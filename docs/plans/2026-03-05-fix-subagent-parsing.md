# Implementation Plan: Fix Subagent Parsing for Claude Code 2.1.68+

**Date:** 2026-03-05
**Design doc:** `docs/designs/design-fix-subagent-parsing.md`
**Branch:** `feature/FIX-SUBAGENT-PARSING-fix-subagent-data`

---

## Investigation Findings (Confirmed)

These facts were confirmed by examining actual `~/.claude` session files and drive every task below:

| Question | Answer |
|----------|--------|
| Agent dispatch tool name | `Task` (old) and `Agent` (new, since 2.1.68) |
| `progress` messages with agent data | **Gone** -- 0 per session in 2.1.68. Only `hook_progress` remains |
| `agent_progress` messages | **Gone** -- 219 per session in 2.1.63, 0 in 2.1.68 |
| Subagent file location | Unchanged: `<session-id>/subagents/agent-*.jsonl` |
| `agentId` in tool_result text | Still present: `agentId: abc123` |
| `toolUseResult.agentId` | Still present in structured data |
| New: `tool-results/` directory | Exists in session folder (informational, not needed for fix) |

---

## Task Dependency Graph

```
Task 1 (subagent-discovery.ts)
    |
    v
Task 2 (Agent tool name) --+
    |                       |
    v                       v
Task 3 (agentId from       Task 4 (always parse
 tool_result for ALL          subagent JSONL)
 agents, not just bg)           |
    |                           |
    v                           v
Task 5 (double-count prevention + token merge)
    |
    v
Task 6 (orphan subagent handling)
    |
    v
Task 7 (update RawJsonlMessage type)
    |
    v
Task 8 (unit tests)
    |
    v
Task 9 (integration test with real fixture)
    |
    v
Task 10 (backward compat verification)
```

---

## Task 1: Create `subagent-discovery.ts` -- Auto-discover subagent files

**File:** `apps/web/src/lib/parsers/subagent-discovery.ts` (NEW)

**What to do:**
- Create a function `discoverSubagentFiles(sessionDir: string): Promise<Map<string, string>>`
- List contents of `<sessionDir>/subagents/` directory
- Match files against pattern `agent-*.jsonl`
- Return `Map<agentId, absoluteFilePath>`
- If directory does not exist, return empty map (no throw)
- Also check `<sessionDir>/agents/` as a fallback directory name

**Detailed logic:**
```
1. const candidateDirs = ['subagents', 'agents']
2. For each dir:
   a. Try fs.promises.readdir(path.join(sessionDir, dir))
   b. Filter files matching /^agent-(.+)\.jsonl$/
   c. Extract agentId from capture group
   d. Map agentId -> absolute path
   e. If found files, return immediately (skip remaining dirs)
3. Return empty Map if nothing found
```

**Test strategy:**
- Unit test with a temp directory containing mock `subagents/agent-abc.jsonl` files
- Test empty directory returns empty map
- Test missing directory returns empty map (no error)

**Estimated time:** 3 minutes

---

## Task 2: Broaden agent dispatch detection -- `Task` and `Agent` tool names

**File:** `apps/web/src/lib/parsers/session-parser.ts`
**Lines:** 237-249 (the `if (block.name === 'Task' && block.input)` block)

**What to change:**

Add a constant at module level:
```typescript
const AGENT_DISPATCH_TOOL_NAMES = new Set(['Task', 'Agent'])
```

Replace line 237:
```typescript
// BEFORE
if (block.name === 'Task' && block.input) {

// AFTER
if (AGENT_DISPATCH_TOOL_NAMES.has(block.name) && block.input) {
```

Inside the block, also broaden input field extraction (line 239):
```typescript
// BEFORE
if (inp.subagent_type) {

// AFTER
const subagentType = inp.subagent_type ?? inp.agent_type ?? inp.type
if (subagentType) {
```

And update the agent construction to use the broadened field:
```typescript
subagentType: String(subagentType),
description: String(inp.description ?? inp.prompt ?? ''),
```

**Why:** The `Agent` tool in 2.1.68 may use `prompt` instead of `description` and may use different field names for the type.

**Test strategy:**
- Unit test: parse a JSONL line with `{ name: "Agent", input: { subagent_type: "implementer" } }` and verify AgentInvocation is created
- Unit test: parse a JSONL line with old `Task` name still works

