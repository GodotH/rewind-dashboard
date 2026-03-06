# Design: FIX-SUBAGENT-PARSING -- Fix Subagent Data Not Displaying for Newer Claude Sessions

## 1. Problem Statement

Users report that subagent data (tool calls, tokens) is not displayed for newer Claude Code sessions. The dashboard only shows main agent timeseries events and main agent tokens, while subagent contributions are missing. This affects both the session detail page and the stats page.

**Symptoms:**
- Agent tool calls not displayed -- only main agent tool_use events show
- Token usage only reflects main agent tokens, missing entire subagent token contribution
- Older sessions display correctly; newer sessions (after a Claude Code update) do not
- Affects session detail page (agents panel, timeline swim lanes, token summary) and stats page (model usage, token trends)

**Hypothesis:** Claude Code changed the JSONL format for subagent data in a recent update. The parser relies on specific message structures that no longer match.

---

## 2. Investigation: Current Parsing Pipeline

### 2.1 How Subagent Data is Currently Discovered

The parser in `apps/web/src/lib/parsers/session-parser.ts` discovers subagent data through three mechanisms:

**Mechanism A -- Foreground agents via `progress` messages:**
```
Main JSONL line:  { type: "progress", parentToolUseID: "task1", data: { agentId: "abc123", message: { message: { model, usage, content } } } }
```
- Agent ID extracted from `data.agentId`
- Tokens extracted from `data.message.message.usage`
- Tool calls extracted from `data.message.message.content[].tool_use`
- Linked to Task tool_use via `parentToolUseID`

**Mechanism B -- Background agents via `tool_result` text:**
```
Main JSONL line:  { type: "user", message: { content: [{ type: "tool_result", content: [{ type: "text", text: "agentId: abc123 ..." }] }] } }
```
- Agent ID extracted via regex: `/agentId:\s*(\w+)/`
- No progress messages emitted for background agents

**Mechanism C -- `toolUseResult` structured data:**
```
Main JSONL line:  { type: "user", toolUseResult: { totalTokens, totalToolUseCount, totalDurationMs, agentId, isAsync } }
```
- Fallback for agent completion stats

### 2.2 How Subagent Files are Located

```
session-parser.ts line 448:
  const subagentDir = filePath.replace(/\.jsonl$/, '')
  const subagentFilePath = `${subagentDir}/subagents/agent-${agentId}.jsonl`
```

Expected filesystem layout:
```
~/.claude/projects/<project>/
  ├── <session-id>.jsonl              # Main session
  └── <session-id>/                   # Session directory
      └── subagents/
          └── agent-<agent-id>.jsonl  # Subagent log
```

### 2.3 How Agent Dispatches are Detected

Agents are only detected if the main session JSONL contains an assistant message with a `Task` tool_use block:
```json
{
  "type": "assistant",
  "message": {
    "content": [{
      "type": "tool_use",
      "name": "Task",
      "id": "task1",
      "input": { "subagent_type": "implementer", "description": "..." }
    }]
  }
}
```

---

## 3. Potential Failure Points

Based on code analysis, these are the points where newer Claude sessions could break:

### 3.1 Changed `progress` Message Structure (HIGH LIKELIHOOD)

The parser expects deeply nested token data at `data.message.message.usage`. If Claude Code changed the nesting (e.g., flattened to `data.usage` or `data.message.usage`), all foreground agent tokens would be missed.

**Current code (line 165-166):**
```typescript
const usage = msg.data?.message?.message?.usage
```

**Possible new structures:**
- `msg.data?.usage` (flattened)
- `msg.data?.message?.usage` (one level less)
- `msg.usage` (top-level)

### 3.2 Changed Tool Name for Agent Dispatch (MEDIUM LIKELIHOOD)

If Claude Code renamed the `Task` tool (e.g., to `Dispatch`, `SubAgent`, `AgentTask`, or `Agent`), the parser at line 237 would never detect agents:
```typescript
if (block.name === 'Task' && block.input) {
```

### 3.3 Changed Subagent Directory Structure (MEDIUM LIKELIHOOD)

If the subagent JSONL files moved to a different location (e.g., `<session-id>/agents/` instead of `<session-id>/subagents/`), the file lookup at line 455 would fail silently (caught by try/catch at line 501).

### 3.4 Changed `progress` Message Type (MEDIUM LIKELIHOOD)

If the message type changed from `"progress"` to something else (e.g., `"agent_progress"`, `"subagent"`), the filter at line 150 would skip all agent progress entirely.

### 3.5 Missing `parentToolUseID` Field (MEDIUM LIKELIHOOD)

