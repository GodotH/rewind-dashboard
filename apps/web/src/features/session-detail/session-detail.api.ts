import * as path from 'node:path'
import * as fs from 'node:fs'
import { createServerFn } from '@tanstack/react-start'
import {
  getProjectsDir,
  decodeProjectDirName,
  extractProjectName,
  getCodexSessionsDir,
  getGeminiTmpDir,
} from '@/lib/utils/claude-path'
import { parseDetail } from '@/lib/parsers/session-parser'
import type { SessionProvider } from '@/lib/parsers/types'

export const getSessionDetail = createServerFn({ method: 'GET' })
  .inputValidator(
    (input: {
      sessionId: string
      projectPath: string
      provider?: SessionProvider
    }) => input,
  )
  .handler(async ({ data }) => {
    const provider = data.provider ?? 'claude'
    const filePath = findSessionFile(data.sessionId, data.projectPath, provider)
    if (!filePath) {
      throw new Error(`Session not found: ${data.sessionId}`)
    }

    const projectName =
      provider === 'codex'
        ? `Codex/${data.projectPath}`
        : provider === 'gemini'
          ? `Gemini/${data.projectPath}`
          : extractProjectName(data.projectPath)

    return parseDetail(
      filePath.path,
      data.sessionId,
      data.projectPath,
      projectName,
      provider,
    )
  })

function findSessionFile(
  sessionId: string,
  projectPath: string,
  provider: SessionProvider,
): { path: string; dirName: string } | null {
  if (provider === 'codex') {
    const codexDir = getCodexSessionsDir()
    // projectPath for codex is relative path from sessions dir, e.g. "2026/04/03"
    // sessionId for codex is rollout-2026-04-03... (full filename without extension)
    const filePath = path.join(codexDir, projectPath, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) {
      return { path: filePath, dirName: projectPath }
    }
    return null
  }

  if (provider === 'gemini') {
    const geminiDir = getGeminiTmpDir()
    const filePath = path.join(geminiDir, projectPath, 'chats', `${sessionId}.json`)
    if (fs.existsSync(filePath)) {
      return { path: filePath, dirName: projectPath }
    }
    return null
  }

  const projectsDir = getProjectsDir()

  // Try to find via projectPath
  let entries: string[]
  try {
    entries = fs.readdirSync(projectsDir)
  } catch {
    return null
  }

  for (const dirName of entries) {
    const decoded = decodeProjectDirName(dirName)
    if (decoded === projectPath || dirName === projectPath) {
      const filePath = path.join(projectsDir, dirName, `${sessionId}.jsonl`)
      if (fs.existsSync(filePath)) {
        return { path: filePath, dirName }
      }
    }
  }

  // Fallback: search all projects
  for (const dirName of entries) {
    const filePath = path.join(projectsDir, dirName, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) {
      return { path: filePath, dirName }
    }
  }

  return null
}
