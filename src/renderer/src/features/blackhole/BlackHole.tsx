import { useEffect, useRef, useState } from 'react'
import { useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { cn } from '@/lib/utils'
import { GravityField } from '@/features/newtab/GravityField'
import { COMPOSITE, TRACE, VERTEX } from './shader'
import { currentFlare, useBlackHole } from './store'

export interface BlackHoleCamera {
  /** Distance from the singularity, in Schwarzschild radii. */
  distance: number
  /** Angle above the disk plane, radians. */
  inclination: number
  /** Orbit angle around the hole, radians. */
  azimuth: number
}

export const DEFAULT_CAMERA: BlackHoleCamera = { distance: 40, inclination: 0.1, azimuth: 0.6 }
/**
 * Where the hole sits across the page on Home, as a fraction of the page width: right of
 * centre at rest, and as you approach it slides to the left edge, half behind the sidebar.
 */
export const HOME_TRACK = { rest: 2 / 3, near: 0 }
/** Camera distance by which an approach has slid the hole all the way to `track.near`. */
const TRACK_NEAR_DISTANCE = 8
const LIMITS = { minDistance: 5, maxDistance: 120, minIncl: -1.25, maxIncl: 1.25 }

/** Frame budget for the black hole: it is scenery, the interface must stay smooth. */
const IDLE_FPS = 30
/**
 * Trace resolution, in rays per CSS pixel. The maximum is a fixed budget: at
 * 0.6 the trace and composite together cost the GPU no more than the old
 * renderer did at 0.45 (measured on an M3). It only drops if frames run late.
 */
const SCALE_MIN = 0.45
const SCALE_MAX = 0.6

interface Props {
  className?: string
  /** Screen offset of the hole from the centre, in units of viewport height. */
  center?: [number, number]
  /**
   * Slide the hole sideways with the zoom, instead of holding it at `center[0]`.
   * Fractions of the canvas width (0 left edge, 1 right edge): `rest` at the starting
   * distance, `near` once the camera has come in close. Changes glide.
   */
  track?: { rest: number; near: number }
  /** Initial camera. */
  camera?: Partial<BlackHoleCamera>
  /** When set, the camera glides to this distance whenever it changes. */
  distance?: number
  /** Start this far away and fall toward the camera distance. */
  introDistance?: number
  /** Expose this camera to `useBlackHole().controller` (drag to orbit, scroll to approach). */
  interactive?: boolean
  exposure?: number
  /** Image tilt in radians, like a camera held slightly off level. */
  roll?: number
  paused?: boolean
}

function link(gl: WebGL2RenderingContext, fragment: string): WebGLProgram {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, shader(gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragment))
  gl.bindAttribLocation(p, 0, 'aPos')
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error')
  return p
}

interface Target {
  fbo: WebGLFramebuffer
  light: WebGLTexture
  sky: WebGLTexture
  w: number
  h: number
}

function makeTarget(gl: WebGL2RenderingContext, w: number, h: number): Target {
  const tex = () => {
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }
  const light = tex()
  const sky = tex()
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, light, 0)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, sky, 0)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { fbo, light, sky, w, h }
}

