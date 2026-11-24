import type { OpenMode } from '@shared/types'
import { parseInput } from '@shared/url'
import { selectActiveTabId, useBrowser } from '@/state/browser'
import { useRuntime } from '@/state/runtime'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { page } from './registry'
import { useBlackHole } from '@/features/blackhole/store'

export function activeTabId(): string | null {
  return selectActiveTabId(useBrowser.getState())
}

export function resolveInput(input: string): string {
  return parseInput(input, useSettings.getState().searchEngine).url
}

/** Opens a URL in one of Gravity's four ways. */
export function openUrl(url: string, mode: OpenMode, origin?: { x: number; y: number }): string | null {
  const B = useBrowser.getState()
  const active = activeTabId()
  switch (mode) {
    case 'foreground': {
      const id = B.newTab(url, { afterId: active ?? undefined })
      B.activateTab(id)
      return id
    }
    case 'background': {
      const id = B.newTab(url, { background: true, afterId: active ?? undefined })
      useUI.getState().toast('Opened in background', 'check')
      return id
    }
    case 'peek': {
      const current = useUI.getState().peek
      if (current) closeTab(current.tabId)
      const id = B.newTab(url, { peek: true })
      useUI.getState().set({
        peek: { tabId: id, origin: origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 } },
        command: { ...useUI.getState().command, open: false }
      })
      return id
    }
    case 'split': {
      const id = B.newTab(url, { background: true, afterId: active ?? undefined })
      if (active && !B.tabs[active]?.peek) {
        B.setSplit(B.activeSpaceId, { a: active, b: id, ratio: 0.5 })
      }
      useBrowser.getState().activateTab(id)
      return id
    }
  }
}

/** What the Command Bar does with typed text. */
export function submitInput(input: string, mode: OpenMode | 'replace'): void {
  const url = resolveInput(input)
  const active = activeTabId()
  if (mode === 'replace' && active) {
    useBrowser.getState().updateTab(active, { url })
    page.load(active, url)
    page.focus(active)
    return
  }
  openUrl(url, mode === 'replace' ? 'foreground' : mode)
}

export function closeTab(id: string): void {
  const ui = useUI.getState()
  if (ui.peek?.tabId === id) ui.set({ peek: null })
  if (ui.fullscreenTab === id) ui.set({ fullscreenTab: null })
  useBrowser.getState().closeTab(id)
  useRuntime.getState().forget(id)
  // Whatever you close falls in: the disk flares a little.
  useBlackHole.getState().flare(0.45)
}

export function closePeek(): void {
  const peek = useUI.getState().peek
  if (peek) closeTab(peek.tabId)
}

/** The tab you were last on in the active space, if any. */
export function lastTabId(): string | null {
  const B = useBrowser.getState()
  const list = (B.order[B.activeSpaceId] ?? []).filter((id) => B.tabs[id] && !B.tabs[id].peek)
  return list.sort((a, b) => B.tabs[b].lastActiveAt - B.tabs[a].lastActiveAt)[0] ?? null
}

/**
 * Home without closing anything: the page steps aside and its tab stays in the
 * sidebar. Pressed again on Home, it returns to the page you came from.
 */
export function toggleHome(): void {
  const ui = useUI.getState()
  if (ui.overview) return
  if (ui.command.open) ui.closeCommand()
  if (ui.peek) closePeek()
  const B = useBrowser.getState()
  if (activeTabId()) {
    ui.set({ findOpen: false })
    B.goHome()
    return
  }
  const last = lastTabId()
  if (last) B.activateTab(last)
}

export function expandPeek(): void {
  const peek = useUI.getState().peek
  if (!peek) return
  useUI.getState().set({ peek: null })
  useBrowser.getState().expandPeek(peek.tabId)
}

export function peekToSplit(): void {
  const peek = useUI.getState().peek
  const B = useBrowser.getState()
  const active = activeTabId()
  if (!peek) return
  useUI.getState().set({ peek: null })
  B.expandPeek(peek.tabId)
  if (active) {
    B.setSplit(B.activeSpaceId, { a: active, b: peek.tabId, ratio: 0.5 })
    B.activateTab(peek.tabId)
  }
}

export function toggleSplit(): void {
  const B = useBrowser.getState()
  const active = activeTabId()
  const spaceId = B.activeSpaceId
  const split = B.splits[spaceId]
  if (split && active && (split.a === active || split.b === active)) {
    B.setSplit(spaceId, null)
    return
  }
  if (!active) return
  const partner = (B.order[spaceId] ?? [])
    .filter((id) => id !== active && B.tabs[id] && !B.tabs[id].peek)
    .sort((a, b) => B.tabs[b].lastActiveAt - B.tabs[a].lastActiveAt)[0]
  if (partner) B.setSplit(spaceId, { a: active, b: partner, ratio: 0.5 })
  else useUI.getState().openCommand('split')
}

export function splitWith(tabId: string, side: 'left' | 'right'): void {
  const B = useBrowser.getState()
  const active = activeTabId()
  if (!active || active === tabId) return
  const tab = B.tabs[tabId]
  if (!tab) return
  if (tab.spaceId !== B.activeSpaceId) return
  B.setSplit(B.activeSpaceId, side === 'left' ? { a: tabId, b: active, ratio: 0.5 } : { a: active, b: tabId, ratio: 0.5 })
  B.activateTab(tabId)
}

export function cycleTab(dir: 1 | -1): void {
  const B = useBrowser.getState()
  const list = (B.order[B.activeSpaceId] ?? []).filter((id) => !B.tabs[id]?.peek)
  if (!list.length) return
  const active = activeTabId()
  const i = active ? list.indexOf(active) : -1
  const next = list[(i + dir + list.length) % list.length]
  B.activateTab(next)
}

export function selectTabIndex(n: number): void {
  const B = useBrowser.getState()
  const list = (B.order[B.activeSpaceId] ?? []).filter((id) => !B.tabs[id]?.peek)
  const id = n === -1 ? list[list.length - 1] : list[n]
  if (id) B.activateTab(id)
}

export function copyActiveUrl(): void {
  const id = activeTabId()
  const url = id ? useBrowser.getState().tabs[id]?.url : undefined
  if (!url) return
  window.gravity.copy(url)
  useUI.getState().toast('Copied page URL', 'copy')
}

/** Sweeps every unpinned tab in the active space into the Archive. */
export function clearSpace(): void {
  const B = useBrowser.getState()
  const ids = (B.order[B.activeSpaceId] ?? []).filter((id) => !B.tabs[id]?.pinned && !B.tabs[id]?.peek)
  if (!ids.length) return
  const items = B.archive(ids)
  for (const id of ids) useRuntime.getState().forget(id)
  if (items.length) window.gravity.archive.add(items)
  useBlackHole.getState().flare(Math.min(1, 0.3 + ids.length * 0.12))
  useUI.getState().toast(`Archived ${ids.length} tab${ids.length === 1 ? '' : 's'}`, 'archive')
}
