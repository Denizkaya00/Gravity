import { app, type Session, type WebContents } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { IPC } from '@shared/ipc'

let blocker: ElectronBlocker | null = null
let loading: Promise<ElectronBlocker | null> | null = null
const sessions = new Set<Session>()
let enabled = true
/** Pending blocked counts per webContents id, flushed in batches to keep IPC quiet. */
const pending = new Map<number, number>()
let flushTimer: NodeJS.Timeout | null = null
let host: WebContents | null = null

export function setShieldHost(wc: WebContents): void {
  host = wc
}

function flush(): void {
  flushTimer = null
  if (!host || host.isDestroyed()) return
  for (const [id, count] of pending) host.send(IPC.shieldBlocked, { webContentsId: id, count })
  pending.clear()
}

async function load(): Promise<ElectronBlocker | null> {
  if (blocker) return blocker
  if (!loading) {
    loading = ElectronBlocker.fromPrebuiltAdsAndTracking(globalThis.fetch, {
      path: join(process.env.GRAVITY_USER_DATA ?? app.getPath('userData'), 'shield-engine.bin'),
      read: async (p) => new Uint8Array(await readFile(p)),
      write: async (p, buf) => writeFile(p, buf)
    })
      .then((b) => {
        blocker = b
        b.on('request-blocked', (request) => {
          const id = request.tabId
          if (typeof id !== 'number' || id < 0) return
          pending.set(id, (pending.get(id) ?? 0) + 1)
          if (!flushTimer) flushTimer = setTimeout(flush, 400)
        })
        return b
      })
      .catch((err) => {
        console.warn('[shield] could not load filter lists', err)
        loading = null
        return null
      })
  }
  return loading
}

/** Registers a session the Shield should protect (applies the current on/off state). */
export async function protectSession(ses: Session): Promise<void> {
  sessions.add(ses)
  if (!enabled) return
  const b = await load()
  if (b && enabled && !b.isBlockingEnabled(ses)) b.enableBlockingInSession(ses)
}

export async function setShieldEnabled(on: boolean): Promise<void> {
  enabled = on
  const b = on ? await load() : blocker
  if (!b) return
  for (const ses of sessions) {
    const active = b.isBlockingEnabled(ses)
    if (on && !active) b.enableBlockingInSession(ses)
    if (!on && active) b.disableBlockingInSession(ses)
  }
}
