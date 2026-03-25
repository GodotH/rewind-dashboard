import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { metadataQuery } from '@/features/metadata/metadata.queries'
import { usePinSession, useRenameSession } from '@/features/metadata/useMetadataMutations'
import { sessionDetailQuery } from '@/features/session-detail/session-detail.queries'
import { TimelineEventsChart } from '@/features/session-detail/timeline-chart'
import { ContextWindowPanel } from '@/features/session-detail/ContextWindowPanel'
import { ToolUsagePanel } from '@/features/session-detail/ToolUsagePanel'
import { ErrorPanel } from '@/features/session-detail/ErrorPanel'
import { AgentDispatchesPanel, SkillInvocationsPanel } from '@/features/session-detail/AgentsSkillsPanel'
import { TasksPanel } from '@/features/session-detail/TasksPanel'
import { CostEstimationPanel } from '@/features/cost-estimation/CostEstimationPanel'
import { CostSummaryLine } from '@/features/cost-estimation/CostSummaryLine'
import { ActiveSessionBanner } from '@/features/session-detail/ActiveSessionBanner'
import { useIsSessionActive } from '@/features/sessions/useIsSessionActive'
import { formatDuration, formatDateTime } from '@/lib/utils/format'
import { sessionToJSON, downloadFile } from '@/lib/utils/export-utils'
import { ExportDropdown } from '@/components/ExportDropdown'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { z } from 'zod'

const searchSchema = z.object({
  project: z.string().optional(),
})

export const Route = createFileRoute('/_dashboard/sessions/$sessionId')({
  validateSearch: searchSchema,
  component: SessionDetailPage,
})

function LaunchButton({ sessionId, cwd }: { sessionId: string; cwd?: string }) {
  const [status, setStatus] = useState<'idle' | 'launched' | 'error'>('idle')

  return (
    <button
      type="button"
      title="Launch session in terminal"
      onClick={async () => {
        try {
          const res = await fetch('/api/launch-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, cwd }),
          })
          setStatus(res.ok ? 'launched' : 'error')
        } catch {
          setStatus('error')
        }
        setTimeout(() => setStatus('idle'), 2000)
      }}
      className="shrink-0 rounded bg-emerald-900/50 px-3 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-800/60 hover:text-emerald-300"
    >
      {status === 'launched' ? 'Launched!' : status === 'error' ? 'Failed' : 'Launch'}
    </button>
  )
}

function DetailPinButton({ sessionId, pinned }: { sessionId: string; pinned: boolean }) {
  const mutation = usePinSession()
  return (
    <button
      type="button"
      title={pinned ? 'Unpin session' : 'Pin session'}
      onClick={() => mutation.mutate({ sessionId, pinned: !pinned })}
      className={`shrink-0 rounded px-2 py-1 text-xs transition-colors ${
        pinned
          ? 'bg-amber-900/50 text-amber-400 hover:bg-amber-800/60'
          : 'bg-gray-800 text-gray-500 hover:text-amber-400'
      }`}
    >
      {pinned ? '\u{1F4CC} Pinned' : '\u{1F4CC} Pin'}
    </button>
  )
}

function DetailRenameButton({
  sessionId,
  currentName,
}: {
  sessionId: string
  currentName: string
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentName)
  const mutation = useRenameSession()

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              mutation.mutate({ sessionId, customName: value.trim() })
              setEditing(false)
            }
            if (e.key === 'Escape') setEditing(false)
          }}
          autoFocus
          className="rounded border border-gray-600 bg-gray-800 px-2 py-0.5 text-xs text-gray-100 outline-none focus:border-brand-500"
          placeholder="Session name..."
        />
        <button
          type="button"
          onClick={() => {
            mutation.mutate({ sessionId, customName: value.trim() })
            setEditing(false)
          }}
          className="rounded bg-brand-600 px-2 py-0.5 text-xs text-white hover:bg-brand-500"
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
        >
          X
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      title="Rename session"
      onClick={() => { setValue(currentName); setEditing(true) }}
      className="shrink-0 rounded bg-gray-800 px-2 py-1 text-xs text-gray-500 transition-colors hover:text-gray-300"
    >
      ✏️ Rename
    </button>
  )
}

