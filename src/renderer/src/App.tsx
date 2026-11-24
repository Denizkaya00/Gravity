import { MotionConfig } from 'motion/react'
import { selectActiveSpace, useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { useAppEffects } from '@/app/useAppEffects'
import { Sidebar } from '@/chrome/Sidebar'
import { FloatingSidebar } from '@/chrome/FloatingSidebar'
import { PageFrame } from '@/browser/PageFrame'
import { WebviewLayer } from '@/browser/WebviewLayer'
import { PageOverlays } from '@/browser/PageOverlays'
import { CommandBar } from '@/features/command/CommandBar'
import { GravityWell } from '@/features/overview/GravityWell'
import { PeekLayer } from '@/features/peek/PeekLayer'
import { FindBar } from '@/features/find/FindBar'
import { Toasts } from '@/features/toast/Toasts'
import { PermissionPrompt } from '@/features/permissions/PermissionPrompt'
import { Cheatsheet } from '@/features/cheatsheet/Cheatsheet'
import { SettingsSheet } from '@/features/settings/SettingsSheet'
import { Onboarding } from '@/features/onboarding/Onboarding'

/** The window surface behind the sidebar: flat graphite (or paper) with a faint grain. */
function SpaceBackdrop() {
  const space = useBrowser(selectActiveSpace)
  return (
    <div className="grain pointer-events-none absolute inset-0 -z-10" style={{ background: 'var(--window)' }}>
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
  const ready = useBrowser((s) => s.ready)
  const motionPref = useSettings((s) => s.motion)
  const reducedMotion = motionPref === 'always' ? 'never' : motionPref === 'never' ? 'always' : 'user'

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <div className="relative isolate flex h-full w-full">
        <SpaceBackdrop />
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
          <SettingsSheet />
          <Cheatsheet />
          <Toasts />
        </>
      )}
      <Onboarding />
    </MotionConfig>
  )
}
