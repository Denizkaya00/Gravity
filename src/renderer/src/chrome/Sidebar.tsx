import { useRef } from 'react'
import { AnimatePresence, LayoutGroup, motion, Reorder } from 'motion/react'
import { ArrowDownToLine, PanelLeft, Plus } from 'lucide-react'
import { selectActiveTabId, useBrowser } from '@/state/browser'
import { useUI } from '@/state/ui'
import { clearSpace } from '@/browser/actions'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'
import { TabItem } from './TabItem'
import { AddressPill } from './AddressPill'
import { HomeButton, NavButtons } from './NavButtons'
import { Favorites } from './Favorites'
import { SpaceSwitcher } from './SpaceSwitcher'
import { SidebarFooter } from './SidebarFooter'
import { IconButton } from '@/components/ui/IconButton'
import { useSettings } from '@/state/settings'
import { useBlackHoleBackdrop } from '@/lib/theme'

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

/** The contents shared by the docked sidebar and the hover-to-reveal floating one. */
export function SidebarContent({ floating = false }: { floating?: boolean }) {
  const cycleSpace = useBrowser((s) => s.cycleSpace)
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const update = useSettings((s) => s.update)
  const focus = useUI((s) => s.focusMode)
  const windowFullscreen = useUI((s) => s.windowFullscreen)
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
        // Sidebar toggle and Home sit at the left edge, just after the traffic lights
        // (which macOS hides in full screen, so the buttons take their place there).
        <div
          className={cn(
            'drag absolute inset-x-0 top-0 flex h-[46px] items-center justify-between pr-2.5',
            windowFullscreen ? 'pl-2.5' : 'pl-[78px]'
          )}
        >
          <div className="no-drag flex items-center gap-0.5">
            <IconButton label={collapsed ? 'Show sidebar (⌘S)' : 'Hide sidebar (⌘S)'} onClick={() => void update({ sidebarCollapsed: !collapsed })}>
              <PanelLeft size={15} />
            </IconButton>
            <HomeButton />
          </div>
          <NavButtons home={false} />
        </div>
      )}
      {floating && (
        // Leaves room for the traffic lights, then offers a way to dock the sidebar again.
        <div className="mb-2 flex h-[30px] items-center justify-end gap-0.5 pl-[72px]">
          <IconButton
            label={focus ? 'Exit focus mode (⇧⌘F)' : 'Keep sidebar open (⌘S)'}
            onClick={() => {
              if (focus) useUI.getState().set({ focusMode: false, sidebarHover: false })
              else void update({ sidebarCollapsed: false })
            }}
            data-testid="sidebar-dock"
          >
            <PanelLeft size={15} />
          </IconButton>
          <NavButtons />
        </div>
      )}
      <AddressPill />
      <Favorites />
      <div className="h-3" />
      <TabList />
      <SpaceSwitcher />
      <SidebarFooter />
    </div>
  )
}

export function Sidebar() {
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const focus = useUI((s) => s.focusMode)
  const glass = useBlackHoleBackdrop()
  const hidden = collapsed || focus
  return (
    <motion.aside
      initial={false}
      animate={{ width: hidden ? 0 : 268, opacity: hidden ? 0 : 1 }}
      transition={spring.gentle}
      // Over the black hole the sidebar is smoked glass, so the light shows through.
      className={cn(
        'relative h-full shrink-0 overflow-hidden',
        glass && 'border-r border-white/[0.06] bg-[rgb(10_9_8/0.55)] backdrop-blur-xl backdrop-brightness-[0.62]'
      )}
    >
      <div className="relative h-full w-[268px]">
        {/* Only one sidebar may own the shared layoutIds at a time. */}
        {!hidden && <SidebarContent />}
      </div>
    </motion.aside>
  )
}