If the field linking progress messages to their parent Task tool_use was renamed (e.g., `parentToolUseId` with lowercase 'd', or `toolUseId`), the agent-to-progress linkage would break.

### 3.6 Changed `agentId` Location in Progress Messages (MEDIUM LIKELIHOOD)

If `agentId` moved from `data.agentId` to a different path (e.g., `data.agent_id`, `agentId` at top level), the agent-to-subagent-file linkage would break.

### 3.7 No More Inline Progress Messages (HIGH LIKELIHOOD for newest Claude versions)

Claude Code may have stopped emitting `progress` messages entirely for foreground agents, instead only writing to the subagent JSONL file. In this case:
- Agent tokens would not be captured via progress messages
- Only the `toolUseResult` fallback (Mechanism C) would provide completion stats
- The subagent JSONL file would be the only source of detailed tool/token data

---

## 4. Questions Requiring User Investigation

Before implementing the fix, the following must be determined by examining actual `~/.claude` session files:

### Q1: What messages appear in a new session's main JSONL when an agent is dispatched?

Examine a recent session that used subagents. Look for:
- Is the tool still called `Task`?
- Are there still `progress` type messages?
- What does the `parentToolUseID` field look like?
- What fields exist in progress message `data`?

### Q2: Where are subagent JSONL files stored in newer sessions?

Check:
- Does `<session-id>/subagents/agent-<id>.jsonl` still exist?
- Is the directory named differently?
- Is the file naming pattern different?

### Q3: How does the `toolUseResult` or agent completion data appear?

Look at the `user` message following a completed agent dispatch:
- Does it still have `toolUseResult`?
- Is the `agentId` still present?
- What is the format of completion stats?

---

## 5. Proposed Fix Architecture

### 5.1 Diagnostic-First Approach

Since we cannot examine the actual `~/.claude` files in this design phase, the fix should be implemented in two stages:

**Stage 1: Add diagnostic logging to identify the exact format change**

Add a temporary diagnostic mode that logs the raw JSONL structure of unrecognized messages, particularly:
- All messages that have `parentToolUseID` or similar fields
- All messages related to agent/subagent activity
- The directory contents of session directories

**Stage 2: Update the parser based on findings**

Once the format change is identified, update the parser to handle both old and new formats.

### 5.2 Robust Multi-Format Parser Design

```
~/.claude/projects/<dir>/<session-id>.jsonl
        |
        v
parseDetail() -- stream parse
        |
        +-- Detect agent dispatches:
        |     Check for: "Task", "Dispatch", "Agent", "SubAgent" tool names
        |     Extract: subagent_type, description, toolUseId
        |
        +-- Detect agent progress (foreground):
        |     Check for: type "progress", "agent_progress", "subagent"
        |     Extract tokens from multiple paths:
        |       data.message.message.usage  (current)
        |       data.message.usage          (possible new)
        |       data.usage                  (possible new)
        |     Extract agentId from multiple paths:
        |       data.agentId               (current)
        |       data.agent_id              (possible new)
        |       agentId                    (possible new)
        |
        +-- Detect agent ID (background):
        |     Check: tool_result text for "agentId:" pattern
        |     Check: toolUseResult.agentId
        |     Check: toolUseResult.isAsync
        |
        +-- Parse subagent JSONL files:
              Try multiple directory patterns:
                <session-id>/subagents/agent-<id>.jsonl  (current)
                <session-id>/agents/agent-<id>.jsonl     (possible new)
                <session-id>/agent-<id>.jsonl            (possible new)
```

### 5.3 Auto-Discovery of Subagent Files

Instead of hardcoding the subagent path, scan the session directory:

```
Current (fragile):
  const subagentFilePath = `${subagentDir}/subagents/agent-${agentId}.jsonl`

Proposed (robust):
  1. List contents of <session-id>/ directory
  2. Find any subdirectory containing JSONL files matching agent-*.jsonl
  3. Match by agentId
  4. Cache the discovered path pattern for the session
```

### 5.4 Fallback Token Extraction

If progress messages are no longer emitted, ensure subagent JSONL is always parsed for token data:

```
Current flow:
  progress messages → agentProgressTokens (primary)
  subagent JSONL → agent.tokens (only if no progress tokens)

Proposed flow:
  progress messages → agentProgressTokens (if available)
  subagent JSONL → always parse for authoritative data
  Merge: use max(progress, subagent) or sum if non-overlapping
```

---

## 6. Data Flow Diagram

### 6.1 Current Flow (Broken for New Sessions)

