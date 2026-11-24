import { systemPreferences, type Session, type WebContents } from 'electron'
import type { PermissionRequest } from '@shared/types'
import { IPC } from '@shared/ipc'
import { originOf } from '@shared/url'
import { JsonStore } from './store'

/** Permissions granted without asking: harmless and expected by most sites. */
const ALWAYS_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management'])
/** Permissions worth a prompt. Anything not listed is denied. */
const ASK = new Set(['media', 'geolocation', 'notifications', 'midi', 'midiSysex', 'clipboard-read', 'display-capture', 'speaker-selection'])

type Decisions = Record<string, Record<string, boolean>>
const store = new JsonStore<Decisions>('permissions', () => ({}))

const pending = new Map<string, (granted: boolean) => void>()
let host: WebContents | null = null
let counter = 0
const attached = new WeakSet<Session>()

export function setPermissionsHost(wc: WebContents): void {
  host = wc
}

function remembered(origin: string, permission: string): boolean | undefined {
  return store.get()[origin]?.[permission]
}

export function handlePermissions(ses: Session, opts: { persist: boolean }): void {
  if (attached.has(ses)) return
  attached.add(ses)

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (ALWAYS_ALLOW.has(permission)) return callback(true)
    if (!ASK.has(permission) || !host || host.isDestroyed()) return callback(false)

    const origin = originOf(details.requestingUrl || wc.getURL())
    const prior = remembered(origin, permission)
    if (prior !== undefined) return callback(prior)

    const id = `perm-${counter++}`
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes as string[] | undefined) : undefined
    const req: PermissionRequest = { id, webContentsId: wc.id, origin, permission, mediaTypes }
    pending.set(id, async (granted) => {
      if (granted && permission === 'media' && process.platform === 'darwin') {
        // The OS also has to agree before the page gets a camera or microphone.
        const wants = mediaTypes ?? ['audio', 'video']
        for (const t of wants) {
          const kind = t === 'video' ? 'camera' : 'microphone'
          if (systemPreferences.getMediaAccessStatus(kind) !== 'granted') {
            granted = await systemPreferences.askForMediaAccess(kind)
          }
        }
      }
      if (opts.persist) {
        store.update((d) => ({ ...d, [origin]: { ...d[origin], [permission]: granted } }))
      }
      callback(granted)
    })
    host.send(IPC.permissionRequest, req)
  })

  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (ALWAYS_ALLOW.has(permission)) return true
    return remembered(originOf(requestingOrigin), permission) === true
  })
}

export function respondPermission(id: string, granted: boolean): void {
  const fn = pending.get(id)
  pending.delete(id)
  fn?.(granted)
}
