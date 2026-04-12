import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { createServerFn } from '@tanstack/react-start'
import {
  getProjectsDir,
  decodeProjectDirName,
  getCodexSessionsDir,
  getGeminiTmpDir,
} from '@/lib/utils/claude-path'
import type { SessionProvider } from '@/lib/parsers/types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  toolNames?: string[]
}

function findSessionFile(
  sessionId: string,
  projectPath: string,
  provider: SessionProvider,
): string | null {
  if (provider === 'codex') {
    const codexDir = getCodexSessionsDir()
    const filePath = path.join(codexDir, projectPath, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) return filePath
    return null
  }

  if (provider === 'gemini') {
    const geminiDir = getGeminiTmpDir()
    const filePath = path.join(geminiDir, projectPath, 'chats', `${sessionId}.json`)
    if (fs.existsSync(filePath)) return filePath
    return null
  }

  const projectsDir = getProjectsDir()
  let entries: string[]
  try {
    entries = fs.readdirSync(projectsDir)
  } catch (_) {
    return null
  }

  for (const dirName of entries) {
    const decoded = decodeProjectDirName(dirName)
    if (decoded === projectPath || dirName === projectPath) {
      const filePath = path.join(projectsDir, dirName, `${sessionId}.jsonl`)
      if (fs.existsSync(filePath)) return filePath
    }
  }
  // Fallback: search all
  for (const dirName of entries) {
    const filePath = path.join(projectsDir, dirName, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) return filePath
  }
  return null
}

export const getChatMessages = createServerFn({ method: 'GET' })
  .inputValidator(
    (input: {
      sessionId: string
      projectPath: string
      provider?: SessionProvider
    }) => input,
  )
  .handler(async ({ data }): Promise<ChatMessage[]> => {
    const provider = data.provider ?? 'claude'
    const filePath = findSessionFile(data.sessionId, data.projectPath, provider)
    if (!filePath) return []

    const messages: ChatMessage[] = []

    if (provider === 'gemini') {
      try {
        const raw = await fs.promises.readFile(filePath, 'utf-8')
        const data = JSON.parse(raw)

        for (const message of data.messages ?? []) {
          const role =
            message.type === 'user'
              ? 'user'
              : message.type === 'gemini'
                ? 'assistant'
                : null
          if (!role) continue

          const textBlocks: string[] = []
          const toolNames: string[] = []

          if (typeof message.content === 'string') {
            textBlocks.push(message.content)
          } else if (Array.isArray(message.content)) {
            for (const block of message.content) {
              if (typeof block?.text === 'string' && block.text) {
                textBlocks.push(block.text)
              }
            }
          }

          for (const toolCall of message.toolCalls ?? []) {
            if (toolCall?.name) {
              toolNames.push(toolCall.name)
            }
          }

          const text = textBlocks.join('\n')
          if (!text && toolNames.length === 0) continue

          messages.push({
            role,
            text:
              text ||
              `[${toolNames.length} tool call${toolNames.length > 1 ? 's' : ''}: ${toolNames.join(', ')}]`,
            timestamp: message.timestamp ?? '',
            toolNames: toolNames.length > 0 ? toolNames : undefined,
          })
        }
      } catch {
        return []
      }

      return messages
    }

    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

    for await (const line of rl) {
      if (!line.trim()) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw JSONL has arbitrary shape
      let msg: any
      try {
        msg = JSON.parse(line)
      } catch (_) {
        continue
      }

      // Handle Claude format
      if (msg.type === 'user' || msg.type === 'assistant') {
        const content = msg.message?.content
        if (!content) continue

        const textBlocks: string[] = []
        const toolNames: string[] = []

        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              textBlocks.push(block.text)
            } else if (block.type === 'tool_use' && block.name) {
              toolNames.push(block.name)
            }
          }
        }

        const text = textBlocks.join('\n')
        if (!text && toolNames.length === 0) continue

        messages.push({
          role: msg.type as 'user' | 'assistant',
          text:
            text ||
            `[${toolNames.length} tool call${toolNames.length > 1 ? 's' : ''}: ${toolNames.join(', ')}]`,
          timestamp: msg.timestamp ?? '',
          toolNames: toolNames.length > 0 ? toolNames : undefined,
        })
      }

      // Handle Codex format
      if (provider === 'codex' && msg.type === 'event_msg' && msg.payload) {
        const role =
          msg.payload.type === 'user_msg' || msg.payload.type === 'user_message'
            ? 'user'
            : msg.payload.type === 'assistant_msg' || msg.payload.type === 'agent_message'
              ? 'assistant'
              : null
        if (!role) continue

        const content = msg.payload.message?.content
        if (!content) continue

        const textBlocks: string[] = []
        const toolNames: string[] = []

        if (typeof content === 'string') {
          textBlocks.push(content)
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              textBlocks.push(block.text)
            } else if (block.type === 'tool_use' && block.name) {
              toolNames.push(block.name)
            }
          }
        }

        // Also check main message content if it exists
        if (msg.message?.content && Array.isArray(msg.message.content)) {
          for (const block of msg.message.content) {
            if (block.type === 'tool_use' && block.name) {
              toolNames.push(block.name)
            }
          }
        }

        const text = textBlocks.join('\n')
        if (!text && toolNames.length === 0) continue

        messages.push({
          role,
          text:
            text ||
            `[${toolNames.length} tool call${toolNames.length > 1 ? 's' : ''}: ${toolNames.join(', ')}]`,
          timestamp: msg.payload.timestamp ?? msg.timestamp ?? '',
          toolNames: toolNames.length > 0 ? toolNames : undefined,
        })
      }
    }

    return messages
  })
