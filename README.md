# Rewind Dashboard

**Find, manage and launch your previous Claude Code sessions.**

A local-first dashboard for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) power users. Star sessions, rename them, organize by project, sort by activity, read full conversations, and resume any session from the browser. Everything runs locally — no data leaves your machine.

Fork of [claude-session-dashboard](https://github.com/dlupiak/claude-session-dashboard) by [Dmytro Lupiak](https://github.com/dlupiak).

## Features

### Session Management
- **Star sessions** — star important sessions so they always appear first
- **Rename sessions** — give sessions meaningful names instead of auto-generated titles
- **Sort sessions** — by latest activity, most messages, longest duration, largest size, or starred only
- **Launch sessions** — click "Launch" to resume any session in a new terminal (Windows, macOS, Linux)
- **Copy resume command** — copy `claude --resume <id>` to clipboard from the overflow menu

### Project Management
- **Rename projects** — give projects meaningful names instead of folder-derived defaults
- **Star projects** — starred projects surface their latest session to the top of the dashboard
- **Hide projects** — remove noisy or old projects from all views (recoverable via Projects page)
- **Project badges** — every session card shows a clickable blue "Project:" badge that filters by project

### Views
- **Sessions view** — flat list of all sessions with sorting, filtering, and search
- **Projects view** — sessions grouped under collapsible project headers with pin/hide controls
- **Projects page** — dedicated page for managing all projects (star, hide, view stats)
- **Stats page** — usage analytics: token trends, model usage, cost estimates, activity heatmap

### Conversation
- **Full chat history** — expandable conversation section on the session detail page shows all user and assistant messages with timestamps and tool call annotations

### Search & Navigation
- **Cmd+K** — global keyboard shortcut to focus search
- **Search** — filter by project name, branch, session ID, working directory, or custom session name
- **Full-text conversation search** — searches inside all messages when query is 3+ characters, shows matching snippets with timestamps
- **Active session detection** — detects running sessions even when idle (1-hour threshold)

## Getting Started

### Prerequisites

- **Node.js** v18 or later
- **Claude Code** installed — the dashboard reads session data from `~/.claude/projects/`
- At least one Claude Code session run (so there's data to display)

### Install and Run

```bash
git clone https://github.com/GodotH/rewind-dashboard.git
cd rewind-dashboard/apps/web
npm install
npx vite --port 3030
```

Open **http://localhost:3030** in your browser.

### First Steps

1. **Browse** — your sessions appear on the Dashboard, sorted by most recent
2. **Star** — click the ★ icon to pin a session to the top
3. **Rename** — click `...` on a card, then "Rename"
4. **Sort** — use the dropdown (top right) to sort by activity, duration, or size
5. **Switch views** — toggle between "Sessions" (flat) and "Projects" (grouped)
6. **Launch** — click the green "Launch" button to resume a session in your terminal
7. **Manage projects** — click "Projects" in the sidebar to star, hide, or browse project stats

## Auto-Start on Login

### Windows

Create `start-rewind.vbs`:

```vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d ""C:\path\to\rewind-dashboard\apps\web"" && npx vite --port 3030", 0, False
```

Register as a scheduled task:

```powershell
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument '"C:\path\to\start-rewind.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "RewindDashboard" -Action $action -Trigger $trigger
```

### macOS

```bash
cat > ~/Library/LaunchAgents/com.rewind-dashboard.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.rewind-dashboard</string>
    <key>ProgramArguments</key>
    <array><string>npx</string><string>vite</string><string>--port</string><string>3030</string></array>
    <key>WorkingDirectory</key><string>/path/to/rewind-dashboard/apps/web</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.rewind-dashboard.plist
```

### Linux

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

> **Not tested.** These are theoretical instructions.

Rewind Dashboard is a web app — it runs in any browser. To access from an iPhone or iPad:

**Local network**: Start with `npx vite --port 3030 --host 0.0.0.0`, then open `http://<your-ip>:3030` in Safari. Add to Home Screen for an app-like experience.

**Remote access**: Use [Tailscale](https://tailscale.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) (`cloudflared tunnel --url http://localhost:3030`).

**Limitations**: The Launch button won't work (no terminal on iOS). The dashboard must run on the machine where `~/.claude/` exists.

## Troubleshooting

### "What is this terminal window?"

When you click **Launch**, Rewind opens a new terminal window running `claude --resume`. On Windows, this window is titled **`Rewind Session <id-prefix>`** (where `<id-prefix>` is the first 8 characters of the session UUID) so you can confirm it came from Rewind. You can close these windows at any time — closing the terminal ends that Claude session but does not affect the dashboard or other sessions.

### Orphan terminals from older versions

Versions of Rewind prior to this fix could occasionally leave unlabeled `cmd.exe` windows behind after a Claude session ended or the Vite dev server was killed. If you see unfamiliar console windows on your desktop with no obvious title, they are almost certainly harmless orphans from a previous session — just close them, or kill them via PowerShell:

```powershell
Get-Process cmd | Where-Object { $_.MainWindowTitle -eq '' } | Stop-Process
```

New launches (with the titled-window fix) no longer produce these orphans, and the temporary `.bat` files they spawn self-delete when the terminal exits.

## How It Works

Claude Code stores session data as JSONL files in `~/.claude/projects/`. Rewind scans these files:

- **Sessions** — parsed from JSONL (timestamps, messages, tokens, tool calls, models)
- **Active detection** — lock directory exists + JSONL modified within 1 hour
- **Metadata** — pins, renames, and hidden projects stored in `~/.claude-dashboard/session-metadata.json`
- **Launcher** — cross-platform session resume:
  - **Windows**: `.bat` script via `cmd.exe /c start "Rewind Session <id>"` (self-deleting, titled window)
  - **macOS**: `osascript` with Terminal.app (full shell environment)
  - **Linux**: `.sh` script (sources `~/.bashrc`) in gnome-terminal/konsole/xterm

Nothing is sent to any server. All data stays local.

## Metadata

User metadata is stored in a single JSON file at `~/.claude-dashboard/session-metadata.json`:

```json
{
  "version": 1,
  "sessions": {
    "<sessionId>": { "pinned": true, "customName": "Auth refactor" }
  },
  "projects": {
    "<projectPath>": { "pinned": true, "hidden": false, "customName": "My Project" }
  }
}
```

Sparse storage — only non-default entries are written. Atomic writes (`.tmp` + rename) prevent corruption.

## Sort Order

In the default "Latest" sort mode, sessions are ordered:

1. **Starred sessions** — explicitly starred, always first
2. **Starred project representative** — one latest session per starred project
3. **Recency** — everything else by last activity

Other sort modes (Most Active, Longest, Largest) sort literally without star boosting.

## Tech Stack

- [TanStack Start](https://tanstack.com/start) + [React](https://react.dev)
- [TanStack Router](https://tanstack.com/router) + [React Query](https://tanstack.com/query)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Vite](https://vite.dev)
- [Zod](https://zod.dev)

## Development

```bash
cd apps/web
npm install
npx vite --port 3030      # dev server
npx vitest                 # run tests
```

> **Note**: Production build has a known TanStack Start issue on Node v24. Use dev mode (`npx vite`).

## Credits

Built on [claude-session-dashboard](https://github.com/dlupiak/claude-session-dashboard) by [Dmytro Lupiak](https://github.com/dlupiak) — a read-only analytics dashboard for Claude Code sessions. Rewind Dashboard adds session management, conversation viewing, sorting, project organization, and cross-platform session launching.

## License

[MIT](LICENSE) — Copyright (c) 2026 Godot Huard. Original dashboard Copyright (c) 2026 Dmytro Lupiak.
