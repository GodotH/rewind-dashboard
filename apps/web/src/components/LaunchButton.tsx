import { useState } from 'react'

interface LaunchButtonProps {
  sessionId: string
  cwd?: string
  size?: 'sm' | 'md'
}

export function LaunchButton({ sessionId, cwd, size = 'sm' }: LaunchButtonProps) {
  const [status, setStatus] = useState<'idle' | 'launched' | 'error'>('idle')
  const padding = size === 'md' ? 'px-3 py-1' : 'px-2 py-0.5'
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
      className={`shrink-0 rounded bg-emerald-900/50 ${padding} text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-800/60 hover:text-emerald-300`}
    >
      {status === 'launched' ? 'Launched!' : status === 'error' ? 'Failed' : 'Launch'}
    </button>
  )
}
