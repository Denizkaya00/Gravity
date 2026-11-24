import type { Favorite } from './types'
import { displayHost } from './url'

/**
 * Favorites are the pages you keep: tiles at the top of the sidebar, a row
 * under the search field on Home, and a group in the Command Bar. Each space
 * has its own list, kept together in `favorites.json` by space id.
 */
export const MAX_FAVORITES = 12

export type AddResult = 'added' | 'exists' | 'full'

/**
 * What makes two addresses the same favorite: host (without www), path and
 * query. The scheme, a trailing slash and the #fragment don't count.
 */
export function favoriteKey(url: string): string {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return url
    return u.host.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + u.search
  } catch {
    return url
  }
}

/**
 * Whether a tab is showing a favorite: the same page or one under it. A site's
 * home page covers the whole site, so its favorite returns to wherever you went.
 */
export function favoriteCovers(favoriteUrl: string, tabUrl: string): boolean {
  const f = favoriteKey(favoriteUrl)
  const t = favoriteKey(tabUrl)
  return t === f || t.startsWith(`${f}/`) || (!f.includes('/') && t.startsWith(`${f}?`))
}

export function findFavorite(list: Favorite[], url: string): Favorite | undefined {
  const key = favoriteKey(url)
  return list.find((f) => favoriteKey(f.url) === key)
}

/** Appends a favorite unless it's already there or the list is full. */
export function withFavorite(list: Favorite[], f: Favorite): { list: Favorite[]; result: AddResult } {
  if (findFavorite(list, f.url)) return { list, result: 'exists' }
  if (list.length >= MAX_FAVORITES) return { list, result: 'full' }
  return { list: [...list, f], result: 'added' }
}

/** Moves the favorite with `id` to position `to` (clamped). */
export function movedFavorite(list: Favorite[], id: string, to: number): Favorite[] {
  const from = list.findIndex((f) => f.id === id)
  if (from === -1) return list
  const target = Math.max(0, Math.min(list.length - 1, to))
  if (target === from) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

/**
 * Fills in what a favorite doesn't know yet (a favorite pinned by typing an
 * address has no title or icon) from a page it led to. Never overwrites.
 */
export function learnedFavorite(f: Favorite, page: { title?: string; favicon?: string; url: string }): Favorite {
  const title = page.title?.trim()
  const usefulTitle = title && title !== page.url && title !== displayHost(page.url) ? title : undefined
  const next = { ...f }
  if (!f.title && usefulTitle) next.title = usefulTitle
  if (!f.favicon && page.favicon) next.favicon = page.favicon
  return next.title === f.title && next.favicon === f.favicon ? f : next
}

/**
 * A short name for a favorite. Page titles carry a lot of noise ("Inbox (3) -
 * me@example.com - Gmail"), so this picks the part that names the site, and
 * falls back to the host.
 */
export function favoriteLabel(f: { url: string; title?: string }): string {
  const host = displayHost(f.url)
  const title = (f.title ?? '').trim()
  if (!title || title === f.url || title === host) return host
  // Words from the host that a site's name tends to contain: mail.google.com → mail, google.
  const words = host
    .split('.')
    .slice(0, -1)
    .filter((w) => w.length > 2 && w !== 'www')
  const names = (sep: RegExp) =>
    title
      .split(sep)
      .map((s) => s.trim())
      .filter(Boolean)
  const naming = (parts: string[]) =>
    parts
      .filter((p) => words.some((w) => p.toLowerCase().replace(/[^a-z0-9]/g, '').includes(w.replace(/[^a-z0-9]/g, ''))))
      .sort((a, b) => a.length - b.length)[0]
  const parts = names(/\s+[|·•–—-]\s+|:\s+/)
  // Commas only count when they set off the name ("Wikipedia, the free encyclopedia").
  return naming([...parts, ...names(/\s+[|·•–—-]\s+|:\s+|,\s+/)]) ?? parts[0] ?? host
}
