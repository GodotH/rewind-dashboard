---
name: testing
description: Vitest and agent-browser testing patterns, conventions, and gotchas for this project.
user-invocable: true
---

# Testing Patterns

## Vitest (Unit + Integration)
- Config lives in `apps/web/vite.config.ts` (no separate vitest.config)
- Run: `npm run test` from `apps/web/`
- Run single file: `npx vitest run path/to/file.test.ts`

### vi.mock Gotcha (IMPORTANT)
`vi.mock()` is hoisted to the top of the file. You CANNOT reference variables declared above it:

```typescript
// BAD — will be undefined
const mockFn = vi.fn()
vi.mock('./module', () => ({ doThing: mockFn }))

// GOOD — define inline
vi.mock('./module', () => ({ doThing: vi.fn() }))
import { doThing } from './module'
// Now doThing is the mock — use it for assertions
```

### Rules
- Test behavior, not implementation
- Prefer integration tests over unit tests
- Mock external services, not internal functions
- "close timed out" warning after Vitest is a known nitro issue — ignore

## agent-browser (E2E)
- Smoke suite: `apps/web/e2e/agent-browser-smoke.sh`
- Fixtures: `apps/web/e2e/fixtures/.claude/`
- Run: `npm run e2e` from `apps/web/`
- Prefer `snapshot -i` refs and semantic assertions over brittle selectors
