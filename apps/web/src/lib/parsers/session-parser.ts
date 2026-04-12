import * as fs from 'node:fs'
import * as readline from 'node:readline'
import type {
  SessionSummary,
  SessionDetail,
  Turn,
  ToolCall,
  TokenUsage,
  SessionError,
  AgentInvocation,
  SkillInvocation,
  TaskItem,
  RawJsonlMessage,
  ContextWindowSnapshot,
  ContextWindowData,
  SessionProvider,
} from './types'
import { discoverSubagentFiles } from './subagent-discovery'

/** Tool names that dispatch a subagent (Task = legacy, Agent = 2.1.68+) */
const AGENT_DISPATCH_TOOL_NAMES = new Set(['Task', 'Agent'])

const HEAD_LINES = 15
const TAIL_LINES = 15

/**
 * Parse a session summary.
 */
export async function parseSummary(
  filePath: string,
  sessionId: string,
  projectPath: string,
  projectName: string,
  fileSizeBytes: number,
  provider: SessionProvider = 'claude',
): Promise<SessionSummary | null> {
  if (provider === 'gemini') {
    return parseGeminiSummary(filePath, sessionId, projectPath, projectName, fileSizeBytes)
  }
  if (provider === 'codex') {
    return parseCodexSummary(filePath, sessionId, projectPath, projectName, fileSizeBytes)
  }

  const headLines = await readHeadLines(filePath, HEAD_LINES)
  const tailLines = await readTailLines(filePath, TAIL_LINES)
  const headSet = new Set(headLines)
  const allLines = [...headLines, ...tailLines.filter((line) => !headSet.has(line))]

  if (allLines.length === 0) return null

  let startedAt: string | null = null
  let lastActiveAt: string | null = null
  let branch: string | null = null
  let cwd: string | null = null
  let model: string | null = null
  let version: string | null = null
  let userMessageCount = 0
  let assistantMessageCount = 0
  let totalMessageCount = 0
  let firstUserMessage: string | null = null
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let claudeName: string | null = null

  for (const line of allLines) {
    const msg = safeParse(line)
    if (!msg) continue
    if (msg.type === 'file-history-snapshot') continue

    const ts = msg.timestamp || msg.payload?.timestamp
    if (ts) {
      if (!startedAt || ts < startedAt) startedAt = ts
      if (!lastActiveAt || ts > lastActiveAt) lastActiveAt = ts
    }

    if (msg.gitBranch && !branch) branch = msg.gitBranch
    if (msg.cwd && !cwd) cwd = msg.cwd
    if (msg.version && !version) version = msg.version

    if (msg.type === 'user') {
      userMessageCount++
      if (!firstUserMessage) {
        const content = msg.message?.content
        if (Array.isArray(content)) {
          const textBlock = content.find((c) => c.type === 'text' && c.text)
          if (textBlock?.text) {
            const text = textBlock.text.trim()
            if (
              !text.startsWith('Base directory for this skill:')
              && !text.startsWith('<command-')
              && !text.startsWith('<system-')
              && !text.startsWith('---\nname:')
            ) {
              firstUserMessage = text.slice(0, 120)
            }
          }
        }
      }
    }
    if (msg.type === 'assistant') {
      assistantMessageCount++
      if (msg.message?.model && !model) model = msg.message.model
      const usage = msg.message?.usage
      if (usage) {
        totalInputTokens += (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
        totalOutputTokens += usage.output_tokens ?? 0
      }
    }
    if (msg.type === 'user' || msg.type === 'assistant' || msg.type === 'system') {
      totalMessageCount++
    }
  }

  if (!startedAt) return null

  const durationMs =
    startedAt && lastActiveAt
      ? new Date(lastActiveAt).getTime() - new Date(startedAt).getTime()
      : 0

  return {
    sessionId,
    projectPath,
    projectName,
    provider,
    branch,
    cwd,
    startedAt,
    lastActiveAt: lastActiveAt ?? startedAt,
    durationMs,
    messageCount: totalMessageCount,
    userMessageCount,
    assistantMessageCount,
    isActive: false,
    sessionState: 'inactive',
    model,
    version,
    fileSizeBytes,
    totalTokens: totalInputTokens + totalOutputTokens,
    firstUserMessage,
    claudeName,
  }
}

async function parseGeminiSummary(
  filePath: string,
  sessionId: string,
  projectPath: string,
  projectName: string,
  fileSizeBytes: number,
): Promise<SessionSummary | null> {
  let data: any
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    data = JSON.parse(content)
  } catch {
    return null
  }

  const messages = data.messages || []
  if (messages.length === 0) return null

  const startedAt = data.startTime || messages[0].timestamp
  const lastActiveAt = data.lastUpdated || messages[messages.length - 1].timestamp
  const durationMs =
    startedAt && lastActiveAt
      ? new Date(lastActiveAt).getTime() - new Date(startedAt).getTime()
      : 0

  let userMessageCount = 0
  let assistantMessageCount = 0
  let firstUserMessage: string | null = null
  let model: string | null = null
  let totalTokens = 0

  for (const m of messages) {
    if (m.type === 'user') {
      userMessageCount++
      if (!firstUserMessage) {
        if (Array.isArray(m.content)) {
          firstUserMessage = m.content[0]?.text?.slice(0, 120) || null
        } else if (typeof m.content === 'string') {
          firstUserMessage = m.content.slice(0, 120)
        }
      }
    } else if (m.type === 'gemini') {
      assistantMessageCount++
      if (!model) model = m.model
    }
    if (m.tokens?.total) {
      totalTokens += m.tokens.total
    }
  }

  return {
    sessionId,
    projectPath,
    projectName,
    provider: 'gemini',
    branch: null,
    cwd: null,
    startedAt,
    lastActiveAt: lastActiveAt ?? startedAt,
    durationMs,
    messageCount: messages.length,
    userMessageCount,
    assistantMessageCount,
    isActive: false,
    sessionState: 'inactive',
    model,
    version: null,
    fileSizeBytes,
    totalTokens,
    firstUserMessage,
    claudeName: null,
  }
}

