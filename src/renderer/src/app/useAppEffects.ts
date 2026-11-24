import { useEffect } from 'react'
import type { CommandEvent, MenuCommand } from '@shared/types'
import { selectActiveSpace, snapshot, useBrowser } from '@/state/browser'
import { runtimeOf, useRuntime } from '@/state/runtime'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import {
  activeTabId,
  closePeek,
  closeTab,
  copyActiveUrl,
  cycleTab,
  openUrl,
  selectTabIndex,
  toggleSplit
} from '@/browser/actions'
import { page } from '@/browser/registry'
import { openOverview } from '@/features/overview/openOverview'
import { findAgain } from '@/features/find/FindBar'

/** Closes the top-most overlay. Returns true if something was closed. */
export function closeTopOverlay(): boolean {
  const ui = useUI.getState()
  if (ui.command.open) return ui.closeCommand(), true
  if (ui.cheatsheet) return ui.set({ cheatsheet: false }), true
  if (ui.settingsOpen) return ui.set({ settingsOpen: false }), true
  if (ui.downloadsOpen) return ui.set({ downloadsOpen: false }), true
  if (ui.peek) return closePeek(), true
  if (ui.findOpen) return ui.set({ findOpen: false }), true
  return false
}

const zoomLabel = (level: number) => `Zoom ${Math.round(Math.pow(1.2, level) * 100)}%`

function handleCommand({ command, arg }: CommandEvent) {
  const B = useBrowser.getState()
  const ui = useUI.getState()
  const settings = useSettings.getState()
  const id = activeTabId()
  const handlers: Record<MenuCommand, () => void> = {
    'new-tab': () => ui.openCommand('new'),
    'open-location': () => ui.openCommand(id ? 'edit' : 'new'),
    'close-tab': () => {
      if (ui.command.open) return ui.closeCommand()
      if (ui.peek) return closePeek()
      if (ui.overview) return
      if (id) closeTab(id)
    },
    'reopen-tab': () => void B.reopenClosed(),
    'next-tab': () => cycleTab(1),
    'prev-tab': () => cycleTab(-1),
    'select-tab': () => selectTabIndex(Number(arg ?? 0)),
    'select-space': () => {
      const sp = B.spaces[Number(arg ?? 0)]
      if (sp) B.setActiveSpace(sp.id)
    },
    'next-space': () => B.cycleSpace(1),
    'prev-space': () => B.cycleSpace(-1),
    'new-space': () => void B.addSpace({ private: arg === 'private' }),
    back: () => id && page.back(id),
    forward: () => id && page.forward(id),
    reload: () => id && page.reload(id),
    'hard-reload': () => id && page.hardReload(id),
    stop: () => id && page.stop(id),
    'zoom-in': () => id && ui.toast(zoomLabel(page.zoom(id, 1)), 'check'),
    'zoom-out': () => id && ui.toast(zoomLabel(page.zoom(id, -1)), 'check'),
    'zoom-reset': () => id && ui.toast(zoomLabel(page.zoom(id, 0)), 'check'),
    find: () => id && ui.set({ findOpen: true }),
    'find-next': () => id && findAgain(true),
    'find-prev': () => id && findAgain(false),
    'toggle-sidebar': () => void settings.update({ sidebarCollapsed: !settings.sidebarCollapsed }),
    'focus-mode': () => ui.set({ focusMode: !ui.focusMode }),
    'tab-overview': () => (ui.overview ? undefined : void openOverview()),
    'toggle-split': () => toggleSplit(),
    'copy-url': () => copyActiveUrl(),
    'pin-tab': () => {
      if (!id) return
      B.togglePin(id)
      ui.toast(B.tabs[id]?.pinned ? 'Unpinned' : 'Pinned', 'check')
    },
    settings: () => ui.set({ settingsOpen: !ui.settingsOpen }),
    devtools: () => id && page.devtools(id),
    print: () => id && page.print(id),
    cheatsheet: () => ui.set({ cheatsheet: !ui.cheatsheet }),
    downloads: () => ui.set({ downloadsOpen: !ui.downloadsOpen }),
    escape: () => {
      // Escape pressed inside a page only closes Peek (pages use Escape too).
      const peek = ui.peek
      if (!peek) return
      const wcId = typeof arg === 'number' ? arg : undefined
      if (wcId === undefined || runtimeOf(peek.tabId).webContentsId === wcId) closePeek()
    }
  }
  handlers[command]?.()
}

/** Everything that keeps the renderer in sync with the main process and the OS. */
export function useAppEffects() {
  const ready = useBrowser((s) => s.ready)

  // Boot: settings, session, and wiring for every main-process event.
  useEffect(() => {
    void useSettings.getState().load()
    void window.gravity.session.load().then((data) => useBrowser.getState().hydrate(data))

    const offs = [
      window.gravity.onCommand(handleCommand),
      window.gravity.onOpenUrl((r) => openUrl(r.url, r.mode)),
      window.gravity.shield.onBlocked(({ webContentsId, count }) => {
        const id = useRuntime.getState().byWebContents(webContentsId)
        if (id) useRuntime.getState().patch(id, { blocked: runtimeOf(id).blocked + count })
      }),
      window.gravity.downloads.onUpdate((d) => useUI.getState().upsertDownload(d)),
      window.gravity.permissions.onRequest((r) => useUI.getState().set({ permissions: [...useUI.getState().permissions, r] })),
      window.gravity.onWindowState((s) => useUI.getState().set({ windowFullscreen: s.fullscreen }))
    ]
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useUI.getState().overview && closeTopOverlay()) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Persist the session (debounced).
  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = useBrowser.subscribe((s) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => window.gravity.session.save(snapshot(s)), 400)
    })
    return () => {
      unsub()
      if (timer) clearTimeout(timer)
    }
  }, [ready])

  // Auto-archive tabs nobody has looked at in a while.
  useEffect(() => {
    if (!ready) return
    const sweep = () => {
      const hours = useSettings.getState().archiveAfterHours
      if (!useSettings.getState().loaded || hours >= 168) return
      const B = useBrowser.getState()
      const active = new Set(Object.values(B.activeTabBySpace))
      const cutoff = Date.now() - hours * 3600_000
      const stale = Object.values(B.tabs)
        .filter((t) => !t.pinned && !t.peek && !active.has(t.id) && t.lastActiveAt < cutoff)
        .map((t) => t.id)
      if (!stale.length) return
      const items = B.archive(stale)
      stale.forEach((id) => useRuntime.getState().forget(id))
      if (items.length) window.gravity.archive.add(items)
    }
    const first = setTimeout(sweep, 3000)
    const timer = setInterval(sweep, 30 * 60_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [ready])

  // Theme, accent, space colours and the per-site tint.
  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  const space = useBrowser(selectActiveSpace)

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      root.classList.toggle('dark', dark)
      root.classList.toggle('light', !dark)
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent', accent)
    const colors = space?.theme.colors
    if (colors) {
      root.style.setProperty('--space-a', colors[0])
      root.style.setProperty('--space-b', colors[1])
      root.style.setProperty('--space-c', colors[2])
    }
    // The accent is the only colour in the chrome; site colours are not allowed to flood it.
    root.style.setProperty('--tint', accent)
  }, [accent, space])

  // Native traffic lights follow the sidebar.
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const focus = useUI((s) => s.focusMode)
  const hover = useUI((s) => s.sidebarHover)
  const fullscreenTab = useUI((s) => s.fullscreenTab)
  useEffect(() => {
    window.gravity.setTrafficLights(!fullscreenTab && (!(collapsed || focus) || hover))
  }, [collapsed, focus, hover, fullscreenTab])
}
