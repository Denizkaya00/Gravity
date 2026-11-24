import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useUI } from '@/state/ui'
import { Kbd } from '@/components/ui/Kbd'
import { spring } from '@/lib/springs'

export const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Tabs',
    items: [
      ['⌘ T', 'New tab / Command Bar'],
      ['⌘ L', 'Edit address'],
      ['⌘ W', 'Close tab'],
      ['⇧ ⌘ T', 'Reopen closed tab'],
      ['⌃ Tab', 'Next tab'],
      ['⌘ 1…9', 'Jump to tab'],
      ['⌘ D', 'Pin tab']
    ]
  },
  {
    group: 'Gravity',
    items: [
      ['⇧ ⌘ \\', 'Gravity Well (all tabs)'],
      ['⇧ click', 'Peek a link'],
      ['⌥ ⌘ \\', 'Split view'],
      ['⇧ ⌘ F', 'Focus mode'],
      ['⌘ S', 'Toggle sidebar'],
      ['⌃ 1…9', 'Switch space'],
      ['⇧ ⌘ N', 'Private space']
    ]
  },
  {
    group: 'Page',
    items: [
      ['⌘ [  ⌘ ]', 'Back / forward'],
      ['⌘ R', 'Reload'],
      ['⌘ F', 'Find on page'],
      ['⌘ +  ⌘ −', 'Zoom'],
      ['⇧ ⌘ C', 'Copy URL'],
      ['⌥ ⌘ I', 'Developer tools'],
      ['⌥ ⌘ L', 'Downloads']
    ]
  }
]

/** Hold ⌘ for a moment (or press ⌘/) to see every shortcut. */
export function Cheatsheet() {
  const open = useUI((s) => s.cheatsheet)
  const set = useUI((s) => s.set)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viaHold = useRef(false)

  useEffect(() => {
    const onMeta = (down: boolean, combo?: boolean) => {
      if (holdTimer.current) clearTimeout(holdTimer.current)
      if (combo) return
      if (down) {
        holdTimer.current = setTimeout(() => {
          const ui = useUI.getState()
          if (ui.command.open || ui.overview || ui.settingsOpen) return
          viaHold.current = true
          set({ cheatsheet: true })
        }, 850)
      } else if (viaHold.current) {
        viaHold.current = false
        set({ cheatsheet: false })
      }
    }
    const off = window.gravity.onMetaKey((e) => onMeta(e.down, e.combo))
    return () => {
      off()
      if (holdTimer.current) clearTimeout(holdTimer.current)
    }
  }, [set])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => set({ cheatsheet: false })}
          data-testid="cheatsheet"
        >
          <div className="absolute inset-0" style={{ background: 'var(--scrim)', backdropFilter: 'blur(6px)' }} />
          <div className="relative grid grid-cols-3 gap-4 px-8">
            {SHORTCUTS.map((g, gi) => (
              <motion.div
                key={g.group}
                initial={{ y: -14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                transition={{ ...spring.settle, delay: gi * 0.04 }}
                className="glass-strong w-[280px] rounded-[10px] p-4"
              >
                <div className="label mb-3">{g.group}</div>
                <div className="flex flex-col gap-2">
                  {g.items.map(([k, label], i) => (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: gi * 0.06 + i * 0.025 }}
                      className="flex items-center justify-between gap-3 text-[12.5px] text-dim"
                    >
                      <span>{label}</span>
                      <Kbd>{k}</Kbd>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