async function parseCodexSummary(
  filePath: string,
  sessionId: string,
  projectPath: string,
  projectName: string,
  fileSizeBytes: number,
): Promise<SessionSummary | null> {
  const headLines = await readHeadLines(filePath, HEAD_LINES)
  const tailLines = await readTailLines(filePath, TAIL_LINES)
  const headSet = new Set(headLines)
  const allLines = [...headLines, ...tailLines.filter((line) => !headSet.has(line))]

  if (allLines.length === 0) return null

  let startedAt: string | null = null
  let lastActiveAt: string | null = null
  let cwd: string | null = null
  let model: string | null = null
  let version: string | null = null
  let userMessageCount = 0
  let assistantMessageCount = 0
  let totalMessageCount = 0
  let firstUserMessage: string | null = null
  let totalTokens = 0

  for (const line of allLines) {
    const msg = safeParse(line)
    if (!msg) continue

    const timestamp = msg.timestamp ?? msg.payload?.timestamp
    if (timestamp) {
      if (!startedAt || timestamp < startedAt) startedAt = timestamp
      if (!lastActiveAt || timestamp > lastActiveAt) lastActiveAt = timestamp
    }

    if (msg.type === 'session_meta' && msg.payload) {
      if (msg.payload.cwd && !cwd) cwd = msg.payload.cwd
      if (msg.payload.cli_version && !version) version = msg.payload.cli_version
      if (msg.payload.timestamp && (!startedAt || msg.payload.timestamp < startedAt)) startedAt = msg.payload.timestamp
    }

    if (msg.type === 'turn_context' && msg.payload) {
      if (msg.payload.cwd && !cwd) cwd = msg.payload.cwd
      if (msg.payload.model && !model) model = msg.payload.model
    }

    if (msg.type === 'event_msg' && msg.payload) {
      const payloadType = msg.payload.type
      if (payloadType === 'user_message' || payloadType === 'user_msg') {
        userMessageCount++
        totalMessageCount++
        if (!firstUserMessage) {
          firstUserMessage = extractCodexPayloadText(msg.payload).slice(0, 120) || null
        }
      } else if (payloadType === 'agent_message' || payloadType === 'assistant_msg') {
        assistantMessageCount++
        totalMessageCount++
        if (!model && msg.payload.message?.model) model = msg.payload.message.model
      } else if (payloadType === 'token_count') {
        totalTokens = Math.max(
          totalTokens,
          msg.payload.info?.total_token_usage?.total_tokens ?? 0,
        )
      }
    }
  }

  if (!startedAt) return null

  return {
    sessionId,
    projectPath,
    projectName,
    provider: 'codex',
    branch: null,
    cwd,
    startedAt,
    lastActiveAt: lastActiveAt ?? startedAt,
    durationMs: new Date(lastActiveAt ?? startedAt).getTime() - new Date(startedAt).getTime(),
    messageCount: totalMessageCount,
    userMessageCount,
    assistantMessageCount,
    isActive: false,
    sessionState: 'inactive',
    model,
    version,
    fileSizeBytes,
    totalTokens,
    firstUserMessage,
    claudeName: null,
  }
}

/**
 * Stream-parse the full session file for detail view.
 */
