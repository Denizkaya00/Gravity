import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useBrowser, selectActiveTab } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { openUrl } from '@/browser/actions'
import { Favicon } from '@/components/ui/Favicon'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'
import { displayHost } from '@shared/url'

function sameSite(a: string, b: string) {
  return displayHost(a) === displayHost(b)
}

/** Arc-style favorite tiles. Clicking one jumps to an open tab of that site if there is one. */
export function Favorites() {
  const favorites = useSettings((s) => s.favorites)
  const remove = useSettings((s) => s.removeFavorite)
  const active = useBrowser(selectActiveTab)
  if (!favorites.length) return null

  const open = (url: string) => {
    const B = useBrowser.getState()
    const existing = (B.order[B.activeSpaceId] ?? []).map((id) => B.tabs[id]).find((t) => t && !t.peek && sameSite(t.url, url))
    if (existing) B.activateTab(existing.id)
    else openUrl(url, 'foreground')
  }

  return (
    <div className="mt-2.5 grid grid-cols-4 gap-1.5">
      <AnimatePresence initial={false}>
        {favorites.slice(0, 8).map((f, i) => {
          const isActive = !!active && sameSite(active.url, f.url)
          return (
            <motion.div
              key={f.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ ...spring.settle, delay: i * 0.02 }}
              className="group relative"
            >
              <motion.button
                type="button"
                title={f.title || displayHost(f.url)}
                whileTap={{ scale: 0.95 }}
                transition={spring.snappy}
                onClick={() => open(f.url)}
                className={cn(
                  'flex h-10 w-full items-center justify-center rounded-[8px] border transition-colors',
                  isActive ? 'border-hairline-strong bg-active' : 'border-hairline bg-hover hover:bg-active'
                )}
              >
                <Favicon src={f.favicon} url={f.url} size={18} />
              </motion.button>
              <button
                type="button"
                title="Remove favorite"
                onClick={() => remove(f.id)}
                className="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-glass-strong text-dim shadow group-hover:flex hover:text-text"
              >
                <X size={9} strokeWidth={3} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
