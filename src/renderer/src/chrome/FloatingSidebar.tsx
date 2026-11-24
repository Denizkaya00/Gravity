import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { spring } from '@/lib/springs'
import { SidebarContent } from './Sidebar'

/**
 * When the sidebar is hidden (⌘S or Focus mode), touching the left edge of the
 * window springs it out over the page. It tucks itself away when you leave.
 */
export function FloatingSidebar() {
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const focus = useUI((s) => s.focusMode)
  const hover = useUI((s) => s.sidebarHover)
  const set = useUI((s) => s.set)
  const commandOpen = useUI((s) => s.command.open)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enabled = collapsed || focus

  useEffect(() => {
    if (!enabled && hover) set({ sidebarHover: false })
  }, [enabled, hover, set])

  if (!enabled) return null

  const enter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    set({ sidebarHover: true })
  }
  const leave = () => {
    leaveTimer.current = setTimeout(() => {
      if (!useUI.getState().command.open && !useUI.getState().dragging) set({ sidebarHover: false })
    }, 280)
  }

  return (
    <>
      <div className="fixed top-0 bottom-0 left-0 z-[28] w-2.5" onMouseEnter={enter} data-testid="sidebar-hotzone" />
      <AnimatePresence>
        {(hover || (commandOpen && hover)) && (
          <motion.div
            initial={{ x: -290, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -290, opacity: 0 }}
            transition={spring.gentle}
            onMouseEnter={enter}
            onMouseLeave={leave}
            className="glass-strong fixed top-2 bottom-2 left-2 z-[40] w-[268px] overflow-hidden rounded-[12px]"
          >
            <SidebarContent floating />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