export async function parseDetail(
  filePath: string,
  sessionId: string,
  projectPath: string,
  projectName: string,
  provider: SessionProvider = 'claude',
): Promise<SessionDetail> {
  if (provider === 'gemini') {
    return parseGeminiDetail(filePath, sessionId, projectPath, projectName)
  }
  if (provider === 'codex') {
    return parseCodexDetail(filePath, sessionId, projectPath, projectName)
  }

  const turns: Turn[] = []
  const toolFrequency: Record<string, number> = {}
  const errors: SessionError[] = []
  const agents: AgentInvocation[] = []
  const skills: SkillInvocation[] = []
  const tasks: TaskItem[] = []
  const modelsSet = new Set<string>()
  let branch: string | null = null
  let cwd: string | null = null
  const totalTokens: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  }
  const tokensByModel: Record<string, TokenUsage> = {}

  // Maps for linking agent stats
  const agentByToolUseId = new Map<string, AgentInvocation>()
  const agentProgressTokens = new Map<string, TokenUsage>()
  const agentProgressToolCalls = new Map<string, Record<string, number>>()
  const agentProgressModel = new Map<string, string>()
  const agentIdByToolUseId = new Map<string, string>()

  // Map for linking TaskCreate tool_use_id to pending task
  const pendingTaskByToolUseId = new Map<string, TaskItem>()
  const taskById = new Map<string, TaskItem>()

  // Context window tracking
  const contextSnapshots: ContextWindowSnapshot[] = []
  let assistantTurnIndex = 0

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const msg = safeParse(line)
    if (!msg || msg.type === 'file-history-snapshot') continue

    if (msg.gitBranch && !branch) branch = msg.gitBranch
    if (msg.cwd && !cwd) cwd = msg.cwd

    // Codex specific
    if (msg.type === 'session_meta' && msg.payload) {
      if (msg.payload.cwd && !cwd) cwd = msg.payload.cwd
    }

    // Track agent progress messages
    if (msg.type === 'progress' && msg.parentToolUseID) {
      const parentId = msg.parentToolUseID

      // Track the agentId from progress messages
      const progressAgentId = msg.data?.agentId
      if (progressAgentId && parentId) {
        agentIdByToolUseId.set(parentId, progressAgentId)
      }

      // Track the model used by each agent
      const progressModel = msg.data?.message?.message?.model
      if (progressModel && parentId) {
        agentProgressModel.set(parentId, progressModel)
      }

      const usage = msg.data?.message?.message?.usage
      if (usage) {
        const existing = agentProgressTokens.get(parentId) ?? {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        }
        existing.inputTokens += usage.input_tokens ?? 0
        existing.outputTokens += usage.output_tokens ?? 0
        existing.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0
        existing.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0
        agentProgressTokens.set(parentId, existing)

        // Also add to session-level totals for accurate cost estimation
        const tokens = {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
        }

        totalTokens.inputTokens += tokens.inputTokens
        totalTokens.outputTokens += tokens.outputTokens
        totalTokens.cacheReadInputTokens += tokens.cacheReadInputTokens
        totalTokens.cacheCreationInputTokens += tokens.cacheCreationInputTokens

        // Add to per-model tracking using model from progress message
        const modelId = msg.data?.message?.message?.model ?? 'unknown'
        if (modelId !== 'unknown') {
          const modelExisting = tokensByModel[modelId] ?? {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          }
          modelExisting.inputTokens += tokens.inputTokens
          modelExisting.outputTokens += tokens.outputTokens
          modelExisting.cacheReadInputTokens += tokens.cacheReadInputTokens
          modelExisting.cacheCreationInputTokens += tokens.cacheCreationInputTokens
          tokensByModel[modelId] = modelExisting
        }
      }

      // Track tool calls within agent progress
      const content = msg.data?.message?.message?.content
      if (Array.isArray(content)) {
        const toolMap = agentProgressToolCalls.get(parentId) ?? {}
        for (const block of content) {
          if (block.type === 'tool_use' && block.name) {
            toolMap[block.name] = (toolMap[block.name] ?? 0) + 1
          }
        }
        agentProgressToolCalls.set(parentId, toolMap)
      }
      continue
    }

    const toolCalls: ToolCall[] = []

    // Helper to extract from message
    const extractFromMessage = (m: any) => {
      if (!m) return
      const content = m.content ?? []
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' && block.name) {
            toolCalls.push({
              toolName: block.name,
              toolUseId: block.id ?? '',
              input: block.input,
            })
            toolFrequency[block.name] = (toolFrequency[block.name] ?? 0) + 1

            // Extract agent invocations from Task/Agent tool calls
            if (AGENT_DISPATCH_TOOL_NAMES.has(block.name) && block.input) {
              const inp = block.input as Record<string, unknown>
              const subagentType = inp.subagent_type ?? inp.agent_type
              if (subagentType) {
                const agent: AgentInvocation = {
                  subagentType: String(subagentType),
                  description: String(inp.description ?? inp.prompt ?? ''),
                  timestamp: msg.timestamp || msg.payload?.timestamp || '',
                  toolUseId: block.id ?? '',
                  model: inp.model ? String(inp.model) : undefined,
                }
                agents.push(agent)
                if (block.id) agentByToolUseId.set(block.id, agent)
              }
            }

            // Extract skill invocations from Skill tool calls
            if (block.name === 'Skill' && block.input) {
              const inp = block.input as Record<string, unknown>
              if (inp.skill) {
                skills.push({
                  skill: String(inp.skill),
                  args: inp.args ? String(inp.args) : null,
                  timestamp: msg.timestamp || msg.payload?.timestamp || '',
                  toolUseId: block.id ?? '',
                })
              }
            }

            // Extract TaskCreate
            if (block.name === 'TaskCreate' && block.input) {
              const inp = block.input as Record<string, unknown>
              const task: TaskItem = {
                taskId: '',
                subject: String(inp.subject ?? ''),
                description: inp.description ? String(inp.description) : undefined,
                activeForm: inp.activeForm ? String(inp.activeForm) : undefined,
                status: 'pending',
                timestamp: msg.timestamp || msg.payload?.timestamp || '',
              }
              tasks.push(task)
              if (block.id) pendingTaskByToolUseId.set(block.id, task)
            }

            // Extract TaskUpdate
            if (block.name === 'TaskUpdate' && block.input) {
              const inp = block.input as Record<string, unknown>
              const taskId = String(inp.taskId ?? '')
              const existing = taskById.get(taskId)
              if (existing && inp.status) {
                existing.status = String(inp.status) as TaskItem['status']
              }
            }
          }
        }
      }

      if (m.model) modelsSet.add(m.model)

      if (m.usage) {
        const u = m.usage
        const tokens: TokenUsage = {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
        }
        totalTokens.inputTokens += tokens.inputTokens
        totalTokens.outputTokens += tokens.outputTokens
        totalTokens.cacheReadInputTokens += tokens.cacheReadInputTokens
        totalTokens.cacheCreationInputTokens += tokens.cacheCreationInputTokens

        // Track per-model token usage
        if (m.model) {
          const modelId = m.model
          const existing = tokensByModel[modelId] ?? {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          }
          existing.inputTokens += tokens.inputTokens
          existing.outputTokens += tokens.outputTokens
          existing.cacheReadInputTokens += tokens.cacheReadInputTokens
          existing.cacheCreationInputTokens += tokens.cacheCreationInputTokens
          tokensByModel[modelId] = existing
        }

        // Track context window snapshot
        const contextSize =
          tokens.inputTokens +
          tokens.cacheReadInputTokens +
          tokens.cacheCreationInputTokens
        const lastSnapshot = contextSnapshots[contextSnapshots.length - 1]
        if (!lastSnapshot || lastSnapshot.contextSize !== contextSize) {
          contextSnapshots.push({
            turnIndex: assistantTurnIndex,
            timestamp: msg.timestamp || msg.payload?.timestamp || '',
            contextSize,
            outputTokens: tokens.outputTokens,
          })
        }
        assistantTurnIndex++
      }
    }

    if (msg.type === 'assistant' && msg.message) {
      extractFromMessage(msg.message)
      if (msg.message.usage) {
        turns.push({
          uuid: msg.uuid ?? '',
          type: msg.type,
          timestamp: msg.timestamp ?? '',
          model: msg.message.model,
          toolCalls,
          tokens: {
            inputTokens: msg.message.usage.input_tokens ?? 0,
            outputTokens: msg.message.usage.output_tokens ?? 0,
            cacheReadInputTokens: msg.message.usage.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: msg.message.usage.cache_creation_input_tokens ?? 0,
          },
          stopReason: msg.message.stop_reason,
        })
        continue
      }
    }

    // Handle tool_result messages (user type with tool results)
    const msgContent = msg.message?.content
    if (msg.type === 'user' && msgContent) {
      if (Array.isArray(msgContent)) {
        for (const block of msgContent) {
          if (block.type !== 'tool_result') continue
          const toolUseId = block.tool_use_id ?? block.id
          const resultText = extractToolResultText(block)

          if (resultText) {
            const taskMatch = resultText.match(/Task #(\S+) created successfully/)
            if (taskMatch && toolUseId) {
              const pending = pendingTaskByToolUseId.get(String(toolUseId))
              if (pending) {
                pending.taskId = taskMatch[1]
                taskById.set(pending.taskId, pending)
              }
            }
          }

          if (resultText && toolUseId) {
            const agentIdMatch = resultText.match(/agentId:\s*([\w-]+)/)
            if (agentIdMatch) {
              agentIdByToolUseId.set(String(toolUseId), agentIdMatch[1])
            }
          }

          if (msg.toolUseResult && toolUseId) {
            const result = msg.toolUseResult
            if (result.agentId) {
              agentIdByToolUseId.set(String(toolUseId), result.agentId)
            }
            if (result.retrieval_status && result.task?.task_id) {
              agentIdByToolUseId.set(String(toolUseId), result.task.task_id)
            }
            const agent = agentByToolUseId.get(String(toolUseId))
            if (agent) {
              if (result.totalTokens) agent.totalTokens = result.totalTokens
              if (result.totalToolUseCount) agent.totalToolUseCount = result.totalToolUseCount
              if (result.totalDurationMs) agent.durationMs = result.totalDurationMs
            }
          }
        }
      }
    }

    // Collect errors from system messages
    if (msg.type === 'system' && msg.level === 'error') {
      errors.push({
        timestamp: msg.timestamp ?? '',
        message: msg.slug ?? msg.subtype ?? 'Unknown error',
        type: msg.subtype ?? 'system',
      })
    }

    if (msg.type === 'user' || msg.type === 'assistant' || msg.type === 'system') {
      const textContent = extractTextContent(msg)
      turns.push({
        uuid: msg.uuid ?? '',
        type: msg.type,
        timestamp: msg.timestamp ?? '',
        message: textContent,
        toolCalls,
      })
    }
  }

  // Merge accumulated progress stats into agents
  for (const agent of agents) {
    const progressTokens = agentProgressTokens.get(agent.toolUseId)
    if (progressTokens && !agent.tokens) {
      agent.tokens = progressTokens
    }
    const progressTools = agentProgressToolCalls.get(agent.toolUseId)
    if (progressTools && !agent.toolCalls) {
      agent.toolCalls = progressTools
    }
    const actualModel = agentProgressModel.get(agent.toolUseId)
    if (actualModel) {
      agent.model = actualModel
    }
  }

  let subagentFileMap = new Map<string, string>()
  if (provider === 'claude') {
    const sessionDir = filePath.replace(/\.jsonl$/, '')
    subagentFileMap = await discoverSubagentFiles(sessionDir)
  }

  const matchedAgentIds = new Set<string>()

  await Promise.all(
    agents.map(async (agent) => {
      const agentId = agentIdByToolUseId.get(agent.toolUseId)
      if (!agentId) return

      agent.agentId = agentId
      matchedAgentIds.add(agentId)

      const subagentFilePath = subagentFileMap.get(agentId)
      if (!subagentFilePath) return

      try {
        const detail = await parseSubagentDetail(subagentFilePath)
        mergeSubagentData(
          agent,
          detail,
          agentProgressTokens.get(agent.toolUseId),
          totalTokens,
          tokensByModel,
        )
      } catch {
        // Subagent file is not readable — skip
      }
    }),
  )

  for (const [agentId, subagentFilePath] of subagentFileMap) {
    if (matchedAgentIds.has(agentId)) continue

    try {
      const detail = await parseSubagentDetail(subagentFilePath)
      const hasTokens = detail.tokens.inputTokens > 0 || detail.tokens.outputTokens > 0
      const hasActivity = hasTokens || detail.skills.length > 0 || detail.totalToolUseCount > 0

      if (hasTokens) {
        addTokens(totalTokens, detail.tokens)
        if (detail.model) {
          const existing = tokensByModel[detail.model] ?? createEmptyTokenUsage()
          addTokens(existing, detail.tokens)
          tokensByModel[detail.model] = existing
        }
      }

      for (const [toolName, count] of Object.entries(detail.toolCalls as Record<string, number>)) {
        toolFrequency[toolName] = (toolFrequency[toolName] ?? 0) + count
      }

      if (hasActivity) {
        agents.push({
          subagentType: 'unknown',
          description: '',
          timestamp: '',
          toolUseId: `orphan-${agentId}`,
          agentId,
          tokens: detail.tokens,
          toolCalls: detail.toolCalls,
          model: detail.model,
          totalToolUseCount: detail.totalToolUseCount,
          skills: detail.skills,
        })
      }
    } catch {
      // Subagent file not readable — skip
    }
  }

  const modelName = modelsSet.size > 0 ? Array.from(modelsSet)[0] : 'unknown'
  const contextWindow = buildContextWindowData(
    contextSnapshots,
    modelName,
  )

  return {
    sessionId,
    projectPath,
    projectName,
    provider,
    branch,
    cwd,
    turns,
    totalTokens,
    tokensByModel,
    toolFrequency,
    errors,
    models: Array.from(modelsSet),
    agents,
    skills,
    tasks,
    contextWindow,
  }
}

