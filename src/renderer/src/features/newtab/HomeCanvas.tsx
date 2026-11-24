import { useEffect, useRef } from 'react'
import { useUI } from '@/state/ui'
import { Kbd } from '@/components/ui/Kbd'
import { BlurFade } from '@/components/magic/blur-fade'
import { HOME_TRACK } from '@/features/blackhole/BlackHole'
import { SceneBackground, useIsBlackHole } from '@/features/scenes/SceneBackground'
import { useBlackHole } from '@/features/blackhole/store'
import { useBlackHoleBackdrop } from '@/lib/theme'
import { HomeClock } from './HomeClock'
import { HomePins } from './HomePins'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'

/** The shade along the foot of Home that the search field sits in. */
export const HOME_SHADE = 'pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-black/55 to-transparent'

/**
 * What a space shows when no tab is open: the time, the chosen scene, a search
 * field and your favorites. With the black hole, drag to orbit it, scroll to approach, double-click to reset.
 *
 * In dark mode the scene is already the window backdrop, so this view is just a
 * transparent layer that steers the black hole's camera. In light mode it draws its own.
 */
export function HomeCanvas() {
  const openCommand = useUI((s) => s.openCommand)
  const covered = useUI((s) => s.command.open || s.overview || s.settingsOpen)
  const backdrop = useBlackHoleBackdrop()
  const orbitable = useIsBlackHole()
  const drag = useRef<{ x: number; y: number } | null>(null)
  const search = useRef<HTMLButtonElement>(null)
  const cam = () => useBlackHole.getState().controller

  // A page that was showing may still hold the keyboard from behind Home; give it back.
  useEffect(() => {
    const el = document.activeElement
    if (el instanceof HTMLElement && el.tagName === 'WEBVIEW') el.blur()
  }, [])

  return (
    <div className={cn('theme-dark absolute inset-0 overflow-hidden', !backdrop && 'bg-[#050505]')} data-testid="home-canvas">
      {!backdrop && (
        <div className="absolute inset-0">
          <SceneBackground interactive center={[0, 0.06]} track={HOME_TRACK} paused={covered} />
        </div>
      )}
      <div
        className={cn('absolute inset-0', orbitable && 'cursor-grab active:cursor-grabbing')}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          drag.current = { x: e.clientX, y: e.clientY }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          cam()?.orbit(e.clientX - drag.current.x, e.clientY - drag.current.y)
          drag.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => cam()?.zoom(e.deltaY)}
        onDoubleClick={() => cam()?.reset()}
        data-testid="home-orbit"
      />
      {/* With the scene as the window backdrop, the backdrop draws this shade itself, across
          the whole window: here it would stop at the frame's rounded edge, inside the margins. */}
      {!backdrop && <div className={HOME_SHADE} />}

      {/* The time sits in the sky at the top, the search field at the foot. */}
      <div className="pointer-events-none absolute inset-x-0 top-[6.5%] flex justify-center px-8">
        <BlurFade delay={0.05} offset={6} blur="4px">
          <HomeClock />
        </BlurFade>
      </div>

      {/* The search field, and your favorites under it. With more of them it rises a little. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[7%] flex flex-col items-center gap-3 px-8">
        <BlurFade delay={0.1} offset={6} blur="4px" layout transition={spring.settle} className="pointer-events-auto w-full max-w-[536px]">
          <button
            ref={search}
            type="button"
            onClick={() => openCommand('new')}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown') return
              e.preventDefault()
              document.querySelector<HTMLElement>('[data-testid="home-pins"] button[tabindex="0"]')?.focus()
            }}
            className="flex h-11 w-full items-center gap-3 rounded-[10px] border border-white/10 bg-black/40 px-4 text-left text-[13.5px] text-faint backdrop-blur-md transition-colors outline-none hover:border-white/20 hover:text-dim focus-visible:border-white/25 focus-visible:text-dim"
            data-testid="home-search"
          >
            <span className="flex-1">Search or enter address</span>
            <Kbd>⌘ T</Kbd>
          </button>
        </BlurFade>
        <BlurFade delay={0.16} offset={6} blur="4px" className="pointer-events-auto w-full max-w-[536px]">
          <HomePins onLeaveTop={() => search.current?.focus()} />
        </BlurFade>
      </div>
    </div>
  )
}
