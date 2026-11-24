import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, LayoutGrid, RotateCw, Waypoints, WifiOff, Zap } from 'lucide-react'
import { useBrowser } from '@/state/browser'
import { useRuntime } from '@/state/runtime'
import { useSettings } from '@/state/settings'
import { useSlots, useUI, type Rect, type SlotName } from '@/state/ui'
import { BorderBeam } from '@/components/magic/border-beam'
import { page } from './registry'
import { useAssignments } from './WebviewLayer'
import { useSwipe, SWIPE_THRESHOLD } from '@/features/swipe/swipeStore'
import { usePinch } from '@/features/pinch/pinchStore'
import { spring } from '@/lib/springs'
import { displayHost } from '@shared/url'
import { isRouteError, siteOf } from '@shared/tunnel'

function AtRect({ rect, z, children, interactive = false }: { rect: Rect; z: number; children: ReactNode; interactive?: boolean }) {
  return (
    <div
      className="fixed overflow-hidden rounded-[10px]"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        zIndex: z,
        pointerEvents: interactive ? 'auto' : 'none'
      }}
    >
      {children}
    </div>
  )
}

/**
 * While a page loads, a single faint beam travels around the frame; when it
 * finishes, a hairline sweeps once along the top edge.
 */
function LoadingBeam({ id, rect }: { id: string; rect: Rect }) {
  const loading = useRuntime((s) => s.tabs[id]?.loading ?? false)
  const tick = useRuntime((s) => s.tabs[id]?.loadedTick ?? 0)
  const [sweep, setSweep] = useState(0)
  useEffect(() => {
    if (tick) setSweep(tick)
  }, [tick])
  return (
    <AtRect rect={rect} z={15}>
      <AnimatePresence>
        {loading && (
          <motion.div className="absolute inset-0 rounded-[inherit]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
            <BorderBeam size={140} duration={3.2} borderWidth={1.5} colorFrom="var(--accent)" colorTo="transparent" />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {sweep > 0 && !loading && (
          <motion.div
            key={sweep}
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
            initial={{ x: '-100%', opacity: 0.9 }}
            animate={{ x: '100%', opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.3, 0, 0.2, 1] }}
            onAnimationComplete={() => setSweep(0)}
          />
        )}
      </AnimatePresence>
    </AtRect>
  )
}

/** At most one automatic retry on a new Tor exit per tab in this long. */
const TUNNEL_RETRY_MS = 60_000

/** A tab's first load can fail before its page is ready to take another URL, so wait for it. */
function loadWhenReady(id: string, url: string, tries = 30): void {
  if (page.url(id) !== undefined) return page.load(id, url)
  if (tries > 0) setTimeout(() => loadWhenReady(id, url, tries - 1), 100)
}

function ErrorOverlay({ id, rect, z }: { id: string; rect: Rect; z: number }) {
  const error = useRuntime((s) => s.tabs[id]?.error)
  const crashed = useRuntime((s) => s.tabs[id]?.crashed)
  const retryAt = useRuntime((s) => s.tabs[id]?.tunnelRetryAt)
  const tunnelMode = useSettings((s) => s.tunnel)
  const bypass = useSettings((s) => s.tunnelBypass)
  const tunnel = useUI((s) => s.tunnel)
  const privateTab = useBrowser((s) => !!s.spaces.find((sp) => sp.id === s.tabs[id]?.spaceId)?.private)
  const show = !!error || !!crashed

  // A page that fails through the Tunnel may only be blocked on this exit, or tor may not be ready yet.
  const site = error ? siteOf(error.url) : null
  const tunneled = tunnelMode === 'all' || (tunnelMode === 'private' && privateTab)
  const viaTunnel = !!error && !!site && tunneled && isRouteError(error.code) && !(bypass.includes(site) && !privateTab)
  const waiting = viaTunnel && tunnel.state !== 'on'
  const due = viaTunnel && tunnel.state === 'on' && (retryAt === undefined || Date.now() - retryAt > TUNNEL_RETRY_MS)

  const load = (url: string) => {
    useRuntime.getState().patch(id, { error: undefined, crashed: false })
    page.load(id, url)
  }
  const anotherExit = (url: string) => {
    useRuntime.getState().patch(id, { tunnelRetryAt: Date.now() })
    // The new navigation clears the error itself (did-start-loading), so the page never sits blank.
    void window.gravity.tunnel.newCircuit().then(() => loadWhenReady(id, url))
  }
  const skipTunnel = async (url: string, host: string) => {
    await useSettings.getState().update({ tunnelBypass: [...new Set([...bypass, host])] })
    useUI.getState().toast(`${host} now opens without the Tunnel`, 'shield')
    load(url)
  }

  // Retry once on a new exit; this also reloads pages that failed while the Tunnel was connecting.
  useEffect(() => {
    if (due && error) anotherExit(error.url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, error])

  const offline = error && [-106, -105, -21, -137].includes(error.code)
  const cert = error && error.code <= -200 && error.code > -300
  const title = crashed
    ? 'This page stopped working.'
    : due
      ? 'Trying another Tor exit.'
      : waiting
        ? tunnel.state === 'error'
          ? 'The Tunnel isn’t connected.'
          : 'The Tunnel is still connecting.'
        : viaTunnel
          ? 'This site isn’t loading through the Tunnel.'
          : offline
            ? 'No connection.'
            : cert
              ? 'This connection isn’t private.'
              : 'This page couldn’t be reached.'
  const detail = waiting
    ? tunnel.state === 'error'
      ? (tunnel.message ?? 'Tor stopped.')
      : `It loads as soon as Tor is ready (${tunnel.progress}%).`
    : viaTunnel && !due
      ? 'Some sites block or drop connections from Tor. Gravity already tried another exit.'
      : null
  return (
    <AnimatePresence>
      {show && (
        <AtRect rect={rect} z={z} interactive>
          <motion.div
            className="grain relative flex h-full w-full items-center justify-center overflow-hidden bg-canvas"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={spring.settle}
              className="w-[420px]"
              data-testid="page-error"
            >
              <div className="label mb-4 flex items-center gap-2">
                {crashed ? <Zap size={11} /> : viaTunnel ? <Waypoints size={11} /> : <WifiOff size={11} />}
                {crashed ? 'renderer gone' : viaTunnel ? `tunnel · error ${error?.code}` : `error ${error?.code}`}
              </div>
              <h2 className="font-display text-[24px] font-medium tracking-tight text-text">{title}</h2>
              {error && (
                <p className="mt-2 font-mono text-[12px] leading-relaxed text-faint">
                  {displayHost(error.url)}
                  <br />
                  {error.description || 'Load failed'}
                </p>
              )}
              {detail && <p className="mt-3 text-[12.5px] leading-relaxed text-dim">{detail}</p>}
              {!due && (
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (viaTunnel && !waiting && error) return anotherExit(error.url)
                      if (error?.url) load(error.url)
                      else {
                        useRuntime.getState().patch(id, { error: undefined, crashed: false })
                        page.reload(id)
                      }
                    }}
                    className="flex items-center gap-2 rounded-[7px] border border-hairline-strong px-3.5 py-1.5 text-[12.5px] text-text hover:bg-hover"
                  >
                    <RotateCw size={13} /> {viaTunnel && !waiting ? 'Try another exit' : 'Try again'}
                  </button>
                  {viaTunnel && !waiting && !privateTab && error && site && (
                    <button
                      type="button"
                      onClick={() => void skipTunnel(error.url, site)}
                      className="rounded-[7px] px-3.5 py-1.5 text-[12.5px] text-dim hover:bg-hover hover:text-text"
                    >
                      Open without the Tunnel
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        </AtRect>
      )}
    </AnimatePresence>
  )
}

/** Safari-style link preview in the bottom-left corner while hovering a link. */
function HoverLink({ id, rect }: { id: string; rect: Rect }) {
  const url = useRuntime((s) => s.tabs[id]?.hoverUrl)
  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.12 } }}
          transition={spring.snappy}
          className="glass-strong pointer-events-none fixed z-[20] max-w-[60%] truncate rounded-[6px] px-2 py-1 font-mono text-[11px] text-dim"
          style={{ left: rect.left + 8, top: rect.top + rect.height - 34 }}
        >
          {url}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** The bubble that fills up while you two-finger swipe toward back/forward. */
function SwipeIndicator({ id, rect }: { id: string; rect: Rect }) {
  const s = useSwipe()
  const active = s.tabId === id && Math.abs(s.amount) > 12
  const dir = s.amount < 0 ? 'back' : 'forward'
  const progress = Math.min(1, Math.abs(s.amount) / SWIPE_THRESHOLD)
  const armed = progress >= 1
  const x = dir === 'back' ? rect.left + 14 + progress * 40 : rect.left + rect.width - 62 - progress * 40
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none fixed z-[20] flex h-10 w-10 items-center justify-center rounded-full"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{
            opacity: 0.35 + progress * 0.65,
            scale: armed ? 1.05 : 0.7 + progress * 0.3,
            left: x,
            top: rect.top + rect.height / 2 - 20
          }}
          exit={{ opacity: 0, scale: s.committed ? 1.6 : 0.4 }}
          transition={spring.snappy}
          style={{
            background: armed ? 'var(--text)' : 'var(--glass-strong)',
            boxShadow: 'var(--shadow)',
            border: '1px solid var(--hairline)'
          }}
        >
          {dir === 'back' ? (
            <ArrowLeft size={18} style={{ color: armed ? 'var(--frame-bg)' : 'var(--text-dim)' }} />
          ) : (
            <ArrowRight size={18} style={{ color: armed ? 'var(--frame-bg)' : 'var(--text-dim)' }} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** The bubble that fills up while you pinch in on a page at 100%, toward the Gravity Well. */
function PinchIndicator({ id, rect }: { id: string; rect: Rect }) {
  const s = usePinch()
  const active = s.tabId === id && s.progress > 0.08
  const armed = s.progress >= 1
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none fixed z-[20] flex h-10 w-10 items-center justify-center rounded-full"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 0.35 + s.progress * 0.65, scale: armed ? 1.05 : 0.7 + s.progress * 0.3 }}
          exit={{ opacity: 0, scale: 0.4 }}
          transition={spring.snappy}
          style={{
            left: rect.left + rect.width / 2 - 20,
            top: rect.top + rect.height / 2 - 20,
            background: armed ? 'var(--text)' : 'var(--glass-strong)',
            boxShadow: 'var(--shadow)',
            border: '1px solid var(--hairline)'
          }}
        >
          <LayoutGrid size={18} style={{ color: armed ? 'var(--frame-bg)' : 'var(--text-dim)' }} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Everything drawn on top of a visible page: beams, errors, hover link, swipe and pinch bubbles. */
export function PageOverlays() {
  const assigned = useAssignments()
  const rects = useSlots((s) => s.rects)
  const overview = useUI((s) => s.overview)
  if (overview) return null
  return (
    <>
      {Object.entries(assigned).map(([id, slot]) => {
        const rect = rects[slot as SlotName]
        if (!rect || slot === 'full') return null
        return (
          <div key={id}>
            {slot !== 'peek' && <LoadingBeam id={id} rect={rect} />}
            <ErrorOverlay id={id} rect={rect} z={slot === 'peek' ? 61 : 12} />
            {slot !== 'peek' && <HoverLink id={id} rect={rect} />}
            {slot !== 'peek' && <SwipeIndicator id={id} rect={rect} />}
            {slot !== 'peek' && <PinchIndicator id={id} rect={rect} />}
          </div>
        )
      })}
    </>
  )
}
