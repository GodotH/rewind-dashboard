---
name: agent-browser
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.
allowed-tools: Bash(agent-browser:*)
---

# Browser Automation with agent-browser

## Quick start

```bash
# open new browser
agent-browser open
# navigate to a page
agent-browser goto https://playwright.dev
# interact with the page using refs from the snapshot
agent-browser click e15
agent-browser type "page.click"
agent-browser press Enter
# take a screenshot
agent-browser screenshot
# close the browser
agent-browser close
```

## Commands

### Core

```bash
agent-browser open
# open and navigate right away
agent-browser open https://example.com/
agent-browser goto https://playwright.dev
agent-browser type "search query"
agent-browser click e3
agent-browser dblclick e7
agent-browser fill e5 "user@example.com"
agent-browser drag e2 e8
agent-browser hover e4
agent-browser select e9 "option-value"
agent-browser upload ./document.pdf
agent-browser check e12
agent-browser uncheck e12
agent-browser snapshot
agent-browser snapshot --filename=after-click.yaml
agent-browser eval "document.title"
agent-browser eval "el => el.textContent" e5
agent-browser dialog-accept
agent-browser dialog-accept "confirmation text"
agent-browser dialog-dismiss
agent-browser resize 1920 1080
agent-browser close
```

### Navigation

```bash
agent-browser go-back
agent-browser go-forward
agent-browser reload
```

### Keyboard

```bash
agent-browser press Enter
agent-browser press ArrowDown
agent-browser keydown Shift
agent-browser keyup Shift
```

### Mouse

```bash
agent-browser mousemove 150 300
agent-browser mousedown
agent-browser mousedown right
agent-browser mouseup
agent-browser mouseup right
agent-browser mousewheel 0 100
```

### Save as

```bash
agent-browser screenshot
agent-browser screenshot e5
agent-browser screenshot --filename=page.png
agent-browser pdf --filename=page.pdf
```

### Tabs

```bash
agent-browser tab-list
agent-browser tab-new
agent-browser tab-new https://example.com/page
agent-browser tab-close
agent-browser tab-close 2
agent-browser tab-select 0
```

### Storage

```bash
agent-browser state-save
agent-browser state-save auth.json
agent-browser state-load auth.json

# Cookies
agent-browser cookie-list
agent-browser cookie-list --domain=example.com
agent-browser cookie-get session_id
agent-browser cookie-set session_id abc123
agent-browser cookie-set session_id abc123 --domain=example.com --httpOnly --secure
agent-browser cookie-delete session_id
agent-browser cookie-clear

# LocalStorage
agent-browser localstorage-list
agent-browser localstorage-get theme
agent-browser localstorage-set theme dark
agent-browser localstorage-delete theme
agent-browser localstorage-clear

# SessionStorage
agent-browser sessionstorage-list
agent-browser sessionstorage-get step
agent-browser sessionstorage-set step 3
agent-browser sessionstorage-delete step
agent-browser sessionstorage-clear
```

### Network

```bash
agent-browser route "**/*.jpg" --status=404
agent-browser route "https://api.example.com/**" --body='{"mock": true}'
agent-browser route-list
agent-browser unroute "**/*.jpg"
agent-browser unroute
```

### DevTools

```bash
agent-browser console
agent-browser console warning
agent-browser network
agent-browser run-code "async page => await page.context().grantPermissions(['geolocation'])"
agent-browser tracing-start
agent-browser tracing-stop
agent-browser video-start
agent-browser video-stop video.webm
```

### Install

```bash
agent-browser install --skills
agent-browser install-browser
```

### Configuration
```bash
# Use specific browser when creating session
agent-browser open --browser=chrome
agent-browser open --browser=firefox
agent-browser open --browser=webkit
agent-browser open --browser=msedge
# Connect to browser via extension
agent-browser open --extension

# Use persistent profile (by default profile is in-memory)
agent-browser open --persistent
# Use persistent profile with custom directory
agent-browser open --profile=/path/to/profile

# Start with config file
agent-browser open --config=my-config.json

# Close the browser
agent-browser close
# Delete user data for the default session
agent-browser delete-data
```

### Browser Sessions

```bash
# create new browser session named "mysession" with persistent profile
agent-browser -s=mysession open example.com --persistent
# same with manually specified profile directory (use when requested explicitly)
agent-browser -s=mysession open example.com --profile=/path/to/profile
agent-browser -s=mysession click e6
agent-browser -s=mysession close  # stop a named browser
agent-browser -s=mysession delete-data  # delete user data for persistent session

agent-browser list
# Close all browsers
agent-browser close-all
# Forcefully kill all browser processes
agent-browser kill-all
```

## Example: Form submission

```bash
agent-browser open https://example.com/form
agent-browser snapshot

agent-browser fill e1 "user@example.com"
agent-browser fill e2 "password123"
agent-browser click e3
agent-browser snapshot
agent-browser close
```

## Example: Multi-tab workflow

```bash
agent-browser open https://example.com
agent-browser tab-new https://example.com/other
agent-browser tab-list
agent-browser tab-select 0
agent-browser snapshot
agent-browser close
```

## Example: Debugging with DevTools

```bash
agent-browser open https://example.com
agent-browser click e4
agent-browser fill e7 "test"
agent-browser console
agent-browser network
agent-browser close
```

```bash
agent-browser open https://example.com
agent-browser tracing-start
agent-browser click e4
agent-browser fill e7 "test"
agent-browser tracing-stop
agent-browser close
```

## Specific tasks

* **Request mocking** [references/request-mocking.md](references/request-mocking.md)
* **Running Playwright code** [references/running-code.md](references/running-code.md)
* **Browser session management** [references/session-management.md](references/session-management.md)
* **Storage state (cookies, localStorage)** [references/storage-state.md](references/storage-state.md)
* **Test generation** [references/test-generation.md](references/test-generation.md)
* **Tracing** [references/tracing.md](references/tracing.md)
* **Video recording** [references/video-recording.md](references/video-recording.md)
