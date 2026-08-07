# Implementer Agent Memory

## TanStack Start Server Functions (this project)

- This project uses `@tanstack/react-start@^1.159.5` which has `.inputValidator()` NOT `.validator()` for server function input validation.
- Pattern: `.inputValidator((input: TypeHere) => input)` followed by `.handler(async ({ data }) => { ... })`
- See `features/session-detail/session-detail.server.ts` as the reference example.

## TanStack Router Search Params

- Use Zod schema with `validateSearch` in route definitions.
- `.catch()` on each field ensures invalid URL params fall back to defaults without errors.
- Components access params via `Route.useSearch()` (import Route from the route file).
- Navigate with search param updates: `navigate({ to: '/path', search: (prev) => ({ ...prev, key: value }) })`.

## Project Quality Gates

- `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build` all exist. Run from `apps/web/`.
- `npm run lint` has 16 pre-existing warnings and 0 errors. Only errors are a regression.

## Pointers

- [Vite config reachable modules need relative imports](feedback_vite_config_imports.md): `@/` breaks the dev server for anything under `src/lib/launch/`.

## Key Patterns

- Import alias: `@/` maps to `apps/web/src/`
- Dark theme conventions in `.claude/skills/uiux/SKILL.md`
- Vertical Slice Architecture: each feature in `features/<name>/` with `*.server.ts`, `*.queries.ts`, and components
- `keepPreviousData` from `@tanstack/react-query` is available and works for pagination smooth transitions
