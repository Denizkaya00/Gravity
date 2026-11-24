import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, animate, frame as nextFrame, motion, motionValue, type MotionValue } from 'motion/react'
import { Plus, Search, X } from 'lucide-react'
import { prettyUrl } from '@shared/url'
import { rankItems } from '@shared/rank'
import { selectActiveSpace, selectActiveTabId, useBrowser } from '@/state/browser'
import { useRuntime } from '@/state/runtime'
import { useSlots, useUI, type Rect } from '@/state/ui'
import { closeTab } from '@/browser/actions'
import { MagicCard } from '@/components/magic/magic-card'
import { Favicon } from '@/components/ui/Favicon'
import { Kbd } from '@/components/ui/Kbd'
import { fallEase, spring, tilt } from '@/lib/springs'
import { SceneBackground } from '@/features/scenes/SceneBackground'
import { useBlackHole } from '@/features/blackhole/store'
import { useBlackHoleBackdrop } from '@/lib/theme'

/** Where the hole sits in the Overview: a little below the middle of the window. */
export const OVERVIEW_HOLE_CENTER: [number, number] = [0, -0.17]
const HOLE_CENTER = OVERVIEW_HOLE_CENTER

type Phase = 'enter' | 'grid' | 'exit'

function Thumb({ id }: { id: string }) {
  const thumb = useRuntime((s) => s.tabs[id]?.thumbnail)
  const tab = useBrowser((s) => s.tabs[id])
  const color = useRuntime((s) => s.tabs[id]?.themeColor ?? s.tabs[id]?.faviconColor)
  // Pages are captured with transparency, so back them with white like the real page.
  if (thumb) return <img src={thumb} alt="" draggable={false} className="h-full w-full bg-white object-cover object-top" />
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: `linear-gradient(160deg, ${color ?? 'var(--space-a)'}14, transparent 70%), var(--canvas)` }}
    >
      <Favicon src={tab?.favicon} url={tab?.url} size={28} />
    </div>
  )
}

/** The card stand-in that sits exactly over the page while morphing in or out. */
function FrameGhost({ id, rect, onDone }: { id: string; rect: Rect; onDone?: () => void }) {
  return (
    <motion.div
      layoutId={`well-${id}`}
      transition={spring.heavy}
      onLayoutAnimationComplete={onDone}
      className="fixed z-[66] overflow-hidden"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderRadius: 10 }}
    >
      <Thumb id={id} />
    </motion.div>
  )
}

