import { useState, useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { SessionSummary } from '@/lib/parsers/types'
import type { SessionMetadataEntry, ProjectMetadataEntry } from '@/features/metadata/metadata.types'
import { usePinSession, useRenameSession, useHideProject } from '@/features/metadata/useMetadataMutations'
import { chatQuery } from './chat.queries'
import { formatDuration, formatRelativeTime, formatBytes, formatDateTime } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { StatusBadge } from './StatusBadge'
import { RunningTimer } from './RunningTimer'

// --- Small action buttons ---

function LaunchButton({ sessionId, cwd }: { sessionId: string; cwd?: string }) {
  const [status, setStatus] = useState<'idle' | 'launched' | 'error'>('idle')
  return (
    <button
      type="button"
      title="Launch session in terminal"
      onClick={async (e) => {
        e.preventDefault(); e.stopPropagation()
        try {
          const res = await fetch('/api/launch-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, cwd }),
          })
          setStatus(res.ok ? 'launched' : 'error')
          setTimeout(() => setStatus('idle'), 2000)
        } catch { setStatus('error'); setTimeout(() => setStatus('idle'), 2000) }
      }}
      className="shrink-0 rounded bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-800/60 hover:text-emerald-300"
    >
      {status === 'launched' ? 'Launched!' : status === 'error' ? 'Failed' : 'Launch'}
    </button>
  )
}

function PinButton({ sessionId, pinned }: { sessionId: string; pinned: boolean }) {
  const mutation = usePinSession()
  return (
    <button
      type="button"
      title={pinned ? 'Unpin session' : 'Pin session'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); mutation.mutate({ sessionId, pinned: !pinned }) }}
      className={`shrink-0 rounded px-1.5 py-0.5 text-xs transition-colors ${
        pinned
          ? 'bg-amber-900/50 text-amber-400 hover:bg-amber-800/60'
          : 'opacity-40 hover:opacity-100 text-gray-500 hover:text-amber-400'
      }`}
    >
      {'\u{1F4CC}'}
    </button>
  )
}

// --- Overflow menu (Hide + Rename) ---

function OverflowMenu({
  sessionId,
  projectPath,
  customName,
  onStartRename,
}: {
  sessionId: string
  projectPath: string
  customName: string
  onStartRename: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const hideMutation = useHideProject()
  const [justHidden, setJustHidden] = useState(false)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (justHidden) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault(); e.stopPropagation()
          hideMutation.mutate({ projectPath, hidden: false })
          setJustHidden(false)
        }}
        className="rounded bg-blue-900/50 px-2 py-0.5 text-xs font-medium text-blue-400 hover:bg-blue-800/60"
      >
        Undo hide
      </button>
    )
  }

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
        <div className="absolute right-0 top-7 z-40 w-36 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
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
              hideMutation.mutate({ projectPath, hidden: true })
              setJustHidden(true)
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
          >
            Hide project
          </button>
        </div>
      )}
    </div>
  )
}

// --- Inline rename ---

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

// --- Chat modal ---

function ChatModal({ sessionId, projectPath, title, onClose }: { sessionId: string; projectPath: string; title: string; onClose: () => void }) {
  const { data: messages, isLoading } = useQuery(chatQuery(sessionId, projectPath))

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-100">{title}</h2>
            <p className="text-xs text-gray-500">{sessionId.slice(0, 8)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/sessions/$sessionId"
              params={{ sessionId }}
              search={{ project: projectPath }}
              className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:text-gray-200"
              onClick={onClose}
            >
              Full details
            </Link>
            <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200">&times;</button>
          </div>
        </div>

        {/* Chat body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-800/50" />
              ))}
            </div>
          ) : messages && messages.length > 0 ? (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-brand-600/30 text-gray-100'
                    : 'bg-gray-800 text-gray-300'
                }`}>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                    {msg.role === 'user' ? 'You' : 'Claude'}
                    {msg.timestamp && (
                      <span className="ml-2 font-normal normal-case">{formatDateTime(msg.timestamp)}</span>
                    )}
                  </p>
                  <div className="whitespace-pre-wrap break-words">
                    {msg.text.length > 5000 ? msg.text.slice(0, 5000) + '\n\n[truncated...]' : msg.text}
                  </div>
                  {msg.toolNames && msg.toolNames.length > 0 && (
                    <p className="mt-1.5 text-[10px] text-gray-500">
                      Tools: {msg.toolNames.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-sm text-gray-500">No messages found</p>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Session card ---

interface SessionCardProps {
  session: SessionSummary
  metadata?: SessionMetadataEntry
  projectMeta?: ProjectMetadataEntry
}

export function SessionCard({ session, metadata, projectMeta }: SessionCardProps) {
  const { privacyMode, anonymizePath, anonymizeProjectName, anonymizeBranch } = usePrivacy()
  const [isRenaming, setIsRenaming] = useState(false)
  const [showChat, setShowChat] = useState(false)

  const isPinned = metadata?.pinned ?? false
  const customName = metadata?.customName
  const displayName = privacyMode ? anonymizeProjectName(session.projectName) : session.projectName
  const displayCwd = session.cwd ? anonymizePath(session.cwd, session.projectName) : null
  const displayBranch = session.branch ? anonymizeBranch(session.branch) : null
  const titleText = customName || session.firstUserMessage || displayName

  return (
    <>
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
                <h3 className="truncate text-sm font-semibold text-gray-100" title={titleText}>{titleText}</h3>
                <StatusBadge isActive={session.isActive} />
              </div>
            )}
            <div className="mt-1 flex items-center gap-2 truncate text-xs text-gray-500">
              <span className={`rounded px-1.5 py-0.5 ${
                projectMeta?.pinned ? 'bg-amber-900/30 text-amber-400 border border-amber-800/50' : 'bg-gray-800 text-gray-400'
              }`}>
                {projectMeta?.pinned && '\u{1F4CC} '}{displayName}
              </span>
              {displayBranch && <span className="font-mono">{displayBranch}</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              title="View chat"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowChat(true) }}
              className="shrink-0 rounded bg-gray-800/50 px-2 py-0.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
            >
              View
            </button>
            <LaunchButton sessionId={session.sessionId} cwd={session.projectPath} />
            <OverflowMenu
              sessionId={session.sessionId}
              projectPath={session.projectPath}
              customName={customName || ''}
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

      {showChat && (
        <ChatModal sessionId={session.sessionId} projectPath={session.projectPath} title={titleText} onClose={() => setShowChat(false)} />
      )}
    </>
  )
}
