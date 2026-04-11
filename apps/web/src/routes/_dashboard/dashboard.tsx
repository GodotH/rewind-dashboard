import { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { statsQuery } from '@/features/stats/stats.queries'
import { paginatedSessionListQuery } from '@/features/sessions/sessions.queries'
import { metadataQuery } from '@/features/metadata/metadata.queries'
import { ActivityChart } from '@/features/stats/ActivityChart'
import { ContributionHeatmap } from '@/features/stats/ContributionHeatmap'
import { TokenTrendChart } from '@/features/stats/TokenTrendChart'
import { ModelUsageChart } from '@/features/stats/ModelUsageChart'
import { HourlyDistribution } from '@/features/stats/HourlyDistribution'
import { SessionCard } from '@/features/sessions/SessionCard'
import { ExportDropdown } from '@/components/ExportDropdown'
import {
  dailyActivityToCSV,
  dailyTokensToCSV,
  modelUsageToCSV,
  statsToJSON,
  downloadFile,
} from '@/lib/utils/export-utils'
import { useSessionCost } from '@/features/cost-estimation/useSessionCost'
import { formatDuration, formatTokenCount, formatUSD } from '@/lib/utils/format'
import type { TokenUsage } from '@/lib/parsers/types'

export const Route = createFileRoute('/_dashboard/dashboard')({
  component: DashboardPage,
})

const EMPTY_TOKENS_BY_MODEL: Record<string, TokenUsage> = {}

function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery(statsQuery)
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery(
    paginatedSessionListQuery({
      page: 1,
      pageSize: 5,
      search: '',
      status: 'all',
      project: '',
      sort: 'latest',
      starFirst: false,
    }),
  )
  const { data: metadata } = useQuery(metadataQuery)

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

  const periods = useMemo(() => {
    if (!stats) return null
    const currentStats = stats
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    function sumPeriod(since: Date) {
      const days = currentStats.dailyActivity.filter((d) => new Date(d.date) >= since)
      const tokenDays = currentStats.dailyModelTokens.filter((d) => new Date(d.date) >= since)
      const sessionCount = days.reduce((s, d) => s + d.sessionCount, 0)
      const toolCalls = days.reduce((s, d) => s + d.toolCallCount, 0)
      let totalTokens = 0
      for (const day of tokenDays) {
        for (const count of Object.values(day.tokensByModel)) {
          totalTokens += count
        }
      }
      return { sessionCount, toolCalls, totalTokens }
    }

    const total = {
      sessionCount: currentStats.totalSessions,
      toolCalls: currentStats.dailyActivity.reduce((s, d) => s + d.toolCallCount, 0),
      totalTokens: Object.values(currentStats.modelUsage).reduce((s, m) => s + m.inputTokens + m.outputTokens, 0),
      inputTokens: Object.values(currentStats.modelUsage).reduce((s, m) => s + m.inputTokens, 0),
      outputTokens: Object.values(currentStats.modelUsage).reduce((s, m) => s + m.outputTokens, 0),
    }

    return {
      today: sumPeriod(dayAgo),
      week: sumPeriod(weekAgo),
      month: sumPeriod(monthAgo),
      total,
    }
  }, [stats])

  const thisWeekSessions = periods?.week.sessionCount ?? 0

  if (statsLoading && sessionsLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-400">Overview of your Claude Code activity</p>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-gray-800 bg-gray-900/50" />
          ))}
        </div>
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-gray-800 bg-gray-900/50" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-400">Overview of your Claude Code activity</p>
        </div>
        {stats && (
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
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link to="/sessions" className="group">
          <QuickStatCard label="Total Sessions" value={stats ? String(stats.totalSessions) : '--'} accent="text-blue-400" icon={
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="12" x2="14" y2="12" /></svg>
          } />
        </Link>
        <Link to="/sessions" className="group">
          <QuickStatCard label="Total Messages" value={stats ? stats.totalMessages.toLocaleString() : '--'} accent="text-purple-400" icon={
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2a2 2 0 00-2 2v8a2 2 0 002 2h8l4 2v-4a2 2 0 002-2V4a2 2 0 00-2-2H2z" /></svg>
          } />
        </Link>
        <Link to="/sessions" className="group">
          <QuickStatCard label="This Week" value={String(thisWeekSessions)} sub="sessions" accent="text-emerald-400" icon={
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0a1 1 0 011 1v1h6V1a1 1 0 112 0v1h1a2 2 0 012 2v10a2 2 0 01-2 2H2a2 2 0 01-2-2V4a2 2 0 012-2h1V1a1 1 0 011-1zm-2 6v8h12V6H2z" /></svg>
          } />
        </Link>
        <Link to="/sessions" search={{ status: 'active' } as never} className="group">
          <QuickStatCard label="Longest Session" value={stats ? formatDuration(stats.longestSession.duration) : '--'} sub={stats ? `${stats.longestSession.messageCount} messages` : undefined} accent="text-brand-400" icon={
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" /><line x1="8" y1="3" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" /><line x1="8" y1="8" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" /></svg>
          } />
        </Link>
      </div>

      {periods && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <h2 className="text-sm font-semibold text-gray-300">Tokens & Cost</h2>
          <div className="mt-3 grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Today</p>
              <p className="mt-1 text-lg font-bold text-gray-100">{formatTokenCount(periods.today.totalTokens)}</p>
              <p className="text-xs text-gray-500">{periods.today.sessionCount} sessions</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">7 Days</p>
              <p className="mt-1 text-lg font-bold text-gray-100">{formatTokenCount(periods.week.totalTokens)}</p>
              <p className="text-xs text-gray-500">{periods.week.sessionCount} sessions</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">30 Days</p>
              <p className="mt-1 text-lg font-bold text-gray-100">{formatTokenCount(periods.month.totalTokens)}</p>
              <p className="text-xs text-gray-500">{periods.month.sessionCount} sessions</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">All Time</p>
              <p className="mt-1 text-lg font-bold text-gray-100">{formatTokenCount(periods.total.totalTokens)}</p>
              <p className="text-xs text-emerald-400/80">{cost ? `~${formatUSD(cost.totalUSD)}` : ''}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Recent Sessions</h2>
          <Link to="/sessions" className="text-xs font-medium text-brand-400 transition-colors hover:text-brand-300">
            View all &rarr;
          </Link>
        </div>
        {sessionsData && sessionsData.sessions.length > 0 ? (
          <div className="mt-3 space-y-2">
            {sessionsData.sessions.map((session) => (
              <SessionCard
                key={session.sessionId}
                session={session}
                metadata={metadata?.sessions[session.sessionId]}
                projectMeta={metadata?.projects[session.projectPath]}
              />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-gray-500">No sessions found</div>
        )}
      </div>

      {stats && (
        <>
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
        </>
      )}
    </div>
  )
}

function QuickStatCard({
  label,
  value,
  sub,
  icon,
  accent,
  truncateValue,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  accent: string
  truncateValue?: boolean
}) {
  return (
    <div className="h-full rounded-xl border border-gray-800 bg-gray-900/50 p-4 transition-colors hover:border-gray-700 hover:bg-gray-900/70">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
          <p className={`mt-2 text-xl font-bold ${accent} ${truncateValue ? 'truncate' : ''}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
        </div>
        <div className={`mt-0.5 ${accent}`}>{icon}</div>
      </div>
    </div>
  )
}
