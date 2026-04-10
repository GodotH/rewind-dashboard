#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_BROWSER_BIN="${AGENT_BROWSER_BIN:-$HOME/.cargo/bin/agent-browser}"
SESSION="rewind-dashboard-e2e"
PORT="${REWIND_E2E_PORT:-3001}"
SCREENSHOT_DIR="$ROOT_DIR/e2e/screenshots"
CLAUDE_HOME_FIXTURE="$ROOT_DIR/e2e/fixtures/.claude"
DEV_PID=""

cleanup() {
  [[ -n "$DEV_PID" ]] && kill "$DEV_PID" >/dev/null 2>&1 || true
  "$AGENT_BROWSER_BIN" close --session "$SESSION" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

pass() {
  echo "[PASS] $1"
}

wait_for_http() {
  local url="$1"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

assert_body_contains() {
  local needle="$1"
  local body
  body="$("$AGENT_BROWSER_BIN" --session "$SESSION" get text body)"
  [[ "$body" == *"$needle"* ]] || fail "missing text: $needle"
}

settle_page() {
  "$AGENT_BROWSER_BIN" --session "$SESSION" wait 1000 >/dev/null
}

if [[ ! -x "$AGENT_BROWSER_BIN" ]]; then
  AGENT_BROWSER_BIN="$(command -v "$AGENT_BROWSER_BIN" 2>/dev/null || true)"
fi
[[ -n "$AGENT_BROWSER_BIN" ]] || fail "agent-browser executable not found"

mkdir -p "$SCREENSHOT_DIR"

cd "$ROOT_DIR"
CLAUDE_HOME="$CLAUDE_HOME_FIXTURE" npm run dev -- --port "$PORT" >/tmp/rewind-dashboard-e2e.log 2>&1 &
DEV_PID=$!

wait_for_http "http://127.0.0.1:$PORT" || fail "dashboard dev server did not start"

"$AGENT_BROWSER_BIN" --session "$SESSION" open "http://127.0.0.1:$PORT/"
settle_page

current_url="$("$AGENT_BROWSER_BIN" --session "$SESSION" get url)"
[[ "$current_url" == *"/sessions"* ]] || fail "root did not redirect to /sessions"
pass "root redirects to sessions"

assert_body_contains "app"
assert_body_contains "another"
pass "sessions page shows fixture projects"
"$AGENT_BROWSER_BIN" --session "$SESSION" screenshot "$SCREENSHOT_DIR/sessions-list.png"

"$AGENT_BROWSER_BIN" --session "$SESSION" open "http://127.0.0.1:$PORT/stats"
settle_page
assert_body_contains "Total Sessions"
assert_body_contains "Total Messages"
assert_body_contains "Model Usage"
pass "stats page loads"
"$AGENT_BROWSER_BIN" --session "$SESSION" screenshot "$SCREENSHOT_DIR/stats-overview.png"

"$AGENT_BROWSER_BIN" --session "$SESSION" open "http://127.0.0.1:$PORT/settings"
settle_page
assert_body_contains "Settings"
assert_body_contains "Subscription Tier"
assert_body_contains "API Pricing"
pass "settings page loads"
"$AGENT_BROWSER_BIN" --session "$SESSION" screenshot "$SCREENSHOT_DIR/settings-page-full.png"

"$AGENT_BROWSER_BIN" --session "$SESSION" open "http://127.0.0.1:$PORT/projects"
settle_page
assert_body_contains "Total Projects"
pass "projects page loads"
"$AGENT_BROWSER_BIN" --session "$SESSION" screenshot "$SCREENSHOT_DIR/projects-page.png"

"$AGENT_BROWSER_BIN" --session "$SESSION" open "http://127.0.0.1:$PORT/sessions/session-001"
settle_page
assert_body_contains "Context Window"
assert_body_contains "Tool Usage"
assert_body_contains "Cost Estimation"
pass "session detail page loads"
"$AGENT_BROWSER_BIN" --session "$SESSION" screenshot "$SCREENSHOT_DIR/session-detail-001.png"

"$AGENT_BROWSER_BIN" --session "$SESSION" open "http://127.0.0.1:$PORT/sessions/session-002"
settle_page
assert_body_contains "Errors"
assert_body_contains "overloaded"
pass "error session detail renders"
"$AGENT_BROWSER_BIN" --session "$SESSION" screenshot "$SCREENSHOT_DIR/session-detail-002-errors.png"

echo "Summary: rewind-dashboard agent-browser smoke passed"
