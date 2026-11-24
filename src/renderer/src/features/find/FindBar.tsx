import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { selectActiveTabId, useBrowser } from '@/state/browser'
import { useRuntime } from '@/state/runtime'
import { useSlots, useUI } from '@/state/ui'
import { page } from '@/browser/registry'
import { spring } from '@/lib/springs'

/** ⌘F: a floating pill that drops in from the top-right of the page. */
export function FindBar() {
  const open = useUI((s) => s.findOpen)
  const set = useUI((s) => s.set)
  const id = useBrowser(selectActiveTabId)
  const result = useRuntime((s) => (id ? s.tabs[id]?.find : undefined))
  const rect = useSlots((s) => s.rects.main ?? s.rects['split-b'])
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => input.current?.select(), 30)
  }, [open])

  useEffect(() => {
    if (!open && id) page.stopFind(id)
  }, [open, id])

  // Re-run the search when the page finishes loading, so typing early still works.
  const loadedTick = useRuntime((s) => (id ? (s.tabs[id]?.loadedTick ?? 0) : 0))
  useEffect(() => {
    if (!open || !id) return
    if (text) page.find(id, text)
    else page.stopFind(id)
  }, [text, open, id, loadedTick])

  const close = () => {
    set({ findOpen: false })
    if (id) page.focus(id)
  }

  return (
    <AnimatePresence>
      {open && rect && (
        <motion.div
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={spring.settle}
          className="glass-strong fixed z-[22] flex items-center gap-1 rounded-[9px] py-1 pr-1 pl-3"
          style={{ top: rect.top + 10, left: rect.left + rect.width - 330, width: 320 }}
          data-testid="find-bar"
        >
          <input
            ref={input}
            value={text}
            placeholder="Find on page"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
              if (e.key === 'Enter' && id && text) page.find(id, text, { forward: !e.shiftKey, findNext: true })
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
          />
          {text && (
            <motion.span key={result?.matches ?? 0} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-1 font-mono text-[10.5px] tabular-nums text-faint">
              {result ? `${result.matches ? result.active : 0}/${result.matches}` : '…'}
            </motion.span>
          )}
          <button type="button" title="Previous (⇧⌘G)" onClick={() => id && page.find(id, text, { forward: false, findNext: true })} className="rounded-md p-1 text-dim hover:bg-hover hover:text-text">
            <ChevronUp size={14} />
          </button>
          <button type="button" title="Next (⌘G)" onClick={() => id && page.find(id, text, { forward: true, findNext: true })} className="rounded-md p-1 text-dim hover:bg-hover hover:text-text">
            <ChevronDown size={14} />
          </button>
          <button type="button" title="Close (Esc)" onClick={close} className="rounded-md p-1 text-dim hover:bg-hover hover:text-text">
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function findAgain(forward: boolean) {
  const ui = useUI.getState()
  const s = useBrowser.getState()
  const id = selectActiveTabId(s)
  if (!ui.findOpen) {
    ui.set({ findOpen: true })
    return
  }
  const input = document.querySelector<HTMLInputElement>('[data-testid="find-bar"] input')
  if (id && input?.value) page.find(id, input.value, { forward, findNext: true })
}
