import * as path from 'node:path'
import * as os from 'node:os'

function resolveClaudeDir(): string {
  if (process.env.CLAUDE_HOME) {
    return path.resolve(process.env.CLAUDE_HOME)
  }
  return path.join(os.homedir(), '.claude')
}

const CLAUDE_DIR = resolveClaudeDir()

export function getClaudeDir(): string {
  return CLAUDE_DIR
}

export function getProjectsDir(): string {
  return path.join(CLAUDE_DIR, 'projects')
}

export function getStatsPath(): string {
  return path.join(CLAUDE_DIR, 'stats-cache.json')
}

export function getHistoryPath(): string {
  return path.join(CLAUDE_DIR, 'history.jsonl')
}

/**
 * Decode a project directory name back to a filesystem path.
 * ~/.claude/projects stores dirs like "-Users-username-Documents-GitHub-foo"
 * which maps to "/Users/username/Documents/GitHub/foo"
 */
export function decodeProjectDirName(dirName: string): string {
  // Replace leading dash with / and all other dashes with /
  return dirName.replace(/^-/, '/').replace(/-/g, '/')
}

/**
 * Extract a meaningful project name from a decoded path.
 * Uses last 2 significant segments to avoid ambiguous names like "1" or "ai".
 *
 * "/Users/user/projects/mycallagent" -> "mycallagent"
 * "/Users/user/AGENTS/CRM/1" -> "CRM/1"
 * "/Users/user/CODE/mycallagent/ai" -> "mycallagent/ai"
 * "C//" -> "C"
 */
export function extractProjectName(decodedPath: string): string {
  // Split and filter empty/common noise segments
  const noise = new Set(['users', 'home', 'documents', 'github', 'onedrive', '_live', '_code', '_work', 'projects', 'code', 'work', 'c', 'live'])
  const segments = decodedPath.split('/').filter(Boolean)
  const meaningful = segments.filter((s) => !noise.has(s.toLowerCase()))

  if (meaningful.length === 0) return segments[segments.length - 1] || decodedPath
  if (meaningful.length === 1) return meaningful[0]

  // Use more parent context if basename alone is too short/generic
  const basename = meaningful[meaningful.length - 1]
  if (basename.length <= 3 || /^\d+$/.test(basename)) {
    // Take up to 3 segments for very short names
    const take = meaningful.length >= 3 ? 3 : 2
    return meaningful.slice(-take).join('/')
  }
  return basename
}

/**
 * Extract session ID from a JSONL filename.
 * "abc-123.jsonl" -> "abc-123"
 */
export function extractSessionId(filename: string): string {
  return filename.replace(/\.jsonl$/, '')
}
