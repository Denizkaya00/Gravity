import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type Ref } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { Plus, X } from 'lucide-react'
import type { Favorite, OpenMode } from '@shared/types'
import { favoriteLabel, MAX_FAVORITES } from '@shared/favorites'
import { prettyUrl } from '@shared/url'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { openFavorite } from '@/browser/favorites'
import { Favicon } from '@/components/ui/Favicon'
import { fallEase, spring, tilt } from '@/lib/springs'
import { cn } from '@/lib/utils'

const COLS = 4
const ADD = '__add'
/** How far above the row a pin has to be let go of to be thrown away. */
const THROW_MARGIN = 48

const modeOf = (e: { metaKey: boolean; shiftKey: boolean; altKey: boolean }): OpenMode =>
  e.metaKey ? 'background' : e.shiftKey ? 'peek' : e.altKey ? 'split' : 'foreground'

const addFavorite = () => useUI.getState().openCommand('pin')

/** Digits open favorites on Home, unless something else has the keyboard. */
function useDigitKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat || !/^[1-9]$/.test(e.key)) return
      const target = e.target as Element | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], webview')) return
      const ui = useUI.getState()
      if (ui.command.open || ui.overview || ui.settingsOpen || ui.cheatsheet || ui.peek || ui.downloadsOpen) return
      const S = useSettings.getState()
      const f = S.onboarded ? S.favorites[Number(e.key) - 1] : undefined
      if (!f) return
      e.preventDefault()
      openFavorite(f)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * Favorites on Home: a quiet index of the pages you keep, under the search
 * field. Each has a small paper label for its icon (so dark icons stay visible
 * over the night sky), a short name, and the digit that opens it.
 *
 * Keyboard: 1–9 open a favorite. In the row, arrows move, ↩ opens (⌘ in the
 * background, ⇧ as a peek, ⌥ in a split), ⌥ + arrows move a favorite and ⌫
 * removes it. With the pointer, drag to reorder, or throw one up and away.
 */
