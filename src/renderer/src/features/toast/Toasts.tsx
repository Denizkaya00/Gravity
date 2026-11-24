import { AnimatePresence, motion } from 'motion/react'
import { Archive, Check, Copy, Download, Shield, TriangleAlert } from 'lucide-react'
import { useUI, type Toast } from '@/state/ui'
import { spring } from '@/lib/springs'

const ICONS: Record<NonNullable<Toast['icon']>, typeof Check> = {
  copy: Copy,
  check: Check,
  archive: Archive,
  shield: Shield,
  download: Download,
  warn: TriangleAlert
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[85] flex flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.icon ?? 'check']
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10, transition: { duration: 0.18 } }}
              transition={spring.settle}
              className="glass-strong flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-[12px] text-text"
              data-testid="toast"
            >
              <Icon size={13} className="text-faint" />
              {t.text}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
