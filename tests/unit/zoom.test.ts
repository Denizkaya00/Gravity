import { describe, expect, it } from 'vitest'
import {
  PINCH_OVERVIEW,
  ZOOM_MAX,
  ZOOM_MIN,
  pinchProgress,
  settleZoom,
  startPinch,
  stepZoom,
  updatePinch,
  zoomLabel,
  type Pinch
} from '@shared/zoom'

/** Feeds a pinch to `scale` (2 = fingers twice as far apart) in small steps, like the trackpad does. */
function pinchTo(p: Pinch, scale: number, canOverview = true, steps = 12): Pinch {
  const total = -100 * Math.log(scale)
  for (let i = 0; i < steps; i++) p = updatePinch(p, total / steps, canOverview)
  return p
}

describe('keyboard zoom', () => {
  it('steps along the 0.5 grid and resets to 100%', () => {
    expect(stepZoom(0, 1)).toBe(0.5)
    expect(stepZoom(0.5, 1)).toBe(1)
    expect(stepZoom(0, -1)).toBe(-0.5)
    expect(stepZoom(2.5, 0)).toBe(0)
  })

  it('goes to the nearest step after a pinch left the page between steps', () => {
    expect(stepZoom(1.37, 1)).toBe(1.5)
    expect(stepZoom(1.37, -1)).toBe(1)
    expect(stepZoom(-0.2, 1)).toBe(0)
  })

  it('stays within the limits', () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
  })

  it('labels levels as percentages', () => {
    expect(zoomLabel(0)).toBe('Zoom 100%')
    expect(zoomLabel(1)).toBe('Zoom 120%')
  })
})

describe('pinch', () => {
  it('follows the fingers when spreading', () => {
    const p = pinchTo(startPinch(0), 1.5)
    expect(p.mode).toBe('zoom')
    expect(Math.pow(1.2, p.level)).toBeCloseTo(1.5, 5)
  })

  it('zooms back out but stops at 100%', () => {
    const p = pinchTo(startPinch(2), 0.25)
    expect(p.mode).toBe('zoom')
    expect(p.level).toBe(0)
    expect(pinchProgress(p)).toBe(0)
  })

  it('keeps a page that ⌘− made smaller from shrinking further', () => {
    const p = pinchTo(startPinch(-1), 0.5, false)
    expect(p.level).toBe(-1)
  })

  it('never goes past the maximum', () => {
    expect(pinchTo(startPinch(4), 8).level).toBe(ZOOM_MAX)
  })

  it('ignores tiny movements', () => {
    const p = updatePinch(startPinch(0), 1, true)
    expect(p.mode).toBe('undecided')
    expect(p.level).toBe(0)
  })

  it('pinching in at 100% builds toward the Gravity Well without zooming', () => {
    const half = pinchTo(startPinch(0), Math.exp(-PINCH_OVERVIEW / 200))
    expect(half.mode).toBe('overview')
    expect(half.level).toBe(0)
    expect(pinchProgress(half)).toBeCloseTo(0.5, 5)
    expect(pinchProgress(pinchTo(half, 0.5))).toBe(1)
  })

  it('a gesture that came down from a larger zoom does not open the Gravity Well', () => {
    const p = pinchTo(pinchTo(startPinch(1), 0.5), 0.5)
    expect(p.mode).toBe('zoom')
    expect(pinchProgress(p)).toBe(0)
  })

  it('only builds toward the Gravity Well where it is allowed', () => {
    const p = pinchTo(startPinch(0), 0.5, false)
    expect(p.mode).toBe('zoom')
    expect(p.level).toBe(0)
  })

  it('spreading again after starting toward the Gravity Well zooms in instead', () => {
    let p = pinchTo(startPinch(0), 0.8)
    expect(p.mode).toBe('overview')
    p = pinchTo(p, 1.5)
    expect(p.mode).toBe('zoom')
    // Net, the fingers ended 0.8 × 1.5 = 1.2 times as far apart.
    expect(Math.pow(1.2, p.level)).toBeCloseTo(1.2, 5)
  })

  it('settles near 100% onto 100%', () => {
    expect(settleZoom(0.1)).toBe(0)
    expect(settleZoom(-0.12)).toBe(0)
    expect(settleZoom(1.2345)).toBe(1.23)
  })
})
