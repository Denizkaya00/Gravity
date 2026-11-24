import { activeTabId } from '@/browser/actions'
import { page } from '@/browser/registry'
import { useUI } from '@/state/ui'

/** Snapshot the live page first, so it can morph into its card. */
export async function openOverview(): Promise<void> {
  const ui = useUI.getState()
  if (ui.overview) return
  const id = activeTabId()
  if (id) await Promise.race([page.capture(id, 900), new Promise((r) => setTimeout(r, 180))])
  useUI.getState().set({ overview: true, command: { ...ui.command, open: false }, findOpen: false })
}
