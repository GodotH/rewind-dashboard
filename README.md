# Rewind Dashboard

**Find, manage and launch your previous coding sessions.**

A local dashboard for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that goes beyond read-only analytics. Pin important sessions, rename them, hide noisy projects, view full conversation history, and launch past sessions directly from the browser — all without sending data anywhere.

Built on top of [claude-session-dashboard](https://github.com/dlupiak/claude-session-dashboard) by [@dlupiak](https://github.com/dlupiak).

## What's New (vs upstream)

| Feature | Description |
|---------|-------------|
| **Pin sessions** | Pin important sessions to the top of the list |
| **Rename sessions** | Give sessions memorable names instead of first-message titles |
| **Pin projects** | Pin projects — their most recent session surfaces to page 1 |
| **Hide projects** | Remove noisy/old projects from all views (recoverable) |
| **Chat viewer** | Read full conversation history in a modal — user and assistant messages |
| **Session launcher** | Click "Launch" to resume any session in a new terminal |
| **Project badges** | Every session card shows its project as a styled badge |
| **Better active detection** | Detects idle-but-running sessions (1h threshold vs 2min) |
| **Overflow menu** | Clean card UI — primary actions visible, secondary in `...` menu |
| **Projects in sidebar** | Direct nav link to project management |

All metadata is stored locally in `~/.claude-dashboard/session-metadata.json`. Session JSONL files are never modified.

## Quick Start

```bash
git clone https://github.com/GodotH/claude-rewind.git
cd claude-rewind/apps/web
npm install
npx vite --port 3030
```

Open [http://localhost:3030](http://localhost:3030)

## Make It Persistent (Auto-Start on Login)

### Windows (Task Scheduler)

Create a VBS wrapper for silent startup:

```vbs
' save as start-rewind.vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d ""C:\path\to\claude-rewind\apps\web"" && npx vite --port 3030", 0, False
```

Then create a Scheduled Task:

```powershell
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument '"C:\path\to\start-rewind.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "StartClaudeRewind" -Action $action -Trigger $trigger -Description "Start Rewind Dashboard dashboard"
```

### macOS (Launch Agent)

```bash
cat > ~/Library/LaunchAgents/com.claude-rewind.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude-rewind</string>
    <key>ProgramArguments</key>
    <array>
        <string>npx</string>
        <string>vite</string>
        <string>--port</string>
        <string>3030</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/claude-rewind/apps/web</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.claude-rewind.plist
```

### Linux (systemd user service)

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/claude-rewind.service << 'EOF'
[Unit]
Description=Rewind Dashboard Dashboard

[Service]
WorkingDirectory=/path/to/claude-rewind/apps/web
ExecStart=npx vite --port 3030
Restart=on-failure

[Install]
WantedBy=default.target
EOF
systemctl --user enable --now claude-rewind
```

## How It Works

Claude Code stores session data as JSONL files in `~/.claude/projects/`. Rewind scans these files to build the dashboard:

- **Sessions**: parsed from JSONL — timestamps, messages, tokens, tool calls, models
- **Active detection**: lock directory + JSONL mtime within 1 hour
- **Metadata**: stored separately in `~/.claude-dashboard/session-metadata.json` (pins, renames, hidden projects)
- **Launcher**: writes a temporary `.bat`/`.sh` file and opens a terminal with `claude --resume <id>`

Nothing is sent to any server. Everything runs locally.

## Metadata Storage

All user metadata is in a single JSON file:

```
~/.claude-dashboard/session-metadata.json
```

```json
{
  "version": 1,
  "sessions": {
    "<sessionId>": {
      "pinned": true,
      "customName": "Auth refactor"
    }
  },
  "projects": {
    "<projectPath>": {
      "pinned": true,
      "hidden": false
    }
  }
}
```

Sparse storage — only entries with non-default values are stored. Atomic writes (write to `.tmp`, then rename) prevent corruption.

## Sort Order

Sessions are sorted in three tiers:

1. **Session-pinned** — explicitly pinned sessions, always first
2. **Project-pinned representative** — one latest session per pinned project
3. **Recency** — everything else by last activity

## Tech Stack

- [TanStack Start](https://tanstack.com/start) + [React](https://react.dev)
- [TanStack Router](https://tanstack.com/router) + [React Query](https://tanstack.com/query)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Vite](https://vite.dev)
- [Zod](https://zod.dev) for schema validation

## Development

```bash
cd apps/web
npm install
npx vite --port 3030      # dev mode
npx vitest                 # run tests
```

> **Note**: Production build has a known TanStack Start bug on Node v24. Use dev mode (`npx vite`).

## Credits

This project is a fork of [claude-session-dashboard](https://github.com/dlupiak/claude-session-dashboard) by [Dmytro Lupiak](https://github.com/dlupiak) — an excellent read-only analytics dashboard for Claude Code sessions. Rewind Dashboard adds session management, chat viewing, and launcher features on top of that foundation.

## License

[MIT](LICENSE) — Copyright (c) 2026 Godot Huard. Original dashboard Copyright (c) 2026 Dmytro Lupiak.
