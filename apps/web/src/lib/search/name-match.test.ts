import { describe, it, expect } from 'vitest'
import {
  normalizeForSearch,
  tokenizeQuery,
  matchesTerms,
  rankSessionMatch,
  isExactName,
  isPrefixName,
} from './name-match'

describe('normalizeForSearch', () => {
  it('folds hyphens to separators', () => {
    expect(normalizeForSearch('vector-crm-v2')).toBe('vector crm v2')
  })

  it('folds an encoded project dir predictably', () => {
    expect(normalizeForSearch('C--Users-godot-OneDrive--LIVE-AGENTS')).toBe(
      'c users godot onedrive live agents',
    )
  })

  it('strips diacritics and underscores', () => {
    expect(normalizeForSearch('Café_Brûlé')).toBe('cafe brule')
  })

  it('collapses runs and trims', () => {
    expect(normalizeForSearch('  a///b   c  ')).toBe('a b c')
    expect(normalizeForSearch('')).toBe('')
  })
})

describe('tokenizeQuery', () => {
  it('returns no terms for whitespace', () => {
    expect(tokenizeQuery('   ')).toEqual([])
  })

  it('splits on any separator', () => {
    expect(tokenizeQuery('vector-crm')).toEqual(['vector', 'crm'])
  })

  it('caps at 16 terms', () => {
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`).join(' ')
    expect(tokenizeQuery(many)).toHaveLength(16)
  })
})

describe('matchesTerms', () => {
  it('matches across a separator mismatch', () => {
    expect(matchesTerms('vector-crm-v2', tokenizeQuery('vector crm'))).toBe(true)
  })

  it('is case insensitive', () => {
    expect(matchesTerms('vector-crm-v2', tokenizeQuery('VECTOR CRM'))).toBe(true)
    expect(matchesTerms('vector-crm-v2', tokenizeQuery('Vector Crm'))).toBe(true)
  })

  it('is order independent', () => {
    expect(matchesTerms('vector-crm-v2', tokenizeQuery('crm vector'))).toBe(true)
  })

  it('matches a token prefix', () => {
    expect(matchesTerms('vector-crm-v2', tokenizeQuery('vec'))).toBe(true)
  })

  it('requires every term (term-AND)', () => {
    expect(matchesTerms('vector-crm-v2', tokenizeQuery('vector redis'))).toBe(false)
  })

  it('matches an infix token', () => {
    expect(matchesTerms('hermes-brain', tokenizeQuery('brain'))).toBe(true)
  })

  it('returns false for nullish haystacks and empty term lists', () => {
    expect(matchesTerms(null, tokenizeQuery('brain'))).toBe(false)
    expect(matchesTerms(undefined, tokenizeQuery('brain'))).toBe(false)
    expect(matchesTerms('anything', [])).toBe(false)
  })
})

describe('isExactName / isPrefixName', () => {
  it('compares on normalized text', () => {
    expect(isExactName('Vector-CRM-v2', 'vector crm v2')).toBe(true)
    expect(isExactName('Vector-CRM-v2', 'vector crm')).toBe(false)
    expect(isPrefixName('Vector-CRM-v2', 'vector crm')).toBe(true)
    expect(isPrefixName(null, 'vector')).toBe(false)
  })
})

describe('rankSessionMatch', () => {
  const base = {
    customName: undefined,
    claudeName: null,
    projectName: 'unrelated-project',
    projectDir: '-unrelated-project',
    branch: 'main',
    cwd: '/tmp/unrelated',
    sessionId: 'ffffffff-0000-0000-0000-000000000000',
    firstUserMessage: null,
  }

  it('tier 0 for an exact name', () => {
    expect(rankSessionMatch({ ...base, customName: 'brain' }, tokenizeQuery('Brain'))).toBe(0)
  })

  it('tier 1 for a name prefix', () => {
    expect(rankSessionMatch({ ...base, customName: 'brain' }, tokenizeQuery('bra'))).toBe(1)
  })

  it('tier 2 for an infix name match', () => {
    expect(
      rankSessionMatch({ ...base, claudeName: 'hermes-brain' }, tokenizeQuery('brain')),
    ).toBe(2)
  })

  it('tier 3 for a project-only match', () => {
    expect(
      rankSessionMatch(
        { ...base, projectName: 'AGENTS', projectDir: 'C--Users-godot-OneDrive--LIVE-AGENTS' },
        tokenizeQuery('agents'),
      ),
    ).toBe(3)
  })

  it('tier 4 for branch, cwd and a raw session id prefix', () => {
    expect(rankSessionMatch({ ...base, branch: 'feature/brain' }, tokenizeQuery('brain'))).toBe(4)
    expect(rankSessionMatch({ ...base, cwd: '/tmp/brainy' }, tokenizeQuery('brain'))).toBe(4)
    expect(rankSessionMatch(base, tokenizeQuery('ffffffff'))).toBe(4)
  })

  it('tier 5 for a firstUserMessage-only match', () => {
    expect(
      rankSessionMatch({ ...base, firstUserMessage: 'fix the brain please' }, tokenizeQuery('brain')),
    ).toBe(5)
  })

  it('null when nothing matched, and for an empty query', () => {
    expect(rankSessionMatch(base, tokenizeQuery('brain'))).toBeNull()
    expect(rankSessionMatch({ ...base, customName: 'brain' }, [])).toBeNull()
  })

  it('ranks a name match above a body match for the same query', () => {
    const named = rankSessionMatch({ ...base, customName: 'brain' }, tokenizeQuery('brain'))!
    const bodyish = rankSessionMatch(
      { ...base, firstUserMessage: 'brain dump' },
      tokenizeQuery('brain'),
    )!
    expect(named).toBeLessThan(bodyish)
  })
})