function freeTarget(gl: WebGL2RenderingContext, t: Target | null) {
  if (!t) return
  gl.deleteFramebuffer(t.fbo)
  gl.deleteTexture(t.light)
  gl.deleteTexture(t.sky)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A ray-traced Schwarzschild black hole on a canvas.
 *
 * Light is traced at a reduced, fixed-budget resolution that steps down if
 * frames run late, and the stars are composited at full Retina resolution. The loop runs at
 * 30fps (60 while you steer the camera), pauses when hidden, recovers from a
 * lost GPU context on a fresh canvas, and falls back to a static drawing only
 * if WebGL2 itself is unavailable.
 */
export function BlackHole({
  className,
  center = [0, 0],
  track,
  camera,
  distance,
  introDistance,
  interactive = false,
  exposure = 1,
  roll = -0.22,
  paused = false
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  // The GPU dropped the context and hasn't given a working one back yet.
  const [recovering, setRecovering] = useState(false)
  // Bumped to get a brand-new <canvas> (and so a fresh WebGL context) after a context loss.
  const [generation, setGeneration] = useState(0)
  const retries = useRef(0)
  const mode = useSettings((s) => s.blackHole)
  const motion = useSettings((s) => s.motion)
  const enabled = mode !== 'off'

  // Everything the render loop reads lives in refs, so React never re-renders per frame.
  const initial = useRef<BlackHoleCamera>({ ...DEFAULT_CAMERA, ...camera, ...(distance ? { distance } : {}) })
  const target = useRef<BlackHoleCamera>({ ...initial.current })
  const current = useRef<BlackHoleCamera>({ ...initial.current, distance: introDistance ?? initial.current.distance })
  /** Render at full rate until this time (performance.now()), e.g. while dragging. */
  const boostUntil = useRef(introDistance ? performance.now() + 4000 : 0)

  const still = mode === 'still' || motion === 'never' || (motion === 'user' && prefersReducedMotion())
  // Read by the running loop, so changing these never restarts the renderer.
  const props = useRef({ center, track, exposure, roll, paused, still })
  props.current = { center, track, exposure, roll, paused, still }

  useEffect(() => {
    if (distance === undefined) return
    target.current.distance = distance
    boostUntil.current = performance.now() + 1500
  }, [distance])

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    // A lost context can't be used; try again on a fresh canvas. While the GPU is
    // resetting (after sleep, a driver reset or heavy load elsewhere) every attempt
    // can fail for a while, so back off and keep trying, showing the drawing in the
    // meantime. Giving up after a few quick tries left it stuck until a restart.
    let retryTimer = 0
    const retry = () => {
      const n = retries.current++
      if (n >= 2) setRecovering(true)
      retryTimer = window.setTimeout(() => setGeneration((g) => g + 1), Math.min(10_000, 250 * 3 ** n))
      return () => window.clearTimeout(retryTimer)
    }
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    })
    if (!gl) {
      setFailed(true)
      return
    }
    if (gl.isContextLost()) return retry()
    if (!gl.getExtension('EXT_color_buffer_float')) {
      console.warn('[black hole] float render targets unavailable, using a static drawing')
      setFailed(true)
      return
    }

    let trace: WebGLProgram
    let composite: WebGLProgram
    try {
      trace = link(gl, TRACE)
      composite = link(gl, COMPOSITE)
    } catch (err) {
      if (gl.isContextLost()) return retry()
      console.warn('[black hole] falling back to a static drawing:', err)
      setFailed(true)
      return
    }
    retries.current = 0
    setRecovering(false)

    // One triangle that covers the screen.
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const uT = (n: string) => gl.getUniformLocation(trace, n)
    const uC = (n: string) => gl.getUniformLocation(composite, n)
    const T = {
      res: uT('uRes'),
      time: uT('uTime'),
      camPos: uT('uCamPos'),
      right: uT('uCamRight'),
      up: uT('uCamUp'),
      fwd: uT('uCamFwd'),
      focal: uT('uFocal'),
      center: uT('uCenter'),
      density: uT('uDensity'),
      flare: uT('uFlare'),
      beaming: uT('uBeaming')
    }
    const C = {
      light: uC('uLight'),
      sky: uC('uSky'),
      res: uC('uRes'),
      exposure: uC('uExposure'),
      time: uC('uTime'),
      camPos: uC('uCamPos'),
      right: uC('uCamRight'),
      up: uC('uCamUp'),
      fwd: uC('uCamFwd'),
      focal: uC('uFocal'),
      center: uC('uCenter'),
      density: uC('uDensity'),
      flare: uC('uFlare')
    }

    // Resolution adapts to frame intervals, not GPU timer queries: on Apple GPUs those
    // read several times too high (queued work, low idle clocks) and pinned the trace
    // at its lowest resolution even with the GPU mostly idle.
    let scale = SCALE_MAX // trace resolution, in rays per CSS pixel
    let rt: Target | null = null
    let dirty = true
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const fw = Math.max(64, Math.round(rect.width * dpr))
      const fh = Math.max(64, Math.round(rect.height * dpr))
      if (canvas.width !== fw || canvas.height !== fh) {
        canvas.width = fw
        canvas.height = fh
      }
      const lw = Math.max(64, Math.round(rect.width * scale))
      const lh = Math.max(64, Math.round(rect.height * scale))
      if (!rt || rt.w !== lw || rt.h !== lh) {
        freeTarget(gl, rt)
        rt = makeTarget(gl, lw, lh)
      }
      // For tests and debugging: the trace resolution, in CSS pixels.
      canvas.dataset.traceScale = scale.toFixed(2)
      dirty = true
    }
    // A panel animating beside the canvas resizes it every frame, and reallocating
    // the buffers every frame stutters. Reallocate at most every 100ms, plus once
    // when it settles; in between the canvas just stretches a little.
    let lastResize = 0
    let resizeTimer = 0
    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer)
      const wait = 100 - (performance.now() - lastResize)
      const run = () => {
        lastResize = performance.now()
        resize()
      }
      if (wait <= 0) run()
      else resizeTimer = window.setTimeout(run, wait)
    })
    ro.observe(canvas)
    resize()

    // Gentle parallax from wherever the pointer is in the window.
    const parallax = { x: 0, y: 0, sx: 0, sy: 0 }
    const onMove = (e: PointerEvent) => {
      parallax.x = e.clientX / window.innerWidth - 0.5
      parallax.y = e.clientY / window.innerHeight - 0.5
    }
    window.addEventListener('pointermove', onMove)

    let time = 7.0
    let last = performance.now()
    let lastRender = 0
    let raf = 0
    const intervals: number[] = []
    let settle = 10 // frames to ignore after a (re)allocation
    let drops = 0
    let smoothWindows = 0
    const centerNow = [...props.current.center] as [number, number]
    // Start where a track puts the hole rather than gliding there from the middle.
    let snapTrack = true

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dtMs = Math.min(100, now - last)
      last = now
      if (document.hidden) return
      const P = props.current
      // While paused, keep the last image, but redraw if the canvas was resized (which clears it).
      if (P.paused && !dirty) return

      const dt = dtMs / 1000
      const tgt = target.current
      const cur = current.current
      if (!P.still) tgt.azimuth += dt * 0.018 // a slow orbit, so the view is never quite static
      const k = 1 - Math.exp(-dt * 3.2)
      const kFar = 1 - Math.exp(-dt * 0.9)
      const before = cur.distance + cur.inclination + cur.azimuth + centerNow[0] + centerNow[1]
      cur.azimuth += (tgt.azimuth - cur.azimuth) * k
      cur.inclination += (tgt.inclination - cur.inclination) * k
      cur.distance += (tgt.distance - cur.distance) * (Math.abs(tgt.distance - cur.distance) > 8 ? kFar : k)
      parallax.sx += (parallax.x - parallax.sx) * k
      parallax.sy += (parallax.y - parallax.sy) * k
      // On a track the hole slides from `rest` to `near` as the camera comes in, evenly per scroll step.
      let cx = P.center[0]
      if (P.track) {
        const rest = initial.current.distance
        const s = Math.min(1, Math.max(0, Math.log(rest / cur.distance) / Math.log(rest / TRACK_NEAR_DISTANCE)))
        const t = s * s * (3 - 2 * s)
        cx = (P.track.rest + (P.track.near - P.track.rest) * t - 0.5) * (canvas.width / canvas.height)
      }
      centerNow[0] = snapTrack && P.track ? cx : centerNow[0] + (cx - centerNow[0]) * k
      snapTrack = false
      centerNow[1] += (P.center[1] - centerNow[1]) * k
      const moving =
        Math.abs(cur.distance + cur.inclination + cur.azimuth + centerNow[0] + centerNow[1] - before) > 1e-5 ||
        Math.abs(parallax.x - parallax.sx) > 1e-4

      const flare = currentFlare(useBlackHole.getState(), now)
      if (P.still && !moving && !dirty && flare < 0.001) return
      // 30fps is plenty for slowly orbiting gas; steering the camera gets the full rate.
      const boosted = now < boostUntil.current
      if (!dirty && !boosted && now - lastRender < 1000 / IDLE_FPS - 2) return
      const sinceRender = Math.min(100, now - lastRender) / 1000
      lastRender = now
      dirty = false
      if (!P.still) time += sinceRender

      // Resolution changes only on sustained evidence, between two levels, so it never
      // visibly flickers: down after ~3s of mostly late frames, back up after ~30s of
      // smooth ones, and it stays down once it has had to come down twice.
      // Frames just after a change are skipped: reallocating is itself a hitch. So are
      // frames while the window is in the background, where macOS throttles it.
      if (settle > 0) settle--
      else if (document.hasFocus()) intervals.push(dtMs)
      if (intervals.length >= 90) {
        // The display's own refresh interval is the shortest gap seen.
        const refresh = Math.min(...intervals)
        const late = intervals.filter((d) => d > refresh * 1.6).length / intervals.length
        intervals.length = 0
        if (scale === SCALE_MAX && late > 0.3) {
          scale = SCALE_MIN
          drops++
          smoothWindows = 0
          settle = 10
          resize()
        } else if (scale === SCALE_MIN && drops < 2) {
          smoothWindows = late < 0.05 ? smoothWindows + 1 : 0
          if (smoothWindows >= 10) {
            scale = SCALE_MAX
            settle = 10
            resize()
          }
        }
      }
      if (!rt) return

      // Camera basis.
      const az = cur.azimuth + parallax.sx * 0.12
      const incl = Math.min(LIMITS.maxIncl, Math.max(LIMITS.minIncl, cur.inclination - parallax.sy * 0.06))
      const d = cur.distance
      const pos = [d * Math.cos(incl) * Math.sin(az), d * Math.sin(incl), d * Math.cos(incl) * Math.cos(az)]
      const fwd = pos.map((v) => -v / d)
      let right = [fwd[2], 0, -fwd[0]]
      const rl = Math.hypot(right[0], right[2]) || 1
      right = right.map((v) => v / rl)
      const up = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0]
      ]
      const cr = Math.cos(P.roll)
      const sr = Math.sin(P.roll)
      const right2 = right.map((v, i) => v * cr + up[i] * sr)
      const up2 = up.map((v, i) => v * cr - right[i] * sr)

      // Matter in the disk follows what's open: more tabs, a denser disk.
      const B = useBrowser.getState()
      const tabCount = (B.order[B.activeSpaceId] ?? []).length
      const downloading = useUI.getState().downloads.some((x) => x.state === 'progressing')
      const density = Math.min(1, 0.3 + tabCount / 18 + (downloading ? 0.25 : 0))

      // Pass 1: trace light at low resolution.
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo)
      gl.viewport(0, 0, rt.w, rt.h)
      gl.useProgram(trace)
      gl.uniform2f(T.res, rt.w, rt.h)
      gl.uniform1f(T.time, time)
      gl.uniform3f(T.camPos, pos[0], pos[1], pos[2])
      gl.uniform3f(T.right, right2[0], right2[1], right2[2])
      gl.uniform3f(T.up, up2[0], up2[1], up2[2])
      gl.uniform3f(T.fwd, fwd[0], fwd[1], fwd[2])
      gl.uniform1f(T.focal, 1.55)
      gl.uniform2f(T.center, centerNow[0], centerNow[1])
      gl.uniform1f(T.density, density)
      gl.uniform1f(T.flare, flare)
      gl.uniform1f(T.beaming, 0.75)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // Pass 2: composite with crisp stars at full resolution.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(composite)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, rt.light)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, rt.sky)
      gl.uniform1i(C.light, 0)
      gl.uniform1i(C.sky, 1)
      gl.uniform2f(C.res, canvas.width, canvas.height)
      gl.uniform1f(C.exposure, P.exposure)
      gl.uniform1f(C.time, time)
      gl.uniform3f(C.camPos, pos[0], pos[1], pos[2])
      gl.uniform3f(C.right, right2[0], right2[1], right2[2])
      gl.uniform3f(C.up, up2[0], up2[1], up2[2])
      gl.uniform3f(C.fwd, fwd[0], fwd[1], fwd[2])
      gl.uniform1f(C.focal, 1.55)
      gl.uniform2f(C.center, centerNow[0], centerNow[1])
      gl.uniform1f(C.density, density)
      gl.uniform1f(C.flare, flare)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(frame)

    // The GPU process can drop contexts (sleep, driver resets). Start over on a new canvas.
    const onLost = (e: Event) => {
      e.preventDefault()
      cancelAnimationFrame(raf)
      retries.current = 0
      setGeneration((g) => g + 1)
    }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.clearTimeout(resizeTimer)
      window.removeEventListener('pointermove', onMove)
      if (!gl.isContextLost()) {
        freeTarget(gl, rt)
        gl.deleteProgram(trace)
        gl.deleteProgram(composite)
        gl.deleteBuffer(buf)
        gl.deleteVertexArray(vao)
        // This effect only re-runs for a new canvas, so release the context right away:
        // browsers cap live WebGL contexts and drop the oldest when there are too many.
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
    }
  }, [enabled, generation])

  // Let the UI above drive this camera: drag to orbit, scroll to approach, double-click to reset.
  useEffect(() => {
    if (!interactive) return
    const boost = () => (boostUntil.current = performance.now() + 1200)
    const controller = {
      orbit: (dx: number, dy: number) => {
        target.current.azimuth -= dx * 0.005
        target.current.inclination = Math.min(LIMITS.maxIncl, Math.max(LIMITS.minIncl, target.current.inclination + dy * 0.004))
        boost()
      },
      zoom: (deltaY: number) => {
        const t = target.current
        t.distance = Math.min(LIMITS.maxDistance, Math.max(LIMITS.minDistance, t.distance * Math.exp(deltaY * 0.0015)))
        boost()
      },
      reset: () => {
        target.current = { ...initial.current, azimuth: current.current.azimuth }
        boost()
      }
    }
    useBlackHole.getState().setController(controller)
    return () => {
      if (useBlackHole.getState().controller === controller) useBlackHole.getState().setController(null)
    }
  }, [interactive])

  if (!enabled || failed) {
    return <GravityField className={cn('h-full w-full', className)} />
  }
  return (
    <>
      {/* While the GPU is away the drawing stands in; the canvas stays mounted to keep retrying. */}
      {recovering && <GravityField className={cn('h-full w-full', className)} />}
      <canvas
        key={generation}
        ref={canvasRef}
        className={cn('block h-full w-full', recovering && 'hidden', className)}
        data-testid="black-hole"
      />
    </>
  )
}
