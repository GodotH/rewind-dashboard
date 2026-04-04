import * as fs from 'node:fs'
import * as path from 'node:os'
import * as pathMod from 'node:path'
import {
  getProjectsDir,
  decodeProjectDirName,
  extractProjectName,
  getCodexSessionsDir,
  getGeminiDir,
} from '../utils/claude-path'
import type { SessionProvider } from '../parsers/types'

export interface ProjectInfo {
  dirName: string
  decodedPath: string
  projectName: string
  sessionFiles: string[]
  provider: SessionProvider
  absoluteDir: string
}

async function scanClaudeProjects(): Promise<ProjectInfo[]> {
  const projectsDir = getProjectsDir()

  let entries: string[]
  try {
    entries = await fs.promises.readdir(projectsDir)
  } catch {
    return []
  }

  const projects: ProjectInfo[] = []

  for (const dirName of entries) {
    const dirPath = pathMod.join(projectsDir, dirName)
    const stat = await fs.promises.stat(dirPath).catch(() => null)
    if (!stat?.isDirectory()) continue

    const files = await fs.promises.readdir(dirPath).catch(() => [] as string[])
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl'))

    if (sessionFiles.length === 0) continue

    const decodedPath = decodeProjectDirName(dirName)
    projects.push({
      dirName,
      decodedPath,
      projectName: extractProjectName(decodedPath),
      sessionFiles,
      provider: 'claude',
      absoluteDir: dirPath,
    })
  }

  return projects
}

async function scanCodexSessions(): Promise<ProjectInfo[]> {
  const sessionsDir = getCodexSessionsDir()
  const allFiles: string[] = []

  async function walk(dir: string) {
    let entries: string[]
    try {
      entries = await fs.promises.readdir(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = pathMod.join(dir, entry)
      const stat = await fs.promises.stat(fullPath).catch(() => null)
      if (stat?.isDirectory()) {
        await walk(fullPath)
      } else if (entry.endsWith('.jsonl')) {
        allFiles.push(fullPath)
      }
    }
  }

  await walk(sessionsDir)

  if (allFiles.length === 0) return []

  const grouped = new Map<string, string[]>()
  for (const file of allFiles) {
    const dir = pathMod.dirname(file)
    const existing = grouped.get(dir) ?? []
    existing.push(pathMod.basename(file))
    grouped.set(dir, existing)
  }

  const projects: ProjectInfo[] = []
  for (const [dir, files] of grouped.entries()) {
    const relative = pathMod.relative(sessionsDir, dir)
    projects.push({
      dirName: relative,
      decodedPath: relative,
      projectName: `Codex/${relative}`,
      sessionFiles: files,
      provider: 'codex',
      absoluteDir: dir,
    })
  }

  return projects
}

async function scanGeminiSessions(): Promise<ProjectInfo[]> {
  const geminiTmpDir = pathMod.join(getGeminiDir(), 'tmp')
  let projectDirs: string[]
  try {
    projectDirs = await fs.promises.readdir(geminiTmpDir)
  } catch {
    return []
  }

  const projects: ProjectInfo[] = []

  for (const projectSlug of projectDirs) {
    const chatDir = pathMod.join(geminiTmpDir, projectSlug, 'chats')
    const stat = await fs.promises.stat(chatDir).catch(() => null)
    if (!stat?.isDirectory()) continue

    const files = await fs.promises.readdir(chatDir).catch(() => [] as string[])
    const sessionFiles = files.filter((f) => f.endsWith('.json'))

    if (sessionFiles.length === 0) continue

    projects.push({
      dirName: projectSlug,
      decodedPath: projectSlug,
      projectName: `Gemini/${projectSlug}`,
      sessionFiles,
      provider: 'gemini',
      absoluteDir: chatDir,
    })
  }

  return projects
}

export async function scanProjects(): Promise<ProjectInfo[]> {
  const [claude, codex, gemini] = await Promise.all([
    scanClaudeProjects(),
    scanCodexSessions(),
    scanGeminiSessions(),
  ])

  return [...claude, ...codex, ...gemini]
}
