import {
  app,
  clipboard,
  ipcMain,
  safeStorage,
  session,
  systemPreferences,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GUEST_IPC, IPC } from '@shared/ipc'
import {
  credentialsFor,
  defaultTitle,
  normalizeSite,
  offerKind,
  siteOf,
  summarize,
  type FillCredential,
  type OfferResponse,
  type PasswordDraft,
  type PasswordEntry,
  type PasswordOffer,
  type PasswordSummary,
  type VaultStatus
} from '@shared/passwords'
import { getSettings } from './settings'

/**
 * The password vault.
 *
 * Everything (entries and the never-save list) is one JSON document, encrypted with
 * `safeStorage`, whose key lives in the macOS keychain, and written atomically to
 * `passwords.json` with owner-only permissions. Nothing is ever stored in plain text: if
 * the keychain can't encrypt, the vault stays unavailable instead.
 *
 * The decrypted vault lives only in this process. The UI gets summaries without
 * passwords, and only while the vault is unlocked (Touch ID, then five idle minutes).
 * Pages get credentials for their own site only, and main reads the page's address from
 * the frame itself, never from what the page says.
 */

interface VaultData {
  entries: PasswordEntry[]
  /** Sites (as `siteOf` gives them) Gravity never offers to save for. */
  never: string[]
}

interface VaultFile {
  version: 1
  /** base64 of safeStorage.encryptString(JSON.stringify(VaultData)) */
  data: string
}

const UNLOCK_MS = 5 * 60_000
const CLIPBOARD_MS = 60_000
const OFFER_MS = 3 * 60_000
const PRIVATE_PARTITION = 'gravity-private'

let file = ''
let vault: VaultData = { entries: [], never: [] }
let unavailable: string | null = 'Passwords are still loading.'
let unlockedUntil = 0
let host: WebContents | null = null
/** What Gravity last put on the clipboard, so it only clears its own copy. */
let clipboardSecret: string | null = null
let clipboardTimer: NodeJS.Timeout | null = null

const pendingOffers = new Map<string, { pageUrl: string; username: string; password: string; existingId?: string; at: number }>()
const recentSubmits = new Map<number, { key: string; at: number }>()
/** Usernames typed on the first page of two-step sign-ins, per page. */
const typedUsernames = new Map<number, { site: string; value: string; at: number }>()

export function setPasswordsHost(wc: WebContents): void {
  host = wc
}

function load(): void {
  const dir = process.env.GRAVITY_USER_DATA ?? app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  file = join(dir, 'passwords.json')
  if (!safeStorage.isEncryptionAvailable()) {
    unavailable = 'The keychain isn’t available, so passwords can’t be stored safely.'
    return
  }
  if (!existsSync(file)) {
    unavailable = null
    return
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as VaultFile
    const json = safeStorage.decryptString(Buffer.from(raw.data, 'base64'))
    const data = JSON.parse(json) as Partial<VaultData>
    vault = { entries: Array.isArray(data.entries) ? data.entries : [], never: Array.isArray(data.never) ? data.never : [] }
    unavailable = null
  } catch (err) {
    // Never overwrite a vault we couldn't read: it may only be the keychain that's off.
    console.error('[passwords] could not read the vault', err)
    unavailable = 'Saved passwords couldn’t be decrypted with this Mac’s keychain. The file was left untouched.'
  }
}

function persist(): void {
  if (unavailable) throw new Error(unavailable)
  const data = safeStorage.encryptString(JSON.stringify(vault)).toString('base64')
  const out: VaultFile = { version: 1, data }
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 })
  renameSync(tmp, file)
  try {
    chmodSync(file, 0o600)
  } catch {
    /* best effort */
  }
}

function isUnlocked(): boolean {
  if (Date.now() > unlockedUntil) return false
  unlockedUntil = Date.now() + UNLOCK_MS
  return true
}

function canTouchId(): boolean {
  if (process.env.GRAVITY_E2E || process.platform !== 'darwin') return false
  try {
    return systemPreferences.canPromptTouchID()
  } catch {
    return false
  }
}

function status(): VaultStatus {
  return {
    available: !unavailable,
    reason: unavailable ?? undefined,
    locked: !(Date.now() <= unlockedUntil),
    count: vault.entries.length,
    touchId: canTouchId()
  }
}

async function unlock(): Promise<boolean> {
  if (unavailable) return false
  if (Date.now() <= unlockedUntil) return isUnlocked()
  if (canTouchId()) {
    try {
      await systemPreferences.promptTouchID('show your saved passwords')
    } catch {
      return false
    }
  }
  unlockedUntil = Date.now() + UNLOCK_MS
  return true
}