async function parseGeminiDetail(
  filePath: string,
  sessionId: string,
  projectPath: string,
  projectName: string,
): Promise<SessionDetail> {
  let data: any
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    data = JSON.parse(content)
  } catch {
    throw new Error('Failed to parse Gemini session JSON')
  }

  const turns: Turn[] = []
  const toolFrequency: Record<string, number> = {}
  const modelsSet = new Set<string>()
  const totalTokens: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  }
  const tokensByModel: Record<string, TokenUsage> = {}

  for (const m of data.messages || []) {
    const toolCalls: ToolCall[] = []
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        toolCalls.push({
          toolName: tc.name,
          toolUseId: tc.id,
          input: tc.args,
        })
        toolFrequency[tc.name] = (toolFrequency[tc.name] ?? 0) + 1
      }
    }

    let textContent: string | undefined
    if (Array.isArray(m.content)) {
      textContent = m.content.find((c: any) => c.text)?.text
    } else if (typeof m.content === 'string') {
      textContent = m.content
    }

    if (m.model) modelsSet.add(m.model)

    const turn: Turn = {
      uuid: m.id || '',
      type: m.type === 'gemini' ? 'assistant' : m.type,
      timestamp: m.timestamp || '',
      message: textContent,
      model: m.model,
      toolCalls,
    }

    if (m.tokens) {
      const t = m.tokens
      const usage: TokenUsage = {
        inputTokens: t.input || 0,
        outputTokens: t.output || 0,
        cacheReadInputTokens: t.cached || 0,
        cacheCreationInputTokens: 0,
      }
      turn.tokens = usage
      addTokens(totalTokens, usage)

      if (m.model) {
        const modelId = m.model
        const existing = tokensByModel[modelId] ?? createEmptyTokenUsage()
        addTokens(existing, usage)
        tokensByModel[modelId] = existing
      }
    }

    turns.push(turn)
  }

  return {
    sessionId,
    projectPath,
    projectName,
    provider: 'gemini',
    branch: null,
    cwd: null,
    turns,
    totalTokens,
    tokensByModel,
    toolFrequency,
    errors: [],
    models: Array.from(modelsSet),
    agents: [],
    skills: [],
    tasks: [],
    contextWindow: null,
  }
}