```
Main JSONL ──parse──> assistant msg ──check name==="Task"──> AgentInvocation
                 |                                               |
                 +──> progress msg ──parentToolUseID──> link to agent
                 |         |                               |
                 |         +──> data.agentId ──> agentIdByToolUseId
                 |         +──> data.message.message.usage ──> tokens
                 |         +──> data.message.message.content ──> tools
                 |
                 +──> user msg ──tool_result text──> agentId (background)
                 |
                 +──> user msg ──toolUseResult──> completion stats

After main parse:
  for each agent with agentId:
    subagentDir/subagents/agent-{agentId}.jsonl ──parse──> skills, tokens, tools
```

### 6.2 Proposed Flow (Handles Both Old and New Formats)

```
Main JSONL ──parse──> assistant msg
                 |
                 +──check tool names: "Task"|"Dispatch"|"Agent"──> AgentInvocation
                 |
                 +──> messages with parentToolUseID (any type)──> link to agent
                 |         |
                 |         +──> extract agentId (multiple paths)
                 |         +──> extract tokens (multiple paths)
                 |         +──> extract tools (multiple paths)
                 |
                 +──> user msg ──tool_result──> agentId (text or structured)
                 |
                 +──> user msg ──toolUseResult──> completion stats

After main parse:
  sessionDir = filePath.replace(/\.jsonl$/, '')
  subagentFiles = discoverSubagentFiles(sessionDir)   <-- NEW: auto-discover

  for each agent with agentId:
    find matching file in subagentFiles
    parse for: skills, tokens, tools, model
    ALWAYS merge tokens (not just when progress tokens missing)   <-- CHANGED

  for orphan subagent files (no matching agent):   <-- NEW
    still count their tokens toward session totals
```

---

## 7. File Plan

### 7.1 Modified Files

| # | File | Changes |
|---|------|---------|
| 1 | `apps/web/src/lib/parsers/session-parser.ts` | Update `parseDetail()` to handle new JSONL format; add auto-discovery for subagent files; make progress message parsing resilient to field name changes; always merge subagent JSONL data |
| 2 | `apps/web/src/lib/parsers/types.ts` | Possibly extend `RawJsonlMessage` to include new field variants |

### 7.2 Potentially Modified Files (depending on findings)

| # | File | Changes |
|---|------|---------|
| 3 | `apps/web/src/lib/scanner/active-detector.ts` | Update lock directory detection if session directory structure changed |
| 4 | `apps/web/src/lib/parsers/stats-parser.ts` | No changes needed -- stats flow through `parseDetail()` which will be fixed |
| 5 | `apps/web/src/features/session-detail/timeline-chart/timeline-data.ts` | No changes needed -- consumes `AgentInvocation[]` which is populated by parser |

### 7.3 New Files

| # | File | Purpose |
|---|------|---------|
| 1 | `apps/web/src/lib/parsers/subagent-discovery.ts` | Auto-discovery logic for subagent JSONL files within a session directory |

---

## 8. Detailed Changes

### 8.1 `session-parser.ts` -- Resilient Progress Message Parsing

Replace the single-path token extraction with a multi-path approach:

```
Current (fragile):
  const usage = msg.data?.message?.message?.usage

Proposed (resilient):
  function extractProgressUsage(msg): Usage | null {
    // Try current path
    const usage1 = msg.data?.message?.message?.usage
    if (usage1?.input_tokens != null) return usage1

    // Try alternative paths
    const usage2 = msg.data?.message?.usage
    if (usage2?.input_tokens != null) return usage2

    const usage3 = msg.data?.usage
    if (usage3?.input_tokens != null) return usage3

    return null
  }
```

Similarly for agentId:
```
function extractProgressAgentId(msg): string | undefined {
  return msg.data?.agentId ?? msg.data?.agent_id ?? msg.agentId
}
```

And for model:
```
function extractProgressModel(msg): string | undefined {
  return msg.data?.message?.message?.model
    ?? msg.data?.message?.model
    ?? msg.data?.model
}
```

And for content (tool calls):
```
function extractProgressContent(msg): ContentBlock[] | undefined {
  return msg.data?.message?.message?.content
    ?? msg.data?.message?.content
    ?? msg.data?.content
}
```

### 8.2 `session-parser.ts` -- Resilient Agent Dispatch Detection

Broaden the tool name check:

```
Current:
  if (block.name === 'Task' && block.input)

Proposed:
  const AGENT_TOOL_NAMES = new Set(['Task', 'Dispatch', 'Agent', 'SubAgent'])
  if (AGENT_TOOL_NAMES.has(block.name) && block.input)
```

And broaden the input field extraction:
```
Current:
  if (inp.subagent_type) { ... }

Proposed:
  const subagentType = inp.subagent_type ?? inp.agent_type ?? inp.type
  if (subagentType) { ... }
```

