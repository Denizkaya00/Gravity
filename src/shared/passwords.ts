/**
 * Saved passwords: the parts both sides need. The vault itself (encryption, storage,
 * who may read what) lives in `main/passwords.ts`; this file is pure and unit-tested.
 */

export interface PasswordEntry {
  id: string
  /** What the user calls it, such as "GitHub (work)". */
  title: string
  /** The site it signs in to. Autofill matches on this. */
  url: string
  username: string
  password: string
  notes?: string
  createdAt: number
  updatedAt: number
  /** Last time it was filled into a page. */
  lastUsedAt?: number
}

/** What the Settings list shows: never the password or the notes. */
export interface PasswordSummary {
  id: string
  title: string
  url: string
  username: string
  hasNotes: boolean
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
  weak: boolean
  /** Another entry uses the same password. */
  reused: boolean
}

/** What the add / edit form sends. `id` edits an existing entry. */
export interface PasswordDraft {
  id?: string
  title: string
  url: string
  username: string
  password: string
  notes?: string
}

/** A credential handed to a page for autofill. */
export interface FillCredential {
  id: string
  username: string
  password: string
}

export interface VaultStatus {
  /** False when the Mac's keychain can't encrypt, or the vault file can't be read. */
  available: boolean
  reason?: string
  locked: boolean
  count: number
  /** Unlocking asks for Touch ID. */
  touchId: boolean
}

/** Gravity asking whether to save (or update) what was just typed into a sign-in form. */
export interface PasswordOffer {
  id: string
  kind: 'save' | 'update'
  site: string
  username: string
  webContentsId: number
}

export type OfferResponse = 'save' | 'never' | 'dismiss'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** "https://www.github.com/login" → "github.com". Null for anything that isn't http(s). */
export function siteOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    return u.port ? `${host}:${u.port}` : host
  } catch {
    return null
  }
}

/**
 * Whether a saved entry belongs on a page. The page's host has to be the entry's host or
 * a subdomain of it (an entry for github.com fills gist.github.com; one for
 * accounts.example.com doesn't fill example.com). An https entry never fills a plain
 * http page, except on this Mac, and an explicit port has to match.
 */
export function matchesSite(entryUrl: string, pageUrl: string): boolean {
  let e: URL, p: URL
  try {
    e = new URL(entryUrl)
    p = new URL(pageUrl)
  } catch {
    return false
  }
  const web = (u: URL) => u.protocol === 'https:' || u.protocol === 'http:'
  if (!web(e) || !web(p)) return false
  const eh = e.hostname.toLowerCase().replace(/^www\./, '')
  const ph = p.hostname.toLowerCase().replace(/^www\./, '')
  if (!eh || !(ph === eh || ph.endsWith(`.${eh}`))) return false
  if (e.protocol === 'https:' && p.protocol !== 'https:' && !LOCAL_HOSTS.has(ph)) return false
  if (e.port && e.port !== p.port) return false
  return true
}

/** Turns what was typed into the Website field into a URL: "github.com" → "https://github.com". */
export function normalizeSite(raw: string): string | null {
  const input = raw.trim()
  if (!input) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
    ? input
    : `${/^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(input) ? 'http' : 'https'}://${input}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!u.hostname || (!u.hostname.includes('.') && !LOCAL_HOSTS.has(u.hostname) && u.hostname !== 'localhost')) return null
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

/** Short and readable: the site, without www. */
export function defaultTitle(url: string): string {
  return siteOf(url) ?? url
}

/** Too short, or too predictable, to keep anything safe. */
export function isWeak(password: string): boolean {
  if (password.length < 8) return true
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length
  if (password.length < 12 && classes < 3) return true
  if (/^(.)\1+$/.test(password)) return true
  return /^(password|qwerty|letmein|welcome|admin|iloveyou|123456)/i.test(password) && password.length < 16
}

/** Strips the secrets, and marks weak and reused passwords. */
export function summarize(entries: PasswordEntry[]): PasswordSummary[] {
  const uses = new Map<string, number>()
  for (const e of entries) if (e.password) uses.set(e.password, (uses.get(e.password) ?? 0) + 1)
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    url: e.url,
    username: e.username,
    hasNotes: !!e.notes?.trim(),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    lastUsedAt: e.lastUsedAt,
    weak: !!e.password && isWeak(e.password),
    reused: (uses.get(e.password) ?? 0) > 1
  }))
}

/** Alphabetical by title, then username. Searching matches title, site and username. */
export function filterEntries<T extends { title: string; url: string; username: string }>(list: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  const sorted = [...list].sort(
    (a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
      a.username.localeCompare(b.username, undefined, { sensitivity: 'base' })
  )
  if (!q) return sorted
  return sorted.filter((e) => [e.title, siteOf(e.url) ?? e.url, e.username].some((s) => s.toLowerCase().includes(q)))
}

/** Entries for a page, most recently used first. */
export function credentialsFor(entries: PasswordEntry[], pageUrl: string): PasswordEntry[] {
  return entries
    .filter((e) => e.password && matchesSite(e.url, pageUrl))
    .sort((a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt))
}

/**
 * What a submitted sign-in means for the vault: nothing new, a new entry, or a new
 * password for an entry already saved under that username.
 */
export function offerKind(
  entries: PasswordEntry[],
  pageUrl: string,
  username: string,
  password: string
): { kind: 'save' } | { kind: 'update'; id: string } | null {
  if (!password) return null
  const here = entries.filter((e) => matchesSite(e.url, pageUrl))
  const same = here.find((e) => e.username === username)
  if (same) return same.password === password ? null : { kind: 'update', id: same.id }
  // Signed in with a saved password and no username we could see: nothing to do.
  if (!username && here.some((e) => e.password === password)) return null
  return { kind: 'save' }
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'

/** A uniformly random index below `n`, without modulo bias. */
type Random = (buf: Uint32Array<ArrayBuffer>) => Uint32Array<ArrayBuffer>

function randomIndex(n: number, random: Random): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n
  const buf = new Uint32Array(1)
  for (;;) {
    random(buf)
    if (buf[0] < limit) return buf[0] % n
  }
}

/**
 * A strong password that is still easy to type: three groups of six, joined by hyphens,
 * with at least one capital and one digit (about 100 bits). Look-alikes such as l, I, O,
 * 0 and 1 are left out.
 */
export function generatePassword(random: Random = (b) => globalThis.crypto.getRandomValues(b)): string {
  const all = LOWER + UPPER + DIGITS
  for (;;) {
    const groups = Array.from({ length: 3 }, () =>
      Array.from({ length: 6 }, () => all[randomIndex(all.length, random)]).join('')
    )
    const pw = groups.join('-')
    if (/[A-Z]/.test(pw) && /\d/.test(pw) && /[a-z]/.test(pw)) return pw
  }
}
