---
name: browser-automation
description: Browser automation workflow for this project using the `agent-browser` CLI.
user-invocable: true
---

# Browser Automation

Use `agent-browser` for interactive UI checks and end-to-end smoke coverage.

## Primary workflow

1. Start the app: `cd apps/web && npm run dev`
2. Open the target page: `agent-browser open http://127.0.0.1:3000/...`
3. Capture a semantic snapshot: `agent-browser snapshot -i`
4. Interact with refs from the snapshot: `click`, `fill`, `press`, `select`
5. Verify outcomes with `get text body`, `console`, `errors`, or screenshots

## Project-specific defaults

- Dashboard smoke suite: `cd apps/web && npm run e2e`
- Fixtures live in `apps/web/e2e/fixtures/.claude/`
- Prefer semantic assertions against page text over brittle selector-only checks
- Save screenshots under `apps/web/e2e/screenshots/` when debugging failures

## Useful commands

```bash
agent-browser open http://127.0.0.1:3000/sessions
agent-browser snapshot -i
agent-browser click @e1
agent-browser fill @e2 "search term"
agent-browser get text body
agent-browser console
agent-browser errors
agent-browser screenshot /tmp/dashboard.png
agent-browser close
```
