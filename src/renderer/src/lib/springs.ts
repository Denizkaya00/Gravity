import type { Transition } from 'motion/react'

/**
 * The Gravity motion system. Movement is physical but restrained: things have
 * mass and settle, they don't bounce around. Everything uses these presets.
 */
export const spring = {
  /** Small UI: buttons, highlights, toggles. */
  snappy: { type: 'spring', stiffness: 520, damping: 44, mass: 0.8 },
  /** Panels and sheets. */
  gentle: { type: 'spring', stiffness: 320, damping: 36, mass: 1 },
  /** Things with weight: pages, cards, the overview morph. */
  heavy: { type: 'spring', stiffness: 300, damping: 34, mass: 1.2 },
  /** Settling into place with a barely visible overshoot. */
  settle: { type: 'spring', stiffness: 420, damping: 30, mass: 1 },
  /** Shared-element morphs between layouts. */
  morph: { type: 'spring', stiffness: 420, damping: 40, mass: 1 }
} satisfies Record<string, Transition>

/** Accelerating ease for things leaving the screen: they fall, not fade. */
export const fallEase = [0.55, 0, 1, 0.45] as const

/** A deterministic, very small rotation per id, so stacks don't look machined. */
export function tilt(id: string, max = 1): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((h % 1000) / 1000) * max * (h % 2 ? 1 : -1)
}