function list(): PasswordSummary[] {
  return summarize(vault.entries)
}

function save(draft: PasswordDraft): PasswordSummary {
  const url = normalizeSite(draft.url)
  if (!url) throw new Error('Enter the website’s address, such as github.com.')
  if (!draft.password) throw new Error('Enter a password.')
  const now = Date.now()
  const fields = {
    title: draft.title.trim() || defaultTitle(url),
    url,
    username: draft.username.trim(),
    password: draft.password,
    notes: draft.notes?.trim() || undefined
  }
  let id = draft.id
  if (id && vault.entries.some((e) => e.id === id)) {
    vault = { ...vault, entries: vault.entries.map((e) => (e.id === id ? { ...e, ...fields, updatedAt: now } : e)) }
  } else {
    id = randomUUID()
    vault = { ...vault, entries: [...vault.entries, { id, ...fields, createdAt: now, updatedAt: now }] }
  }
  persist()
  return list().find((e) => e.id === id)!
}

function remove(id: string): void {
  vault = { ...vault, entries: vault.entries.filter((e) => e.id !== id) }
  persist()
}

/** Copies a username or password, and takes a password off the clipboard after a minute. */
function copy(id: string, field: 'username' | 'password'): boolean {
  const entry = vault.entries.find((e) => e.id === id)
  if (!entry) return false
  const value = entry[field]
  void clipboard.writeText(value)
  if (clipboardTimer) clearTimeout(clipboardTimer)
  clipboardSecret = null
  if (field === 'password') {
    clipboardSecret = value
    clipboardTimer = setTimeout(() => void clearClipboard(), CLIPBOARD_MS)
  }
  return true
}

/** True while a copied password is still waiting to be taken off the clipboard. */
export function clipboardPending(): boolean {
  return clipboardSecret !== null
}

/** Clears the clipboard if it still holds the password Gravity put there. */
export async function clearClipboard(): Promise<void> {
  if (clipboardTimer) clearTimeout(clipboardTimer)
  clipboardTimer = null
  const secret = clipboardSecret
  clipboardSecret = null
  if (secret === null) return
  try {
    if ((await clipboard.readText()) === secret) clipboard.clear()
  } catch {
    /* nothing to do */
  }
}

/* ---------------------------------------------------------------- pages */

/** The top-level page address of a guest <webview> in Gravity's window, or null for anyone else. */
function guestPage(e: IpcMainEvent | IpcMainInvokeEvent): string | null {
  const wc = e.sender
  if (!host || wc.getType() !== 'webview' || wc.hostWebContents !== host) return null
  const frame = e.senderFrame
  if (!frame || frame.parent) return null
  return /^https?:/i.test(frame.url) ? frame.url : null
}

function isPrivate(wc: WebContents): boolean {
  return wc.session === session.fromPartition(PRIVATE_PARTITION)
}

function credentials(e: IpcMainInvokeEvent): FillCredential[] {
  const pageUrl = guestPage(e)
  if (!pageUrl || unavailable || !getSettings().passwordsAutofill) return []
  return credentialsFor(vault.entries, pageUrl).map((c) => ({ id: c.id, username: c.username, password: c.password }))
}

function filled(e: IpcMainEvent, id: unknown): void {
  const pageUrl = guestPage(e)
  if (!pageUrl || unavailable || typeof id !== 'string' || isPrivate(e.sender)) return
  const entry = vault.entries.find((x) => x.id === id)
  if (!entry || !credentialsFor([entry], pageUrl).length) return
  vault = { ...vault, entries: vault.entries.map((x) => (x.id === id ? { ...x, lastUsedAt: Date.now() } : x)) }
  try {
    persist()
  } catch {
    /* not worth bothering anyone about */
  }
}

function typedUsername(e: IpcMainEvent, value: unknown): void {
  const pageUrl = guestPage(e)
  const site = pageUrl && siteOf(pageUrl)
  if (!site || typeof value !== 'string' || !value.trim() || value.length > 256) return
  typedUsernames.set(e.sender.id, { site, value: value.trim(), at: Date.now() })
}

