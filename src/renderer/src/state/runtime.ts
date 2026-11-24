import { create } from 'zustand'

export interface TabRuntime {
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  themeColor?: string
  faviconColor?: string
  thumbnail?: string
  error?: { code: number; description: string; url: string }
  crashed?: boolean
  audible?: boolean
  muted?: boolean
  blocked: number
  webContentsId?: number
  zoom: number
  hoverUrl?: string
  find?: { active: number; matches: number }
  /** Increments every time a load finishes; drives the "finished" shimmer. */
  loadedTick: number
  /** When this tab last retried a failed page on a new Tor exit. */
  tunnelRetryAt?: number
}

const blank = (): TabRuntime => ({
  loading: false,
  canGoBack: false,
  canGoForward: false,
  blocked: 0,
  zoom: 0,
  loadedTick: 0
})

/** How many live webviews we keep before the least-recently-used ones go to sleep. */
export const MAX_LIVE_TABS = 12

interface RuntimeState {
  tabs: Record<string, TabRuntime>
  /** Tabs with a live <webview>, most recently used first. */
  mounted: string[]
  patch: (id: string, patch: Partial<TabRuntime>) => void
  get: (id: string) => TabRuntime
  mount: (id: string, keep?: string[]) => void
  unmount: (id: string) => void
  forget: (id: string) => void
  byWebContents: (wcId: number) => string | undefined
}

export const useRuntime = create<RuntimeState>((set, get) => ({
  tabs: {},
  mounted: [],
  patch: (id, patch) =>
    set((s) => ({ tabs: { ...s.tabs, [id]: { ...(s.tabs[id] ?? blank()), ...patch } } })),
  get: (id) => get().tabs[id] ?? blank(),
  mount: (id, keep = []) =>
    set((s) => {
      if (s.mounted[0] === id) return s
      const next = [id, ...s.mounted.filter((m) => m !== id)]
      // Evict the oldest tabs that are not protected (split partners, audio, peek).
      while (next.length > MAX_LIVE_TABS) {
        const victimIdx = [...next].reverse().findIndex((m) => !keep.includes(m) && !s.tabs[m]?.audible)
        if (victimIdx === -1) break
        next.splice(next.length - 1 - victimIdx, 1)
      }
      return { mounted: next }
    }),
  unmount: (id) => set((s) => ({ mounted: s.mounted.filter((m) => m !== id) })),
  forget: (id) =>
    set((s) => {
      const { [id]: _gone, ...tabs } = s.tabs
      void _gone
      return { tabs, mounted: s.mounted.filter((m) => m !== id) }
    }),
  byWebContents: (wcId) => {
    const entry = Object.entries(get().tabs).find(([, r]) => r.webContentsId === wcId)
    return entry?.[0]
  }
}))

export const runtimeOf = (id: string | null | undefined): TabRuntime =>
  (id && useRuntime.getState().tabs[id]) || blank()
