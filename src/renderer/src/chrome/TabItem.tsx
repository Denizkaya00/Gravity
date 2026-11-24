import { memo, useRef } from 'react'
import { motion, Reorder, useDragControls } from 'motion/react'
import { Pin, Volume2, VolumeX, X } from 'lucide-react'
import { useBrowser } from '@/state/browser'
import { useRuntime } from '@/state/runtime'
import { useSlots, useUI } from '@/state/ui'
import { closeTab, splitWith } from '@/browser/actions'
import { page } from '@/browser/registry'
import { Favicon } from '@/components/ui/Favicon'
import { spring, fallEase } from '@/lib/springs'
import { cn } from '@/lib/utils'
import { displayHost } from '@shared/url'

/** Updates the split drop zone while a tab is dragged over the page. */
function trackSplitDrop(x: number, y: number) {
  const rects = useSlots.getState().rects
  const r = rects.main ?? rects['split-a']
  const ui = useUI.getState()
  let zone: 'left' | 'right' | null = null
  if (r && x > r.left + 24 && x < r.left + r.width && y > r.top && y < r.top + r.height) {
    zone = x < r.left + r.width / 2 ? 'left' : 'right'
  }
  if (ui.splitDrop !== zone) ui.set({ splitDrop: zone })
}

export const TabItem = memo(function TabItem({ id, active }: { id: string; active: boolean }) {
  const tab = useBrowser((s) => s.tabs[id])
  const activateTab = useBrowser((s) => s.activateTab)
  const loading = useRuntime((s) => s.tabs[id]?.loading ?? false)
  const audible = useRuntime((s) => s.tabs[id]?.audible ?? false)
  const muted = useRuntime((s) => s.tabs[id]?.muted ?? false)
  const asleep = useRuntime((s) => !s.mounted.includes(id))
  const controls = useDragControls()
  const dragged = useRef(false)

  if (!tab) return null
  const title = tab.title && tab.title !== tab.url ? tab.title : displayHost(tab.url)

  return (
    <Reorder.Item
      value={id}
      as="div"
      layout="position"
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10, transition: { duration: 0.2, ease: fallEase } }}
      transition={spring.settle}
      whileDrag={{ scale: 1.015, zIndex: 50, boxShadow: 'var(--shadow)' }}
      onDragStart={() => {
        dragged.current = true
        useUI.getState().set({ dragging: true })
      }}
      onDrag={(_e, info) => trackSplitDrop(info.point.x, info.point.y)}
      onDragEnd={() => {
        const zone = useUI.getState().splitDrop
        useUI.getState().set({ dragging: false, splitDrop: null })
        if (zone) splitWith(id, zone)
        setTimeout(() => (dragged.current = false), 0)
      }}
      className="relative"
      data-tab-id={id}
    >
      <div
        role="tab"
        aria-selected={active}
        onPointerDown={(e) => {
          if (e.button === 0) controls.start(e)
        }}
        onClick={() => {
          if (!dragged.current) activateTab(id)
        }}
        onAuxClick={(e) => {
          if (e.button === 1) closeTab(id)
        }}
        className={cn(
          'group relative flex h-8 items-center gap-2.5 rounded-[7px] pr-1.5 pl-2.5 transition-colors',
          !active && 'hover:bg-hover'
        )}
      >
        {active && (
          <motion.div
            layoutId="active-tab"
            transition={spring.snappy}
            className="absolute inset-0 rounded-[7px] bg-active shadow-[inset_0_0_0_1px_var(--hairline)]"
          >
            <span className="absolute top-1/2 left-0 h-3 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
          </motion.div>
        )}
        <Favicon src={tab.favicon} url={tab.url} loading={loading} dim={asleep && !active} className="relative" />
        <span
          className={cn(
            'relative min-w-0 flex-1 truncate text-[13px] leading-none',
            active ? 'text-text' : asleep ? 'text-faint' : 'text-dim'
          )}
        >
          {title}
        </span>
        {(audible || muted) && (
          <button
            type="button"
            title={muted ? 'Unmute tab' : 'Mute tab'}
            onClick={(e) => {
              e.stopPropagation()
              page.setMuted(id, !muted)
            }}
            className="relative rounded p-0.5 text-dim hover:text-text"
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        )}
        {tab.pinned ? (
          <Pin size={11} className="relative text-faint group-hover:hidden" />
        ) : null}
        <motion.button
          type="button"
          title="Close tab"
          whileTap={{ scale: 0.8 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            closeTab(id)
          }}
          className="relative hidden h-[20px] w-[20px] items-center justify-center rounded-[5px] text-dim group-hover:flex hover:bg-hover hover:text-text"
        >
          <X size={13} strokeWidth={2.2} />
        </motion.button>
      </div>
    </Reorder.Item>
  )
})