function submitted(e: IpcMainEvent, payload: unknown): void {
  const pageUrl = guestPage(e)
  const site = pageUrl && siteOf(pageUrl)
  if (!pageUrl || !site || unavailable || !host || host.isDestroyed()) return
  if (!getSettings().passwordsOffer || isPrivate(e.sender) || vault.never.includes(site)) return
  const p = payload as { username?: unknown; password?: unknown } | null
  if (!p || typeof p.password !== 'string' || !p.password || p.password.length > 1024) return
  let username = typeof p.username === 'string' ? p.username.trim().slice(0, 256) : ''
  if (!username) {
    const typed = typedUsernames.get(e.sender.id)
    if (typed && typed.site === site && Date.now() - typed.at < 10 * 60_000) username = typed.value
  }

  // A form usually announces itself more than once (click, then submit): ask once.
  const key = `${site}\n${username}\n${p.password}`
  const recent = recentSubmits.get(e.sender.id)
  if (recent && recent.key === key && Date.now() - recent.at < 15_000) return
  recentSubmits.set(e.sender.id, { key, at: Date.now() })

  const what = offerKind(vault.entries, pageUrl, username, p.password)
  if (!what) return
  const now = Date.now()
  for (const [id, o] of pendingOffers) if (now - o.at > OFFER_MS) pendingOffers.delete(id)
  const id = randomUUID()
  pendingOffers.set(id, {
    pageUrl,
    username,
    password: p.password,
    existingId: what.kind === 'update' ? what.id : undefined,
    at: now
  })
  const offer: PasswordOffer = { id, kind: what.kind, site, username, webContentsId: e.sender.id }
  host.send(IPC.passwordsOffer, offer)
}

function respondOffer(id: string, answer: OfferResponse): void {
  const o = pendingOffers.get(id)
  pendingOffers.delete(id)
  if (!o || unavailable || Date.now() - o.at > OFFER_MS) return
  if (answer === 'never') {
    const site = siteOf(o.pageUrl)
    if (site && !vault.never.includes(site)) {
      vault = { ...vault, never: [...vault.never, site] }
      persist()
    }
    return
  }
  if (answer !== 'save') return
  const existing = o.existingId && vault.entries.find((e) => e.id === o.existingId)
  if (existing) {
    save({ ...existing, password: o.password })
  } else {
    const u = new URL(o.pageUrl)
    save({ title: defaultTitle(o.pageUrl), url: `${u.protocol}//${u.host}`, username: o.username, password: o.password })
  }
}

/* ------------------------------------------------------------------ IPC */

export function initPasswords(): void {
  load()

  /** Only Gravity's own window may manage the vault, and only while it's unlocked. */
  const fromHost = (e: IpcMainEvent | IpcMainInvokeEvent) => !!host && e.sender === host
  const managing = <A extends unknown[], R>(fn: (...args: A) => R) =>
    (e: IpcMainInvokeEvent, ...args: A): R => {
      if (!fromHost(e)) throw new Error('Not allowed')
      if (!isUnlocked()) throw new Error('Passwords are locked')
      return fn(...args)
    }

  ipcMain.handle(IPC.passwordsStatus, (e) => {
    if (!fromHost(e)) throw new Error('Not allowed')
    return status()
  })
  ipcMain.handle(IPC.passwordsUnlock, (e) => {
    if (!fromHost(e)) throw new Error('Not allowed')
    return unlock()
  })
  ipcMain.on(IPC.passwordsLock, (e) => {
    if (fromHost(e)) unlockedUntil = 0
  })
  ipcMain.handle(IPC.passwordsList, managing(() => list()))
  ipcMain.handle(
    IPC.passwordsGet,
    managing((id: string) => vault.entries.find((x) => x.id === id) ?? null)
  )
  ipcMain.handle(IPC.passwordsSave, managing((draft: PasswordDraft) => save(draft)))
  ipcMain.handle(IPC.passwordsRemove, managing((id: string) => remove(id)))
  ipcMain.handle(IPC.passwordsCopy, managing((id: string, field: 'username' | 'password') => copy(id, field)))
  ipcMain.handle(IPC.passwordsNever, managing(() => [...vault.never].sort()))
  ipcMain.handle(
    IPC.passwordsNeverRemove,
    managing((site: string) => {
      vault = { ...vault, never: vault.never.filter((s) => s !== site) }
      persist()
    })
  )
  ipcMain.on(IPC.passwordsOfferRespond, (e, id: string, answer: OfferResponse) => {
    if (!fromHost(e)) return
    try {
      respondOffer(id, answer)
    } catch (err) {
      console.error('[passwords] could not save', err)
    }
  })

  ipcMain.handle(GUEST_IPC.credentials, (e) => credentials(e))
  ipcMain.on(GUEST_IPC.filled, (e, id) => filled(e, id))
  ipcMain.on(GUEST_IPC.username, (e, value) => typedUsername(e, value))
  ipcMain.on(GUEST_IPC.submitted, (e, payload) => submitted(e, payload))
}
