import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Favorite, type Settings } from '@shared/types'
import { uid } from '@/lib/id'

interface SettingsState extends Settings {
  loaded: boolean
  favorites: Favorite[]
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
  addFavorite: (f: Omit<Favorite, 'id'>) => void
  removeFavorite: (id: string) => void
  setFavorites: (list: Favorite[]) => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  favorites: [],
  load: async () => {
    const [s, favorites] = await Promise.all([window.gravity.settings.get(), window.gravity.favorites.get()])
    set({ ...s, favorites, loaded: true })
  },
  update: async (patch) => {
    set(patch)
    const next = await window.gravity.settings.set(patch)
    set(next)
  },
  addFavorite: (f) => {
    if (get().favorites.some((x) => x.url === f.url)) return
    const favorites = [...get().favorites, { ...f, id: uid('f') }].slice(0, 12)
    set({ favorites })
    window.gravity.favorites.set(favorites)
  },
  removeFavorite: (id) => {
    const favorites = get().favorites.filter((f) => f.id !== id)
    set({ favorites })
    window.gravity.favorites.set(favorites)
  },
  setFavorites: (favorites) => {
    set({ favorites })
    window.gravity.favorites.set(favorites)
  }
}))
