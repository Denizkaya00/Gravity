import { create } from 'zustand'
import type { ArchivedTab, ClosedTab, SessionData, Space, Split, Tab } from '@shared/types'
import { uid } from '@/lib/id'

export interface BrowserTab extends Tab {
  /** Peek tabs float above the page and are hidden from the sidebar until expanded. */
  peek?: boolean
}

/**
 * Muted space colours. A space's colour only marks it (a small swatch and a
 * hairline), it never floods the interface.
 */
export const SPACE_COLORS = ['#8a857c', '#b4694a', '#74869c', '#7c9278', '#a88a52', '#8a7186']
const PRIVATE_COLOR = '#5f5a66'

const tone = (c: string): Space['theme']['colors'] => [c, c, c]

interface BrowserState {
  ready: boolean
  spaces: Space[]
  tabs: Record<string, BrowserTab>
  order: Record<string, string[]>
  activeSpaceId: string
  activeTabBySpace: Record<string, string | null>
  splits: Record<string, Split | null>
  closed: ClosedTab[]
  /** Direction of the last space switch, for the slide animation. */
  spaceDirection: 1 | -1

  hydrate: (data: SessionData | null) => void
  newTab: (url: string, opts?: { spaceId?: string; background?: boolean; afterId?: string; peek?: boolean }) => string
  closeTab: (id: string) => void
  activateTab: (id: string) => void
  /** Shows Home in the active space; its tabs stay open in the sidebar. */
  goHome: () => void
  updateTab: (id: string, patch: Partial<BrowserTab>) => void
  reorder: (spaceId: string, ids: string[]) => void
  togglePin: (id: string) => void
  reopenClosed: () => string | null
  expandPeek: (id: string) => void
  addSpace: (opts?: { private?: boolean }) => string
  updateSpace: (id: string, patch: Partial<Space>) => void
  removeSpace: (id: string) => void
  setActiveSpace: (id: string) => void
  cycleSpace: (dir: 1 | -1) => void
  setSplit: (spaceId: string, split: Split | null) => void
  archive: (ids: string[]) => ArchivedTab[]
}

function defaultSession(): SessionData {
  const home: Space = { id: uid('s'), name: 'Personal', emoji: '', theme: { colors: tone(SPACE_COLORS[0]) } }
  const work: Space = { id: uid('s'), name: 'Work', emoji: '', theme: { colors: tone(SPACE_COLORS[2]) } }
  return {
    version: 1,
    spaces: [home, work],
    tabs: [],
    order: { [home.id]: [], [work.id]: [] },
    activeSpaceId: home.id,
    activeTabBySpace: { [home.id]: null, [work.id]: null },
    splits: {},
    closed: []
  }
}

/** Most-recently-used other tab in the same space, for when the active one closes. */
function nextActive(state: BrowserState, spaceId: string, excluding: string): string | null {
  const candidates = (state.order[spaceId] ?? [])
    .filter((id) => id !== excluding && state.tabs[id] && !state.tabs[id].peek)
    .sort((a, b) => state.tabs[b].lastActiveAt - state.tabs[a].lastActiveAt)
  return candidates[0] ?? null
}

