import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { RotateCcw } from 'lucide-react'
import type { HistoryEntry } from '@shared/types'
import { displayHost } from '@shared/url'
import { selectActiveSpace, useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { openUrl } from '@/browser/actions'
import { BlurFade } from '@/components/magic/blur-fade'
import { Favicon } from '@/components/ui/Favicon'
import { Kbd } from '@/components/ui/Kbd'
import { spring } from '@/lib/springs'
import { GravityField } from './GravityField'

/** A digit that rolls over like a mechanical counter when it changes. */
function RollingDigit({ d }: { d: string }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.6em] overflow-hidden align-top">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={d}
          initial={{ y: '-100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={spring.heavy}
          className="absolute inset-0 text-center"
        >
          {d}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** What a space shows when no tab is open: the time, a search field, your sites. */
export function HomeCanvas() {
  const space = useBrowser(selectActiveSpace)
  const spaceIndex = useBrowser((s) => s.spaces.findIndex((sp) => sp.id === s.activeSpaceId))
  const favorites = useSettings((s) => s.favorites)
  const closed = useBrowser((s) => s.closed)
  const reopen = useBrowser((s) => s.reopenClosed)
  const openCommand = useUI((s) => s.openCommand)
  const [top, setTop] = useState<HistoryEntry[]>([])
  const now = useNow()

  useEffect(() => {
    void window.gravity.history.top(8).then(setTop)
  }, [space?.id])

  const hh = now.getHours().toString().padStart(2, '0')
  const mm = now.getMinutes().toString().padStart(2, '0')
  const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
  const sites = (favorites.length ? favorites : top).slice(0, 8)

  return (
    <div className="grain absolute inset-0 overflow-hidden bg-canvas" data-testid="home-canvas">
      <GravityField className="absolute inset-0 h-full w-full" />

      <div className="label absolute top-5 left-6 flex items-center gap-3">
        <span>{date}</span>
      </div>
      <div className="label absolute top-5 right-6 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-[1px]" style={{ background: space?.theme.colors[0] }} />
        {String(spaceIndex + 1).padStart(2, '0')} / {space?.name}
      </div>

      <div className="relative flex h-full flex-col items-center justify-center px-8">
        <div className="font-display text-[104px] leading-none font-extralight tracking-[-0.04em] text-text tabular-nums">
          <RollingDigit d={hh[0]} />
          <RollingDigit d={hh[1]} />
          <span className="mx-[0.06em] inline-block -translate-y-[0.06em] text-faint">:</span>
          <RollingDigit d={mm[0]} />
          <RollingDigit d={mm[1]} />
        </div>

        <BlurFade delay={0.1} offset={6} blur="4px" className="mt-10 w-full max-w-[520px]">
          <button
            type="button"
            onClick={() => openCommand('new')}
            className="flex h-11 w-full items-center gap-3 rounded-[9px] border border-hairline px-4 text-left text-[13.5px] text-faint shadow-[var(--shadow)] transition-colors hover:border-hairline-strong"
            style={{ background: 'var(--frame-bg)' }}
            data-testid="home-search"
          >
            <span className="flex-1">Search or enter address</span>
            <Kbd>⌘ T</Kbd>
          </button>
        </BlurFade>

        {sites.length > 0 && (
          <BlurFade delay={0.18} offset={6} blur="4px" className="mt-8">
            <div className="flex flex-wrap justify-center gap-1">
              {sites.map((s, i) => (
                <motion.button
                  key={s.url}
                  type="button"
                  title={s.title || s.url}
                  onClick={() => openUrl(s.url, 'foreground')}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring.settle, delay: 0.22 + i * 0.03 }}
                  whileTap={{ scale: 0.96 }}
                  className="group flex w-[88px] flex-col items-center gap-2 rounded-[8px] py-3 hover:bg-hover"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-hairline bg-hover transition-colors group-hover:border-hairline-strong">
                    <Favicon src={s.favicon} url={s.url} size={18} />
                  </span>
                  <span className="w-full truncate px-1 text-center font-mono text-[10.5px] text-faint group-hover:text-dim">
                    {displayHost(s.url)}
                  </span>
                </motion.button>
              ))}
            </div>
          </BlurFade>
        )}
      </div>

      {closed.length > 0 && (
        <button
          type="button"
          onClick={() => reopen()}
          className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-[7px] px-3 py-1.5 font-mono text-[11px] text-faint hover:bg-hover hover:text-dim"
        >
          <RotateCcw size={11} />
          <span className="max-w-[320px] truncate">Reopen {closed[0].title}</span>
          <Kbd>⇧ ⌘ T</Kbd>
        </button>
      )}
    </div>
  )
}
