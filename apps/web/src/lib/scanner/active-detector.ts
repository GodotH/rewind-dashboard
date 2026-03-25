import * as fs from 'node:fs'
import * as path from 'node:path'
import { getProjectsDir } from '../utils/claude-path'

const ACTIVE_THRESHOLD_MS = 3_600_000 // 1 hour — idle sessions don't write to JSONL frequently

/**
 * Check if a session is active by examining:
 * 1. Existence of a lock directory (primary signal — created when Claude Code starts)
 * 2. mtime of the JSONL file (within last 1 hour — filters orphaned lock dirs)
 */
export async function isSessionActive(
  projectDirName: string,
  sessionId: string,
): Promise<boolean> {
  const projectsDir = getProjectsDir()
  const jsonlPath = path.join(projectsDir, projectDirName, `${sessionId}.jsonl`)
  const lockDirPath = path.join(projectsDir, projectDirName, sessionId)

  // Lock directory must exist (primary signal)
  const lockStat = await fs.promises.stat(lockDirPath).catch(() => null)
  if (!lockStat?.isDirectory()) return false

  // JSONL mtime must be recent enough to exclude orphaned locks
  const stat = await fs.promises.stat(jsonlPath).catch(() => null)
  if (!stat) return false

  const age = Date.now() - stat.mtimeMs
  return age <= ACTIVE_THRESHOLD_MS
}
