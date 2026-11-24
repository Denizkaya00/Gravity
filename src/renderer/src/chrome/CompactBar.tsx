import { motion } from 'motion/react'
import { PanelLeft } from 'lucide-react'
import { prettyUrl } from '@shared/url'
import { selectActiveTab, useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { IconButton } from '@/components/ui/IconButton'
import { spring } from '@/lib/springs'
import { NavButtons } from './NavButtons'

/**
 * With the sidebar collapsed, a slim title bar keeps the essentials in reach:
 * the traffic lights, a button to bring the sidebar back, navigation and the
 * address. Focus mode hides even this.
 */
export function CompactBar() {
  const update = useSettings((s) => s.update)
  const openCommand = useUI((s) => s.openCommand)
  const tab = useBrowser(selectActiveTab)
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={spring.snappy}
      className="drag absolute inset-x-0 top-0 flex h-10 items-center gap-1 pr-3 pl-[84px]"
      data-testid="compact-bar"
    >
      <IconButton label="Show sidebar (⌘S)" onClick={() => void update({ sidebarCollapsed: false })} data-testid="sidebar-show">
        <PanelLeft size={15} />
      </IconButton>
      <NavButtons />
      <button
        type="button"
        onClick={() => openCommand(tab ? 'edit' : 'new')}
        // Centred on the window (like the clock and the search field on Home), not in the space left beside the buttons.
        className="no-drag absolute left-1/2 max-w-[46%] -translate-x-1/2 truncate rounded-[6px] px-3 py-1 font-mono text-[11px] text-faint hover:bg-hover hover:text-dim"
      >
        {tab ? prettyUrl(tab.url) : 'Search or enter address'}
      </button>
    </motion.div>
  )
}
