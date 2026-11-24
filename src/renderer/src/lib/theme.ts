import { useSyncExternalStore } from 'react'
import { useSettings } from '@/state/settings'

const query = () => window.matchMedia('(prefers-color-scheme: dark)')

function subscribe(cb: () => void) {
  const mq = query()
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** Whether the interface is currently dark (resolving "Auto" against the OS). */
export function useResolvedDark(): boolean {
  const theme = useSettings((s) => s.theme)
  const systemDark = useSyncExternalStore(subscribe, () => query().matches)
  return theme === 'dark' || (theme === 'system' && systemDark)
}

/**
 * In dark mode the black hole is the window itself: it fills the whole window
 * and the sidebar is a pane of smoked glass in front of it.
 */
export function useBlackHoleBackdrop(): boolean {
  const dark = useResolvedDark()
  const mode = useSettings((s) => s.blackHole)
  return dark && mode !== 'off'
}
