import type { SessionProvider } from '@/lib/parsers/types'

interface ProviderBadgeProps {
  provider: SessionProvider
}

export function ProviderBadge({ provider }: ProviderBadgeProps) {
  switch (provider) {
    case 'claude':
      return (
        <span className="inline-flex items-center rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-400 border border-orange-500/20">
          Claude
        </span>
      )
    case 'codex':
      return (
        <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400 border border-blue-500/20">
          Codex
        </span>
      )
    case 'gemini':
      return (
        <span className="inline-flex items-center rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400 border border-purple-500/20">
          Gemini
        </span>
      )
    default:
      return null
  }
}
