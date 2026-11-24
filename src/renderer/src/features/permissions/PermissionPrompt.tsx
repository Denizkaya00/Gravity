import { AnimatePresence, motion } from 'motion/react'
import { Bell, Camera, ClipboardPaste, MapPin, Mic, MonitorUp, Music, ShieldQuestion } from 'lucide-react'
import { displayHost } from '@shared/url'
import { useSlots, useUI } from '@/state/ui'
import { spring } from '@/lib/springs'

function describe(permission: string, media?: string[]): { text: string; Icon: typeof Bell } {
  switch (permission) {
    case 'media': {
      const cam = media?.includes('video')
      const mic = media?.includes('audio')
      return { text: cam && mic ? 'use your camera and microphone' : cam ? 'use your camera' : 'use your microphone', Icon: cam ? Camera : Mic }
    }
    case 'geolocation':
      return { text: 'know your location', Icon: MapPin }
    case 'notifications':
      return { text: 'show notifications', Icon: Bell }
    case 'clipboard-read':
      return { text: 'see what you copied', Icon: ClipboardPaste }
    case 'display-capture':
      return { text: 'record your screen', Icon: MonitorUp }
    case 'midi':
    case 'midiSysex':
      return { text: 'use your MIDI devices', Icon: Music }
    default:
      return { text: `use ${permission}`, Icon: ShieldQuestion }
  }
}

/** Permission requests drop in from the top of the page, one at a time. */
export function PermissionPrompt() {
  const requests = useUI((s) => s.permissions)
  const set = useUI((s) => s.set)
  const rect = useSlots((s) => s.rects.main ?? s.rects['split-a'])
  const req = requests[0]

  const respond = (granted: boolean) => {
    if (!req) return
    window.gravity.permissions.respond(req.id, granted)
    set({ permissions: useUI.getState().permissions.filter((r) => r.id !== req.id) })
  }

  const left = rect ? rect.left + rect.width / 2 - 200 : window.innerWidth / 2 - 200
  const top = rect ? rect.top + 12 : 12

  return (
    <AnimatePresence>
      {req && (
        <motion.div
          key={req.id}
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0, transition: { duration: 0.2 } }}
          transition={spring.settle}
          className="glass-strong fixed z-[72] w-[400px] rounded-[10px] p-4"
          style={{ left, top }}
          data-testid="permission-prompt"
        >
          {(() => {
            const { text, Icon } = describe(req.permission, req.mediaTypes)
            return (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-hairline">
                  <Icon size={15} className="text-dim" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] text-text">
                    <span className="font-semibold">{displayHost(req.origin)}</span> wants to {text}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={() => respond(false)} className="rounded-[6px] px-3 py-1 text-[12.5px] text-dim hover:bg-hover hover:text-text">
                      Block
                    </button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={() => respond(true)}
                      className="rounded-[6px] px-3 py-1 text-[12.5px] text-[var(--frame-bg)]"
                      style={{ background: 'var(--text)' }}
                    >
                      Allow
                    </motion.button>
                  </div>
                </div>
              </div>
            )
          })()}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
