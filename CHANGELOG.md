# Changelog

## v1.03

### Added
- **Dashboard overhaul** — 4-tab navigation (Dashboard, Sessions, Projects, Settings), unified stat box grid
- **Active session detection** — dual-strategy: lock directory (15min) + mtime-only (2min) for newer Claude Code versions
- **Conversation viewer** — full chat history on session detail page
- **Full-text conversation search** — searches inside all messages, shows matching snippets
- **Project badges** — clickable project labels on every session card
- **Launch confirmation popup** — shows session details before resuming
- **Matrix green theme** — emerald accents, loading animation, sidebar redesign

### Fixed
- **Path decoding** — Windows hyphens preserved, macOS homedir-matching heuristic for lossy encoding
- **Token counting** — fixed double-counting for sessions with < 30 lines (head/tail overlap)
- **Session launch** — reads `cwd` from JSONL data instead of lossy decoded path
- **Stream cleanup** — proper `try/finally` on readline streams to prevent resource leaks
- **Security** — UUID validation on sessionId, path traversal checks on cwd, removed `--dangerously-skip-permissions`

## v1.02

### Added
- **Renamable projects** — give projects meaningful names from the Projects page
- **Full-text search** — 3+ character queries search inside conversations
- **Search timestamps** — matching snippets show message timestamps
- **Collapsible agent sections** — tool call details collapse for readability

## v1.01

### Added
- **Sort modes** — latest, most messages, longest, largest, starred only
- **Grouped project view** — sessions under collapsible project headers
- **Projects route** — dedicated page for managing projects
- **Cross-platform launcher** — Windows, macOS (Terminal.app), Linux (gnome-terminal/konsole/xterm)

## v1.00

### Added
- Initial release — fork of claude-session-dashboard with session management, starring, renaming, and launching