### 8.3 `subagent-discovery.ts` -- New File for Auto-Discovery

```
/**
 * Discover subagent JSONL files within a session directory.
 * Handles both old format (subagents/) and potential new formats.
 * Returns a map of agentId -> absolute file path.
 */
export async function discoverSubagentFiles(
  sessionDir: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  // Pattern 1: <session-id>/subagents/agent-<id>.jsonl (current)
  // Pattern 2: <session-id>/agents/agent-<id>.jsonl (possible)
  // Pattern 3: <session-id>/agent-<id>.jsonl (possible)

  const candidates = ['subagents', 'agents', '.']

  for (const subdir of candidates) {
    const dir = subdir === '.' ? sessionDir : path.join(sessionDir, subdir)
    try {
      const files = await fs.promises.readdir(dir)
      for (const file of files) {
        const match = file.match(/^agent-(.+)\.jsonl$/)
        if (match) {
          result.set(match[1], path.join(dir, file))
        }
      }
      if (result.size > 0) break  // Found files in this pattern, stop searching
    } catch {
      // Directory doesn't exist, try next pattern
    }
  }

  return result
}
```

### 8.4 `session-parser.ts` -- Use Auto-Discovery Instead of Hardcoded Path

Replace:
```typescript
const subagentDir = filePath.replace(/\.jsonl$/, '')
// ...
const subagentFilePath = `${subagentDir}/subagents/agent-${agentId}.jsonl`
```

With:
```typescript
const sessionDir = filePath.replace(/\.jsonl$/, '')
const subagentFileMap = await discoverSubagentFiles(sessionDir)
// ...
const subagentFilePath = subagentFileMap.get(agentId)
if (!subagentFilePath) return  // No file found for this agent
```

### 8.5 `session-parser.ts` -- Always Parse Subagent JSONL for Tokens

Currently, subagent JSONL tokens are only used when no progress tokens exist (`if (!agent.tokens)`). Change this to always parse and prefer subagent JSONL data as the authoritative source:

```
Current:
  if (!agent.tokens) {
    agent.tokens = detail.tokens
  }

Proposed:
  // Subagent JSONL is authoritative for token data
  // Progress messages may be incomplete or absent in newer formats
  if (detail.tokens.inputTokens > 0 || detail.tokens.outputTokens > 0) {
    // Only override if subagent file has actual data
    const progressTokenTotal = (agent.tokens?.inputTokens ?? 0) + (agent.tokens?.outputTokens ?? 0)
    const subagentTokenTotal = detail.tokens.inputTokens + detail.tokens.outputTokens

    if (subagentTokenTotal > progressTokenTotal) {
      // Subagent JSONL has more complete data -- use it
      // BUT: first subtract any progress-counted tokens from session totals
      // to avoid double-counting
      if (agent.tokens) {
        totalTokens.inputTokens -= agent.tokens.inputTokens
        totalTokens.outputTokens -= agent.tokens.outputTokens
        totalTokens.cacheReadInputTokens -= agent.tokens.cacheReadInputTokens
        totalTokens.cacheCreationInputTokens -= agent.tokens.cacheCreationInputTokens
      }

      agent.tokens = detail.tokens

      // Add subagent tokens to session totals
      totalTokens.inputTokens += detail.tokens.inputTokens
      totalTokens.outputTokens += detail.tokens.outputTokens
      totalTokens.cacheReadInputTokens += detail.tokens.cacheReadInputTokens
      totalTokens.cacheCreationInputTokens += detail.tokens.cacheCreationInputTokens
    }
  }
```

### 8.6 Handle `parentToolUseID` Variations

```
Current:
  if (msg.type === 'progress' && msg.parentToolUseID) {

Proposed:
  const parentId = msg.parentToolUseID ?? msg.parentToolUseId ?? msg.parent_tool_use_id
  if (msg.type === 'progress' && parentId) {
```

Update `RawJsonlMessage` type:
```typescript
parentToolUseID?: string
parentToolUseId?: string  // Alternative casing
parent_tool_use_id?: string  // Snake_case alternative
```

---

## 9. Impact Analysis

### 9.1 Session Detail Page

| Component | Current Issue | Fix Impact |
|---|---|---|
| Agents panel | Empty -- no agents detected | Agents detected via broadened tool name matching |
| Timeline swim lanes | No agent lanes | Agent lanes restored |
| Token summary | Only main agent tokens | Full session tokens including subagents |
| Tool frequency chart | Missing subagent tools | Includes subagent tool calls |
| Cost estimation | Underestimated | Accurate with all tokens |
| Context window | Main agent only | Unchanged (context window is main agent concept) |