const COMMAND_NAME_RE = /<command-name>([^<]+)<\/command-name>/

interface SubagentDetail {
  skills: SkillInvocation[]
  tokens: TokenUsage
  toolCalls: Record<string, number>
  model?: string
  totalToolUseCount: number
}

async function parseSubagentDetail(
  subagentFilePath: string,
): Promise<SubagentDetail> {
  const skills: SkillInvocation[] = []
  const tokens = createEmptyTokenUsage()
  const toolCalls: Record<string, number> = {}
  let model: string | undefined
  let totalToolUseCount = 0
  const seenRequestIds = new Set<string>()

  const stream = fs.createReadStream(subagentFilePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let lineCount = 0
  const maxLinesForInjected = 20

  for await (const line of rl) {
    const msg = safeParse(line)
    if (!msg) continue
    lineCount++

    if (lineCount <= maxLinesForInjected && msg.type === 'user' && Array.isArray(msg.message?.content)) {
      const firstBlock = msg.message.content[0]
      if (firstBlock?.type === 'text' && firstBlock.text) {
        const match = COMMAND_NAME_RE.exec(firstBlock.text)
        if (match) {
          const skillName = match[1].trim()
          if (skillName) {
            skills.push({
              skill: skillName,
              args: null,
              timestamp: msg.timestamp ?? '',
              toolUseId: `injected-${skillName}-${lineCount}`,
              source: 'injected',
            })
          }
        }
      }
    }

    if (msg.type !== 'assistant' || !msg.message) continue

    const requestId = msg.requestId
    const isNewRequest = !requestId || !seenRequestIds.has(requestId)
    if (requestId) {
      seenRequestIds.add(requestId)
    }

    if (msg.message.model && !model) {
      model = msg.message.model
    }

    if (isNewRequest && msg.message.usage) {
      const usage = msg.message.usage
      tokens.inputTokens += usage.input_tokens ?? 0
      tokens.outputTokens += usage.output_tokens ?? 0
      tokens.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0
      tokens.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0
    }

    for (const block of msg.message.content ?? []) {
      if (block.type === 'tool_use' && block.name) {
        toolCalls[block.name] = (toolCalls[block.name] ?? 0) + 1
        totalToolUseCount++

        if (block.name === 'Skill') {
          const input = block.input as Record<string, unknown> | undefined
          if (input?.skill) {
            skills.push({
              skill: String(input.skill),
              args: input.args ? String(input.args) : null,
              timestamp: msg.timestamp ?? '',
              toolUseId: block.id ?? '',
              source: 'invoked',
            })
          }
        }
      }
    }
  }

  return { skills, tokens, toolCalls, model, totalToolUseCount }
}

async function parseCodexDetail(
  filePath: string,
  sessionId: string,
  projectPath: string,
  projectName: string,
): Promise<SessionDetail> {
  const turns: Turn[] = []
  const toolFrequency: Record<string, number> = {}
  const modelsSet = new Set<string>()
  const totalTokens = createEmptyTokenUsage()
  const tokensByModel: Record<string, TokenUsage> = {}
  let cwd: string | null = null
  let version: string | null = null
  let currentModel: string | null = null

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const msg = safeParse(line)
    if (!msg) continue

    if (msg.type === 'session_meta' && msg.payload) {
      cwd = cwd ?? msg.payload.cwd ?? null
      version = version ?? msg.payload.cli_version ?? null
      continue
    }

    if (msg.type === 'turn_context' && msg.payload) {
      cwd = cwd ?? msg.payload.cwd ?? null
      currentModel = msg.payload.model ?? currentModel
      if (currentModel) modelsSet.add(currentModel)
      continue
    }

    if (msg.type !== 'event_msg' || !msg.payload) continue

    const payloadType = msg.payload.type

    if (payloadType === 'token_count') {
      const usage = msg.payload.info?.last_token_usage ?? msg.payload.info?.total_token_usage
      if (usage) {
        totalTokens.inputTokens = Math.max(totalTokens.inputTokens, usage.input_tokens ?? 0)
        totalTokens.outputTokens = Math.max(totalTokens.outputTokens, usage.output_tokens ?? 0)
        totalTokens.cacheReadInputTokens = Math.max(totalTokens.cacheReadInputTokens, usage.cached_input_tokens ?? 0)
      }
      continue
    }

    if (payloadType !== 'user_message' && payloadType !== 'user_msg' && payloadType !== 'agent_message' && payloadType !== 'assistant_msg') {
      continue
    }

    const messageModel = msg.payload.message?.model ?? currentModel ?? undefined
    if (messageModel) {
      modelsSet.add(messageModel)
    }

    const toolCalls = extractCodexToolCalls(msg.payload, toolFrequency)
    const text = extractCodexPayloadText(msg.payload)
    const role = payloadType === 'user_message' || payloadType === 'user_msg' ? 'user' : 'assistant'
    const turn: Turn = {
      uuid: msg.payload.id ?? msg.uuid ?? '',
      type: role,
      timestamp: msg.payload.timestamp ?? msg.timestamp ?? '',
      message: text || undefined,
      model: role === 'assistant' ? messageModel : undefined,
      toolCalls,
    }

    const usage = extractCodexTokenUsage(msg.payload)
    if (usage) {
      turn.tokens = usage
      addTokens(totalTokens, usage)
      if (messageModel) {
        const existing = tokensByModel[messageModel] ?? createEmptyTokenUsage()
        addTokens(existing, usage)
        tokensByModel[messageModel] = existing
      }
    }

    turns.push(turn)
  }

  return {
    sessionId,
    projectPath,
    projectName,
    provider: 'codex',
    branch: null,
    cwd,
    turns,
    totalTokens,
    tokensByModel,
    toolFrequency,
    errors: [],
    models: Array.from(modelsSet),
    agents: [],
    skills: [],
    tasks: [],
    contextWindow: null,
  }
}

