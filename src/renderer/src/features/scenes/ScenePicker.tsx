import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Moon } from 'lucide-react'
import type { SpaceBackground } from '@shared/types'
import { selectActiveSpace, useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'
import { SceneBackground } from './SceneBackground'
import { MILKY_WAY, MOUNTAINS, SCENE_INFO } from './scenes'
import { backgroundName, followDefaultBackground, setBackground, useBackground, useOthersWithOwn, useOwnBackground } from './background'

type Choose = (patch: Partial<SpaceBackground>) => void

/**
 * The background picker in Settings: a still of each scene, drawn by the scene
 * itself (one frame each, then they stop), with its name and a short note.
 * While Mountains is chosen, its photos open beneath.
 *
 * Each space can keep its own background. A new one shows at once in the space
 * you're in; then, unless Settings says where backgrounds go, a small card
 * beneath asks whether every space should have it too. Ignoring the card keeps
 * it in this space only.
 */
export function ScenePicker() {
  const { scene } = useBackground()
  const scope = useSettings((s) => s.backgroundScope)
  const spaceId = useBrowser((s) => s.activeSpaceId)
  const several = useBrowser((s) => s.spaces.length > 1)
  // The space the card is asking about; moving to another space puts the question away.
  const [askingFor, setAskingFor] = useState<string | null>(null)
  // Start the previews once the sheet has slid in, so compiling them can't stutter it.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 380)
    return () => clearTimeout(timer)
  }, [])

  const choose: Choose = (patch) => {
    if (!several || scope === 'all') return setBackground(patch, 'all')
    setBackground(patch, 'space')
    if (scope === 'ask') setAskingFor(spaceId)
  }

  return (
    <>
      <Header />
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Background">
        {SCENE_INFO.map((s) => {
          const on = scene === s.id
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose({ scene: s.id })}
              className="group flex flex-col items-stretch self-start text-left"
              data-testid={`scene-${s.id}`}
            >
              <div
                className={cn(
                  'relative aspect-[16/10] overflow-hidden rounded-[7px] border bg-[#050505] transition-colors',
                  on ? 'border-transparent' : 'border-hairline group-hover:border-hairline-strong'
                )}
              >
                {ready && <SceneBackground scene={s.id} still camera={{ distance: 30 }} className="pointer-events-none" />}
                {on && (
                  <motion.span
                    layoutId="scene-ring"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-[7px] shadow-[inset_0_0_0_1.5px_var(--accent)]"
                  />
                )}
              </div>
              <div className={cn('mt-1.5 text-[12px]', on ? 'text-text' : 'text-dim')}>{s.name}</div>
              <div className="label truncate text-[9.5px]">{s.note}</div>
            </button>
          )
        })}
      </div>
      <AnimatePresence initial={false}>
        {scene === 'mountains' && (
          <motion.div
            key="mountains"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.gentle}
            className="overflow-hidden"
          >
            <MountainPhotos choose={choose} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {askingFor === spaceId && several && scope === 'ask' && (
          <motion.div
            key="ask"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.gentle}
            className="overflow-hidden"
          >
            <WhereTo onDone={() => setAskingFor(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** "Background", and, with more than one space, which space you're changing and whether it has its own. */
function Header() {
  const space = useBrowser(selectActiveSpace)
  const several = useBrowser((s) => s.spaces.length > 1)
  const own = useOwnBackground()
  return (
    <div className="mb-2.5 flex min-h-[22px] items-center justify-between gap-3">
      <div className="text-[13px] text-text">Background</div>
      {several && space && (
        <div className="flex min-w-0 items-center gap-1 text-[11px]" data-testid="background-space">
          <span
            className="flex min-w-0 items-center gap-1.5 rounded-full bg-hover px-2 py-[3px] text-dim"
            title={own ? `${space.name} has its own background` : `${space.name} shows the default background`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: space.theme.colors[0], boxShadow: space.private ? 'inset 0 0 0 1px var(--hairline-strong)' : undefined }}
            />
            <span className="truncate">{space.name}</span>
            <span className="shrink-0 text-faint" data-testid="background-kind">
              · {own ? 'Own' : 'Default'}
            </span>
          </span>
          <AnimatePresence initial={false}>
            {own && (
              <motion.button
                type="button"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={spring.snappy}
                onClick={followDefaultBackground}
                title="Show the default background in this space again"
                className="shrink-0 rounded-md px-1.5 py-[3px] text-faint hover:bg-hover hover:text-dim"
                data-testid="background-use-default"
              >
                Use default
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

/**
 * The quiet question after a change: keep it in this space (it already is), or
 * give it to every space. "Remember" saves the answer as the setting below.
 */
function WhereTo({ onDone }: { onDone: () => void }) {
  const background = useBackground()
  const space = useBrowser(selectActiveSpace)
  const others = useOthersWithOwn()
  const update = useSettings((s) => s.update)
  const [remember, setRemember] = useState(false)
  // The card opens beneath the picker, often below the fold: bring it into view as it grows.
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const timer = setTimeout(() => card.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 120)
    return () => clearTimeout(timer)
  }, [])

  const answer = (scope: 'space' | 'all') => {
    if (scope === 'all') setBackground({}, 'all')
    if (remember) void update({ backgroundScope: scope })
    onDone()
  }

  return (
    <div ref={card} className="mt-3 scroll-mb-4 rounded-[10px] border border-hairline bg-hover p-3" role="group" aria-label="Where to use this background" data-testid="background-ask">
      <div className="text-[12.5px] text-text">
        Use <span className="font-medium">{backgroundName(background)}</span> in
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => answer('space')}
          className="flex min-w-0 items-center justify-center gap-1.5 rounded-[7px] bg-active px-2.5 py-1.5 text-[12px] text-text shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
          data-testid="background-this-space"
        >
          {space && <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: space.theme.colors[0] }} />}
          <span className="truncate">{space ? `${space.name} only` : 'This space only'}</span>
        </button>
        <button
          type="button"
          onClick={() => answer('all')}
          className="rounded-[7px] px-2.5 py-1.5 text-[12px] text-dim shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-hover hover:text-text"
          data-testid="background-all-spaces"
        >
          All spaces
        </button>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={remember}
          onClick={() => setRemember(!remember)}
          className="group flex items-center gap-1.5 text-[11px] text-faint hover:text-dim"
          data-testid="background-remember"
        >
          <span
            className={cn(
              'grid h-3 w-3 place-items-center rounded-[3px] border transition-colors',
              remember ? 'border-transparent bg-accent text-white' : 'border-hairline-strong'
            )}
          >
            {remember && <Check className="h-2 w-2" strokeWidth={3.5} />}
          </span>
          Remember my choice
        </button>
        {others > 0 && (
          <span className="truncate text-[10.5px] text-faint">
            All spaces replaces {others === 1 ? 'one other space’s own' : `${others} spaces’ own`}
          </span>
        )}
      </div>
    </div>
  )
}

/** One photo to choose: the photo itself, its name, a short note. */
function Tile({
  thumb,
  name,
  note,
  on,
  ring,
  badge,
  ...button
}: {
  thumb: string
  name: string
  note: string
  on: boolean
  /** A ring that slides between the tiles of a group, or a plain one. */
  ring: string | null
  badge?: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="group flex flex-col items-stretch self-start text-left" {...button}>
      <div
        className={cn(
          'relative aspect-[16/10] overflow-hidden rounded-[6px] border bg-[#050505] transition-colors',
          on ? 'border-transparent' : 'border-hairline group-hover:border-hairline-strong'
        )}
      >
        <img src={thumb} alt="" draggable={false} className="h-full w-full object-cover" />
        {badge}
        {on &&
          (ring ? (
            <motion.span layoutId={ring} transition={spring.snappy} className="absolute inset-0 rounded-[6px] shadow-[inset_0_0_0_1.5px_var(--accent)]" />
          ) : (
            <span className="absolute inset-0 rounded-[6px] shadow-[inset_0_0_0_1.5px_var(--accent)]" />
          ))}
      </div>
      <div className={cn('mt-1 truncate text-[11.5px]', on ? 'text-text' : 'text-dim')}>{name}</div>
      <div className="label truncate text-[9px]">{note}</div>
    </button>
  )
}

/**
 * The Mountains photos. One is shown by day and, taken down to moonlight, by
 * night; the Milky Way, if it's on, takes the night instead.
 */
function MountainPhotos({ choose }: { choose: Choose }) {
  const { mountainPhoto: photo, mountainStars: milkyWay } = useBackground()

  return (
    <div className="mt-3 rounded-[10px] border border-hairline p-2.5" data-testid="mountain-photos">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <div className="label text-[9.5px]">Photo</div>
        <div className="truncate text-[11px] text-faint">{milkyWay ? 'The Milky Way after sunset' : 'By moonlight after sunset'}</div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <div role="radiogroup" aria-label="Mountain photo" className="contents">
          {MOUNTAINS.map((m) => (
            <Tile
              key={m.id}
              role="radio"
              aria-checked={photo === m.id}
              onClick={() => choose({ mountainPhoto: m.id })}
              thumb={m.thumb}
              name={m.name}
              note={m.note}
              on={photo === m.id}
              ring="mountain-ring"
              data-testid={`mountain-${m.id}`}
            />
          ))}
        </div>
        <Tile
          role="switch"
          aria-checked={milkyWay}
          aria-label="Milky Way at night"
          onClick={() => choose({ mountainStars: !milkyWay })}
          thumb={MILKY_WAY.thumb}
          name={MILKY_WAY.name}
          note={milkyWay ? 'On at night' : MILKY_WAY.note}
          on={milkyWay}
          ring={null}
          badge={
            <span className="absolute top-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-black/55 text-white/85">
              <Moon className="h-2.5 w-2.5" strokeWidth={2} />
            </span>
          }
          data-testid="mountain-stars"
        />
      </div>
    </div>
  )
}
