# Browser Session Management

Run multiple isolated browser sessions concurrently with state persistence.

## Named Browser Sessions

Use `-b` flag to isolate browser contexts:

```bash
# Browser 1: Authentication flow
agent-browser -s=auth open https://app.example.com/login

# Browser 2: Public browsing (separate cookies, storage)
agent-browser -s=public open https://example.com

# Commands are isolated by browser session
agent-browser -s=auth fill e1 "user@example.com"
agent-browser -s=public snapshot
```

## Browser Session Isolation Properties

Each browser session has independent:
- Cookies
- LocalStorage / SessionStorage
- IndexedDB
- Cache
- Browsing history
- Open tabs

## Browser Session Commands

```bash
# List all browser sessions
agent-browser list

# Stop a browser session (close the browser)
agent-browser close                # stop the default browser
agent-browser -s=mysession close   # stop a named browser

# Stop all browser sessions
agent-browser close-all

# Forcefully kill all daemon processes (for stale/zombie processes)
agent-browser kill-all

# Delete browser session user data (profile directory)
agent-browser delete-data                # delete default browser data
agent-browser -s=mysession delete-data   # delete named browser data
```

## Environment Variable

Set a default browser session name via environment variable:

```bash
export PLAYWRIGHT_CLI_SESSION="mysession"
agent-browser open example.com  # Uses "mysession" automatically
```

## Common Patterns

### Concurrent Scraping

```bash
#!/bin/bash
# Scrape multiple sites concurrently

# Start all browsers
agent-browser -s=site1 open https://site1.com &
agent-browser -s=site2 open https://site2.com &
agent-browser -s=site3 open https://site3.com &
wait

# Take snapshots from each
agent-browser -s=site1 snapshot
agent-browser -s=site2 snapshot
agent-browser -s=site3 snapshot

# Cleanup
agent-browser close-all
```

### A/B Testing Sessions

```bash
# Test different user experiences
agent-browser -s=variant-a open "https://app.com?variant=a"
agent-browser -s=variant-b open "https://app.com?variant=b"

# Compare
agent-browser -s=variant-a screenshot
agent-browser -s=variant-b screenshot
```

### Persistent Profile

By default, browser profile is kept in memory only. Use `--persistent` flag on `open` to persist the browser profile to disk:

```bash
# Use persistent profile (auto-generated location)
agent-browser open https://example.com --persistent

# Use persistent profile with custom directory
agent-browser open https://example.com --profile=/path/to/profile
```

## Default Browser Session

When `-s` is omitted, commands use the default browser session:

```bash
# These use the same default browser session
agent-browser open https://example.com
agent-browser snapshot
agent-browser close  # Stops default browser
```

## Browser Session Configuration

Configure a browser session with specific settings when opening:

```bash
# Open with config file
agent-browser open https://example.com --config=.playwright/my-cli.json

# Open with specific browser
agent-browser open https://example.com --browser=firefox

# Open in headed mode
agent-browser open https://example.com --headed

# Open with persistent profile
agent-browser open https://example.com --persistent
```

## Best Practices

### 1. Name Browser Sessions Semantically

```bash
# GOOD: Clear purpose
agent-browser -s=github-auth open https://github.com
agent-browser -s=docs-scrape open https://docs.example.com

# AVOID: Generic names
agent-browser -s=s1 open https://github.com
```

### 2. Always Clean Up

```bash
# Stop browsers when done
agent-browser -s=auth close
agent-browser -s=scrape close

# Or stop all at once
agent-browser close-all

# If browsers become unresponsive or zombie processes remain
agent-browser kill-all
```

### 3. Delete Stale Browser Data

```bash
# Remove old browser data to free disk space
agent-browser -s=oldsession delete-data
```
