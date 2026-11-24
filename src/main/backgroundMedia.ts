import { webContents, type WebContents } from 'electron'

/**
 * Video in a tab that has left view pauses, and plays on when the tab comes back.
 *
 * Background tabs stay mounted (see Memory in docs/ARCHITECTURE.md) and are only hidden, so
 * without this their pages keep playing. Video is paused rather than the tab muted: a video
 * you can't see has nothing to offer, and muting would let it run on past what you missed.
 * Sound-only playback (music, podcasts, a `<video>` with no picture) keeps going, as in any
 * browser; the sidebar shows those tabs with a speaker to mute them. Video in
 * picture-in-picture keeps going too, since it's still in view.
 */

/** Guest webContents ids of tabs that are out of view. */
const hidden = new Set<number>()
const watched = new WeakSet<WebContents>()

/**
 * Runs inside every frame of the page (main world: an iframe embed is a different origin and
 * Gravity's preload only runs in the top frame). Must stay self-contained: it is sent as source.
 */
function frameScript(hide: boolean): void {
  type State = { hidden: boolean; held: HTMLVideoElement[] }
  const key = Symbol.for('gravity.background-media')
  const w = window as unknown as Record<symbol, State | undefined>
  let state = w[key]

  const hold = (el: EventTarget | null) => {
    if (!state || !(el instanceof HTMLVideoElement) || el.paused) return
    if (el === document.pictureInPictureElement) return
    if (el.readyState >= 1 && el.videoWidth === 0) return // sound only
    el.pause()
    if (!state.held.includes(el)) state.held.push(el)
  }

  if (!state) {
    const created: State = { hidden: false, held: [] }
    state = created
    Object.defineProperty(window, key, { value: created })
    // Video that starts while the tab is away (autoplay, the next episode) waits as well.
    document.addEventListener('playing', (e) => created.hidden && hold(e.target), true)
  }

  state.hidden = hide
  if (hide) {
    const videos: HTMLVideoElement[] = []
    const collect = (root: Document | ShadowRoot) => {
      videos.push(...root.querySelectorAll('video'))
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collect(el.shadowRoot)
    }
    collect(document)
    for (const v of videos) hold(v)
  } else {
    for (const v of state.held.splice(0)) if (v.paused && v.isConnected) void v.play().catch(() => undefined)
  }
}

function apply(contents: WebContents, hide: boolean): void {
  if (contents.isDestroyed()) return
  const code = `(${frameScript.toString()})(${hide})`
  for (const frame of contents.mainFrame.framesInSubtree) {
    if (frame.detached) continue
    frame.executeJavaScript(code).catch(() => undefined)
  }
}

function watch(contents: WebContents): void {
  if (watched.has(contents)) return
  watched.add(contents)
  const id = contents.id
  // Covers pages that load while the tab is away, and video in frames added since it left.
  contents.on('media-started-playing', () => {
    if (hidden.has(id)) apply(contents, true)
  })
  contents.once('destroyed', () => hidden.delete(id))
}

/** The UI reports when a tab enters or leaves view (any slot: main, either half of a split, Peek, fullscreen). */
export function setTabInView(host: WebContents, webContentsId: number, inView: boolean): void {
  const contents = webContents.fromId(webContentsId)
  // Only the UI's own pages.
  if (!contents || contents.isDestroyed() || contents.hostWebContents !== host) return
  watch(contents)
  if (inView === !hidden.has(webContentsId)) return
  if (inView) hidden.delete(webContentsId)
  else hidden.add(webContentsId)
  apply(contents, !inView)
}