// --- Helpers ---

async function readHeadLines(
  filePath: string,
  count: number,
): Promise<string[]> {
  const lines: string[] = []
  let stream: fs.ReadStream | null = null
  let rl: readline.Interface | null = null
  try {
    stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
    rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

    for await (const line of rl) {
      lines.push(line)
      if (lines.length >= count) break
    }
  } finally {
    stream?.destroy()
    rl?.close()
  }
  return lines
}

async function readTailLines(
  filePath: string,
  count: number,
): Promise<string[]> {
  const stat = await fs.promises.stat(filePath)
  const readSize = Math.min(stat.size, 65536)
  const buffer = Buffer.alloc(readSize)

  const fd = await fs.promises.open(filePath, 'r')
  try {
    await fd.read(buffer, 0, readSize, Math.max(0, stat.size - readSize))
  } finally {
    await fd.close()
  }

  const text = buffer.toString('utf-8')
  const lines = text.split('\n').filter(Boolean)
  return lines.slice(-count)
}

function safeParse(line: string): RawJsonlMessage | null {
  try {
    return JSON.parse(line) as RawJsonlMessage
  } catch {
    return null
  }
}

function extractToolResultText(block: {
  text?: string
  content?: string | Array<{ type: string; text?: string }>
}): string | undefined {
  if (block.text) return block.text
  if (typeof block.content === 'string') return block.content
  if (Array.isArray(block.content)) {
    const texts = block.content
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text!)
    return texts.length > 0 ? texts.join('\n') : undefined
  }
  return undefined
}