export const useBrowser = create<BrowserState>((set, get) => ({
  ready: false,
  spaces: [],
  tabs: {},
  order: {},
  activeSpaceId: '',
  activeTabBySpace: {},
  splits: {},
  closed: [],
  spaceDirection: 1,

  hydrate: (data) => {
    const s = data && data.version === 1 && data.spaces?.length ? data : defaultSession()
    const tabs: Record<string, BrowserTab> = {}
    for (const t of s.tabs) tabs[t.id] = t
    const order: Record<string, string[]> = {}
    for (const sp of s.spaces) order[sp.id] = (s.order[sp.id] ?? []).filter((id) => tabs[id])
    const activeSpaceId = s.spaces.some((sp) => sp.id === s.activeSpaceId) ? s.activeSpaceId : s.spaces[0].id
    set({
      ready: true,
      spaces: s.spaces,
      tabs,
      order,
      activeSpaceId,
      activeTabBySpace: s.activeTabBySpace ?? {},
      splits: s.splits ?? {},
      closed: s.closed ?? []
    })
  },

  newTab: (url, opts = {}) => {
    const state = get()
    const spaceId = opts.spaceId ?? state.activeSpaceId
    const id = uid('t')
    const now = Date.now()
    const tab: BrowserTab = {
      id,
      spaceId,
      url,
      title: url,
      pinned: false,
      createdAt: now,
      lastActiveAt: opts.background ? now - 1 : now,
      peek: opts.peek
    }
    const list = [...(state.order[spaceId] ?? [])]
    const anchor = opts.afterId ? list.indexOf(opts.afterId) : -1
    if (anchor >= 0) list.splice(anchor + 1, 0, id)
    else {
      // New tabs land at the top of the unpinned section, like Arc.
      const firstUnpinned = list.findIndex((tid) => !state.tabs[tid]?.pinned)
      list.splice(firstUnpinned === -1 ? list.length : firstUnpinned, 0, id)
    }
    set({
      tabs: { ...state.tabs, [id]: tab },
      order: { ...state.order, [spaceId]: list },
      activeTabBySpace:
        opts.background || opts.peek ? state.activeTabBySpace : { ...state.activeTabBySpace, [spaceId]: id }
    })
    return id
  },

  closeTab: (id) => {
    const state = get()
    const tab = state.tabs[id]
    if (!tab) return
    const { [id]: _removed, ...tabs } = state.tabs
    void _removed
    const order = { ...state.order, [tab.spaceId]: (state.order[tab.spaceId] ?? []).filter((t) => t !== id) }
    const activeTabBySpace = { ...state.activeTabBySpace }
    if (activeTabBySpace[tab.spaceId] === id) activeTabBySpace[tab.spaceId] = nextActive(state, tab.spaceId, id)
    const splits = { ...state.splits }
    const split = splits[tab.spaceId]
    if (split && (split.a === id || split.b === id)) {
      splits[tab.spaceId] = null
      activeTabBySpace[tab.spaceId] = split.a === id ? split.b : split.a
    }
    const space = state.spaces.find((s) => s.id === tab.spaceId)
    const closed =
      tab.peek || space?.private || !/^https?:/.test(tab.url)
        ? state.closed
        : [{ url: tab.url, title: tab.title, favicon: tab.favicon, spaceId: tab.spaceId, closedAt: Date.now() }, ...state.closed].slice(0, 25)
    set({ tabs, order, activeTabBySpace, splits, closed })
  },

  activateTab: (id) => {
    const state = get()
    const tab = state.tabs[id]
    if (!tab) return
    const now = Date.now()
    const prevSpace = state.activeSpaceId
    const idxPrev = state.spaces.findIndex((s) => s.id === prevSpace)
    const idxNext = state.spaces.findIndex((s) => s.id === tab.spaceId)
    set({
      tabs: { ...state.tabs, [id]: { ...tab, lastActiveAt: now } },
      activeSpaceId: tab.spaceId,
      spaceDirection: idxNext >= idxPrev ? 1 : -1,
      activeTabBySpace: { ...state.activeTabBySpace, [tab.spaceId]: id }
    })
  },

  goHome: () => {
    const state = get()
    if (!state.activeTabBySpace[state.activeSpaceId]) return
    set({ activeTabBySpace: { ...state.activeTabBySpace, [state.activeSpaceId]: null } })
  },

  updateTab: (id, patch) => {
    const tab = get().tabs[id]
    if (!tab) return
    set((s) => ({ tabs: { ...s.tabs, [id]: { ...tab, ...patch } } }))
  },

  reorder: (spaceId, ids) => set((s) => ({ order: { ...s.order, [spaceId]: ids } })),

  togglePin: (id) => {
    const state = get()
    const tab = state.tabs[id]
    if (!tab) return
    const pinned = !tab.pinned
    const list = (state.order[tab.spaceId] ?? []).filter((t) => t !== id)
    const lastPinned = list.reduce((acc, tid, i) => (state.tabs[tid]?.pinned ? i : acc), -1)
    list.splice(pinned ? lastPinned + 1 : lastPinned + 1, 0, id)
    set({
      tabs: { ...state.tabs, [id]: { ...tab, pinned } },
      order: { ...state.order, [tab.spaceId]: list }
    })
  },

  reopenClosed: () => {
    const state = get()
    const [last, ...rest] = state.closed
    if (!last) return null
    const spaceId = state.spaces.some((s) => s.id === last.spaceId) ? last.spaceId : state.activeSpaceId
    set({ closed: rest })
    const id = get().newTab(last.url, { spaceId })
    get().updateTab(id, { title: last.title, favicon: last.favicon })
    get().activateTab(id)
    return id
  },

  expandPeek: (id) => {
    const tab = get().tabs[id]
    if (!tab) return
    get().updateTab(id, { peek: false })
    get().activateTab(id)
  },

  addSpace: (opts = {}) => {
    const state = get()
    const id = uid('s')
    const n = state.spaces.length
    const space: Space = opts.private
      ? { id, name: 'Private', emoji: '', theme: { colors: tone(PRIVATE_COLOR) }, private: true }
      : { id, name: `Space ${n + 1}`, emoji: '', theme: { colors: tone(SPACE_COLORS[n % SPACE_COLORS.length]) } }
    set({
      spaces: [...state.spaces, space],
      order: { ...state.order, [id]: [] },
      activeTabBySpace: { ...state.activeTabBySpace, [id]: null },
      activeSpaceId: id,
      spaceDirection: 1
    })
    return id
  },

  updateSpace: (id, patch) => set((s) => ({ spaces: s.spaces.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)) })),

  removeSpace: (id) => {
    const state = get()
    if (state.spaces.length <= 1) return
    const tabs = { ...state.tabs }
    for (const tid of state.order[id] ?? []) delete tabs[tid]
    const spaces = state.spaces.filter((s) => s.id !== id)
    const { [id]: _o, ...order } = state.order
    void _o
    set({
      spaces,
      tabs,
      order,
      activeSpaceId: state.activeSpaceId === id ? spaces[0].id : state.activeSpaceId
    })
  },

  setActiveSpace: (id) => {
    const state = get()
    if (id === state.activeSpaceId || !state.spaces.some((s) => s.id === id)) return
    const a = state.spaces.findIndex((s) => s.id === state.activeSpaceId)
    const b = state.spaces.findIndex((s) => s.id === id)
    set({ activeSpaceId: id, spaceDirection: b > a ? 1 : -1 })
  },

  cycleSpace: (dir) => {
    const state = get()
    const i = state.spaces.findIndex((s) => s.id === state.activeSpaceId)
    const next = state.spaces[(i + dir + state.spaces.length) % state.spaces.length]
    if (next) {
      set({ activeSpaceId: next.id, spaceDirection: dir })
    }
  },

  setSplit: (spaceId, split) => set((s) => ({ splits: { ...s.splits, [spaceId]: split } })),

  archive: (ids) => {
    const state = get()
    const items: ArchivedTab[] = []
    for (const id of ids) {
      const t = state.tabs[id]
      if (!t || t.pinned) continue
      if (/^https?:/.test(t.url)) items.push({ url: t.url, title: t.title, favicon: t.favicon, spaceId: t.spaceId, archivedAt: Date.now() })
    }
    for (const id of ids) {
      if (!get().tabs[id]?.pinned) get().closeTab(id)
    }
    // Archived tabs should not also clutter "reopen closed tab".
    set((s) => ({ closed: s.closed.filter((c) => !items.some((i) => i.url === c.url && Date.now() - c.closedAt < 1000)) }))
    return items
  }
}))

