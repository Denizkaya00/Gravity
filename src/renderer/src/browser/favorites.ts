import type { Favorite, OpenMode } from '@shared/types'
import { favoriteCovers, favoriteKey, findFavorite, MAX_FAVORITES } from '@shared/favorites'
import { useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { openUrl } from './actions'

type Page = { url: string; title?: string; favicon?: string }

/** Tabs opened from a favorite, so the favorite can learn its title and icon from them. */
const openedFrom = new Map<string, string>()

/** Adds a page to this space's Favorites (the sidebar tiles and the row on Home), with a toast saying how it went. */
export function addToFavorites(page: Page): boolean {
  const result = useSettings.getState().addFavorite({ url: page.url, title: page.title ?? '', favicon: page.favicon })
  const toast = useUI.getState().toast
  if (result === 'added') toast('Added to Favorites', 'check')
  else if (result === 'exists') toast('Already in Favorites', 'check')
  else toast(`Favorites hold ${MAX_FAVORITES} pages. Remove one to add another`, 'warn')
  return result === 'added'
}

export function toggleFavorite(page: Page): void {
  const existing = findFavorite(useSettings.getState().favorites, page.url)
  if (!existing) return void addToFavorites(page)
  useSettings.getState().removeFavorite(existing.id)
  useUI.getState().toast('Removed from Favorites', 'check')
}

/**
 * Opens a favorite. A plain open goes back to a tab in this space that's on
 * that page (or under it) if there is one, so favorites don't pile up duplicates.
 */
export function openFavorite(f: Favorite, mode: OpenMode = 'foreground', origin?: { x: number; y: number }): void {
  const B = useBrowser.getState()
  if (mode === 'foreground') {
    const tabs = (B.order[B.activeSpaceId] ?? []).map((id) => B.tabs[id]).filter((t) => t && !t.peek)
    const key = favoriteKey(f.url)
    const existing = tabs.find((t) => favoriteKey(t.url) === key) ?? tabs.find((t) => favoriteCovers(f.url, t.url))
    if (existing) return B.activateTab(existing.id)
  }
  const id = openUrl(f.url, mode, origin)
  if (id && (!f.title || !f.favicon)) openedFrom.set(id, f.id)
}

/**
 * A favorite pinned by typing its address knows neither its name nor its
 * icon. Fill them in from the first page it opens (following redirects), or
 * from any tab on the same address. Private spaces teach nothing.
 */
export function watchFavorites(): () => void {
  return useBrowser.subscribe((s, prev) => {
    if (s.tabs === prev.tabs) return
    const S = useSettings.getState()
    if (!openedFrom.size && Object.values(S.favoritesBySpace).every((list) => list.every((f) => f.title && f.favicon))) return
    for (const tab of Object.values(s.tabs)) {
      const before = prev.tabs[tab.id]
      if (before && before.title === tab.title && before.favicon === tab.favicon) continue
      if (s.spaces.find((sp) => sp.id === tab.spaceId)?.private) continue
      if (tab.peek && !openedFrom.has(tab.id)) continue
      // Each space keeps its own favorites, so a tab teaches only the ones in its space.
      const list = S.favoritesBySpace[tab.spaceId] ?? []
      const favId = openedFrom.get(tab.id) ?? findFavorite(list, tab.url)?.id
      if (!favId) continue
      S.learnFavorite(favId, tab, tab.spaceId)
      const f = useSettings.getState().favoritesBySpace[tab.spaceId]?.find((x) => x.id === favId)
      if (!f || (f.title && f.favicon)) openedFrom.delete(tab.id)
    }
    for (const id of openedFrom.keys()) if (!s.tabs[id]) openedFrom.delete(id)
  })
}
