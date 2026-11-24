import { create } from 'zustand'

export interface CameraController {
  /** Orbit by a pointer movement in CSS pixels. */
  orbit: (dx: number, dy: number) => void
  /** Move closer (negative) or further (positive), from a wheel delta. */
  zoom: (deltaY: number) => void
  reset: () => void
}

interface BlackHoleState {
  /** performance.now() of the last accretion burst. */
  flareAt: number
  flareStrength: number
  /** The interactive black hole currently on screen, if any. */
  controller: CameraController | null
  /** Something fell in: the disk flares briefly. */
  flare: (strength?: number) => void
  setController: (c: CameraController | null) => void
}

export const useBlackHole = create<BlackHoleState>((set, get) => ({
  flareAt: -1e9,
  flareStrength: 0,
  controller: null,
  flare: (strength = 0.7) => {
    // Bursts that overlap add up, but stay bounded.
    const now = performance.now()
    const current = currentFlare(get(), now)
    set({ flareAt: now, flareStrength: Math.min(1, current + strength) })
  },
  setController: (controller) => set({ controller })
}))

export function currentFlare(s: Pick<BlackHoleState, 'flareAt' | 'flareStrength'>, now: number): number {
  const t = (now - s.flareAt) / 1000
  if (t < 0) return 0
  // Fast rise, slow exponential decay.
  return s.flareStrength * Math.min(1, t * 8) * Math.exp(-t * 1.6)
}