/** The serializable snapshot written to disk (private spaces and peeks excluded). */
export function snapshot(s: BrowserState): SessionData {
  const privateIds = new Set(s.spaces.filter((sp) => sp.private).map((sp) => sp.id))
  const tabs = Object.values(s.tabs).filter((t) => !t.peek && !privateIds.has(t.spaceId))
  const spaces = s.spaces.filter((sp) => !sp.private)
  const order: Record<string, string[]> = {}
  for (const sp of spaces) order[sp.id] = (s.order[sp.id] ?? []).filter((id) => s.tabs[id] && !s.tabs[id].peek)
  return {
    version: 1,
    spaces,
    tabs: tabs.map(({ peek: _p, ...t }) => t),
    order,
    activeSpaceId: privateIds.has(s.activeSpaceId) ? (spaces[0]?.id ?? '') : s.activeSpaceId,
    activeTabBySpace: Object.fromEntries(Object.entries(s.activeTabBySpace).filter(([k]) => !privateIds.has(k))),
    splits: Object.fromEntries(Object.entries(s.splits).filter(([k]) => !privateIds.has(k))),
    closed: s.closed
  }
}

// ── selectors ───────────────────────────────────────────────────────────────
export const selectActiveSpace = (s: BrowserState): Space | undefined => s.spaces.find((sp) => sp.id === s.activeSpaceId)
export const selectActiveTabId = (s: BrowserState): string | null => s.activeTabBySpace[s.activeSpaceId] ?? null
export const selectActiveTab = (s: BrowserState): BrowserTab | null => {
  const id = selectActiveTabId(s)
  return id ? (s.tabs[id] ?? null) : null
}
export const selectSplit = (s: BrowserState): Split | null => {
  const split = s.splits[s.activeSpaceId]
  const active = selectActiveTabId(s)
  if (!split || !s.tabs[split.a] || !s.tabs[split.b]) return null
  return active === split.a || active === split.b ? split : null
}
export function isPrivateTab(tabId: string): boolean {
  const s = useBrowser.getState()
  const t = s.tabs[tabId]
  return !!t && !!s.spaces.find((sp) => sp.id === t.spaceId)?.private
}
