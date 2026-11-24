import { useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { selectActiveSpace, selectActiveTabId, useBrowser } from '@/state/browser'
import { useUI } from '@/state/ui'
import { useBlackHoleBackdrop } from '@/lib/theme'
import { HOME_TRACK } from '@/features/blackhole/BlackHole'
import { SceneBackground } from '@/features/scenes/SceneBackground'
import { HOME_SHADE } from '@/features/newtab/HomeCanvas'
import { OVERVIEW_HOLE_CENTER } from '@/features/overview/GravityWell'
import { useSettings } from '@/state/settings'
import { useAppEffects } from '@/app/useAppEffects'
import { Sidebar } from '@/chrome/Sidebar'
import { FloatingSidebar } from '@/chrome/FloatingSidebar'
import { PageFrame } from '@/browser/PageFrame'
import { WebviewLayer } from '@/browser/WebviewLayer'
import { usePageFocus } from '@/browser/usePageFocus'
import { PageOverlays } from '@/browser/PageOverlays'
import { CommandBar } from '@/features/command/CommandBar'
import { GravityWell } from '@/features/overview/GravityWell'
import { PeekLayer } from '@/features/peek/PeekLayer'
import { FindBar } from '@/features/find/FindBar'
import { Toasts } from '@/features/toast/Toasts'
import { PermissionPrompt } from '@/features/permissions/PermissionPrompt'
import { SavePasswordPrompt } from '@/features/passwords/SavePasswordPrompt'
import { Cheatsheet } from '@/features/cheatsheet/Cheatsheet'
import { SettingsSheet } from '@/features/settings/SettingsSheet'
import { Onboarding } from '@/features/onboarding/Onboarding'

/** The window surface: the chosen scene in dark mode, otherwise flat paper or graphite with grain. */
function SpaceBackdrop() {
  const space = useBrowser(selectActiveSpace)
  const backdrop = useBlackHoleBackdrop()
  const activeId = useBrowser(selectActiveTabId)
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const focus = useUI((s) => s.focusMode)
  const overview = useUI((s) => s.overview)
  const covered = useUI((s) => s.command.open || s.settingsOpen)
  const onboarding = useSettings((s) => s.loaded && !s.onboarded)
  const [{ width, height }, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (backdrop) {
    // Place the hole over the page area, not the whole window.
    const sidebar = collapsed || focus ? 0 : 268
    const top = collapsed && !focus ? 40 : 0
    const acrossPage = (f: number) => (sidebar + (width - sidebar) * f) / width
    // With a page open the scene steps out entirely, so it doesn't glimmer through the
    // sidebar glass or the margins around the page. It stays mounted (and paused) so
    // Home and the Overview bring it back without rebuilding the WebGL context.
    const hidden = !!activeId && !overview
    return (
      // Normally behind everything; while the Overview is open it rises above the
      // live pages (z 10) and sits just under the Overview itself (z 65).
      <div className="pointer-events-none fixed inset-0 bg-[#050505]" style={{ zIndex: overview ? 64 : 0 }}>
        <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: hidden ? 0 : 1 }} data-testid="scene-backdrop">
          <SceneBackground
            interactive={!activeId && !overview}
            // The Overview reuses this same black hole (no second WebGL context): it
            // slides down below the cards and the camera pulls back.
            center={overview ? OVERVIEW_HOLE_CENTER : [sidebar / 2 / height, 0.06 - top / 2 / height]}
            // On Home the hole rests right of centre and slides left as you approach, until
            // half of it is behind the sidebar glass; the Overview centres it under the cards.
            track={overview ? undefined : { rest: acrossPage(HOME_TRACK.rest), near: acrossPage(HOME_TRACK.near) }}
            distance={overview ? 52 : 40}
            // Hidden behind an open page: hold the frame.
            paused={hidden || covered || onboarding}
          />
          {/* Home's shade at the foot, edge to edge (not clipped to the page frame inside its margins). */}
          <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: !activeId && !overview ? 1 : 0 }}>
            <div className={HOME_SHADE} />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="grain pointer-events-none fixed inset-0 z-0" style={{ background: 'var(--window)' }}>
      {/* The space colour is only a whisper along the top edge. */}
      <div
        className="absolute inset-x-0 top-0 h-[120px] opacity-[0.07]"
        style={{ background: 'linear-gradient(180deg, var(--space-a), transparent)' }}
      />
      {space?.private && <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.015)_6px_7px)]" />}
    </div>
  )
}

export function App() {
  useAppEffects()
  usePageFocus()
  const ready = useBrowser((s) => s.ready)
  const motionPref = useSettings((s) => s.motion)
  const reducedMotion = motionPref === 'always' ? 'never' : motionPref === 'never' ? 'always' : 'user'

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <SpaceBackdrop />
      <div className="relative isolate z-[1] flex h-full w-full">
        {ready && (
          <>
            <Sidebar />
            <PageFrame />
          </>
        )}
      </div>
      {ready && (
        <>
          <WebviewLayer />
          <PageOverlays />
          <FindBar />
          <FloatingSidebar />
          <PeekLayer />
          <GravityWell />
          <CommandBar />
          <PermissionPrompt />
          <SavePasswordPrompt />
          <SettingsSheet />
          <Cheatsheet />
          <Toasts />
        </>
      )}
      <Onboarding />
    </MotionConfig>
  )
}
