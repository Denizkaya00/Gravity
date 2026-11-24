import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react'
import { selectActiveTabId, useBrowser } from '@/state/browser'
import { useRuntime } from '@/state/runtime'
import { page } from '@/browser/registry'
import { IconButton } from '@/components/ui/IconButton'

export function NavButtons() {
  const id = useBrowser(selectActiveTabId)
  const canBack = useRuntime((s) => (id ? (s.tabs[id]?.canGoBack ?? false) : false))
  const canForward = useRuntime((s) => (id ? (s.tabs[id]?.canGoForward ?? false) : false))
  const loading = useRuntime((s) => (id ? (s.tabs[id]?.loading ?? false) : false))

  return (
    <div className="no-drag flex items-center gap-0.5">
      <IconButton label="Back (⌘[)" disabled={!canBack} onClick={() => id && page.back(id)}>
        <ArrowLeft size={15} />
      </IconButton>
      <IconButton label="Forward (⌘])" disabled={!canForward} onClick={() => id && page.forward(id)}>
        <ArrowRight size={15} />
      </IconButton>
      <IconButton
        label={loading ? 'Stop (⌘.)' : 'Reload (⌘R)'}
        disabled={!id}
        onClick={() => id && (loading ? page.stop(id) : page.reload(id))}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={loading ? 'stop' : 'reload'}
            initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex"
          >
            {loading ? <X size={15} /> : <RotateCw size={14} />}
          </motion.span>
        </AnimatePresence>
      </IconButton>
    </div>
  )
}