**Estimated time:** 3 minutes

---

## Task 3: Extract `agentId` from tool_result for ALL agents (not just background)

**File:** `apps/web/src/lib/parsers/session-parser.ts`
**Lines:** 374-404 (the tool_result handling block)

**What to change:**

The current code already extracts `agentId` from tool_result text (line 379) and from `toolUseResult` (line 395-397). However, the `toolUseResult` processing at line 386-404 only runs when `agentByToolUseId.get(toolUseId)` finds a match -- meaning it only works for agents detected via `Task` tool_use.

The `agentId` text extraction at line 379 already works for any tool_result. No change needed there.

The key change: move the `agentIdByToolUseId` extraction from `toolUseResult` OUTSIDE the `if (agent)` guard so it fires even when no agent dispatch was detected yet (handles race conditions in message ordering).

```typescript
// BEFORE (line 386-404):
if (msg.toolUseResult && toolUseId) {
  const agent = agentByToolUseId.get(String(toolUseId))
  if (agent) {
    // ... extract stats ...
    if (result.isAsync === true && result.agentId) {
      agentIdByToolUseId.set(String(toolUseId), result.agentId)
    }
  }
}

// AFTER:
if (msg.toolUseResult && toolUseId) {
  const result = msg.toolUseResult

  // Always extract agentId regardless of whether we found a matching agent dispatch
  if (result.agentId) {
    agentIdByToolUseId.set(String(toolUseId), result.agentId)
  }

  const agent = agentByToolUseId.get(String(toolUseId))
  if (agent) {
    if (result.totalTokens) agent.totalTokens = result.totalTokens
    if (result.totalToolUseCount) agent.totalToolUseCount = result.totalToolUseCount
    if (result.totalDurationMs) agent.durationMs = result.totalDurationMs
  }

  if (result.retrieval_status && result.task?.task_id) {
    agentIdByToolUseId.set(String(toolUseId), result.task.task_id)
  }
}
```

**Test strategy:**
- Unit test: toolUseResult with agentId but NO matching Task tool_use -> agentIdByToolUseId still populated

**Estimated time:** 3 minutes

---

## Task 4: Always parse subagent JSONL files (not just as fallback)

**File:** `apps/web/src/lib/parsers/session-parser.ts`
**Lines:** 447-505 (the post-parse agent enrichment section)

**What to change:**

Replace the current enrichment loop with one that:
1. Uses `discoverSubagentFiles()` instead of hardcoded path
2. Always calls `parseSubagentDetail()` for each agent with an agentId
3. Passes results to a new merge function (Task 5)

```typescript
// BEFORE (line 448-505):
const subagentDir = filePath.replace(/\.jsonl$/, '')
await Promise.all(
  agents.map(async (agent) => {
    const agentId = agentIdByToolUseId.get(agent.toolUseId)
    if (!agentId) return
    agent.agentId = agentId
    const subagentFilePath = `${subagentDir}/subagents/agent-${agentId}.jsonl`
    // ... try/catch with conditional merge ...
  }),
)

// AFTER:
const sessionDir = filePath.replace(/\.jsonl$/, '')
const subagentFileMap = await discoverSubagentFiles(sessionDir)

await Promise.all(
  agents.map(async (agent) => {
    const agentId = agentIdByToolUseId.get(agent.toolUseId)
    if (!agentId) return
    agent.agentId = agentId

    const subagentFilePath = subagentFileMap.get(agentId)
    if (!subagentFilePath) return

    try {
      const detail = await parseSubagentDetail(subagentFilePath)
      mergeSubagentData(agent, detail, totalTokens, tokensByModel, agentProgressTokens)
    } catch {
      // Subagent file not readable -- skip
    }
  }),
)
```

**Import needed:** Add `import { discoverSubagentFiles } from './subagent-discovery'`

**Test strategy:**
- Verify that `discoverSubagentFiles` is called instead of hardcoded path construction
- Mock filesystem test with subagent files in discovered location

**Estimated time:** 4 minutes

---

## Task 5: Prevent double-counting tokens -- smart merge logic

**File:** `apps/web/src/lib/parsers/session-parser.ts`
**New function:** `mergeSubagentData()`

