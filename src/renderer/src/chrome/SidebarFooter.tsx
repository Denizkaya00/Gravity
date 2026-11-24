import { motion } from 'motion/react'
import { Settings2, Shield, ShieldOff } from 'lucide-react'
import { selectActiveTabId, useBrowser } from '@/state/browser'
import { useRuntime } from '@/state/runtime'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { NumberTicker } from '@/components/magic/number-ticker'
import { IconButton } from '@/components/ui/IconButton'
import { DownloadsOrb } from '@/features/downloads/DownloadsOrb'
import { spring } from '@/lib/springs'

function ShieldBadge() {
  const id = useBrowser(selectActiveTabId)
  const blocked = useRuntime((s) => (id ? (s.tabs[id]?.blocked ?? 0) : 0))
  const on = useSettings((s) => s.shield)
  const update = useSettings((s) => s.update)
  const toast = useUI((s) => s.toast)
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      transition={spring.snappy}
      onClick={() => {
        void update({ shield: !on })
        toast(on ? 'Shield off' : 'Shield on — blocking ads & trackers', 'shield')
      }}
      title={on ? `Shield is blocking ads & trackers (${blocked} on this page). Click to turn off.` : 'Shield is off. Click to turn on.'}
      className="no-drag flex h-7 items-center gap-1 rounded-lg px-1.5 text-dim hover:bg-hover hover:text-text"
      data-testid="shield"
    >
      {on ? <Shield size={14} /> : <ShieldOff size={14} />}
      {on && blocked > 0 && (
        <NumberTicker value={blocked} className="font-mono text-[10.5px] tabular-nums text-dim" />
      )}
    </motion.button>
  )
}

export function SidebarFooter() {
  const open = useUI((s) => s.set)
  return (
    <div className="flex items-center justify-between border-t border-hairline pt-1.5">
      <IconButton label="Settings (⌘,)" onClick={() => open({ settingsOpen: true })}>
        <Settings2 size={15} />
      </IconButton>
      <div className="flex items-center gap-1">
        <ShieldBadge />
        <DownloadsOrb />
      </div>
    </div>
  )
}
