import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Favorite, type FavoritesBySpace, type Settings } from '@shared/types'
import { learnedFavorite, movedFavorite, withFavorite, type AddResult } from '@shared/favorites'
import { uid } from '@/lib/id'
import { useBrowser } from './browser'

interface SettingsState extends Settings {
  loaded: boolean
  /** Every space's favorites. Private spaces' lists live only in memory. */
  favoritesBySpace: FavoritesBySpace
  /** The favorites of the space you're in. */
  favorites: Favorite[]
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
  /** These act on the space you're in unless given another. */
  addFavorite: (f: Omit<Favorite, 'id'>, spaceId?: string) => AddResult
  removeFavorite: (id: string, spaceId?: string) => void
  moveFavorite: (id: string, to: number, spaceId?: string) => void
  /** Fills in a favorite's missing title or icon from a page it opened. */
  learnFavorite: (id: string, page: { url: string; title?: string; favicon?: string }, spaceId?: string) => void
  setFavorites: (list: Favorite[], spaceId?: string) => void
}

const NONE: Favorite[] = []
const activeSpace = () => useBrowser.getState().activeSpaceId

/** Resolves once the session has loaded, so the spaces are known. */
const spacesReady = () =>
  new Promise<void>((resolve) => {
    if (useBrowser.getState().ready) return resolve()
    const off = useBrowser.subscribe((s) => {
      if (!s.ready) return
      off()
      resolve()
    })
  })

/** What goes to disk: private spaces and spaces that are gone are left out. */
function persistable(bySpace: FavoritesBySpace): FavoritesBySpace {
  const { spaces, ready } = useBrowser.getState()
  if (!ready) return bySpace
  const keep = new Set(spaces.filter((sp) => !sp.private).map((sp) => sp.id))
  return Object.fromEntries(Object.entries(bySpace).filter(([id]) => keep.has(id)))
}

export const useSettings = create<SettingsState>((set, get) => {
  const listOf = (spaceId: string) => get().favoritesBySpace[spaceId] ?? NONE
  const saveFavorites = (spaceId: string, list: Favorite[]) => {
    if (list === listOf(spaceId)) return
    const favoritesBySpace = { ...get().favoritesBySpace, [spaceId]: list }
    set({ favoritesBySpace, favorites: favoritesBySpace[activeSpace()] ?? NONE })
    window.gravity.favorites.set(persistable(favoritesBySpace))
  }
  return {
    ...DEFAULT_SETTINGS,
    loaded: false,
    favoritesBySpace: {},
    favorites: NONE,
    load: async () => {
      const [s, stored] = await Promise.all([window.gravity.settings.get(), window.gravity.favorites.get(), spacesReady()])
      let favoritesBySpace: FavoritesBySpace = stored && !Array.isArray(stored) ? stored : {}
      if (Array.isArray(stored)) {
        // Before spaces had their own favorites, one list served them all: each space keeps a copy.
        const spaces = useBrowser.getState().spaces.filter((sp) => !sp.private)
        favoritesBySpace = Object.fromEntries(spaces.map((sp) => [sp.id, stored]))
        window.gravity.favorites.set(favoritesBySpace)
      }
      set({ ...s, favoritesBySpace, favorites: favoritesBySpace[activeSpace()] ?? NONE, loaded: true })
    },
    update: async (patch) => {
      set(patch)
      const next = await window.gravity.settings.set(patch)
      set(next)
    },
    addFavorite: (f, spaceId = activeSpace()) => {
      const { list, result } = withFavorite(listOf(spaceId), { ...f, id: uid('f') })
      saveFavorites(spaceId, list)
      return result
    },
    removeFavorite: (id, spaceId = activeSpace()) =>
      saveFavorites(
        spaceId,
        listOf(spaceId).filter((f) => f.id !== id)
      ),
    moveFavorite: (id, to, spaceId = activeSpace()) => saveFavorites(spaceId, movedFavorite(listOf(spaceId), id, to)),
    learnFavorite: (id, page, spaceId = activeSpace()) => {
      const list = listOf(spaceId)
      const i = list.findIndex((f) => f.id === id)
      if (i === -1) return
      const next = learnedFavorite(list[i], page)
      if (next === list[i]) return
      saveFavorites(
        spaceId,
        list.map((f, j) => (j === i ? next : f))
      )
    },
    setFavorites: (list, spaceId = activeSpace()) => saveFavorites(spaceId, list)
  }
})

// Follow the space you're in, and forget the favorites of spaces that are removed.
useBrowser.subscribe((s, prev) => {
  if (s.activeSpaceId === prev.activeSpaceId && s.spaces === prev.spaces) return
  const S = useSettings.getState()
  const ids = new Set(s.spaces.map((sp) => sp.id))
  const gone = prev.ready && Object.keys(S.favoritesBySpace).some((id) => !ids.has(id))
  const favoritesBySpace = gone ? Object.fromEntries(Object.entries(S.favoritesBySpace).filter(([id]) => ids.has(id))) : S.favoritesBySpace
  const favorites = favoritesBySpace[s.activeSpaceId] ?? NONE
  if (favorites !== S.favorites || gone) useSettings.setState({ favoritesBySpace, favorites })
  if (gone && S.loaded) window.gravity.favorites.set(persistable(favoritesBySpace))
})