### 9.2 Stats Page

| Component | Current Issue | Fix Impact |
|---|---|---|
| Token trends (stacked area) | Undercounted | Full tokens via `parseDetail()` fixes |
| Model usage (pie chart) | Missing subagent model usage | Included via `tokensByModel` |
| Daily activity | Missing subagent tool calls | Included via `toolFrequency` |
| Cost estimation | Underestimated | Accurate |

### 9.3 Backward Compatibility

All changes use fallback chains (try new format, fall back to current format). Existing sessions with the old format will continue to parse correctly.

---

## 10. Risks and Mitigations

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **Double-counting tokens** when both progress and subagent JSONL have data | High | Compare totals; prefer the larger source; subtract the smaller before adding the larger |
| 2 | **Wrong tool name guess** -- if the new tool name is not in our expanded set | Medium | Log unrecognized tool names with `subagent_type`-like inputs to aid future debugging |
| 3 | **Auto-discovery lists wrong directory** (e.g., other session data in session dir) | Low | Only match files matching `agent-*.jsonl` pattern |
| 4 | **Performance regression from directory listing** for every session detail parse | Low | Single `readdir()` call per session, cached by OS; only called once per detail view |
| 5 | **Format continues to evolve** breaking the parser again | Medium | Add a "format version" detection heuristic: check for known field patterns to determine format version and branch accordingly |
| 6 | **RawJsonlMessage type becomes overly broad** with optional field variants | Low | Document each variant with a comment explaining when/why it appears |

---

## 11. Task Breakdown

| # | Task | Effort | Dependencies |
|---|------|--------|-------------|
| 1 | **Investigate actual JSONL format** -- examine 2-3 recent sessions from `~/.claude` to identify exact changes | S | None |
| 2 | **Create `subagent-discovery.ts`** -- auto-discovery of subagent files | S | Task 1 |
| 3 | **Add resilient extraction helpers** -- `extractProgressUsage()`, `extractProgressAgentId()`, `extractProgressModel()`, `extractProgressContent()` | M | Task 1 |
| 4 | **Broaden agent dispatch detection** -- support multiple tool names and input field variants | S | Task 1 |
| 5 | **Update subagent file lookup** -- use auto-discovery instead of hardcoded path | S | Task 2 |
| 6 | **Fix token merging logic** -- prefer authoritative source, prevent double-counting | M | Tasks 3, 5 |
| 7 | **Update `RawJsonlMessage` type** -- add variant fields with documentation | S | Task 1 |
| 8 | **Add tests for new format** -- create test fixtures matching the new JSONL structure | M | Tasks 3-6 |
| 9 | **Test backward compatibility** -- verify old sessions still parse correctly | S | Tasks 3-6 |

**Total estimated effort:** M-L (depending on how many format changes occurred)

---

## 12. Investigation Checklist

The implementer should examine actual `~/.claude` files to answer these questions before coding:

- [ ] Is the agent dispatch tool still called `Task`? If not, what is it called?
- [ ] Are `progress` messages still emitted for foreground agents? If yes, what is their structure?
- [ ] Where is `agentId` located in progress messages?
- [ ] Where is `usage` (token data) located in progress messages?
- [ ] Where are subagent JSONL files stored? (`subagents/`? `agents/`? flat?)
- [ ] What does the `parentToolUseID` field look like in new sessions? (same name? different casing?)
- [ ] Does the `toolUseResult` field still appear in user messages after agent completion?
- [ ] Are there any new message types that didn't exist before?
- [ ] Has the subagent JSONL file naming pattern changed? (`agent-<id>.jsonl`?)

### How to investigate

```bash
# Find most recent sessions
ls -lt ~/.claude/projects/*/  | head -20

# Pick a recent session with known subagent usage
# Examine main JSONL for agent-related messages
cat <session>.jsonl | jq -c 'select(.type == "progress")' | head -5
cat <session>.jsonl | jq -c 'select(.message.content[]?.name == "Task")' | head -5

# Check subagent directory structure
ls -R <session-id>/

# Compare with an old session that works correctly
```

---

## 13. Open Questions

1. **Is this a gradual change or a hard cutoff?** Did Claude Code start the new format on a specific date/version, or is it a mix?

2. **Are there sessions where the `Task` tool IS called but progress messages are not emitted?** This would indicate a partial change (agent dispatch works, but progress reporting changed).

3. **Does the user see agents listed with zero tokens, or are agents not detected at all?** This distinguishes between "agent detection works but token extraction is broken" vs "the entire agent pipeline is broken."
