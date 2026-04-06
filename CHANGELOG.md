# Changelog

## Unreleased

### Fixed

- **Path decoding**: Windows project directory names with literal hyphens (e.g. `fiscal-26`) are now preserved instead of being split into bogus path segments (`fiscal/26`). The decoder uses `--` as the reliable separator boundary when present, keeping single `-` as literal hyphens.
- **Session launch**: `LaunchButton` now reads `cwd` from the JSONL session data instead of using the lossy decoded project path. The launch endpoint reads the first 4KB (multiple lines) instead of just the first line to find the `cwd` field.
- **Stream cleanup**: `search.api.ts` and `session-parser.ts` now use `try/finally` blocks to properly close readline streams and destroy file handles, preventing resource leaks on early returns.

### Migration

After upgrading, pinned/hidden/renamed project settings in `~/.claude-dashboard/session-metadata.json` may use old path keys. These won't match the new decoder output. Either:
1. Delete the file to reset (you'll lose pins/hides/renames)
2. Run a key migration to remap old paths to new paths
