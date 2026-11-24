import type { ComponentProps } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { SceneId } from '@shared/types'
import { useSettings } from '@/state/settings'
import { cn } from '@/lib/utils'
import { BlackHole } from '@/features/blackhole/BlackHole'
import { GravityField } from '@/features/newtab/GravityField'
import { ShaderScene } from './ShaderScene'
import { PAINTED, paintedScene } from './scenes'
import { useBackground } from './background'

type Props = ComponentProps<typeof BlackHole> & {
  /** Show this scene instead of the one chosen in Settings (for previews). */
  scene?: SceneId
  /** Draw one frame and stop. */
  still?: boolean
}

/**
 * The background of the space you're in (its own, or the default). The black hole keeps all its props (camera,
 * track, interaction); the painted scenes use the centre and pause. Changing
 * scene, or moving to a space with another, crossfades: the old one stays only while the new one fades in.
 */
export function SceneBackground({ scene: override, still, ...props }: Props) {
  const { scene: chosen, mountainPhoto: photo, mountainStars: milkyWay } = useBackground()
  const mode = useSettings((s) => s.blackHole)
  const scene = override ?? chosen
  // The scene with its chosen photo; a new photo is a new scene (a fresh canvas, crossfaded).
  const painted = scene !== 'blackhole' && PAINTED[scene] ? paintedScene(scene, photo, milkyWay) : null
  const sceneKey = painted ? `${painted.id}:${painted.variant ?? ''}` : 'blackhole'

  let content
  if (!painted) content = <BlackHole {...props} paused={props.paused || still} />
  else if (mode === 'off' && !override) content = <GravityField className={cn('h-full w-full', props.className)} />
  else content = <ShaderScene key={sceneKey} scene={painted} className={props.className} center={props.center} paused={props.paused} still={still} />

  // Previews in Settings don't transition.
  if (override) return content
  const key = !painted ? 'blackhole' : mode === 'off' ? 'off' : sceneKey
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={key}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  )
}

/** Whether the black hole is the scene, for the parts that interact with it (orbit, zoom). */
export function useIsBlackHole(): boolean {
  return useBackground().scene === 'blackhole'
}
