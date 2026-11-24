import { useRef } from 'react'
import { AnimatePresence, animate, motion } from 'motion/react'
import { X } from 'lucide-react'
import { selectActiveTabId, selectSplit, useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { useBlackHoleBackdrop } from '@/lib/theme'
import { useUI } from '@/state/ui'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'
import { HomeCanvas } from '@/features/newtab/HomeCanvas'
import { CompactBar } from '@/chrome/CompactBar'
import { Slot, kickLayout } from './Slot'

function SplitDivider({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const spaceId = useBrowser((s) => s.activeSpaceId)
  const setSplit = useBrowser((s) => s.setSplit)
  return (
    <div
      className="group relative z-[20] flex w-2 shrink-0 cursor-col-resize items-center justify-center"
      onPointerDown={(e) => {
        e.preventDefault()
        const el = containerRef.current
        const split = useBrowser.getState().splits[spaceId]
        if (!el || !split) return
        const rect = el.getBoundingClientRect()
        useUI.getState().set({ dragging: true })
        const move = (ev: PointerEvent) => {
          const ratio = Math.max(0.2, Math.min(0.8, (ev.clientX - rect.left) / rect.width))
          const cur = useBrowser.getState().splits[spaceId]
          if (cur) setSplit(spaceId, { ...cur, ratio })
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          useUI.getState().set({ dragging: false })
          const cur = useBrowser.getState().splits[spaceId]
          if (!cur) return
          // Magnetic snap to the thirds and the middle.
          const target = [1 / 3, 0.5, 2 / 3].find((t) => Math.abs(t - cur.ratio) < 0.045)
          if (target !== undefined) {
            animate(cur.ratio, target, {
              ...spring.snappy,
              onUpdate: (r) => {
                const now = useBrowser.getState().splits[spaceId]
                if (now) setSplit(spaceId, { ...now, ratio: r })
              }
            })
          }
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
    >
      <div className="h-8 w-[3px] rounded-full bg-hairline-strong transition-all group-hover:h-14 group-hover:bg-text/40" />
    </div>
  )
}

function SplitView() {
  const split = useBrowser(selectSplit)!
  const activeId = useBrowser(selectActiveTabId)
  const tabs = useBrowser((s) => s.tabs)
  const setSplit = useBrowser((s) => s.setSplit)
  const spaceId = useBrowser((s) => s.activeSpaceId)
  const ref = useRef<HTMLDivElement>(null)

  const side = (name: 'split-a' | 'split-b', id: string, flex: number) => (
    <div className="relative min-w-0" style={{ flex }}>
      <Slot name={name} className="absolute inset-0" />
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-[16] rounded-[10px] transition-shadow duration-300',
          activeId === id ? 'shadow-[0_0_0_1px_var(--hairline-strong)]' : 'shadow-[0_0_0_1px_var(--hairline)]'
        )}
      />
      <div className="pointer-events-none absolute top-0 left-1/2 z-[17] -translate-x-1/2">
        <div className="glass pointer-events-auto mt-1.5 flex max-w-[260px] items-center gap-1.5 rounded-[6px] py-0.5 pr-0.5 pl-2 text-[11px] text-dim opacity-0 transition-opacity hover:opacity-100">
          <span className="truncate">{tabs[id]?.title}</span>
          <button
            type="button"
            title="Close split"
            onClick={() => setSplit(spaceId, null)}
            className="rounded-full p-0.5 hover:bg-hover hover:text-text"
          >
            <X size={11} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <motion.div ref={ref} className="absolute inset-0 flex" initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} onAnimationComplete={kickLayout}>
      {side('split-a', split.a, split.ratio)}
      <SplitDivider containerRef={ref} />
      {side('split-b', split.b, 1 - split.ratio)}
    </motion.div>
  )
}

/** Glowing drop zones shown while a tab is dragged out of the sidebar. */
function SplitDropZones() {
  const dragging = useUI((s) => s.dragging)
  const zone = useUI((s) => s.splitDrop)
  const activeId = useBrowser(selectActiveTabId)
  if (!activeId) return null
  return (
    <AnimatePresence>
      {dragging && zone && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-[30] flex gap-2 p-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {(['left', 'right'] as const).map((s) => (
            <motion.div
              key={s}
              animate={{ opacity: zone === s ? 1 : 0.4 }}
              transition={spring.snappy}
              className="label flex flex-1 items-center justify-center rounded-[8px] border"
              style={{
                borderColor: zone === s ? 'var(--hairline-strong)' : 'var(--hairline)',
                background: zone === s ? 'var(--scrim)' : 'rgb(0 0 0 / 0.12)',
                backdropFilter: 'blur(6px)'
              }}
            >
              {zone === s ? `Split ${s}` : ''}
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** The rounded "card" the page lives in, glowing in the site's colour. */
export function PageFrame() {
  const activeId = useBrowser(selectActiveTabId)
  const split = useBrowser(selectSplit)
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const focus = useUI((s) => s.focusMode)
  const backdrop = useBlackHoleBackdrop()

  return (
    <motion.main
      className="drag relative h-full min-w-0 flex-1"
      initial={false}
      animate={{
        paddingTop: focus ? 26 : collapsed ? 40 : 8,
        paddingBottom: focus ? 26 : 8,
        paddingRight: focus ? 26 : 8,
        paddingLeft: focus ? 26 : collapsed ? 8 : 0
      }}
      transition={spring.gentle}
      onUpdate={kickLayout}
    >
      <AnimatePresence>{collapsed && !focus && <CompactBar key="compact" />}</AnimatePresence>
      <motion.div
        className="no-drag relative h-full w-full overflow-hidden rounded-[10px]"
        // On Home with the black hole behind everything, the frame steps aside.
        style={
          !activeId && backdrop
            ? { background: 'transparent' }
            : { background: 'var(--frame-bg)', boxShadow: '0 0 0 1px var(--hairline), var(--shadow)' }
        }
        data-testid="page-frame"
      >
        {activeId ? split ? <SplitView /> : <Slot name="main" className="absolute inset-0" /> : <HomeCanvas />}
        <SplitDropZones />
      </motion.div>
    </motion.main>
  )
}
