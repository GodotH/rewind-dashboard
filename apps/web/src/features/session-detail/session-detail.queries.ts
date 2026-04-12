import { queryOptions } from '@tanstack/react-query'
import { getSessionDetail } from './session-detail.api'
import type { SessionProvider } from '@/lib/parsers/types'

export function sessionDetailQuery(
  sessionId: string,
  projectPath: string,
  provider: SessionProvider = 'claude',
  isActive?: boolean,
) {
  return queryOptions({
    queryKey: ['session', 'detail', sessionId, projectPath, provider],
    queryFn: () => getSessionDetail({ data: { sessionId, projectPath, provider } }),
    staleTime: isActive ? 2_000 : 30_000,
    refetchInterval: isActive ? 5_000 : undefined,
  })
}
