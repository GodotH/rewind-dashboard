import { MetadataSchema, DEFAULT_METADATA, type Metadata } from './metadata.types'

const METADATA_DIR = '.claude-dashboard'
const METADATA_FILE = 'session-metadata.json'

async function getMetadataPaths() {
  const [{ join }, { homedir }] = await Promise.all([
    import('node:path'),
    import('node:os'),
  ])

  const dir = join(homedir(), METADATA_DIR)
  return {
    dir,
    filePath: join(dir, METADATA_FILE),
  }
}

export async function readMetadata(): Promise<Metadata> {
  const fs = await import('node:fs')

  try {
    const { filePath } = await getMetadataPaths()
    const raw = fs.readFileSync(filePath, 'utf-8')
    const json = JSON.parse(raw) as unknown
    const result = MetadataSchema.safeParse(json)
    if (result.success) return result.data
    console.warn('Invalid metadata file, using defaults:', result.error.message)
    return DEFAULT_METADATA
  } catch {
    return DEFAULT_METADATA
  }
}

export async function writeMetadata(metadata: Metadata): Promise<void> {
  const fs = await import('node:fs')
  const { dir, filePath } = await getMetadataPaths()
  const tmpPath = `${filePath}.tmp`
  const withTimestamp: Metadata = {
    ...metadata,
    updatedAt: new Date().toISOString(),
  }

  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(tmpPath, JSON.stringify(withTimestamp, null, 2), 'utf-8')
    fs.renameSync(tmpPath, filePath)
  } catch (error) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch {
      // cleanup failure is non-fatal
    }
    throw new Error(
      `Failed to save metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}
