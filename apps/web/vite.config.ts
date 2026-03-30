import { defineConfig, type Plugin } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { spawn, execSync } from 'node:child_process'
import { homedir, tmpdir, platform } from 'node:os'
import { join } from 'node:path'
import { readdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs'

function launchSessionPlugin(): Plugin {
  return {
    name: 'launch-session',
    configureServer(server) {
      server.middlewares.use('/api/launch-session', (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end('Method not allowed')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          try {
            const { sessionId, cwd } = JSON.parse(Buffer.concat(chunks).toString())
            const home = homedir()
            const projDir = join(home, '.claude', 'projects')
            let sessionCwd = cwd || home
            try {
              const dirs = readdirSync(projDir)
              for (const d of dirs) {
                const jsonl = join(projDir, d, sessionId + '.jsonl')
                if (existsSync(jsonl)) {
                  const firstLine = readFileSync(jsonl, 'utf8').split('\n')[0]
                  try {
                    const parsed = JSON.parse(firstLine)
                    if (parsed.cwd) { sessionCwd = parsed.cwd; break }
                  } catch {}
                }
              }
            } catch {}
            const resumeCmd = `claude --resume ${sessionId} --dangerously-skip-permissions`
            const isWin = platform() === 'win32'
            let child
            if (isWin) {
              const safeCwd = sessionCwd.replace(/\//g, '\\')
              const batPath = join(tmpdir(), `launch-session-${sessionId.slice(0,8)}.bat`)
              writeFileSync(batPath, ['@echo off', `cd /d "${safeCwd}"`, resumeCmd, 'pause', ''].join('\r\n'))
              child = spawn('cmd.exe', ['/c', 'start', '', batPath], { detached: true, stdio: 'ignore' })
              child.unref()
              setTimeout(() => { try { unlinkSync(batPath) } catch {} }, 60000)
            } else if (platform() === 'darwin') {
              // macOS: use osascript to run in Terminal.app with full shell environment
              const escaped = `cd "${sessionCwd}" && ${resumeCmd}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
              spawn('osascript', [
                '-e', `tell application "Terminal" to do script "${escaped}"`,
                '-e', 'tell application "Terminal" to activate',
              ], { detached: true, stdio: 'ignore' }).unref()
            } else {
              // Linux: write a shell script that sources profile for PATH
              const shPath = join(tmpdir(), `launch-session-${sessionId.slice(0,8)}.sh`)
              const lines = [
                '#!/usr/bin/env bash',
                '[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"',
                '[ -f "$HOME/.profile" ] && source "$HOME/.profile"',
                `cd "${sessionCwd}"`,
                resumeCmd,
                'exec bash',
                '',
              ]
              writeFileSync(shPath, lines.join('\n'))
              chmodSync(shPath, 0o755)
              // Find a terminal emulator (use execSync from top-level import)
              let term = 'xterm'
              for (const t of ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal']) {
                try {
                  if (execSync(`command -v ${t} 2>/dev/null`).toString().trim()) { term = t; break }
                } catch (_) { /* not found, try next */ }
              }
              if (term === 'gnome-terminal') {
                spawn(term, ['--', shPath], { detached: true, stdio: 'ignore' }).unref()
              } else {
                spawn(term, ['-e', shPath], { detached: true, stdio: 'ignore' }).unref()
              }
              setTimeout(() => { try { unlinkSync(shPath) } catch {} }, 60000)
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
          } catch (err: any) {
            console.error('[launch-session] Error:', err?.message || err)
            res.writeHead(400)
            res.end(JSON.stringify({ error: err?.message || 'Bad request' }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  server: {
    port: 3000,
    watch: {
      ignored: ['**/routeTree.gen.ts'],
    },
  },
  plugins: [
    launchSessionPlugin(),
    tsConfigPaths(),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ],
  // Test config is in vitest.config.ts (separate from app config to avoid
  // tanstackStart/viteReact plugins interfering with React module resolution in tests)
})
