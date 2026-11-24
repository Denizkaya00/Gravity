import { create } from 'zustand'
import { pinchProgress, settleZoom, startPinch, updatePinch, zoomLabel, type Pinch } from '@shared/zoom'
import { page } from '@/browser/registry'
import { useBrowser } from '@/state/browser'
import { useUI } from '@/state/ui'
import { openOverview } from '@/features/overview/openOverview'

/** Holding still this long with the Gravity Well armed opens it. */
const COMMIT_MS = 160
/**
 * Pinch wheel events carry no begin or end, and the trackpad sends nothing
 * while the fingers rest, so a gesture is over after this much quiet. A shorter
 * pause mid-pinch continues the same gesture.
 */
const END_MS = 450

interface PinchState {
  tabId: string | null
  /** 0–1 toward the Gravity Well. At 1, holding still or letting go opens it. */
  progress: number
}

export const usePinch = create<PinchState>(() => ({ tabId: null, progress: 0 }))

let gesture: { tabId: string; pinch: Pinch } | null = null
let commitTimer: ReturnType<typeof setTimeout> | null = null
let endTimer: ReturnType<typeof setTimeout> | null = null
let frame: number | null = null

/** Only a page in the main or split slot can fall into the Gravity Well, not Peek or fullscreen video. */
function canOverview(tabId: string): boolean {
  const ui = useUI.getState()
  if (ui.overview || ui.peek?.tabId === tabId || ui.fullscreenTab === tabId) return false
  return !useBrowser.getState().tabs[tabId]?.peek
}

function applyZoom() {
  frame = null
  if (gesture?.pinch.mode === 'zoom') page.setZoom(gesture.tabId, gesture.pinch.level)
}

function end() {
  if (commitTimer) clearTimeout(commitTimer)
  if (endTimer) clearTimeout(endTimer)
  if (frame !== null) cancelAnimationFrame(frame)
  commitTimer = endTimer = frame = null
  const g = gesture
  gesture = null
  usePinch.setState({ tabId: null, progress: 0 })
  if (g?.pinch.mode !== 'zoom') return
  const level = settleZoom(g.pinch.level)
  page.setZoom(g.tabId, level)
  if (level !== g.pinch.start) useUI.getState().toast(zoomLabel(level), 'check')
}

function commit() {
  commitTimer = null
  const g = gesture
  if (g?.pinch.mode !== 'overview' || pinchProgress(g.pinch) < 1 || !canOverview(g.tabId)) return
  end()
  void openOverview()
}

export const pinch = {
  /** One step of a trackpad pinch over a page: the `deltaY` of a wheel event with `ctrlKey`. */
  push(tabId: string, deltaY: number) {
    if (gesture && gesture.tabId !== tabId) end()
    if (!gesture) gesture = { tabId, pinch: startPinch(page.zoomLevel(tabId)) }
    gesture.pinch = updatePinch(gesture.pinch, deltaY, canOverview(tabId))
    const progress = pinchProgress(gesture.pinch)
    const s = usePinch.getState()
    if (s.tabId !== tabId || s.progress !== progress) usePinch.setState({ tabId, progress })
    // Zooming re-lays out the page, so do it at most once a frame.
    if (gesture.pinch.mode === 'zoom' && frame === null) frame = requestAnimationFrame(applyZoom)
    if (commitTimer) clearTimeout(commitTimer)
    if (endTimer) clearTimeout(endTimer)
    commitTimer = setTimeout(commit, COMMIT_MS)
    endTimer = setTimeout(end, END_MS)
  }
}
