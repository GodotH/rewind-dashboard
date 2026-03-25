import { defineConfig, type Plugin } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { spawn } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { readdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'

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
            const safeCwd = sessionCwd.replace(/\//g, '\\')
            const resumeCmd = `claude --resume ${sessionId} --dangerously-skip-permissions`
            const batPath = join(tmpdir(), `launch-session-${sessionId.slice(0,8)}.bat`)
            writeFileSync(batPath, ['@echo off', `cd /d "${safeCwd}"`, resumeCmd, 'pause', ''].join('\r\n'))
            const child = spawn('cmd.exe', ['/c', 'start', '', batPath], {
              detached: true,
              stdio: 'ignore',
            })
            child.unref()
            setTimeout(() => { try { unlinkSync(batPath) } catch {} }, 60000)
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
