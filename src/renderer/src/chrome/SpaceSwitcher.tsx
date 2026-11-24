import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { useBrowser } from '@/state/browser'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'

/** Spaces as a row of small swatches; the active one shows its name. */
export function SpaceSwitcher() {
  const spaces = useBrowser((s) => s.spaces)
  const activeId = useBrowser((s) => s.activeSpaceId)
  const setActive = useBrowser((s) => s.setActiveSpace)
  const addSpace = useBrowser((s) => s.addSpace)
  const removeSpace = useBrowser((s) => s.removeSpace)

  return (
    <div className="mt-1 flex items-center gap-0.5 px-1 py-1.5">
      {spaces.map((sp, i) => {
        const active = sp.id === activeId
        return (
          <motion.button
            key={sp.id}
            type="button"
            title={`${sp.name} (⌃${i + 1})${spaces.length > 1 ? ' · right-click to remove' : ''}`}
            onClick={() => setActive(sp.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              if (spaces.length > 1 && window.confirm(`Remove the space “${sp.name}” and its tabs?`)) removeSpace(sp.id)
            }}
            whileTap={{ scale: 0.92 }}
            transition={spring.snappy}
            className={cn('relative flex h-6 items-center gap-1.5 rounded-[6px] px-2', !active && 'hover:bg-hover')}
          >
            {active && <motion.span layoutId="space-pill" transition={spring.snappy} className="absolute inset-0 rounded-[6px] bg-active" />}
            <span
              className={cn('relative h-2 w-2 rounded-[2px] transition-opacity', !active && 'opacity-50')}
              style={{ background: sp.theme.colors[0], boxShadow: sp.private ? 'inset 0 0 0 1px var(--hairline-strong)' : undefined }}
            />
            {active && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                transition={spring.snappy}
                className="relative overflow-hidden text-[11.5px] whitespace-nowrap text-dim"
              >
                {sp.name}
              </motion.span>
            )}
          </motion.button>
        )
      })}
      <button
        type="button"
        title="New space (⌥⌘N)"
        onClick={() => addSpace()}
        className="ml-auto flex h-6 w-6 items-center justify-center rounded-[6px] text-faint hover:bg-hover hover:text-dim"
      >
        <Plus size={13} />
      </button>
    </div>
  )
}
