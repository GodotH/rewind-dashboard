import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { SessionSummary } from '@/lib/parsers/types'
import type { SessionMetadataEntry, ProjectMetadataEntry } from '@/features/metadata/metadata.types'
import { usePinSession, useRenameSession } from '@/features/metadata/useMetadataMutations'
import { LaunchButton } from '@/components/LaunchButton'
import { formatDuration, formatRelativeTime, formatBytes } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { StatusBadge } from './StatusBadge'
import { RunningTimer } from './RunningTimer'

function PinButton({ sessionId, pinned }: { sessionId: string; pinned: boolean }) {
  const mutation = usePinSession()
  return (
    <button
      type="button"
      title={pinned ? 'Unstar session' : 'Star session'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); mutation.mutate({ sessionId, pinned: !pinned }) }}
      className={`shrink-0 rounded px-1.5 py-0.5 text-xs transition-colors ${
        pinned
          ? 'bg-amber-900/50 text-amber-400 hover:bg-amber-800/60'
          : 'opacity-40 hover:opacity-100 text-gray-500 hover:text-amber-400'
      }`}
    >
      {pinned ? '\u2605' : '\u2606'}
    </button>
  )
}

function OverflowMenu({
  sessionId,
  onStartRename,
}: {
  sessionId: string
  onStartRename: () => void
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="More actions"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
      >
        &hellip;
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-40 w-44 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onStartRename(); setOpen(false) }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault(); e.stopPropagation()
              navigator.clipboard.writeText(`claude --resume ${sessionId}`)
              setCopied(true)
              setTimeout(() => { setCopied(false); setOpen(false) }, 1200)
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
          >
            {copied ? 'Copied!' : 'Copy resume command'}
          </button>
        </div>
      )}
    </div>
  )
}

function InlineRename({ sessionId, currentName, onClose }: { sessionId: string; currentName: string; onClose: () => void }) {
  const [value, setValue] = useState(currentName)
  const mutation = useRenameSession()
  function handleSubmit() { mutation.mutate({ sessionId, customName: value.trim() }); onClose() }
  return (
    <div className="flex items-center gap-1" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
      <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose() }}
        autoFocus className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-0.5 text-sm text-gray-100 outline-none focus:border-brand-500" placeholder="Session name..." />
      <button type="button" onClick={handleSubmit} className="rounded bg-brand-600 px-2 py-0.5 text-xs text-white hover:bg-brand-500">OK</button>
      <button type="button" onClick={onClose} className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600">X</button>
    </div>
  )
}

interface SessionCardProps {
  session: SessionSummary
  metadata?: SessionMetadataEntry
  projectMeta?: ProjectMetadataEntry
}

export function SessionCard({ session, metadata, projectMeta }: SessionCardProps) {
  const { privacyMode, anonymizePath, anonymizeProjectName, anonymizeBranch } = usePrivacy()
  const navigate = useNavigate()
  const [isRenaming, setIsRenaming] = useState(false)

  const isPinned = metadata?.pinned ?? false
  const customName = metadata?.customName
  const displayName = privacyMode ? anonymizeProjectName(session.projectName) : session.projectName
  const displayCwd = session.cwd ? anonymizePath(session.cwd, session.projectName) : null
  const displayBranch = session.branch ? anonymizeBranch(session.branch) : null
  const titleText = customName || session.firstUserMessage || displayName

  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.sessionId }}
      search={{ project: session.projectPath }}
      className="group block rounded-xl border border-gray-800 bg-gray-900/50 p-4 transition-all hover:border-gray-700 hover:bg-gray-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <InlineRename sessionId={session.sessionId} currentName={customName || ''} onClose={() => setIsRenaming(false)} />
          ) : (
            <div className="flex items-center gap-2">
              <PinButton sessionId={session.sessionId} pinned={isPinned} />
              <span className="text-gray-500 text-xs">💬</span>
              <h3 className="truncate text-sm font-semibold text-gray-100" title={titleText}>{titleText}</h3>
              <StatusBadge isActive={session.isActive} />
            </div>
          )}
          <div className="mt-1 flex items-center gap-2 truncate text-xs text-gray-500">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation()
                navigate({ to: '/sessions', search: (prev) => ({ ...prev, project: session.projectName, page: 1 }) })
              }}
              className={`rounded px-1.5 py-0.5 transition-colors cursor-pointer hover:brightness-125 ${
                projectMeta?.pinned
                  ? 'bg-amber-900/30 text-amber-400 border border-amber-800/50'
                  : 'bg-blue-900/20 text-blue-300 border border-blue-800/40'
              }`}
              title={`Filter by project: ${displayName}`}
            >
              {projectMeta?.pinned && '\u2605 '}Project: {displayName}
            </button>
            {displayBranch && <span className="font-mono">{displayBranch}</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <LaunchButton sessionId={session.sessionId} cwd={session.projectPath} />
          <OverflowMenu
            sessionId={session.sessionId}
            onStartRename={() => setIsRenaming(true)}
          />
          <span className="ml-1 text-xs text-gray-500">{formatRelativeTime(session.lastActiveAt)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
        <span title="Duration">
          {session.isActive ? <RunningTimer startedAt={session.startedAt} /> : formatDuration(session.durationMs)}
        </span>
        <span title="Messages">{session.messageCount} msgs</span>
        {session.model && (
          <span title="Model" className="truncate font-mono text-gray-500">
            {session.model.replace(/^claude-/, '').split('-202')[0]}
          </span>
        )}
        <span title="File size" className="text-gray-500">{formatBytes(session.fileSizeBytes)}</span>
      </div>

      {displayCwd && <p className="mt-2 truncate text-xs font-mono text-gray-600">{displayCwd}</p>}
    </Link>
  )
}
