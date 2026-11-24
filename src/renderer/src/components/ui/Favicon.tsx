import { useState } from 'react'
import { Globe } from 'lucide-react'
import { displayHost } from '@shared/url'
import { cn } from '@/lib/utils'

/** A favicon with a quiet monogram fallback and an optional loading ring. */
export function Favicon({
  src,
  url,
  size = 16,
  loading = false,
  className,
  dim = false
}: {
  src?: string
  url?: string
  size?: number
  loading?: boolean
  className?: string
  dim?: boolean
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const host = url ? displayHost(url) : ''
  const letter = host.replace(/^www\./, '').charAt(0).toUpperCase()
  const showImg = src && failed !== src

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', dim && 'opacity-50 grayscale', className)}
      style={{ width: size, height: size }}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setFailed(src ?? null)}
          className="h-full w-full rounded-[3px] object-contain"
        />
      ) : letter && /[A-Z]/.test(letter) ? (
        <span
          className="flex h-full w-full items-center justify-center rounded-[4px] border border-hairline-strong font-mono font-medium text-dim"
          style={{ fontSize: size * 0.56 }}
        >
          {letter}
        </span>
      ) : (
        <Globe className="h-full w-full text-faint" strokeWidth={1.5} />
      )}
      {loading && (
        <span
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: -3.5,
            background: 'conic-gradient(from 0deg, transparent 0deg, var(--text-dim) 90deg, transparent 180deg)',
            mask: 'radial-gradient(circle, transparent calc(50% - 1.25px), #000 calc(50% - 0.75px))',
            animation: 'spin-slow 0.8s linear infinite'
          }}
        />
      )}
    </span>
  )
}
