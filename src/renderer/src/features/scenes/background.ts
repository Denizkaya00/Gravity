import type { SpaceBackground } from '@shared/types'
import { selectActiveSpace, useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { MOUNTAINS, SCENE_INFO } from './scenes'

/**
 * Backgrounds per space. Settings holds the default; a space can keep its own
 * (`Space.background`), and shows the default until it does. A space's own
 * background is saved with the session, so a private space's goes when it does.
 */

type Defaults = Pick<SpaceBackground, 'scene' | 'mountainPhoto' | 'mountainStars'>

export function defaultBackground(s: Defaults = useSettings.getState()): SpaceBackground {
  return { scene: s.scene, mountainPhoto: s.mountainPhoto, mountainStars: s.mountainStars }
}

function same(a: SpaceBackground, b: SpaceBackground): boolean {
  return a.scene === b.scene && a.mountainPhoto === b.mountainPhoto && a.mountainStars === b.mountainStars
}

/** The background of the space you're in. */
export function currentBackground(): SpaceBackground {
  return selectActiveSpace(useBrowser.getState())?.background ?? defaultBackground()
}

/** The background of the space you're in, as a hook. Each part is its own selector, so nothing re-renders for nothing. */
export function useBackground(): SpaceBackground {
  const own = useBrowser((s) => selectActiveSpace(s)?.background)
  const scene = useSettings((s) => s.scene)
  const mountainPhoto = useSettings((s) => s.mountainPhoto)
  const mountainStars = useSettings((s) => s.mountainStars)
  return own ?? { scene, mountainPhoto, mountainStars }
}

/** Whether the space you're in has a background of its own. */
export function useOwnBackground(): boolean {
  return useBrowser((s) => !!selectActiveSpace(s)?.background)
}

/** How many spaces other than the one you're in have their own background. */
export function useOthersWithOwn(): number {
  return useBrowser((s) => s.spaces.filter((sp) => sp.id !== s.activeSpaceId && sp.background).length)
}

/**
 * Changes the background. `space` gives the space you're in its own (or, when
 * it lands back on the default, lets it follow the default again); `all` makes
 * it the default and every space follows it.
 */
export function setBackground(patch: Partial<SpaceBackground>, scope: 'space' | 'all'): void {
  const B = useBrowser.getState()
  const next = { ...currentBackground(), ...patch }
  if (scope === 'all') {
    void useSettings.getState().update(next)
    if (B.spaces.some((sp) => sp.background)) useBrowser.setState({ spaces: B.spaces.map(({ background: _b, ...sp }) => sp) })
    return
  }
  const own = same(next, defaultBackground()) ? undefined : next
  useBrowser.setState({
    spaces: B.spaces.map((sp) => {
      if (sp.id !== B.activeSpaceId) return sp
      const { background: _b, ...rest } = sp
      return own ? { ...rest, background: own } : rest
    })
  })
}

/** Lets the space you're in follow the default background again. */
export function followDefaultBackground(): void {
  const B = useBrowser.getState()
  useBrowser.setState({ spaces: B.spaces.map((sp) => (sp.id === B.activeSpaceId ? (({ background: _b, ...rest }) => rest)(sp) : sp)) })
}

/** A short name for a background: "Dunes", or "Mountains · Everest". */
export function backgroundName(b: SpaceBackground): string {
  const scene = SCENE_INFO.find((s) => s.id === b.scene)?.name ?? b.scene
  if (b.scene !== 'mountains') return scene
  const photo = MOUNTAINS.find((m) => m.id === b.mountainPhoto)?.name
  return photo ? `${scene} · ${photo}` : scene
}
