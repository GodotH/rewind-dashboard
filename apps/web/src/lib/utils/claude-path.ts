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
  // Claude Code's encoding is lossy: \, /, :, _, and literal - all become -
  // When -- exists, it reliably marks a path separator or special char boundary,
  // so single - can be kept as a literal hyphen (preserves names like fiscal-26).
  // When no -- exists (pure Unix paths), every - is a path separator.

  const hasDoubleDash = dirName.includes('--')

  if (hasDoubleDash) {
    // Windows-style path: "C--Users-godot--work-fiscal-26"
    const driveMatch = dirName.match(/^([A-Za-z])--(.*)$/)
    if (driveMatch) {
      const rest = driveMatch[2].replace(/--/g, '/').replace(/-/g, '-')
      return `${driveMatch[1].toUpperCase()}:/${rest}`
    }
    // Unix path with special chars (e.g. underscore dirs): "--" marks separators
    if (dirName.startsWith('-')) {
      const rest = dirName.slice(1).replace(/--/g, '/').replace(/-/g, '-')
      return `/${rest}`
    }
    return dirName.replace(/--/g, '/').replace(/-/g, '-')
  }

  // No double-dash: plain Unix path, every - is a path separator
  return dirName.replace(/^-/, '/').replace(/-/g, '/')
}

/**
 * Extract a meaningful project name from a decoded path.
 * Returns the last path segment as the project name.
 * If the last segment is purely numeric, prepends the parent segment for context.
 * Strips leading noise-word prefixes that result from lossy path decoding
 * (e.g. "work-fiscal-26" → "fiscal-26" because "work" was a separate directory).
 *
 * "C:/Users-godot/work-fiscal-26" -> "fiscal-26"
 * "/Users/user/projects/mycallagent" -> "mycallagent"
 * "/Users/user/AGENTS/CRM/1" -> "CRM/1"
 * "C:/Users-godot-OneDrive/LIVE/CODE-rewind-dashboard" -> "rewind-dashboard"
 */
export function extractProjectName(decodedPath: string): string {
  const segments = decodedPath.split('/').filter(Boolean)
  if (segments.length === 0) return decodedPath

  let basename = segments[segments.length - 1]

  // Strip leading noise-word prefixes caused by lossy path decoding.
  // E.g. "work-fiscal-26" → "fiscal-26" (because "work\" became "work-")
  // E.g. "CODE-rewind-dashboard" → "rewind-dashboard"
  const noise = new Set(['users', 'home', 'documents', 'github', 'onedrive', 'projects', 'code', 'work', 'c', 'live'])
  const dashIdx = basename.indexOf('-')
  if (dashIdx > 0) {
    const prefix = basename.slice(0, dashIdx)
    if (noise.has(prefix.toLowerCase())) {
      basename = basename.slice(dashIdx + 1)
    }
  }

  // If basename is purely numeric (e.g. "1", "26"), prepend parent for context
  if (/^\d+$/.test(basename) && segments.length >= 2) {
    const parent = segments[segments.length - 2]
    return `${parent}/${basename}`
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
