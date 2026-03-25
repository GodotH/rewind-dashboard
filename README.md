# Rewind Dashboard

**Find, manage and launch your previous coding sessions.**

A local dashboard for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that goes beyond read-only analytics. Pin important sessions, rename them, hide noisy projects, view full conversation history, and launch past sessions directly from the browser — all without sending data anywhere.

Built on top of [claude-session-dashboard](https://github.com/dlupiak/claude-session-dashboard) by [@dlupiak](https://github.com/dlupiak).

## Features

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

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v18 or later
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed (the dashboard reads its session data from `~/.claude/projects/`)
- A few Claude Code sessions already run (so there's data to display)

### Install

```bash
git clone https://github.com/GodotH/rewind-dashboard.git
cd rewind-dashboard/apps/web
npm install
```

### Run

```bash
npx vite --port 3030
```

Open [http://localhost:3030](http://localhost:3030) — you should see your sessions immediately.

### First Steps

1. **Browse sessions** — your most recent sessions appear on the Sessions page
2. **Pin a session** — click the ★ icon on any card to keep it at the top
3. **Rename a session** — click `...` → Rename to give it a memorable name
4. **View a conversation** — click "View" to read the full chat in a modal
5. **Launch a session** — click "Launch" to resume it in a new terminal
6. **Manage projects** — click "Projects" in the sidebar to pin or hide entire projects

## Make It Persistent (Auto-Start on Login)

### Windows (Task Scheduler)

Create a VBS wrapper for silent startup:

```vbs
' save as start-rewind.vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d ""C:\path\to\rewind-dashboard\apps\web"" && npx vite --port 3030", 0, False
```

Then create a Scheduled Task:

```powershell
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument '"C:\path\to\start-rewind.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "StartRewindDashboard" -Action $action -Trigger $trigger -Description "Start Rewind Dashboard"
```

### macOS (Launch Agent)

```bash
cat > ~/Library/LaunchAgents/com.rewind-dashboard.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.rewind-dashboard</string>
    <key>ProgramArguments</key>
    <array>
        <string>npx</string>
        <string>vite</string>
        <string>--port</string>
        <string>3030</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/rewind-dashboard/apps/web</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.rewind-dashboard.plist
```

### Linux (systemd user service)

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/rewind-dashboard.service << 'EOF'
[Unit]
Description=Rewind Dashboard

[Service]
WorkingDirectory=/path/to/rewind-dashboard/apps/web
ExecStart=npx vite --port 3030
Restart=on-failure

[Install]
WantedBy=default.target
EOF
systemctl --user enable --now rewind-dashboard
```

## iOS / iPadOS (Experimental)

> **Disclaimer**: This has not been tested on iOS. These are theoretical instructions based on how Claude Code and Rewind Dashboard work.

Rewind Dashboard is a web app served by Vite — it runs in any browser. To access it from an iPhone or iPad:

### Option 1: Access from local network

If your Mac/PC and iOS device are on the same network:

```bash
# Start with host binding
npx vite --port 3030 --host 0.0.0.0
```

Then open `http://<your-computer-ip>:3030` in Safari on your iOS device. You can add it to your Home Screen for an app-like experience (Safari → Share → Add to Home Screen).

### Option 2: Remote access via Tailscale / Cloudflare Tunnel

For access outside your local network:

- **Tailscale**: Install on both devices. Access via Tailscale IP (e.g., `http://100.x.x.x:3030`)
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:3030` gives you an HTTPS URL

### Limitations on iOS

- **Session launcher** won't work (no terminal on iOS) — the Launch button will have no effect
- **Claude Code data** lives on your computer, not on iOS — the dashboard must run on the machine where `~/.claude/` exists
- iOS Safari may have minor rendering differences with Tailwind CSS

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
