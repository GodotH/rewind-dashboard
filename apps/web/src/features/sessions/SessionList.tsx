import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { paginatedSessionListQuery, activeSessionsQuery } from './sessions.queries'
import { metadataQuery } from '@/features/metadata/metadata.queries'
import { SessionCard } from './SessionCard'
import { SessionFilters } from './SessionFilters'
import { PaginationControls } from './PaginationControls'
import { usePageSizePreference } from './usePageSizePreference'
import { SessionListGrouped } from './SessionListGrouped'
import { Route } from '@/routes/_dashboard/sessions/index'

export function SessionList() {
  const navigate = useNavigate()
  const { page, pageSize, search, status, project, sort, view } = Route.useSearch()
  const { storedPageSize, setPageSize } = usePageSizePreference()
  const hasAppliedStoredPreference = useRef(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Cmd+K to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (
      storedPageSize !== null &&
      !hasAppliedStoredPreference.current &&
      storedPageSize !== pageSize
    ) {
      hasAppliedStoredPreference.current = true
      navigate({
        to: '/sessions',
        search: (prev) => ({ ...prev, pageSize: storedPageSize, page: 1 }),
        replace: true,
      })
    }
  }, [storedPageSize, pageSize, navigate])

  const { data: paginatedData, isLoading } = useQuery(
    paginatedSessionListQuery({ page, pageSize, search, status, project, sort }),
  )
  const { data: activeSessions = [] } = useQuery(activeSessionsQuery)
  const { data: metadata } = useQuery(metadataQuery)

  // Merge active status from fast-polling query
  const mergedSessions = useMemo(() => {
    if (!paginatedData) return []
    const activeIds = new Set(activeSessions.map((s) => s.sessionId))
    return paginatedData.sessions.map((s) => ({
      ...s,
      isActive: activeIds.has(s.sessionId) || s.isActive,
    }))
  }, [paginatedData, activeSessions])

  // Client-side filter hidden projects from dropdown
  const visibleProjects = useMemo(() => {
    const projects = paginatedData?.projects ?? []
    const hiddenPaths = new Set(
      Object.entries(metadata?.projects ?? {})
        .filter(([, v]) => v.hidden)
        .map(([k]) => k),
    )
    if (hiddenPaths.size === 0) return projects
    const hiddenNames = new Set<string>()
    for (const s of paginatedData?.sessions ?? []) {
      if (hiddenPaths.has(s.projectPath)) hiddenNames.add(s.projectName)
    }
    return projects.filter((p) => !hiddenNames.has(p))
  }, [paginatedData, metadata])

  function handlePageChange(newPage: number) {
    navigate({ to: '/sessions', search: (prev) => ({ ...prev, page: newPage }) })
  }

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize)
    navigate({ to: '/sessions', search: (prev) => ({ ...prev, pageSize: newSize, page: 1 }) })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: pageSize }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-gray-800 bg-gray-900/50" />
        ))}
      </div>
    )
  }

  const totalCount = paginatedData?.totalCount ?? 0
  const totalPages = paginatedData?.totalPages ?? 1
  const activeCount = activeSessions.length

  return (
    <div>
      <SessionFilters
        projects={visibleProjects}
        activeCount={activeCount}
        searchRef={searchInputRef}
      />

      <div className="mt-4 space-y-2">
        {mergedSessions.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            {totalCount === 0 && !search && status === 'all' && !project
              ? 'No sessions found in ~/.claude'
              : 'No sessions match your filters'}
          </div>
        ) : view === 'grouped' ? (
          <SessionListGrouped sessions={mergedSessions} metadata={metadata} />
        ) : (
          mergedSessions.map((session) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              metadata={metadata?.sessions[session.sessionId]}
              projectMeta={metadata?.projects[session.projectPath]}
            />
          ))
        )}
      </div>

      <div className="mt-4">
        <PaginationControls
          page={paginatedData?.page ?? page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  )
}