function Well() {
  const space = useBrowser(selectActiveSpace)
  const activeId = useBrowser(selectActiveTabId)
  const order = useBrowser((s) => s.order[s.activeSpaceId])
  const tabs = useBrowser((s) => s.tabs)
  const set = useUI((s) => s.set)
  const openCommand = useUI((s) => s.openCommand)
  const frame = useSlots((s) => s.rects.main ?? s.rects['split-a'] ?? null)
  const [phase, setPhase] = useState<Phase>(activeId && frame ? 'enter' : 'grid')
  const [target, setTarget] = useState<string | null>(activeId)
  const [filter, setFilter] = useState('')
  const [focus, setFocus] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const frameRect = useRef(frame)
  const [fallen, setFallen] = useState<Set<string>>(() => new Set())
  // In dark mode the window's own black hole moves in behind the cards; otherwise draw one here.
  const backdrop = useBlackHoleBackdrop()

  // Each card's vertical offset (drag and hover), so a fall can take over from it.
  const lifts = useRef(new Map<string, MotionValue<number>>())
  const lift = (id: string) => {
    let v = lifts.current.get(id)
    if (!v) lifts.current.set(id, (v = motionValue(0)))
    return v
  }

  /**
   * Closing a tab here sucks its card into the black hole: it is pulled
   * straight toward the centre, speeding up and shrinking as it goes, and the
   * disk flares when it arrives. One continuous curve, so it never stalls.
   * `velocityY` carries a flick's momentum into the start of the fall.
   */
  const fallIn = (id: string, velocityY = 0) => {
    if (fallen.has(id)) return
    setFallen((f) => new Set(f).add(id))
    // Animate the card's inner body, not the motion wrapper, so layout
    // animations on the wrapper can't interrupt the fall.
    const card = document.querySelector<HTMLElement>(`[data-well-id="${id}"]`)
    const el = card?.querySelector<HTMLElement>('[data-fall]') ?? null
    if (!card || !el) return closeTab(id)
    const r = el.getBoundingClientRect()
    const dx = window.innerWidth / 2 - (r.left + r.width / 2)
    const dy = window.innerHeight * (0.5 - HOLE_CENTER[1]) - (r.top + r.height / 2)
    // Stop the wrapper springing back from a drag, so the card falls from
    // exactly where it is. The path below is drawn against the wrapper's live
    // offset, so anything the wrapper still does (a hover ending) can't move it.
    const wrapperY = lift(id)
    wrapperY.stop()
    const y0 = wrapperY.get()
    const v0 = Math.max(-3000, Math.min(3000, velocityY))
    const duration = 0.75
    card.style.zIndex = '40'
    card.style.pointerEvents = 'none'
    el.style.willChange = 'transform, opacity, filter'
    const draw = (p: number) => {
      const pull = p ** 2.4 // accelerates the whole way in
      const momentum = v0 * duration * p * (1 - p) ** 2 // matches the flick's speed at p = 0, gone by p = 1
      const scale = 1 - 0.97 * p ** 1.5
      const fade = Math.min(1, Math.max(0, (p - 0.55) / 0.45))
      // Apply in the render step, after every motion value has updated this frame.
      nextFrame.render(() => {
        const y = y0 - wrapperY.get() + dy * pull + momentum
        el.style.transform = `translate(${dx * pull}px, ${y}px) scale(${scale})`
        el.style.opacity = String(1 - fade * fade * (3 - 2 * fade))
        el.style.filter = fade > 0 ? `blur(${(5 * fade * fade).toFixed(2)}px)` : ''
      })
    }
    void animate(0, 1, { duration, ease: 'linear', onUpdate: draw }).then(() => {
      useBlackHole.getState().flare(0.8)
      closeTab(id)
    })
  }

  const ids = useMemo(() => {
    const list = (order ?? []).filter((id) => tabs[id] && !tabs[id].peek)
    if (!filter.trim()) return list
    return rankItems(filter, list.map((id) => tabs[id]), () => 0, 50).map((t) => t.id)
  }, [order, tabs, filter])

  useEffect(() => {
    if (phase !== 'enter') return
    const r = requestAnimationFrame(() => setPhase('grid'))
    return () => cancelAnimationFrame(r)
  }, [phase])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60)
  }, [])

  useEffect(() => setFocus(Math.max(0, ids.indexOf(activeId ?? ''))), [ids, activeId])

  const finish = () => set({ overview: false })

  const choose = (id: string | null) => {
    if (phase === 'exit') return
    if (!id || !frameRect.current) {
      if (id) useBrowser.getState().activateTab(id)
      finish()
      return
    }
    useBrowser.getState().activateTab(id)
    setTarget(id)
    setPhase('exit')
    // Safety net in case the morph is skipped (e.g. reduced motion).
    setTimeout(finish, 900)
  }

  // Card width is fixed-ish (~300px) so a few tabs never balloon into posters.
  const cols = Math.max(2, Math.min(5, Math.floor((window.innerWidth - 80) / 320)))

  return (
    <motion.div
      className="theme-dark fixed inset-0 z-[65] flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25, delay: 0.05 } }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          choose(activeId)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          if (ids[focus]) choose(ids[focus])
        } else if (e.key === 'ArrowRight') setFocus((f) => Math.min(ids.length - 1, f + 1))
        else if (e.key === 'ArrowLeft') setFocus((f) => Math.max(0, f - 1))
        else if (e.key === 'ArrowDown') setFocus((f) => Math.min(ids.length - 1, f + cols))
        else if (e.key === 'ArrowUp') setFocus((f) => Math.max(0, f - cols))
      }}
      data-testid="gravity-well"
    >
      <motion.div
        className={backdrop ? 'absolute inset-0' : 'absolute inset-0 bg-[#050505]'}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === 'exit' ? 0 : 1 }}
        transition={{ duration: 0.3 }}
        onClick={() => choose(activeId)}
      >
        {!backdrop && <SceneBackground center={HOLE_CENTER} camera={{ distance: 52, inclination: 0.14 }} exposure={0.85} />}
        {/* Over a page, darken it fully; the black hole shows through the lower half. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/45 to-black/10" />
      </motion.div>

      <motion.div
        className="drag relative flex items-center gap-4 px-10 pt-9 pb-6"
        animate={{ opacity: phase === 'exit' ? 0 : 1, y: phase === 'exit' ? -20 : 0 }}
        initial={{ opacity: 0, y: -20 }}
        transition={spring.gentle}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-[20px] font-medium tracking-tight text-text">{space?.name}</span>
          <span className="label tabular-nums">
            {String(ids.length).padStart(2, '0')} tab{ids.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="no-drag ml-auto flex w-[280px] items-center gap-2 rounded-[8px] border border-hairline bg-hover px-3 py-1.5">
          <Search size={13} className="text-faint" />
          <input
            ref={inputRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tabs"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
          />
          <Kbd>esc</Kbd>
        </div>
      </motion.div>

      <div className="scroll-thin relative flex-1 overflow-y-auto px-10 pb-12" onClick={(e) => e.target === e.currentTarget && choose(activeId)}>
        <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          <AnimatePresence mode="popLayout">
            {ids.map((id, i) => {
              const tab = tabs[id]
              const isActive = id === activeId
              const morphing = (phase === 'enter' && id === activeId) || (phase === 'exit' && id === target)
              if (morphing) return <div key={id} className="aspect-[16/10]" />
              return (
                <motion.div
                  key={id}
                  layoutId={`well-${id}`}
                  layout
                  custom={i}
                  initial={id === activeId ? false : { opacity: 0, y: -28, rotate: tilt(id, 1.2) }}
                  animate={
                    phase === 'exit'
                      ? { opacity: 0, y: 40, transition: { duration: 0.28, ease: fallEase, delay: i * 0.01 } }
                      : { opacity: 1, y: 0, rotate: 0, transition: { ...spring.settle, delay: Math.min(i * 0.025, 0.25) } }
                  }
                  exit={fallen.has(id) ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 20, transition: { duration: 0.2 } }}
                  transition={spring.heavy}
                  drag="y"
                  dragSnapToOrigin
                  dragElastic={{ top: 0.9, bottom: 0.15 }}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  onDragEnd={(_e, info) => {
                    if (info.offset.y < -110 || info.velocity.y < -650) fallIn(id, info.velocity.y)
                  }}
                  whileHover={{ y: -2 }}
                  whileDrag={{ scale: 1.01 }}
                  onClick={() => choose(id)}
                  className="group relative"
                  style={{ borderRadius: 10, y: lift(id) }}
                  data-testid="well-card"
                  data-well-id={id}
                >
                  <div data-fall>
                  <MagicCard
                    className="rounded-[10px] shadow-[var(--shadow)]"
                    gradientSize={260}
                    gradientFrom="var(--hairline-strong)"
                    gradientTo="var(--hairline)"
                    gradientColor="rgb(255 250 240 / 0.04)"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden rounded-t-[10px] border-b border-hairline">
                      {(isActive || focus === i) && (
                        <span className={`absolute top-2 left-2 z-10 h-1.5 w-1.5 rounded-full ${isActive ? 'bg-accent' : 'bg-text/50'}`} />
                      )}
                      <Thumb id={id} />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <Favicon src={tab.favicon} url={tab.url} size={15} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] text-text">{tab.title || prettyUrl(tab.url)}</div>
                        <div className="truncate font-mono text-[10.5px] text-faint">{prettyUrl(tab.url)}</div>
                      </div>
                      <button
                        type="button"
                        title="Close tab (or flick the card up)"
                        onClick={(e) => {
                          e.stopPropagation()
                          fallIn(id)
                        }}
                        className="rounded-[5px] p-1 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-hover hover:text-text"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </MagicCard>
                  </div>
                </motion.div>
              )
            })}
            <motion.button
              key="__new"
              type="button"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === 'exit' ? 0 : 1 }}
              transition={{ ...spring.settle, delay: Math.min(ids.length * 0.035, 0.35) }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                finish()
                openCommand('new')
              }}
              className="flex aspect-[16/10] flex-col items-center justify-center gap-2 self-start rounded-[10px] border border-dashed border-hairline-strong text-faint hover:bg-hover hover:text-dim"
            >
              <Plus size={18} strokeWidth={1.5} />
              <span className="label">New tab</span>
            </motion.button>
          </AnimatePresence>
        </div>
        {ids.length === 0 && filter && <div className="mt-10 text-center text-faint">No tabs match “{filter}”</div>}
      </div>

      {phase === 'enter' && activeId && frameRect.current && <FrameGhost id={activeId} rect={frameRect.current} />}
      {phase === 'exit' && target && frameRect.current && <FrameGhost id={target} rect={frameRect.current} onDone={finish} />}
    </motion.div>
  )
}

export function GravityWell() {
  const open = useUI((s) => s.overview)
  return <AnimatePresence>{open && <Well key="well" />}</AnimatePresence>
}