**What to create:**

Extract a function that handles the merge logic for a single agent:

```typescript
function mergeSubagentData(
  agent: AgentInvocation,
  detail: SubagentDetail,
  totalTokens: TokenUsage,
  tokensByModel: Record<string, TokenUsage>,
  agentProgressTokens: Map<string, TokenUsage>,
): void {
  // 1. Always set skills (most complete source)
  agent.skills = detail.skills

  // 2. Determine if progress tokens were already counted for this agent
  const hadProgressTokens = agentProgressTokens.has(agent.toolUseId)
  const progressTokens = agentProgressTokens.get(agent.toolUseId)

  // 3. Determine authoritative token source
  const subagentHasTokens = detail.tokens.inputTokens > 0 || detail.tokens.outputTokens > 0

  if (subagentHasTokens) {
    if (hadProgressTokens && progressTokens) {
      // Progress tokens were already added to totalTokens and tokensByModel.
      // Subtract them, then add subagent tokens (more authoritative).
      subtractTokens(totalTokens, progressTokens)

      // Also subtract from per-model tracking
      const progressModel = agent.model // model was set from progress data
      if (progressModel && tokensByModel[progressModel]) {
        subtractTokens(tokensByModel[progressModel], progressTokens)
      }
    }

    // Set agent tokens from subagent JSONL
    agent.tokens = detail.tokens

    // Add subagent tokens to session totals
    addTokens(totalTokens, detail.tokens)

    // Add to per-model tracking
    if (detail.model) {
      const modelTokens = tokensByModel[detail.model] ?? createEmptyTokenUsage()
      addTokens(modelTokens, detail.tokens)
      tokensByModel[detail.model] = modelTokens
    }
  } else if (!agent.tokens) {
    // No subagent tokens and no progress tokens -- leave as-is
  }

  // 4. Merge tool calls (subagent JSONL is authoritative)
  if (!agent.toolCalls || Object.keys(agent.toolCalls).length === 0) {
    agent.toolCalls = detail.toolCalls
  }

  // 5. Merge model (prefer subagent JSONL if not already set)
  if (!agent.model && detail.model) {
    agent.model = detail.model
  }

  // 6. Merge tool use count
  if (!agent.totalToolUseCount && detail.totalToolUseCount > 0) {
    agent.totalToolUseCount = detail.totalToolUseCount
  }
}
```

Also create small helpers:
```typescript
function createEmptyTokenUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }
}

function addTokens(target: TokenUsage, source: TokenUsage): void {
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
  target.cacheReadInputTokens += source.cacheReadInputTokens
  target.cacheCreationInputTokens += source.cacheCreationInputTokens
}

function subtractTokens(target: TokenUsage, source: TokenUsage): void {
  target.inputTokens -= source.inputTokens
  target.outputTokens -= source.outputTokens
  target.cacheReadInputTokens -= source.cacheReadInputTokens
  target.cacheCreationInputTokens -= source.cacheCreationInputTokens
}
```

**Key insight:** When progress messages existed (old format), tokens were added to `totalTokens` and `tokensByModel` inline during the progress parsing loop (lines 179-206). When we later parse the subagent JSONL and find it has better data, we must subtract the progress tokens first to avoid double-counting.

For new sessions (2.1.68+) where progress messages are absent, `hadProgressTokens` will be false, so we just add subagent tokens directly.

**Test strategy:**
- Unit test: agent with progress tokens AND subagent tokens -> verify no double-counting
- Unit test: agent with NO progress tokens AND subagent tokens -> verify tokens added once
- Unit test: agent with progress tokens but NO subagent file -> verify progress tokens retained

**Estimated time:** 5 minutes

---

## Task 6: Handle orphan subagent files

**File:** `apps/web/src/lib/parsers/session-parser.ts`
**Location:** After the existing agent enrichment loop (after Task 4 changes)

**What to add:**

After enriching known agents, check for subagent files that were discovered but not matched to any agent dispatch. These are "orphan" subagent files -- they exist on disk but no `Task`/`Agent` tool_use was found in the main JSONL (could happen if the main JSONL was truncated or the dispatch format changed in a way we do not recognize yet).

