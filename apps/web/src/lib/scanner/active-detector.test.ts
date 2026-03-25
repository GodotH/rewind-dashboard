import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  promises: {
    stat: vi.fn(),
  },
}))

vi.mock('@/lib/utils/claude-path', () => ({
  getProjectsDir: vi.fn(() => '/fake/projects'),
}))

import * as fs from 'node:fs'
import * as path from 'node:path'
import { isSessionActive } from './active-detector'

const mockStat = fs.promises.stat as ReturnType<typeof vi.fn>

const PROJECT_DIR = 'some-project'
const SESSION_ID = 'session-abc-123'
const JSONL_PATH = path.join('/fake/projects', PROJECT_DIR, `${SESSION_ID}.jsonl`)
const LOCK_DIR_PATH = path.join('/fake/projects', PROJECT_DIR, SESSION_ID)
const ACTIVE_THRESHOLD_MS = 3_600_000 // 1 hour

function makeStatResult(mtimeMs: number, isDir = false) {
  return {
    mtimeMs,
    isDirectory: () => isDir,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('isSessionActive', () => {
  describe('lock directory checks (primary signal)', () => {
    it('returns false when lock directory does not exist', async () => {
      vi.setSystemTime(1_700_000_000_000)

      mockStat.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
      // Lock dir checked first; when missing, no jsonl check needed
      expect(mockStat).toHaveBeenCalledTimes(1)
      expect(mockStat).toHaveBeenCalledWith(LOCK_DIR_PATH)
    })

    it('returns false when lock path exists but is a file, not a directory', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      mockStat.mockResolvedValueOnce(makeStatResult(now - 30_000, false)) // not a directory

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })

    it('returns false when lock dir stat throws', async () => {
      vi.setSystemTime(1_700_000_000_000)

      mockStat.mockRejectedValueOnce(new Error('permission denied'))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })
  })

  describe('mtime-based threshold (orphan filter)', () => {
    it('returns true when lock dir exists and file modified within 1 hour', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - 60_000 // 1 minute ago

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs, true)) // lock dir exists
        .mockResolvedValueOnce(makeStatResult(mtimeMs)) // jsonl recent

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(true)
      expect(mockStat).toHaveBeenCalledWith(LOCK_DIR_PATH)
      expect(mockStat).toHaveBeenCalledWith(JSONL_PATH)
    })

    it('returns false when lock dir exists but file modified more than 1 hour ago', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - ACTIVE_THRESHOLD_MS - 1 // just over 1 hour

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs, true)) // lock dir exists
        .mockResolvedValueOnce(makeStatResult(mtimeMs)) // jsonl stale

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })

    it('returns true when file modified exactly at the threshold boundary', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - ACTIVE_THRESHOLD_MS // exactly at boundary: age <= threshold

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs, true)) // lock dir
        .mockResolvedValueOnce(makeStatResult(mtimeMs)) // jsonl

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(true)
    })

    it('returns false when file modified 1ms beyond the threshold', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - ACTIVE_THRESHOLD_MS - 1

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs, true))
        .mockResolvedValueOnce(makeStatResult(mtimeMs))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })
  })

  describe('jsonl file not found', () => {
    it('returns false when lock dir exists but jsonl stat throws ENOENT', async () => {
      vi.setSystemTime(1_700_000_000_000)

      mockStat
        .mockResolvedValueOnce(makeStatResult(0, true)) // lock dir exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })

    it('returns false when lock dir exists but jsonl stat throws permission error', async () => {
      vi.setSystemTime(1_700_000_000_000)

      mockStat
        .mockResolvedValueOnce(makeStatResult(0, true))
        .mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })

    it('returns false when lock dir exists but jsonl stat throws generic error', async () => {
      vi.setSystemTime(1_700_000_000_000)

      mockStat
        .mockResolvedValueOnce(makeStatResult(0, true))
        .mockRejectedValueOnce(new Error('Unexpected error'))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })
  })

  describe('path construction', () => {
    it('constructs the correct lock dir path', async () => {
      vi.setSystemTime(1_700_000_000_000)

      mockStat.mockRejectedValue(new Error('ENOENT'))

      await isSessionActive('my-project-dir', 'my-session-id')

      expect(mockStat).toHaveBeenCalledWith(path.join('/fake/projects', 'my-project-dir', 'my-session-id'))
    })

    it('constructs the correct jsonl path when lock dir exists', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      mockStat
        .mockResolvedValueOnce(makeStatResult(now - 1_000, true)) // lock dir
        .mockResolvedValueOnce(makeStatResult(now - 1_000)) // jsonl

      await isSessionActive('my-project-dir', 'my-session-id')

      expect(mockStat).toHaveBeenCalledWith(path.join('/fake/projects', 'my-project-dir', 'my-session-id.jsonl'))
    })
  })
})
