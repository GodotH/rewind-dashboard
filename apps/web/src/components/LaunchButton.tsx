import { useState } from 'react'

interface LaunchButtonProps {
  sessionId: string
  cwd?: string
  size?: 'sm' | 'md'
  isActive?: boolean
}

export function LaunchButton({ sessionId, cwd, size = 'sm', isActive }: LaunchButtonProps) {
  const [status, setStatus] = useState<'idle' | 'launched' | 'error'>('idle')
  const padding = size === 'md' ? 'px-3 py-1' : 'px-2 py-0.5'

  if (isActive) {
    return (
      <span className={`shrink-0 border border-emerald-400/30 bg-emerald-900/15 ${padding} text-xs font-medium text-emerald-400/60`}>
        active
      </span>
    )
  }

  return (
    <button
      type="button"
      title="Launch session in terminal"
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
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
      }}
      className={`shrink-0 border border-emerald-400/30 bg-emerald-900/15 ${padding} text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-400/50 hover:bg-emerald-900/25`}
    >
      {status === 'launched' ? 'Launched!' : status === 'error' ? 'Failed' : 'Launch'}
    </button>
  )
}
