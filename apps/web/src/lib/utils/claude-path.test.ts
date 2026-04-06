import { describe, it, expect, vi, afterEach } from 'vitest'
import * as os from 'node:os'
import * as path from 'node:path'

// Pure functions can be imported directly
import {
  decodeProjectDirName,
  extractProjectName,
  extractSessionId,
} from './claude-path'

describe('claude-path', () => {
  describe('getClaudeDir', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    it('returns default path when CLAUDE_HOME is not set', async () => {
      vi.stubEnv('CLAUDE_HOME', '')
      vi.resetModules()
      const { getClaudeDir } = await import('./claude-path')
      expect(getClaudeDir()).toBe(path.join(os.homedir(), '.claude'))
    })

    it('returns resolved CLAUDE_HOME when set', async () => {
      vi.stubEnv('CLAUDE_HOME', '/custom/claude/dir')
      vi.resetModules()
      const { getClaudeDir } = await import('./claude-path')
      expect(getClaudeDir()).toBe('/custom/claude/dir')
    })

    it('resolves relative CLAUDE_HOME to absolute path', async () => {
      vi.stubEnv('CLAUDE_HOME', 'relative/claude')
      vi.resetModules()
      const { getClaudeDir } = await import('./claude-path')
      const result = getClaudeDir()
      expect(path.isAbsolute(result)).toBe(true)
      expect(result).toContain('relative/claude')
    })
  })

  describe('getProjectsDir', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    it('returns projects subdirectory under claude dir', async () => {
      vi.stubEnv('CLAUDE_HOME', '/custom/claude')
      vi.resetModules()
      const { getProjectsDir } = await import('./claude-path')
      expect(getProjectsDir()).toBe('/custom/claude/projects')
    })

    it('returns default projects path when CLAUDE_HOME not set', async () => {
      vi.stubEnv('CLAUDE_HOME', '')
      vi.resetModules()
      const { getProjectsDir } = await import('./claude-path')
      expect(getProjectsDir()).toBe(path.join(os.homedir(), '.claude', 'projects'))
    })
  })

  describe('getStatsPath', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    it('returns stats-cache.json path under claude dir', async () => {
      vi.stubEnv('CLAUDE_HOME', '/custom/claude')
      vi.resetModules()
      const { getStatsPath } = await import('./claude-path')
      expect(getStatsPath()).toBe('/custom/claude/stats-cache.json')
    })
  })

  describe('getHistoryPath', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    it('returns history.jsonl path under claude dir', async () => {
      vi.stubEnv('CLAUDE_HOME', '/custom/claude')
      vi.resetModules()
      const { getHistoryPath } = await import('./claude-path')
      expect(getHistoryPath()).toBe('/custom/claude/history.jsonl')
    })
  })

  describe('decodeProjectDirName', () => {
    // --- Unix paths (no double-dash) ---

    it('decodes leading dash to slash (Unix)', () => {
      expect(decodeProjectDirName('-Users-username-project')).toBe('/Users/username/project')
    })

    it('decodes a typical encoded Unix project directory name', () => {
      expect(decodeProjectDirName('-Users-alice-Documents-GitHub-myproject')).toBe(
        '/Users/alice/Documents/GitHub/myproject'
      )
    })

    it('handles a single segment path (no intermediate dashes)', () => {
      expect(decodeProjectDirName('-project')).toBe('/project')
    })

    it('converts all dashes to slashes for pure Unix paths', () => {
      const result = decodeProjectDirName('-a-b-c-d')
      expect(result).toBe('/a/b/c/d')
    })

    it('handles a path with no dashes (returns string unchanged)', () => {
      const result = decodeProjectDirName('nodash')
      expect(result).toBe('nodash')
    })

    it('handles deep nested Unix paths', () => {
      expect(decodeProjectDirName('-home-user-work-clients-acme-frontend')).toBe(
        '/home/user/work/clients/acme/frontend'
      )
    })

    // --- Windows paths (double-dash present) ---

    it('decodes Windows drive letter with double-dash', () => {
      expect(decodeProjectDirName('C--Users-godot--work')).toBe('C:/Users-godot/work')
    })

    it('preserves literal hyphens in folder names on Windows', () => {
      expect(decodeProjectDirName('C--Users-godot--work-fiscal-26')).toBe(
        'C:/Users-godot/work-fiscal-26'
      )
    })

    it('preserves hyphens in nested Windows paths', () => {
      expect(decodeProjectDirName('C--Users-godot--work-fiscal-26-forms')).toBe(
        'C:/Users-godot/work-fiscal-26-forms'
      )
    })

    it('handles Windows OneDrive paths with underscore dirs', () => {
      expect(decodeProjectDirName('C--Users-godot-OneDrive--LIVE--CODE-quickfax')).toBe(
        'C:/Users-godot-OneDrive/LIVE/CODE-quickfax'
      )
    })

    it('handles Windows root path', () => {
      expect(decodeProjectDirName('C--')).toBe('C:/')
    })

    it('handles Unix path with double-dash (underscore dirs)', () => {
      expect(decodeProjectDirName('-home-user--work-my-project')).toBe(
        '/home-user/work-my-project'
      )
    })
  })

  describe('extractProjectName', () => {
    it('extracts last segment from a decoded path', () => {
      expect(extractProjectName('/Users/username/Documents/GitHub/myproject')).toBe('myproject')
    })

    it('handles a short decoded path', () => {
      expect(extractProjectName('/project')).toBe('project')
    })

    it('uses parent context for short basenames', () => {
      // 'c' is in noise set, filtered out. Meaningful: [a,b,d,e]. e<=3, take 3: b/d/e
      expect(extractProjectName('/a/b/c/d/e')).toBe('b/d/e')
    })

    it('returns the name portion from a typical project path', () => {
      expect(extractProjectName('/Users/alice/work/repos/dashboard')).toBe('dashboard')
    })

    it('includes parent for numeric basenames', () => {
      // "alice" filtered as noise (<=3 threshold doesn't apply, but it's >3 so kept)
      // Actually: Users filtered, alice kept, AGENTS kept, CRM kept, 1 is short → takes 3
      expect(extractProjectName('/Users/alice/AGENTS/CRM/1')).toBe('AGENTS/CRM/1')
    })

    it('handles root path', () => {
      const result = extractProjectName('/')
      expect(typeof result).toBe('string')
    })
  })

  describe('extractSessionId', () => {
    it('strips .jsonl extension from filename', () => {
      expect(extractSessionId('abc-123.jsonl')).toBe('abc-123')
    })

    it('handles UUID-style session filenames', () => {
      expect(extractSessionId('550e8400-e29b-41d4-a716-446655440000.jsonl')).toBe(
        '550e8400-e29b-41d4-a716-446655440000'
      )
    })

    it('returns filename unchanged when no .jsonl extension', () => {
      expect(extractSessionId('no-extension')).toBe('no-extension')
    })

    it('returns filename unchanged for other extensions', () => {
      expect(extractSessionId('session.json')).toBe('session.json')
    })

    it('handles filenames with multiple dots', () => {
      expect(extractSessionId('session.backup.jsonl')).toBe('session.backup')
    })

    it('handles empty string', () => {
      expect(extractSessionId('')).toBe('')
    })
  })
})
