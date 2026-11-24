import { useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { selectActiveTabId, selectSplit, useBrowser } from '@/state/browser'
import { useRuntime } from '@/state/runtime'
import { useSettings } from '@/state/settings'
import { useSlots, useUI, type Rect, type SlotName } from '@/state/ui'
import { fallEase, spring } from '@/lib/springs'
import { TabView, useFullSlot } from './TabView'

const Z: Record<SlotName, number> = { main: 10, 'split-a': 10, 'split-b': 10, peek: 60, full: 95 }

/** Which slot each visible tab occupies right now. Tabs not listed are hidden. */
export function useAssignments(): Record<string, SlotName> {
  const activeId = useBrowser(selectActiveTabId)
  const split = useBrowser(selectSplit)
  const peek = useUI((s) => s.peek)
  const full = useUI((s) => s.fullscreenTab)
  return useMemo(() => {
    const m: Record<string, SlotName> = {}
    if (split) {
      m[split.a] = 'split-a'
      m[split.b] = 'split-b'
    } else if (activeId) {
      m[activeId] = 'main'
    }
    if (peek) m[peek.tabId] = 'peek'
    if (full && m[full]) m[full] = 'full'
    return m
  }, [activeId, split, peek, full])
}

function useMountAndSleep(assigned: Record<string, SlotName>) {
  const mount = useRuntime((s) => s.mount)
  const ids = Object.keys(assigned)
  const key = ids.join('|')
  useEffect(() => {
    for (const id of ids) mount(id, ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mount])

  // Put tabs to sleep after a while in the background to free memory.
  useEffect(() => {
    const timer = setInterval(() => {
      const minutes = useSettings.getState().sleepAfterMinutes
      const { mounted, tabs: rt, unmount } = useRuntime.getState()
      const { tabs } = useBrowser.getState()
      const now = Date.now()
      for (const id of mounted) {
        if (assignedRef.current[id] || rt[id]?.audible) continue
        const last = tabs[id]?.lastActiveAt ?? 0
        if (now - last > minutes * 60_000) unmount(id)
      }
    }, 60_000)
    return () => clearInterval(timer)
  }, [])
  const assignedRef = useRef(assigned)
  assignedRef.current = assigned
}

function TabSurface({ id, slot }: { id: string; slot: SlotName | undefined }) {
  const rect = useSlots((s) => (slot ? s.rects[slot] : undefined))
  const mainRect = useSlots((s) => s.rects.main ?? s.rects['split-a'])
  const dragging = useUI((s) => s.dragging)
  const peekOrigin = useUI((s) => (s.peek?.tabId === id ? s.peek.origin : null))
  const lastRect = useRef<Rect | undefined>(rect)
  if (rect) lastRect.current = rect
  const r = rect ?? lastRect.current ?? mainRect ?? { left: 0, top: 0, width: 800, height: 600 }
  const visible = !!slot && !!rect
  const isPeek = slot === 'peek'
  const isFull = slot === 'full'

  // A tab without a slot is hidden but still running; its video waits until it's back.
  const webContentsId = useRuntime((s) => s.tabs[id]?.webContentsId)
  const inView = !!slot
  useEffect(() => {
    if (webContentsId) window.gravity.setTabInView(webContentsId, inView)
  }, [webContentsId, inView])

  // Peek pages spring out of the click point.
  const initial = isPeek && peekOrigin
    ? {
        opacity: 0,
        scale: 0.4,
        x: peekOrigin.x - (r.left + r.width / 2),
        y: peekOrigin.y - (r.top + r.height / 2)
      }
    : { opacity: 0 }

  return (
    <motion.div
      data-tab-surface={id}
      layout
      layoutDependency={slot ?? 'hidden'}
      transition={{ layout: spring.heavy, default: isPeek ? spring.heavy : { duration: 0.16 } }}
      initial={initial}
      animate={visible ? { opacity: 1, scale: 1, x: 0, y: 0, visibility: 'visible' } : { opacity: 0, transitionEnd: { visibility: 'hidden' } }}
      exit={
        isPeek
          ? { y: window.innerHeight * 0.6, opacity: 0, transition: { duration: 0.42, ease: fallEase } }
          : visible
            ? { y: 36, scale: 0.985, opacity: 0, transition: { duration: 0.24, ease: fallEase } }
            : { opacity: 0, transition: { duration: 0 } }
      }
      style={{
        position: 'fixed',
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        zIndex: slot ? Z[slot] : 1,
        borderRadius: isFull ? 0 : 10,
        overflow: 'hidden',
        pointerEvents: visible && !dragging ? 'auto' : 'none',
        boxShadow: isPeek ? '0 0 0 1px var(--hairline-strong), 0 30px 80px -20px rgb(0 0 0 / 0.6)' : undefined
      }}
    >
      <TabView id={id} />
    </motion.div>
  )
}

/**
 * All live pages are rendered here, once, and never re-parented (moving a
 * <webview> in the DOM would reload it). Each page is positioned over the
 * "slot" it currently belongs to, and morphs with a spring when that changes:
 * peek → tab, tab → split, and so on.
 */
export function WebviewLayer() {
  useFullSlot()
  const assigned = useAssignments()
  const mounted = useRuntime((s) => s.mounted)
  const tabs = useBrowser((s) => s.tabs)
  useMountAndSleep(assigned)
  // A fixed order, not `mounted`'s most-recent-first: reordering would make React move <webview>s in the DOM,
  // and a moved <webview> starts over as a new page, losing its history, form text and undo.
  const live = mounted.filter((id) => tabs[id]).sort()
  return (
    <AnimatePresence>
      {live.map((id) => (
        <TabSurface key={id} id={id} slot={assigned[id]} />
      ))}
    </AnimatePresence>
  )
}