```typescript
// After the agents.map() Promise.all block:

// Handle orphan subagent files (found on disk but no matching agent dispatch)
const matchedAgentIds = new Set(
  agents.map((a) => a.agentId).filter(Boolean)
)

for (const [agentId, filePath] of subagentFileMap) {
  if (matchedAgentIds.has(agentId)) continue

  try {
    const detail = await parseSubagentDetail(filePath)

    // Add orphan tokens to session totals (they represent real API usage)
    if (detail.tokens.inputTokens > 0 || detail.tokens.outputTokens > 0) {
      addTokens(totalTokens, detail.tokens)

      if (detail.model) {
        const modelTokens = tokensByModel[detail.model] ?? createEmptyTokenUsage()
        addTokens(modelTokens, detail.tokens)
        tokensByModel[detail.model] = modelTokens
      }
    }

    // Add orphan tool calls to session-level tool frequency
    for (const [toolName, count] of Object.entries(detail.toolCalls)) {
      toolFrequency[toolName] = (toolFrequency[toolName] ?? 0) + count
    }

    // Create a synthetic AgentInvocation for the orphan
    agents.push({
      subagentType: 'unknown',
      description: `Discovered subagent (${agentId})`,
      timestamp: '',
      toolUseId: `orphan-${agentId}`,
      agentId,
      tokens: detail.tokens,
      toolCalls: detail.toolCalls,
      model: detail.model,
      totalToolUseCount: detail.totalToolUseCount,
      skills: detail.skills,
    })
  } catch {
    // File not readable -- skip
  }
}
```

**Test strategy:**
- Unit test: session dir has `agent-xyz.jsonl` but no `Agent`/`Task` call in main JSONL -> orphan agent created with tokens
- Unit test: orphan tokens added to totalTokens and tokensByModel

**Estimated time:** 4 minutes

---

## Task 7: Update `RawJsonlMessage` type

**File:** `apps/web/src/lib/parsers/types.ts`
**Lines:** 188-255 (RawJsonlMessage interface)

**What to change:**

No structural changes needed based on confirmed findings. The existing type already supports:
- `parentToolUseID` (line 238)
- `toolUseResult.agentId` (line 243)
- `data.agentId` (line 221)

However, add a comment documenting the 2.1.68 changes for future maintainers:

```typescript
/**
 * Raw JSONL message from Claude Code session files.
 *
 * Format changes by version:
 * - <= 2.1.63: Agent dispatch via "Task" tool, progress messages with agent data
 * - >= 2.1.68: Agent dispatch via "Agent" tool, NO progress messages for agents,
 *              subagent JSONL files are the only source of agent token/tool data.
 *              agentId still appears in tool_result text and toolUseResult.
 */
export interface RawJsonlMessage {
```

**Test strategy:** Typecheck passes (`npm run typecheck`)

**Estimated time:** 2 minutes

---

## Task 8: Unit tests for new and changed functions

**File:** `apps/web/src/lib/parsers/__tests__/subagent-discovery.test.ts` (NEW)
**File:** `apps/web/src/lib/parsers/__tests__/session-parser-subagent.test.ts` (NEW)

### 8a: Tests for `discoverSubagentFiles`

```
Test cases:
1. Directory with subagents/ containing agent-abc.jsonl, agent-def.jsonl
   -> Returns Map { "abc" => "...agent-abc.jsonl", "def" => "...agent-def.jsonl" }
2. Empty subagents/ directory -> Returns empty Map
3. Session directory does not exist -> Returns empty Map (no error)
4. Non-jsonl files in subagents/ are ignored
5. Files not matching agent-*.jsonl pattern are ignored
```

### 8b: Tests for `mergeSubagentData`

Since `mergeSubagentData` will be a module-private function, test it indirectly through `parseDetail()` using fixture JSONL files.

Create fixture files:
- `fixtures/new-format-session.jsonl` -- simulates 2.1.68 format (Agent tool, no progress messages)
- `fixtures/new-format-session/subagents/agent-testid.jsonl` -- subagent data

```
Test cases:
1. New format session: Agent tool detected, tokens from subagent JSONL added to totals
2. Old format session: Task tool detected, progress tokens present, subagent tokens replace if larger
3. Mixed: some agents have progress, some do not
4. Orphan subagent file: no agent dispatch but file exists -> synthetic agent created
```