function extractTextContent(msg: RawJsonlMessage): string | undefined {
  const m = msg.message || msg.payload?.message
  if (!m) return undefined
  const content = m.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined

  const texts = content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)

  return texts.length > 0 ? texts.join('\n').slice(0, 500) : undefined
}

function extractCodexPayloadText(payload: NonNullable<RawJsonlMessage['payload']>): string {
  const message = payload.user_message ?? payload.agent_message ?? payload.message
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const texts = content
    .filter((block) => block?.type === 'output_text' || block?.type === 'input_text' || block?.type === 'text')
    .map((block) => block.text)
    .filter((text): text is string => typeof text === 'string' && text.length > 0)

  return texts.join('\n')
}

function extractCodexToolCalls(
  payload: NonNullable<RawJsonlMessage['payload']>,
  toolFrequency: Record<string, number>,
): ToolCall[] {
  const message = payload.agent_message ?? payload.message
  const content = Array.isArray(message?.content) ? message.content : []
  const toolCalls: ToolCall[] = []

  for (const block of content) {
    if (block?.type === 'tool_use' && block.name) {
      toolCalls.push({
        toolName: block.name,
        toolUseId: block.id ?? '',
        input: block.input,
      })
      toolFrequency[block.name] = (toolFrequency[block.name] ?? 0) + 1
    }
  }

  return toolCalls
}

