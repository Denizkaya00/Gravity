import type { WebviewTag } from 'electron'
import { stepZoom } from '@shared/zoom'
import { useRuntime } from '@/state/runtime'

/**
 * The single place that knows about live <webview> elements. Everything else
 * talks to pages through these helpers, which keeps the rest of the app
 * independent of the embedding technology (it could become WebContentsView).
 */
const views = new Map<string, WebviewTag>()
const ready = new Set<string>()

export const registry = {
  set(id: string, wv: WebviewTag) {
    views.set(id, wv)
  },
  delete(id: string) {
    views.delete(id)
    ready.delete(id)
  },
  markReady(id: string) {
    ready.add(id)
  },
  get(id: string | null | undefined): WebviewTag | undefined {
    if (!id || !ready.has(id)) return undefined
    return views.get(id)
  }
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}

export const page = {
  load(id: string, url: string) {
    const wv = registry.get(id)
    if (wv) void wv.loadURL(url).catch(() => undefined)
  },
  back: (id: string) => safe(() => registry.get(id)?.goBack()),
  forward: (id: string) => safe(() => registry.get(id)?.goForward()),
  reload: (id: string) => safe(() => registry.get(id)?.reload()),
  hardReload: (id: string) => safe(() => registry.get(id)?.reloadIgnoringCache()),
  stop: (id: string) => safe(() => registry.get(id)?.stop()),
  print: (id: string) => safe(() => void registry.get(id)?.print()),
  devtools: (id: string) => safe(() => registry.get(id)?.openDevTools()),
  focus: (id: string) => safe(() => registry.get(id)?.focus()),
  setMuted(id: string, muted: boolean) {
    safe(() => registry.get(id)?.setAudioMuted(muted))
    useRuntime.getState().patch(id, { muted })
  },
  /** ⌘+ / ⌘− / ⌘0. Returns the new level. */
  zoom(id: string, dir: 1 | -1 | 0) {
    const wv = registry.get(id)
    if (!wv) return 0
    const next = stepZoom(safe(() => wv.getZoomLevel()) ?? 0, dir)
    page.setZoom(id, next)
    return next
  },
  zoomLevel: (id: string): number => safe(() => registry.get(id)?.getZoomLevel()) ?? useRuntime.getState().get(id).zoom,
  /** Sets the zoom level directly, for trackpad pinch. */
  setZoom(id: string, level: number) {
    const wv = registry.get(id)
    if (!wv) return
    safe(() => wv.setZoomLevel(level))
    useRuntime.getState().patch(id, { zoom: level })
  },
  find(id: string, text: string, opts: { forward?: boolean; findNext?: boolean } = {}) {
    const wv = registry.get(id)
    if (!wv || !text) return
    safe(() => wv.findInPage(text, { forward: opts.forward ?? true, findNext: opts.findNext ?? false }))
  },
  stopFind(id: string) {
    safe(() => registry.get(id)?.stopFindInPage('clearSelection'))
    useRuntime.getState().patch(id, { find: undefined })
  },
  url: (id: string): string | undefined => safe(() => registry.get(id)?.getURL()),

  /** Takes a small screenshot of a visible page for the Gravity Well and sleeping tabs. */
  async capture(id: string, width = 560): Promise<string | undefined> {
    const wv = registry.get(id)
    if (!wv) return undefined
    try {
      const img = await wv.capturePage()
      if (img.isEmpty()) return undefined
      const data = img.resize({ width, quality: 'good' }).toDataURL()
      useRuntime.getState().patch(id, { thumbnail: data })
      return data
    } catch {
      return undefined
    }
  }
}
