import { useEffect, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { GUEST } from '@shared/ipc'
import { isPrivateTab, useBrowser } from '@/state/browser'
import { runtimeOf, useRuntime } from '@/state/runtime'
import { useSlots, useUI } from '@/state/ui'
import { page, registry } from './registry'
import { openUrl } from './actions'
import { swipe } from '@/features/swipe/swipeStore'
import { pinch } from '@/features/pinch/pinchStore'

type AnyEvent = Event & Record<string, unknown>

/** Sends a page visit to history unless the tab lives in a private space. */
function recordVisit(id: string, url: string, meta = false) {
  if (isPrivateTab(id)) return
  const tab = useBrowser.getState().tabs[id]
  window.gravity.history.add({ url, title: tab?.title, favicon: tab?.favicon, meta })
}

/**
 * Hosts one <webview> and translates its events into store updates.
 * The `src` attribute is only used for the first load; later navigations go
 * through `loadURL` so re-renders never reload the page.
 */
export function TabView({ id }: { id: string }) {
  const ref = useRef<WebviewTag>(null)
  const [src] = useState(() => useBrowser.getState().tabs[id]?.url || 'about:blank')
  const [partition] = useState(() => (isPrivateTab(id) ? 'gravity-private' : 'persist:gravity'))

  useEffect(() => {
    const wv = ref.current
    if (!wv) return
    registry.set(id, wv)
    const patch = useRuntime.getState().patch
    const updateTab = useBrowser.getState().updateTab
    const syncNav = () => {
      try {
        patch(id, { canGoBack: wv.canGoBack(), canGoForward: wv.canGoForward() })
      } catch {
        /* not ready */
      }
    }
    let thumbTimer: ReturnType<typeof setTimeout> | null = null

    const handlers: Record<string, (e: AnyEvent) => void> = {
      'dom-ready': () => {
        registry.markReady(id)
        const rt = runtimeOf(id)
        patch(id, { webContentsId: wv.getWebContentsId() })
        if (rt.zoom) wv.setZoomLevel(rt.zoom)
        if (rt.muted) wv.setAudioMuted(true)
        syncNav()
      },
      'did-start-loading': () => patch(id, { loading: true, error: undefined, crashed: false }),
      'did-stop-loading': () => {
        patch(id, { loading: false, loadedTick: runtimeOf(id).loadedTick + 1 })
        syncNav()
        if (thumbTimer) clearTimeout(thumbTimer)
        thumbTimer = setTimeout(() => {
          if (useUI.getState().overview) return
          const active = useBrowser.getState().activeTabBySpace[useBrowser.getState().activeSpaceId]
          if (active === id) void page.capture(id)
        }, 900)
      },
      'did-navigate': (e) => {
        const url = String(e.url)
        updateTab(id, { url })
        patch(id, { blocked: 0, hoverUrl: undefined })
        syncNav()
        recordVisit(id, url)
      },
      'did-navigate-in-page': (e) => {
        if (!e.isMainFrame) return
        const url = String(e.url)
        updateTab(id, { url })
        syncNav()
        recordVisit(id, url)
      },
      'page-title-updated': (e) => {
        const title = String(e.title)
        updateTab(id, { title })
        const url = useBrowser.getState().tabs[id]?.url
        if (url) recordVisit(id, url, true)
      },
      'page-favicon-updated': (e) => {
        const favicons = e.favicons as string[]
        const favicon = favicons?.[0]
        if (!favicon) return
        updateTab(id, { favicon })
        void window.gravity.faviconColor(favicon).then((c) => {
          if (c) patch(id, { faviconColor: c })
        })
      },
      'did-change-theme-color': (e) => patch(id, { themeColor: (e.themeColor as string | null) ?? undefined }),
      'did-fail-load': (e) => {
        const code = Number(e.errorCode)
        if (!e.isMainFrame || code === -3) return
        patch(id, {
          loading: false,
          error: { code, description: String(e.errorDescription), url: String(e.validatedURL) }
        })
      },
      'render-process-gone': () => patch(id, { crashed: true, loading: false }),
      'media-started-playing': () => patch(id, { audible: true }),
      'media-paused': () => patch(id, { audible: false }),
      'found-in-page': (e) => {
        const r = e.result as { activeMatchOrdinal: number; matches: number }
        patch(id, { find: { active: r.activeMatchOrdinal, matches: r.matches } })
      },
      'update-target-url': (e) => patch(id, { hoverUrl: (e.url as string) || undefined }),
      'enter-html-full-screen': () => useUI.getState().set({ fullscreenTab: id }),
      'leave-html-full-screen': () => useUI.getState().set({ fullscreenTab: null }),
      'ipc-message': (e) => {
        const channel = e.channel as string
        const [payload] = (e.args as unknown[]) ?? []
        if (channel === GUEST.swipe) swipe.push(id, (payload as { deltaX: number }).deltaX)
        if (channel === GUEST.peek) {
          const p = payload as { url: string; x: number; y: number }
          const rect = wv.getBoundingClientRect()
          openUrl(p.url, 'peek', { x: rect.left + p.x, y: rect.top + p.y })
        }
      },
      focus: () => {
        // Clicking into the other half of a split view makes it the active tab.
        const s = useBrowser.getState()
        const tab = s.tabs[id]
        if (!tab || tab.peek) return
        const split = s.splits[tab.spaceId]
        if (split && (split.a === id || split.b === id) && s.activeTabBySpace[tab.spaceId] !== id) s.activateTab(id)
      }
    }

    // A trackpad pinch never reaches the page: Chromium hands it to the outermost frame, this UI,
    // as wheel events with ctrlKey aimed at the <webview>. (Plain scrolls and ⌃-scroll go to the page.)
    const el: HTMLElement = wv
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) pinch.push(id, e.deltaY)
    }

    for (const [name, fn] of Object.entries(handlers)) wv.addEventListener(name, fn as EventListener)
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      if (thumbTimer) clearTimeout(thumbTimer)
      for (const [name, fn] of Object.entries(handlers)) wv.removeEventListener(name, fn as EventListener)
      el.removeEventListener('wheel', onWheel)
      registry.delete(id)
    }
  }, [id])

  return <webview ref={ref as never} src={src} partition={partition} allowpopups={'true' as unknown as boolean} />
}

/** Keeps the 'full' slot (HTML fullscreen video) the size of the window. */
export function useFullSlot() {
  const setRect = useSlots((s) => s.setRect)
  useEffect(() => {
    const update = () => setRect('full', { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [setRect])
}
