import * as path from 'node:path'
import * as os from 'node:os'

function resolveClaudeDir(): string {
  if (process.env.CLAUDE_HOME) {
    return path.resolve(process.env.CLAUDE_HOME)
  }
  return path.join(os.homedir(), '.claude')
}

function resolveCodexDir(): string {
  if (process.env.CODEX_HOME) {
    return path.resolve(process.env.CODEX_HOME)
  }
  return path.join(os.homedir(), '.codex')
}

function resolveGeminiDir(): string {
  if (process.env.GEMINI_HOME) {
    return path.resolve(process.env.GEMINI_HOME)
  }
  return path.join(os.homedir(), '.gemini')
}

const CLAUDE_DIR = resolveClaudeDir()
const CODEX_DIR = resolveCodexDir()
const GEMINI_DIR = resolveGeminiDir()

export function getClaudeDir(): string {
  return CLAUDE_DIR
}

export function getCodexDir(): string {
  return CODEX_DIR
}

export function getGeminiDir(): string {
  return GEMINI_DIR
}

export function getProjectsDir(): string {
  return path.join(CLAUDE_DIR, 'projects')
}

export function getCodexSessionsDir(): string {
  return path.join(CODEX_DIR, 'sessions')
}

export function getGeminiTmpDir(): string {
  return path.join(GEMINI_DIR, 'tmp')
}

export function getStatsPath(): string {
  return path.join(CLAUDE_DIR, 'stats-cache.json')
}

export function getHistoryPath(): string {
  return path.join(CLAUDE_DIR, 'history.jsonl')
}

/**
 * Common intermediate directory names that appear between the home directory
 * and a project directory. Used as split points when decoding lossy Unix paths.
 */
const KNOWN_DIRS = new Set([
  'Documents', 'GitHub', 'Desktop', 'Downloads',
  'projects', 'repos', 'code', 'work', 'src',
  'Sites', 'Applications', 'Library',
  'Workspace', 'workspace', 'go', 'git', 'opt',
])

function decodeUnixDirName(dirName: string, homedir?: string): string {
  const raw = dirName.startsWith('-') ? dirName.slice(1) : dirName
  const segments = raw.split('-')
  if (segments.length === 0) return `/${raw}`

  const home = homedir ?? os.homedir()
  const homeSegments = home.split('/').filter(Boolean)
  const result: string[] = []
  let i = 0

  for (const hs of homeSegments) {
    if (i < segments.length && segments[i] === hs) {
      result.push(segments[i])
      i++
    } else {
      break
    }
  }

  while (i < segments.length) {
    if (KNOWN_DIRS.has(segments[i])) {
      result.push(segments[i])
      i++
    } else {
      const parts: string[] = []
      while (i < segments.length && !KNOWN_DIRS.has(segments[i])) {
        parts.push(segments[i])
        i++
      }
      result.push(parts.join('-'))
    }
  }

  return '/' + result.join('/')
}

/**
 * Decode a project directory name back to a filesystem path.
 * ~/.claude/projects stores dirs like "-Users-username-Documents-GitHub-foo"
 * which maps to "/Users/username/Documents/GitHub/foo"
 */
export function decodeProjectDirName(dirName: string, homedir?: string): string {
  const hasDoubleDash = dirName.includes('--')

  if (hasDoubleDash) {
    const driveMatch = dirName.match(/^([A-Za-z])--(.*)$/)
    if (driveMatch) {
      const rest = driveMatch[2].replace(/--/g, '/').replace(/-/g, '-')
      return `${driveMatch[1].toUpperCase()}:/${rest}`
    }
    if (dirName.startsWith('-')) {
      const rest = dirName.slice(1).replace(/--/g, '/').replace(/-/g, '-')
      return `/${rest}`
    }
    return dirName.replace(/--/g, '/').replace(/-/g, '-')
  }

  return decodeUnixDirName(dirName, homedir)
}

/**
 * Extract a meaningful project name from a decoded path.
 */
export function extractProjectName(decodedPath: string): string {
  const segments = decodedPath.split('/').filter(Boolean)
  if (segments.length === 0) return decodedPath

  let basename = segments[segments.length - 1]

  const noise = new Set(['users', 'home', 'documents', 'github', 'onedrive', 'projects', 'code', 'work', 'c', 'live'])
  const dashIdx = basename.indexOf('-')
  if (dashIdx > 0) {
    const prefix = basename.slice(0, dashIdx)
    if (noise.has(prefix.toLowerCase())) {
      basename = basename.slice(dashIdx + 1)
    }
  }

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
  return filename.replace(/\.jsonl$/, '').replace(/\.pb$/, '')
}