### 8c: Tests for broadened tool name detection

```
Test cases:
1. block.name === "Task" -> AgentInvocation created (backward compat)
2. block.name === "Agent" -> AgentInvocation created (new format)
3. block.name === "Read" -> NOT treated as agent dispatch
```

**Estimated time:** 5 minutes (fixture creation) + 5 minutes (test code)

---

## Task 9: Integration test with real-world fixture

**File:** `apps/web/src/lib/parsers/__tests__/session-parser-integration.test.ts` (NEW)

**What to do:**
- Create a realistic fixture pair: main JSONL + subagent JSONL that mimics the 2.1.68 format
- The main JSONL should have:
  - An assistant message with `{ name: "Agent", input: { subagent_type: "implementer", prompt: "..." } }`
  - A user message with tool_result containing `agentId: test123`
  - A user message with `toolUseResult: { agentId: "test123", totalTokens: 5000 }`
  - NO progress messages with agent data
  - Normal assistant messages with usage (main agent tokens)
- The subagent JSONL (`subagents/agent-test123.jsonl`) should have:
  - Assistant messages with usage (subagent tokens)
  - Tool_use blocks (subagent tool calls)
  - A user message with `<command-name>typescript-rules</command-name>` (injected skill)

**Assertions:**
- `result.agents.length === 1`
- `result.agents[0].subagentType === 'implementer'`
- `result.agents[0].agentId === 'test123'`
- `result.agents[0].tokens.inputTokens > 0` (from subagent JSONL)
- `result.agents[0].skills.length >= 1`
- `result.totalTokens.inputTokens` includes both main + subagent tokens
- `result.tokensByModel` has entries for both main model and subagent model

**Estimated time:** 5 minutes

---

## Task 10: Backward compatibility verification

**File:** `apps/web/src/lib/parsers/__tests__/session-parser-backward-compat.test.ts` (NEW)

**What to do:**
- Create a fixture that mimics the OLD format (2.1.63):
  - `Task` tool name
  - `progress` messages with `parentToolUseID`, `data.agentId`, `data.message.message.usage`
  - Subagent JSONL file also present

**Assertions:**
- Agents still detected via `Task` tool name
- Progress tokens still extracted correctly
- Subagent JSONL tokens replace progress tokens (since subagent is now authoritative)
- No double-counting: `totalTokens` matches expected sum
- Skills still extracted from subagent JSONL

**Estimated time:** 4 minutes

---

## Summary Table

| # | Task | File(s) | Est. Time | Depends On |
|---|------|---------|-----------|------------|
| 1 | Create subagent-discovery.ts | `lib/parsers/subagent-discovery.ts` (NEW) | 3 min | -- |
| 2 | Broaden agent dispatch tool names | `lib/parsers/session-parser.ts` L237 | 3 min | -- |
| 3 | Extract agentId for all agents | `lib/parsers/session-parser.ts` L386-404 | 3 min | -- |
| 4 | Use auto-discovery for subagent files | `lib/parsers/session-parser.ts` L447-505 | 4 min | 1 |
| 5 | Smart token merge (no double-count) | `lib/parsers/session-parser.ts` (new fn) | 5 min | 4 |
| 6 | Handle orphan subagent files | `lib/parsers/session-parser.ts` (after enrichment) | 4 min | 1, 5 |
| 7 | Update RawJsonlMessage comments | `lib/parsers/types.ts` | 2 min | -- |
| 8 | Unit tests | `lib/parsers/__tests__/` (NEW) | 10 min | 1-6 |
| 9 | Integration test | `lib/parsers/__tests__/` (NEW) | 5 min | 1-6 |
| 10 | Backward compat test | `lib/parsers/__tests__/` (NEW) | 4 min | 1-6 |

**Total estimated time:** ~43 minutes

---

## Quality Gates (before PR)

```bash
cd apps/web
npm run typecheck   # Must pass
npm run test        # Must pass (including new tests)
npm run build       # Must pass
```

---

## Rollback Plan

All changes are additive -- the broadened tool name set includes the old name, the discovery function falls back gracefully, and the merge logic handles both old and new formats. If a regression is found:

1. Revert the branch
2. The old parser still works for pre-2.1.68 sessions
3. New sessions would again show missing subagent data (pre-existing bug)
