---
name: investigate
description: Investigate a URL or page using Playwright browser
user_invocable: true
arguments:
  - name: url
    description: "URL or path to investigate (e.g., /agents, https://example.com)"
    required: true
---

# Browser Investigation

You are investigating **$ARGUMENTS.url** using Playwright.

## Steps

### 1. Resolve URL
- If the URL starts with `/`, prepend `http://localhost:3000`
- If the URL starts with `http`, use as-is
- Check if the dev server is running on :3000; if not, suggest `npm run dev`

### 2. Navigate
- Use `agent-browser open` to open the URL
- Take a screenshot with `agent-browser screenshot`

### 3. Inspect
- Use `agent-browser snapshot` to get the accessibility tree
- Check `agent-browser logs` for errors
- Check `agent-browser network requests` for failed requests

### 4. Report
- Summarize what you see: layout, content, errors
- If there are console errors or network failures, list them
- Suggest fixes if issues are found

## Notes
- Use Playwright MCP tools, not Bash-based browser commands
- Take screenshots at each significant step
- Close the browser when done: `agent-browser close`
