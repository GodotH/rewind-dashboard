import { queryOptions } from '@tanstack/react-query'
import { getChatMessages } from './chat.api'
import type { SessionProvider } from '@/lib/parsers/types'

export function chatQuery(
  sessionId: string,
  projectPath: string,
  provider: SessionProvider = 'claude',
) {
  return queryOptions({
    queryKey: ['session', 'chat', sessionId, projectPath, provider],
    queryFn: () => getChatMessages({ data: { sessionId, projectPath, provider } }),
    staleTime: 30_000,
  })
}
