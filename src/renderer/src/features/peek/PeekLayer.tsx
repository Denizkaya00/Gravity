import { AnimatePresence, motion } from 'motion/react'
import { Columns2, Maximize2, X } from 'lucide-react'
import { prettyUrl } from '@shared/url'
import { useBrowser } from '@/state/browser'
import { useRuntime } from '@/state/runtime'
import { useUI } from '@/state/ui'
import { closePeek, expandPeek, peekToSplit } from '@/browser/actions'
import { Slot } from '@/browser/Slot'
import { Favicon } from '@/components/ui/Favicon'
import { Kbd } from '@/components/ui/Kbd'
import { spring } from '@/lib/springs'

function PeekCard({ tabId, origin }: { tabId: string; origin: { x: number; y: number } }) {
  const tab = useBrowser((s) => s.tabs[tabId])
  const loading = useRuntime((s) => s.tabs[tabId]?.loading)
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[55]"
        style={{ background: 'var(--scrim)', backdropFilter: 'blur(4px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.35 } }}
        onMouseDown={closePeek}
      />
      <div className="pointer-events-none fixed inset-0 z-[56] flex items-center justify-center">
        <div className="flex flex-col" style={{ width: 'min(1100px, 84vw)', height: '86vh' }}>
          <motion.div
            className="glass-strong pointer-events-auto mb-2 flex h-9 items-center gap-2.5 self-center rounded-[9px] pr-1 pl-3"
            initial={{ opacity: 0, scale: 0.4, x: origin.x - cx, y: origin.y - cy }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, y: 60, transition: { duration: 0.25 } }}
            transition={spring.heavy}
            data-testid="peek-bar"
          >
            <Favicon src={tab?.favicon} url={tab?.url} loading={loading} size={15} />
            <span className="max-w-[360px] truncate font-mono text-[11px] text-dim">{tab ? prettyUrl(tab.url) : ''}</span>
            <div className="ml-2 flex items-center gap-1">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={expandPeek}
                className="flex items-center gap-1.5 rounded-[6px] border border-hairline px-2.5 py-1 text-[12px] text-text hover:bg-hover"
                data-testid="peek-expand"
              >
                <Maximize2 size={12} /> Open as Tab
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={peekToSplit}
                className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12px] text-dim hover:bg-hover hover:text-text"
              >
                <Columns2 size={12} /> Split
              </motion.button>
              <button type="button" title="Close (Esc)" onClick={closePeek} className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-dim hover:bg-hover hover:text-text">
                <Kbd>esc</Kbd>
                <X size={13} />
              </button>
            </div>
          </motion.div>
          <Slot name="peek" className="min-h-0 flex-1" />
        </div>
      </div>
    </>
  )
}

/** Peek: a link opened in a floating card above the current page (⇧-click). */
export function PeekLayer() {
  const peek = useUI((s) => s.peek)
  return <AnimatePresence>{peek && <PeekCard key={peek.tabId} tabId={peek.tabId} origin={peek.origin} />}</AnimatePresence>
}