function SessionDetailPage() {
  const { sessionId } = Route.useParams()
  const { project = '' } = Route.useSearch()

  const { privacyMode, anonymizeProjectName, anonymizeBranch } = usePrivacy()
  const isActive = useIsSessionActive(sessionId)
  const { data: metadata } = useQuery(metadataQuery)
  const sessionMeta = metadata?.sessions[sessionId]

  const { data: detail, isLoading, error } = useQuery(
    sessionDetailQuery(sessionId, project, isActive),
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-800" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-900/50" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-400">
          Failed to load session: {error?.message ?? 'Not found'}
        </p>
        <Link
          to="/sessions"
          className="mt-2 inline-block text-sm text-brand-300 hover:underline"
        >
          Back to sessions
        </Link>
      </div>
    )
  }

  const firstUserTurn = detail.turns.find((t) => t.type === 'user' && t.message)
  const sessionTitle = sessionMeta?.customName || firstUserTurn?.message?.slice(0, 120) || detail.projectName

  const startedAt = detail.turns[0]?.timestamp
  const endedAt = detail.turns[detail.turns.length - 1]?.timestamp
  const durationMs =
    startedAt && endedAt
      ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
      : 0

  return (
    <div>
      {isActive && <ActiveSessionBanner />}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            to="/sessions"
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            &larr; Sessions
          </Link>
          <h1 className="mt-1 text-xl font-bold text-gray-100" title={sessionTitle}>
            {privacyMode
              ? anonymizeProjectName(detail.projectName)
              : sessionTitle}
          </h1>
          {sessionTitle !== detail.projectName && (
            <p className="mt-0.5 text-xs text-gray-500">{detail.projectName}</p>
          )}
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
            {detail.branch && (
              <span className="font-mono">{anonymizeBranch(detail.branch)}</span>
            )}
            {startedAt && <span>{formatDateTime(startedAt)}</span>}
            <span>{formatDuration(durationMs)}</span>
            <span>{detail.turns.length} turns</span>
            <CostSummaryLine tokensByModel={detail.tokensByModel} />
          </div>
          {detail.models.length > 0 && (
            <div className="mt-1 flex gap-1">
              {detail.models.map((m) => (
                <span
                  key={m}
                  className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-400"
                >
                  {m.replace(/^claude-/, '').split('-202')[0]}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DetailPinButton sessionId={sessionId} pinned={sessionMeta?.pinned ?? false} />
          <DetailRenameButton sessionId={sessionId} currentName={sessionMeta?.customName || ''} />
          <LaunchButton sessionId={sessionId} cwd={detail.projectPath} />
          <ExportDropdown
            options={[
              {
                label: 'Export Session (JSON)',
                onClick: () =>
                  downloadFile(
                    sessionToJSON(detail),
                    `session-${sessionId.slice(0, 8)}.json`,
                    'application/json',
                  ),
              },
            ]}
          />
          <span className="font-mono text-xs text-gray-600">
            {sessionId.slice(0, 8)}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ContextWindowPanel contextWindow={detail.contextWindow} tokens={detail.totalTokens} />
        <ToolUsagePanel toolFrequency={detail.toolFrequency} />
      </div>

      {/* Cost estimation */}
      <div className="mt-4">
        <CostEstimationPanel tokensByModel={detail.tokensByModel} />
      </div>

      {/* Agent Dispatches */}
      {detail.agents.length > 0 && (
        <div className="mt-4">
          <AgentDispatchesPanel agents={detail.agents} />
        </div>
      )}

      {/* Tasks */}
      {detail.tasks.length > 0 && (
        <div className="mt-4">
          <TasksPanel tasks={detail.tasks} />
        </div>
      )}

      <div className="mt-4">
        <ErrorPanel errors={detail.errors} />
      </div>

      {/* Timeline Events Chart */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-300">Timeline</h2>
        <TimelineEventsChart
          turns={detail.turns}
          agents={detail.agents}
          skills={detail.skills}
          errors={detail.errors}
        />
      </div>

      {/* Skill Invocations */}
      {(detail.skills.length > 0 || detail.agents.some(a => (a.skills?.length ?? 0) > 0)) && (
        <div className="mt-6">
          <SkillInvocationsPanel agents={detail.agents} skills={detail.skills} />
        </div>
      )}

    </div>
  )
}
