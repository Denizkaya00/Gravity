/**
 * Page zoom, shared by the keyboard (⌘+ / ⌘− / ⌘0) and trackpad pinch.
 * Levels are Chromium zoom levels: the zoom factor is 1.2 ^ level, so 0 is 100%.
 */
export const ZOOM_MIN = -4 // 48%
export const ZOOM_MAX = 5 // 249%
/** ⌘+ and ⌘− move between multiples of this. */
export const ZOOM_STEP = 0.5

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const zoomPercent = (level: number): number => Math.round(Math.pow(1.2, level) * 100)
export const zoomLabel = (level: number): string => `Zoom ${zoomPercent(level)}%`

/** The keyboard's next level: one step along the 0.5 grid (from between steps, the nearest one that way), or 100%. */
export function stepZoom(level: number, dir: 1 | -1 | 0): number {
  if (dir === 0) return 0
  const grid = level / ZOOM_STEP
  const next = dir > 0 ? Math.floor(grid + 1e-6) + 1 : Math.ceil(grid - 1e-6) - 1
  return clamp(next * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX)
}

/**
 * A trackpad pinch reaches Gravity as `wheel` events with `ctrlKey` set, where
 * Chromium sets deltaY = -100 · ln(scale). Dividing by 100 · ln(1.2) turns that
 * into zoom levels, so the page grows exactly as far as the fingers spread.
 */
export const PINCH_PER_LEVEL = 100 * Math.log(1.2)
/** How far to pinch in (fingers to two thirds of their spread) before letting go opens the Gravity Well. */
export const PINCH_OVERVIEW = 100 * Math.log(1.5)
/** Movement below this doesn't pick a direction yet. */
const PINCH_DEAD_ZONE = 3

export interface Pinch {
  /** Zoom level when the gesture began. */
  start: number
  /** Zoom level now. */
  level: number
  /** Net amount pinched in since the gesture began, in wheel units. Negative means spread. */
  inward: number
  /** `zoom` moves the page zoom; `overview` builds toward the Gravity Well. */
  mode: 'undecided' | 'zoom' | 'overview'
}

export const startPinch = (level: number): Pinch => ({ start: level, level, inward: 0, mode: 'undecided' })

/**
 * Pinch zooms the way it does in Safari: spreading zooms in, and pinching in
 * zooms back out but stops at 100% (or at the starting level, if ⌘− already
 * took the page lower). Smaller than that is left to ⌘−. A gesture that starts
 * at or below 100% and pinches in builds toward the Gravity Well instead.
 */
export function updatePinch(p: Pinch, deltaY: number, canOverview: boolean): Pinch {
  const inward = p.inward + deltaY
  const floor = Math.min(0, p.start)
  if (p.mode === 'zoom') return { ...p, inward, level: clamp(p.level - deltaY / PINCH_PER_LEVEL, floor, ZOOM_MAX) }
  if (p.mode === 'undecided' && Math.abs(inward) < PINCH_DEAD_ZONE) return { ...p, inward }
  if (inward > 0 && canOverview && p.start <= 1e-3) return { ...p, inward, mode: 'overview' }
  // Spreading, or pinching in above 100%: zoom from where the gesture began.
  return { ...p, inward, mode: 'zoom', level: clamp(p.start - inward / PINCH_PER_LEVEL, floor, ZOOM_MAX) }
}

/** 0–1 toward the Gravity Well. At 1, letting go opens it. */
export const pinchProgress = (p: Pinch): number => (p.mode === 'overview' ? clamp(p.inward / PINCH_OVERVIEW, 0, 1) : 0)

/** Where a pinch comes to rest: within a few percent of 100% snaps to it, so it's easy to get back. */
export const settleZoom = (level: number): number => (Math.abs(level) < 0.15 ? 0 : Math.round(level * 100) / 100)
