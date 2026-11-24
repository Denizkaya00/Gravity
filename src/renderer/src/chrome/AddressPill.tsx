import { motion } from 'motion/react'
import { Globe, Lock, Search, ShieldAlert, Star } from 'lucide-react'
import { selectActiveTab, useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { prettyUrl } from '@shared/url'
import { findFavorite } from '@shared/favorites'
import { toggleFavorite } from '@/browser/favorites'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'

export function AddressPill() {
  const tab = useBrowser(selectActiveTab)
  const command = useUI((s) => s.command)
  const openCommand = useUI((s) => s.openCommand)
  const favorites = useSettings((s) => s.favorites)

  // While the Command Bar is open the pill "becomes" it (shared layoutId).
  const morphing = command.open
  const url = tab?.url ?? ''
  const secure = url.startsWith('https:')
  const insecure = url.startsWith('http:')
  const fav = findFavorite(favorites, url)

  return (
    <div className="h-8 shrink-0">
      {!morphing && (
        <motion.div
          layoutId="omnibox"
          transition={spring.morph}
          className="group no-drag flex h-8 w-full items-center gap-2 border border-hairline bg-hover pr-1 pl-2.5 transition-colors hover:border-hairline-strong"
          style={{ borderRadius: 8 }}
        >
          <button
            type="button"
            data-testid="address-pill"
            onClick={() => openCommand(tab ? 'edit' : 'new')}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {!tab ? (
              <Search size={13} className="shrink-0 text-faint" />
            ) : secure ? (
              <Lock size={12} className="shrink-0 text-faint" />
            ) : insecure ? (
              <ShieldAlert size={12} className="shrink-0 text-faint" />
            ) : (
              <Globe size={13} className="shrink-0 text-faint" />
            )}
            <span className={cn('min-w-0 flex-1 truncate font-mono text-[11.5px]', tab ? 'text-dim' : 'text-faint')}>
              {tab ? prettyUrl(url) : 'Search or enter address'}
            </span>
          </button>
          {tab && /^https?:/.test(url) && (
            <motion.button
              type="button"
              title={fav ? 'Remove from Favorites (⇧⌘D)' : 'Add to Favorites (⇧⌘D)'}
              whileTap={{ scale: 0.85 }}
              onClick={() => toggleFavorite(tab)}
              data-testid="favorite-toggle"
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md text-faint hover:bg-hover hover:text-text',
                !fav && 'opacity-0 group-hover:opacity-100'
              )}
            >
              <Star size={12} className={cn(fav && 'fill-current text-dim')} />
            </motion.button>
          )}
        </motion.div>
      )}
    </div>
  )
}
