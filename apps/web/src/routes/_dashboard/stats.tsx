import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { statsQuery } from '@/features/stats/stats.queries'
import { projectAnalyticsQuery } from '@/features/project-analytics/project-analytics.queries'
import { ActivityChart } from '@/features/stats/ActivityChart'
import { ContributionHeatmap } from '@/features/stats/ContributionHeatmap'
import { TokenTrendChart } from '@/features/stats/TokenTrendChart'
import { ModelUsageChart } from '@/features/stats/ModelUsageChart'
import { HourlyDistribution } from '@/features/stats/HourlyDistribution'
import { formatDuration, formatTokenCount, formatUSD } from '@/lib/utils/format'
import {
  dailyActivityToCSV,
  dailyTokensToCSV,
  modelUsageToCSV,
  statsToJSON,
  downloadFile,
} from '@/lib/utils/export-utils'
import { ExportDropdown } from '@/components/ExportDropdown'
import { useSessionCost } from '@/features/cost-estimation/useSessionCost'
import type { TokenUsage, StatsCache } from '@/lib/parsers/types'

export const Route = createFileRoute('/_dashboard/stats')({
  component: StatsPage,
})

const EMPTY_TOKENS_BY_MODEL: Record<string, TokenUsage> = {}

function StatsPage() {
  const { data: stats, isLoading } = useQuery(statsQuery)
  const { data: projectData } = useQuery(projectAnalyticsQuery)

  const tokensByModel = useMemo(() => {
    if (!stats) return EMPTY_TOKENS_BY_MODEL
    const result: Record<string, TokenUsage> = {}
    for (const [model, usage] of Object.entries(stats.modelUsage)) {
      result[model] = {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
      }
    }
    return result
  }, [stats])

  const { cost } = useSessionCost(tokensByModel)

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Stats</h1>
        <p className="mt-1 text-sm text-gray-400">Usage analytics</p>
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-900/50" />
          ))}
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Stats</h1>
        <div className="py-12 text-center text-sm text-gray-500">
          No stats data found. Check ~/.claude/stats-cache.json
        </div>
      </div>
    )
  }

  const totalTokens = Object.values(stats.modelUsage).reduce(
    (sum, m) => sum + m.inputTokens + m.outputTokens,
    0,
  )
  const totalToolCalls = stats.dailyActivity.reduce(
    (sum, d) => sum + d.toolCallCount,
    0,
  )
  const totalDurationMs =
    projectData?.projects.reduce((sum, p) => sum + p.totalDurationMs, 0) ?? 0
  const projectCount = projectData?.projects.length ?? 0

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Stats</h1>
          <p className="mt-1 text-sm text-gray-400">Usage analytics</p>
        </div>
        <ExportDropdown
          options={[
            {
              label: 'Daily Activity (CSV)',
              onClick: () => downloadFile(dailyActivityToCSV(stats), 'daily-activity.csv', 'text/csv'),
            },
            {
              label: 'Token Usage (CSV)',
              onClick: () => downloadFile(dailyTokensToCSV(stats), 'daily-tokens.csv', 'text/csv'),
            },
            {
              label: 'Model Usage (CSV)',
              onClick: () => downloadFile(modelUsageToCSV(stats), 'model-usage.csv', 'text/csv'),
            },
            {
              label: 'Full Stats (JSON)',
              onClick: () => downloadFile(statsToJSON(stats), 'stats.json', 'application/json'),
            },
          ]}
        />
      </div>

      {/* Key totals */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Sessions" value={String(stats.totalSessions)} />
        <StatCard label="Total Messages" value={stats.totalMessages.toLocaleString()} />
        <StatCard label="Total Time" value={formatDuration(totalDurationMs)} />
        <StatCard label="Projects" value={String(projectCount)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Tokens" value={formatTokenCount(totalTokens)} />
        <StatCard label="Estimated Cost" value={cost ? `~${formatUSD(cost.totalUSD)}` : 'N/A'} />
        <StatCard label="Tool Calls" value={totalToolCalls.toLocaleString()} />
        <StatCard
          label="Longest Session"
          value={formatDuration(stats.longestSession.duration)}
          sub={`${stats.longestSession.messageCount} messages`}
        />
      </div>

      <div className="mt-6">
        <ContributionHeatmap dailyActivity={stats.dailyActivity} dailyModelTokens={stats.dailyModelTokens} />
      </div>

      <div className="mt-4">
        <ActivityChart data={stats.dailyActivity} />
      </div>

      <div className="mt-4">
        <TokenTrendChart data={stats.dailyModelTokens} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ModelUsageChart data={stats.modelUsage} />
        <HourlyDistribution hourCounts={stats.hourCounts} />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}