export function HomePins({ onLeaveTop }: { onLeaveTop?: () => void }) {
  const favorites = useSettings((s) => s.favorites)
  const loaded = useSettings((s) => s.loaded)
  const remove = useSettings((s) => s.removeFavorite)
  const move = useSettings((s) => s.moveFavorite)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const nodes = useRef(new Map<string, HTMLElement>())
  const row = useRef<HTMLDivElement>(null)
  const wantFocus = useRef(false)
  /** Where each position in the row is, measured when a drag starts. */
  const slots = useRef<DOMRect[]>([])
  const dragged = useRef(false)
  /** Pins thrown away, and where they were let go: they leave from there. */
  const thrown = useRef<Thrown>(new Map())

  useDigitKeys()

  const canAdd = favorites.length < MAX_FAVORITES
  const ids = [...favorites.map((f) => f.id), ...(canAdd ? [ADD] : [])]
  const current = focusId && ids.includes(focusId) ? focusId : ids[0]

  useLayoutEffect(() => {
    if (!wantFocus.current) return
    wantFocus.current = false
    nodes.current.get(current)?.focus()
  })

  const focusAt = (i: number) => {
    const id = ids[Math.max(0, Math.min(ids.length - 1, i))]
    setFocusId(id)
    nodes.current.get(id)?.focus()
  }

  const removePin = (id: string, viaKeyboard = false) => {
    const i = ids.indexOf(id)
    if (viaKeyboard) {
      setFocusId(ids[i + 1] ?? ids[i - 1] ?? null)
      wantFocus.current = true
    }
    remove(id)
  }

  const onKeyDown = (e: ReactKeyboardEvent, id: string) => {
    const i = ids.indexOf(id)
    const f = favorites.find((x) => x.id === id)
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key]
    if (step !== undefined) {
      e.preventDefault()
      if (e.altKey && f) {
        move(id, i + step)
        setFocusId(id)
        wantFocus.current = true
      } else if (e.key === 'ArrowUp' && i < COLS) onLeaveTop?.()
      else focusAt(i + step)
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      focusAt(e.key === 'Home' ? 0 : ids.length - 1)
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && f) {
      e.preventDefault()
      removePin(id, true)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (f) openFavorite(f, modeOf(e))
      else addFavorite()
    }
  }

  const onDragStart = (id: string) => {
    dragged.current = true
    setDragId(id)
    slots.current = favorites.map((f) => nodes.current.get(f.id)?.getBoundingClientRect() ?? new DOMRect())
  }

  const onDrag = (id: string, info: PanInfo) => {
    const top = row.current?.getBoundingClientRect().top ?? 0
    setArmed(info.point.y < top - THROW_MARGIN)
    // The slot under the pointer, by fixed positions so neighbours can't swap back and forth.
    const { x, y } = info.point
    const k = slots.current.findIndex((r) => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2)
    if (k !== -1 && favorites[k]?.id !== id) move(id, k)
  }

  const onDragEnd = (id: string, info: PanInfo) => {
    setDragId(null)
    setArmed(false)
    const top = row.current?.getBoundingClientRect().top ?? 0
    if (info.point.y < top - THROW_MARGIN) {
      thrown.current.set(id, { x: info.offset.x, y: info.offset.y })
      remove(id)
    }
  }

  if (!loaded) return null

  return (
    <div
      ref={row}
      role="list"
      aria-label="Favorites"
      className="relative flex flex-wrap justify-center gap-x-1 gap-y-0.5"
      data-testid="home-pins"
    >
      {/* A soft pool of shade, not a box: unseen in space, it keeps names readable over a bright photo or print. */}
      <div aria-hidden className="pointer-events-none absolute -inset-x-14 -inset-y-6 -z-10 rounded-[50%] bg-black/30 blur-2xl" />
      <AnimatePresence mode="popLayout" initial={false} custom={thrown.current}>
        {favorites.map((f, i) => (
          <Pin
            key={f.id}
            f={f}
            index={i}
            focusable={current === f.id}
            dragging={dragId === f.id}
            armed={dragId === f.id && armed}
            nodeRef={(el) => (el ? nodes.current.set(f.id, el) : nodes.current.delete(f.id))}
            onFocus={() => setFocusId(f.id)}
            onKeyDown={(e) => onKeyDown(e, f.id)}
            onOpen={(e) => {
              if (dragged.current) return
              openFavorite(f, modeOf(e), { x: e.clientX, y: e.clientY })
            }}
            onRemove={() => removePin(f.id)}
            onPointerDown={() => (dragged.current = false)}
            onDragStart={() => onDragStart(f.id)}
            onDrag={(info) => onDrag(f.id, info)}
            onDragEnd={(info) => onDragEnd(f.id, info)}
          />
        ))}
        {canAdd && (
          <motion.div
            key={ADD}
            layout
            role="listitem"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={spring.settle}
            className={favorites.length ? CELL : 'w-auto'}
          >
            <button
              type="button"
              ref={(el) => {
                if (el) nodes.current.set(ADD, el)
                else nodes.current.delete(ADD)
              }}
              tabIndex={current === ADD ? 0 : -1}
              onFocus={() => setFocusId(ADD)}
              onKeyDown={(e) => onKeyDown(e, ADD)}
              onClick={addFavorite}
              title="Add a favorite"
              className="group flex h-8 w-full items-center gap-1.5 rounded-[7px] px-1.5 text-left text-faint outline-none transition-colors hover:bg-white/[0.05] hover:text-dim focus-visible:bg-white/[0.07] focus-visible:text-dim"
              data-testid="home-pin-add"
            >
              {favorites.length > 0 && <span className={DIGIT} />}
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-dashed border-white/25 transition-colors group-hover:border-white/40">
                <Plus size={11} strokeWidth={1.75} />
              </span>
              <span className={cn(LABEL, 'ml-0.5 text-[12px]')}>{favorites.length ? 'Add' : 'Add a favorite'}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A quarter of the row, less the gaps. */
const CELL = 'w-[calc((100%-0.75rem)/4)]'
const SHADOW = '[text-shadow:0_1px_10px_rgb(0_0_0/0.75)]'
const LABEL = `min-w-0 truncate ${SHADOW}`
/** The digit that opens a favorite on Home, in front of it like an index. */
const DIGIT = `w-2 shrink-0 text-center font-mono text-[10px] text-[rgb(232_228_220/0.46)] tabular-nums ${SHADOW}`

type Thrown = Map<string, { x: number; y: number }>

/** Taken off the row, a pin falls away. Thrown, it carries on up from where it was let go. */
function leave(id: string, from?: { x: number; y: number }) {
  return from
    ? { opacity: 0, x: from.x, y: from.y - 90, scale: 0.6, transition: { duration: 0.32, ease: fallEase } }
    : { opacity: 0, y: 44, rotate: tilt(id, 6), transition: { duration: 0.36, ease: fallEase } }
}

function Pin({
  ref,
  f,
  index,
  focusable,
  dragging,
  armed,
  nodeRef,
  onFocus,
  onKeyDown,
  onOpen,
  onRemove,
  onPointerDown,
  onDragStart,
  onDrag,
  onDragEnd
}: {
  /** AnimatePresence measures a leaving pin through this, so the others can close up at once. */
  ref?: Ref<HTMLDivElement>
  f: Favorite
  index: number
  focusable: boolean
  dragging: boolean
  armed: boolean
  nodeRef: (el: HTMLElement | null) => void
  onFocus: () => void
  onKeyDown: (e: ReactKeyboardEvent) => void
  onOpen: (e: ReactMouseEvent) => void
  onRemove: () => void
  onPointerDown: () => void
  onDragStart: () => void
  onDrag: (info: PanInfo) => void
  onDragEnd: (info: PanInfo) => void
}) {
  const label = favoriteLabel(f)
  return (
    <motion.div
      ref={ref}
      layout
      role="listitem"
      initial={{ opacity: 0, y: -14 }}
      // While dragged, the pointer owns its position.
      animate={dragging ? { opacity: armed ? 0.45 : 1 } : { opacity: 1, y: 0 }}
      variants={{ exit: (thrown?: Thrown) => leave(f.id, thrown?.get(f.id)) }}
      exit="exit"
      transition={spring.settle}
      drag
      dragSnapToOrigin
      dragMomentum={false}
      whileDrag={{ scale: 1.04 }}
      onPointerDown={onPointerDown}
      onDragStart={onDragStart}
      onDrag={(_e, info) => onDrag(info)}
      onDragEnd={(_e, info) => onDragEnd(info)}
      className={cn('group relative', CELL, dragging && 'z-10')}
      data-testid="home-pin"
      data-pin-id={f.id}
    >
      <button
        type="button"
        ref={nodeRef}
        tabIndex={focusable ? 0 : -1}
        title={`${f.title || label}\n${prettyUrl(f.url)}`}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onClick={onOpen}
        className={cn(
          'peer flex h-8 w-full items-center gap-1.5 rounded-[7px] px-1.5 text-left text-[rgb(232_228_220/0.74)] outline-none transition-colors',
          'hover:bg-white/[0.06] hover:text-text focus-visible:bg-white/[0.08] focus-visible:text-text',
          dragging && 'bg-white/[0.08] shadow-[var(--shadow)]'
        )}
        data-testid="home-pin-open"
      >
        <span className={DIGIT}>{index < 9 ? index + 1 : ''}</span>
        {/* Paper, so a black icon reads as well as a bright one. */}
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[#ebe7df] shadow-[0_1px_2px_rgb(0_0_0/0.35)] [--hairline-strong:transparent] [--text-dim:rgb(28_27_25/0.72)] [--text-faint:rgb(28_27_25/0.5)]">
          <Favicon src={f.favicon} url={f.url} size={12} />
        </span>
        <span className={cn(LABEL, 'ml-0.5 flex-1 text-[12px] group-hover:pr-5')}>{label}</span>
      </button>
      <span className="pointer-events-none absolute top-1/2 left-0 h-3 w-[2px] -translate-y-1/2 rounded-full bg-accent opacity-0 transition-opacity peer-focus-visible:opacity-100" />
      <button
        type="button"
        tabIndex={-1}
        title="Remove from Favorites"
        aria-label={`Remove ${label} from Favorites`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        className="absolute top-1/2 right-1 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-[5px] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/[0.08] hover:text-text"
        data-testid="home-pin-remove"
      >
        <X size={11} strokeWidth={2} />
      </button>
    </motion.div>
  )
}