function extractCodexTokenUsage(payload: NonNullable<RawJsonlMessage['payload']>): TokenUsage | null {
  const usage = payload.token_count ?? payload.usage
  if (!usage) return null

  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadInputTokens: usage.cached_input_tokens ?? usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
  }
}

// Context window helpers ... (rest unchanged)

const CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4-6': 1_000_000,
  'claude-opus-4-5': 200_000,
  'claude-opus-4-1': 200_000,
  'claude-opus-4': 200_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-sonnet-4-5': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-haiku-3-5': 200_000,
  'claude-haiku-3': 200_000,
}

function getContextLimit(modelName: string): number {
  const normalized = modelName.replace(/-\d{8}$/, '')
  return CONTEXT_LIMITS[normalized] ?? 200_000
}

function buildContextWindowData(
  snapshots: ContextWindowSnapshot[],
  modelName: string,
): ContextWindowData | null {
  if (snapshots.length === 0) return null

  const contextLimit = getContextLimit(modelName)
  const autocompactBuffer = Math.round(contextLimit * 0.165)
  const systemOverhead = snapshots[0].contextSize
  const currentContextSize = snapshots[snapshots.length - 1].contextSize
  const messagesEstimate = Math.max(0, currentContextSize - systemOverhead)
  const freeSpace = Math.max(0, contextLimit - currentContextSize)
  const usagePercent = Math.round((currentContextSize / contextLimit) * 100)

  return {
    contextLimit,
    modelName,
    systemOverhead,
    currentContextSize,
    messagesEstimate,
    freeSpace,
    autocompactBuffer,
    usagePercent,
    snapshots,
  }
}

function createEmptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  }
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

function mergeSubagentData(
  agent: AgentInvocation,
  detail: SubagentDetail,
  progressTokens: TokenUsage | undefined,
  totalTokens: TokenUsage,
  tokensByModel: Record<string, TokenUsage>,
): void {
  agent.skills = detail.skills
  if (detail.tokens.inputTokens > 0 || detail.tokens.outputTokens > 0) {
    if (progressTokens) {
      subtractTokens(totalTokens, progressTokens)
      const progressModel = agent.model
      if (progressModel && tokensByModel[progressModel]) {
        subtractTokens(tokensByModel[progressModel], progressTokens)
      }
    }
    agent.tokens = detail.tokens
    addTokens(totalTokens, detail.tokens)
    if (detail.model) {
      const existing = tokensByModel[detail.model] ?? createEmptyTokenUsage()
      addTokens(existing, detail.tokens)
      tokensByModel[detail.model] = existing
    }
  } else if (!agent.tokens && progressTokens) {
    agent.tokens = progressTokens
  }
  if (!agent.toolCalls && Object.keys(detail.toolCalls).length > 0) {
    agent.toolCalls = detail.toolCalls
  }
  if (!agent.model && detail.model) {
    agent.model = detail.model
  }
  if (!agent.totalToolUseCount && detail.totalToolUseCount > 0) {
    agent.totalToolUseCount = detail.totalToolUseCount
  }
}
