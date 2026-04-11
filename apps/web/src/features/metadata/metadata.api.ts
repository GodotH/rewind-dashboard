import { createServerFn } from '@tanstack/react-start'
import { type Metadata } from './metadata.types'
import { readMetadata, writeMetadata } from './metadata.storage'

function cleanEntry<T extends Record<string, unknown>>(entry: T): T | null {
  const cleaned = { ...entry }
  for (const [k, v] of Object.entries(cleaned)) {
    if (v === undefined || v === false || v === '') delete cleaned[k]
  }
  return Object.keys(cleaned).length > 0 ? cleaned : null
}

// --- Server Functions ---

export const getMetadata = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Metadata> => {
    return readMetadata()
  },
)

export const pinSession = createServerFn({ method: 'POST' })
  .inputValidator((input: { sessionId: string; pinned: boolean }) => input)
  .handler(async ({ data }) => {
    const metadata = await readMetadata()
    const entry = { ...metadata.sessions[data.sessionId], pinned: data.pinned || undefined }
    const cleaned = cleanEntry(entry)
    if (cleaned) {
      metadata.sessions[data.sessionId] = cleaned
    } else {
      delete metadata.sessions[data.sessionId]
    }
    await writeMetadata(metadata)
  })

export const renameSession = createServerFn({ method: 'POST' })
  .inputValidator((input: { sessionId: string; customName: string }) => input)
  .handler(async ({ data }) => {
    const metadata = await readMetadata()
    const entry = {
      ...metadata.sessions[data.sessionId],
      customName: data.customName || undefined,
    }
    const cleaned = cleanEntry(entry)
    if (cleaned) {
      metadata.sessions[data.sessionId] = cleaned
    } else {
      delete metadata.sessions[data.sessionId]
    }
    await writeMetadata(metadata)
  })

export const pinProject = createServerFn({ method: 'POST' })
  .inputValidator((input: { projectPath: string; pinned: boolean }) => input)
  .handler(async ({ data }) => {
    const metadata = await readMetadata()
    const entry = { ...metadata.projects[data.projectPath], pinned: data.pinned || undefined }
    const cleaned = cleanEntry(entry)
    if (cleaned) {
      metadata.projects[data.projectPath] = cleaned
    } else {
      delete metadata.projects[data.projectPath]
    }
    await writeMetadata(metadata)
  })

export const hideProject = createServerFn({ method: 'POST' })
  .inputValidator((input: { projectPath: string; hidden: boolean }) => input)
  .handler(async ({ data }) => {
    const metadata = await readMetadata()
    const entry = { ...metadata.projects[data.projectPath], hidden: data.hidden || undefined }
    const cleaned = cleanEntry(entry)
    if (cleaned) {
      metadata.projects[data.projectPath] = cleaned
    } else {
      delete metadata.projects[data.projectPath]
    }
    await writeMetadata(metadata)
  })

export const renameProject = createServerFn({ method: 'POST' })
  .inputValidator((input: { projectPath: string; customName: string }) => input)
  .handler(async ({ data }) => {
    const metadata = await readMetadata()
    const entry = {
      ...metadata.projects[data.projectPath],
      customName: data.customName || undefined,
    }
    const cleaned = cleanEntry(entry)
    if (cleaned) {
      metadata.projects[data.projectPath] = cleaned
    } else {
      delete metadata.projects[data.projectPath]
    }
    await writeMetadata(metadata)
  })
