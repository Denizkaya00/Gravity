import { useRef } from 'react'
import { AnimatePresence, LayoutGroup, motion, Reorder } from 'motion/react'
import { ArrowDownToLine, PanelLeft, Plus } from 'lucide-react'
import { selectActiveSpace, selectActiveTabId, useBrowser } from '@/state/browser'
import { useUI } from '@/state/ui'
import { clearSpace } from '@/browser/actions'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'
import { TabItem } from './TabItem'
import { AddressPill } from './AddressPill'
import { NavButtons } from './NavButtons'
import { Favorites } from './Favorites'
import { SpaceSwitcher } from './SpaceSwitcher'
import { SidebarFooter } from './SidebarFooter'
import { IconButton } from '@/components/ui/IconButton'
import { useSettings } from '@/state/settings'

function TabList() {
  const spaceId = useBrowser((s) => s.activeSpaceId)
  const order = useBrowser((s) => s.order[s.activeSpaceId])
  const tabs = useBrowser((s) => s.tabs)
  const activeId = useBrowser(selectActiveTabId)
  const reorder = useBrowser((s) => s.reorder)
  const direction = useBrowser((s) => s.spaceDirection)
  const openCommand = useUI((s) => s.openCommand)

  const visible = (order ?? []).filter((id) => tabs[id] && !tabs[id].peek)
  const pinned = visible.filter((id) => tabs[id].pinned)
  const regular = visible.filter((id) => !tabs[id].pinned)

  const commit = (nextPinned: string[], nextRegular: string[]) => {
    const peeks = (order ?? []).filter((id) => tabs[id]?.peek)
    reorder(spaceId, [...nextPinned, ...nextRegular, ...peeks])
  }

  return (
    <AnimatePresence mode="popLayout" initial={false} custom={direction}>
      <motion.div
        key={spaceId}
        custom={direction}
        variants={{
          enter: (d: number) => ({ x: d * 28, opacity: 0 }),
          center: { x: 0, opacity: 1 },
          exit: (d: number) => ({ x: d * -28, opacity: 0 })
        }}
        initial="enter"
        animate="center"
        exit="exit"
        transition={spring.gentle}
        className="scroll-thin flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-2"
      >
        <LayoutGroup id={`tabs-${spaceId}`}>
          {pinned.length > 0 && (
            <Reorder.Group axis="y" values={pinned} onReorder={(ids) => commit(ids, regular)} as="div" className="flex flex-col gap-0.5">
              <AnimatePresence initial={false}>
                {pinned.map((id) => (
                  <TabItem key={id} id={id} active={id === activeId} />
                ))}
              </AnimatePresence>
            </Reorder.Group>
          )}

          <div className="group/divider relative mx-1.5 my-2 flex h-5 items-center">
            <div className="h-px w-full bg-hairline" />
            {regular.length > 0 && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={clearSpace}
                title="Sweep unpinned tabs into the Archive"
                className="label absolute right-0 flex items-center gap-1 rounded-[5px] bg-[var(--window)] px-1.5 py-0.5 opacity-0 transition-opacity group-hover/divider:opacity-100 hover:text-dim"
              >
                <ArrowDownToLine size={10} /> Clear
              </motion.button>
            )}
          </div>

          <motion.button
            type="button"
            layout="position"
            onClick={() => openCommand('new')}
            whileTap={{ scale: 0.97 }}
            className="flex h-8 shrink-0 items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] text-faint hover:bg-hover hover:text-dim"
          >
            <Plus size={15} strokeWidth={1.75} />
            New Tab
          </motion.button>

          <Reorder.Group axis="y" values={regular} onReorder={(ids) => commit(pinned, ids)} as="div" className="flex flex-col gap-0.5">
            <AnimatePresence initial={false}>
              {regular.map((id) => (
                <TabItem key={id} id={id} active={id === activeId} />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        </LayoutGroup>
      </motion.div>
    </AnimatePresence>
  )
}

function SpaceTitle() {
  const space = useBrowser(selectActiveSpace)
  const index = useBrowser((s) => s.spaces.findIndex((sp) => sp.id === s.activeSpaceId))
  const updateSpace = useBrowser((s) => s.updateSpace)
  const direction = useBrowser((s) => s.spaceDirection)
  if (!space) return null
  return (
    <div className="relative mt-4 mb-1.5 h-5 overflow-hidden px-2.5">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={space.id}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={spring.snappy}
          className="label flex items-center gap-2"
        >
          <span className="h-1.5 w-1.5 rounded-[1px]" style={{ background: space.theme.colors[0] }} />
          <span className="tabular-nums">{String(index + 1).padStart(2, '0')}</span>
          <span className="text-faint/60">/</span>
          <span
            className="text-dim outline-none"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            title="Click to rename"
            onBlur={(e) => {
              const name = e.currentTarget.textContent?.trim()
              if (name && name !== space.name) updateSpace(space.id, { name })
              else e.currentTarget.textContent = space.name
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          >
            {space.name}
          </span>
          {space.private && <span className="ml-auto text-faint">private</span>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** The contents shared by the docked sidebar and the hover-to-reveal floating one. */
export function SidebarContent({ floating = false }: { floating?: boolean }) {
  const cycleSpace = useBrowser((s) => s.cycleSpace)
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const update = useSettings((s) => s.update)
  const wheel = useRef({ acc: 0, t: 0 })

  return (
    <div
      className={cn('flex h-full w-full flex-col px-2.5 pb-2', floating ? 'pt-3' : 'pt-[46px]')}
      onWheel={(e) => {
        // Two-finger horizontal swipe on the sidebar flips between spaces.
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
        const now = performance.now()
        if (now - wheel.current.t < 450 && wheel.current.acc === Infinity) return
        wheel.current.acc += e.deltaX
        if (Math.abs(wheel.current.acc) > 90) {
          cycleSpace(wheel.current.acc > 0 ? 1 : -1)
          wheel.current = { acc: Infinity, t: now }
          setTimeout(() => (wheel.current.acc = 0), 450)
        }
      }}
    >
      {!floating && (
        <div className="drag absolute inset-x-0 top-0 flex h-[46px] items-center justify-end gap-0.5 pr-2.5">
          <IconButton label={collapsed ? 'Show sidebar (⌘S)' : 'Hide sidebar (⌘S)'} onClick={() => void update({ sidebarCollapsed: !collapsed })}>
            <PanelLeft size={15} />
          </IconButton>
          <NavButtons />
        </div>
      )}
      {floating && (
        <div className="mb-2 flex items-center justify-end gap-0.5">
          <NavButtons />
        </div>
      )}
      <AddressPill />
      <Favorites />
      <SpaceTitle />
      <TabList />
      <SpaceSwitcher />
      <SidebarFooter />
    </div>
  )
}

export function Sidebar() {
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const focus = useUI((s) => s.focusMode)
  const hidden = collapsed || focus
  return (
    <motion.aside
      initial={false}
      animate={{ width: hidden ? 0 : 268, opacity: hidden ? 0 : 1 }}
      transition={spring.gentle}
      className="relative h-full shrink-0 overflow-hidden"
    >
      <div className="relative h-full w-[268px]">
        {/* Only one sidebar may own the shared layoutIds at a time. */}
        {!hidden && <SidebarContent />}
      </div>
    </motion.aside>
  )
}
