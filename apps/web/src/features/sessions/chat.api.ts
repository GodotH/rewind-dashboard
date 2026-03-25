import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { createServerFn } from '@tanstack/react-start'
import { getProjectsDir, decodeProjectDirName } from '@/lib/utils/claude-path'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  toolNames?: string[]
}

function findSessionFile(sessionId: string, projectPath: string): string | null {
  const projectsDir = getProjectsDir()
  let entries: string[]
  try { entries = fs.readdirSync(projectsDir) } catch { return null }

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
  .inputValidator((input: { sessionId: string; projectPath: string }) => input)
  .handler(async ({ data }): Promise<ChatMessage[]> => {
    const filePath = findSessionFile(data.sessionId, data.projectPath)
    if (!filePath) return []

    const messages: ChatMessage[] = []
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

    for await (const line of rl) {
      if (!line.trim()) continue
      let msg: any
      try { msg = JSON.parse(line) } catch { continue }

      if (msg.type !== 'user' && msg.type !== 'assistant') continue
      if (!msg.message?.content || !Array.isArray(msg.message.content)) continue

      const textBlocks: string[] = []
      const toolNames: string[] = []

      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          textBlocks.push(block.text)
        } else if (block.type === 'tool_use' && block.name) {
          toolNames.push(block.name)
        }
      }

      const text = textBlocks.join('\n')
      if (!text && toolNames.length === 0) continue

      messages.push({
        role: msg.type as 'user' | 'assistant',
        text: text || `[${toolNames.length} tool call${toolNames.length > 1 ? 's' : ''}: ${toolNames.join(', ')}]`,
        timestamp: msg.timestamp ?? '',
        toolNames: toolNames.length > 0 ? toolNames : undefined,
      })
    }

    return messages
  })
