import { useState, useEffect, useCallback, useRef } from 'react'

interface LaunchButtonProps {
  sessionId: string
  cwd?: string
  size?: 'sm' | 'md'
  isActive?: boolean
}

export function LaunchButton({ sessionId, cwd, size = 'sm', isActive }: LaunchButtonProps) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'launched' | 'error'>('idle')
  const padding = size === 'md' ? 'px-3 py-1' : 'px-2 py-0.5'
  const popupRef = useRef<HTMLSpanElement>(null)

  const launch = useCallback(async () => {
    try {
      const res = await fetch('/api/launch-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, cwd }),
      })
      setStatus(res.ok ? 'launched' : 'error')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }, [sessionId, cwd])

  const cancel = useCallback(() => setStatus('idle'), [])

  useEffect(() => {
    if (status !== 'confirm') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); void launch() }
      if (e.key === 'Escape') { e.preventDefault(); cancel() }
    }
    const onClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) cancel()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [status, launch, cancel])

  if (isActive) {
    return (
      <span className={`shrink-0 border border-matrix/20 bg-matrix/10 ${padding} text-xs font-medium text-matrix/60`}>
        active
      </span>
    )
  }

  if (status === 'confirm') {
    return (
      <span className="relative" ref={popupRef}>
        <span className={`shrink-0 border border-matrix/20 bg-matrix/10 ${padding} text-xs font-medium text-matrix/40`}>
          Launch
        </span>
        <span className="absolute right-0 bottom-full z-50 mb-1 flex min-w-[180px] flex-col gap-2.5 border border-matrix/20 bg-gray-950 p-2.5 shadow-lg shadow-black/50">
          <span className="w-full text-center text-xs leading-tight font-mono text-matrix/50">
            Launch session in terminal
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); void launch() }}
              className="flex-1 border border-matrix/30 bg-matrix/15 py-0.5 text-center text-xs font-bold text-matrix transition-colors hover:bg-matrix/25"
            >
              YEAH
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); cancel() }}
              className="flex-1 border border-matrix/20 bg-matrix/10 py-0.5 text-center text-xs font-medium text-matrix/60 transition-colors hover:bg-matrix/15"
            >
              NOPE
            </button>
          </span>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); cancel() }}
            className="w-full border border-gray-700 bg-gray-800/50 py-0.5 text-center text-xs font-medium text-gray-500 transition-colors hover:bg-gray-700"
          >
            CANCEL
          </button>
          <span className="font-mono text-[9px] text-gray-600">enter - yeah | esc - cancel</span>
        </span>
      </span>
    )
  }

  return (
    <button
      type="button"
      title="Launch session in terminal"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setStatus('confirm')
      }}
      className={`shrink-0 border border-matrix/20 bg-matrix/10 ${padding} text-xs font-medium text-matrix transition-colors hover:border-matrix/30 hover:bg-matrix/15`}
    >
      {status === 'launched' ? 'Launched!' : status === 'error' ? 'Failed' : 'Launch'}
    </button>
  )
}
