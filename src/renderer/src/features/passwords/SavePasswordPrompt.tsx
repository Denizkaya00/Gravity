import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { KeyRound } from 'lucide-react'
import type { OfferResponse } from '@shared/passwords'
import { useSlots, useUI } from '@/state/ui'
import { spring } from '@/lib/springs'

/** "Save password for github.com?" drops in from the top of the page after a sign-in. */
export function SavePasswordPrompt() {
  const offers = useUI((s) => s.passwordOffers)
  const permissionShowing = useUI((s) => s.permissions.length > 0)
  const set = useUI((s) => s.set)
  const rect = useSlots((s) => s.rects.main ?? s.rects['split-a'])
  const offer = permissionShowing ? undefined : offers[offers.length - 1]

  const respond = (answer: OfferResponse) => {
    if (!offer) return
    window.gravity.passwords.respondOffer(offer.id, answer)
    set({ passwordOffers: useUI.getState().passwordOffers.filter((o) => o.id !== offer.id) })
    if (answer === 'save') useUI.getState().toast(offer.kind === 'update' ? 'Password updated' : 'Password saved', 'check')
  }

  // Unanswered, it goes away by itself after a while, like "Not now".
  useEffect(() => {
    if (!offer) return
    const t = setTimeout(() => {
      window.gravity.passwords.respondOffer(offer.id, 'dismiss')
      useUI.getState().set({ passwordOffers: useUI.getState().passwordOffers.filter((o) => o.id !== offer.id) })
    }, 60_000)
    return () => clearTimeout(t)
  }, [offer])

  const left = rect ? rect.left + rect.width / 2 - 200 : window.innerWidth / 2 - 200
  const top = rect ? rect.top + 12 : 12

  return (
    <AnimatePresence>
      {offer && (
        <motion.div
          key={offer.id}
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0, transition: { duration: 0.2 } }}
          transition={spring.settle}
          className="glass-strong fixed z-[72] w-[400px] rounded-[10px] p-4"
          style={{ left, top }}
          data-testid="password-offer"
        >
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-hairline">
              <KeyRound size={15} className="text-dim" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] text-text">
                {offer.kind === 'update' ? 'Update the saved password for ' : 'Save password for '}
                <span className="font-semibold">{offer.site}</span>?
              </div>
              {offer.username && <div className="mt-0.5 truncate font-mono text-[11.5px] text-faint">{offer.username}</div>}
              <div className="mt-3 flex items-center justify-end gap-2">
                {offer.kind === 'save' && (
                  <button
                    type="button"
                    onClick={() => respond('never')}
                    className="mr-auto rounded-[6px] px-2 py-1 text-[12px] text-faint hover:bg-hover hover:text-text"
                    data-testid="password-offer-never"
                  >
                    Never for this site
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => respond('dismiss')}
                  className="rounded-[6px] px-3 py-1 text-[12.5px] text-dim hover:bg-hover hover:text-text"
                >
                  Not now
                </button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => respond('save')}
                  className="rounded-[6px] px-3 py-1 text-[12.5px] text-[var(--frame-bg)]"
                  style={{ background: 'var(--text)' }}
                  data-testid="password-offer-save"
                >
                  {offer.kind === 'update' ? 'Update' : 'Save'}
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
