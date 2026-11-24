import { useEffect, useRef, useState } from 'react'
import { useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { cn } from '@/lib/utils'
import { GravityField } from '@/features/newtab/GravityField'
import { currentFlare, useBlackHole } from '@/features/blackhole/store'
import { VERTEX } from './glsl'
import { useNight } from './daylight'
import type { PaintedScene } from './scenes'

/** Scenery: 30fps is plenty for drifting mist and slow water. */
const FPS = 30

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** '#b4694a' → [r, g, b] in 0..1. */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [0.706, 0.412, 0.29]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
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

interface Props {
  scene: PaintedScene
  className?: string
  /** Offset of the composition's centre, in units of viewport height (as for the black hole). */
  center?: [number, number]
  /** Hold the current frame. */
  paused?: boolean
  /** Draw a single frame and stop, whatever the motion setting (for previews). */
  still?: boolean
}

/**
 * A painted scene: one fragment shader, drawn at a reduced resolution and
 * stretched to fit, at 30fps, paused while hidden or covered. It drifts with the
 * pointer, flares softly when a tab closes, and thickens as tabs pile up. Like
 * the black hole it recovers from a lost GPU context, showing the line drawing
 * meanwhile.
 */
export function ShaderScene({ scene, className, center = [0, 0], paused = false, still: forceStill = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [generation, setGeneration] = useState(0)
  const retries = useRef(0)
  const mode = useSettings((s) => s.blackHole)
  const motion = useSettings((s) => s.motion)
  // The interface's accent, for the details that carry it (the mountains' seal).
  const accent = useSettings((s) => s.accent)
  const still = forceStill || mode === 'still' || motion === 'never' || (motion === 'user' && prefersReducedMotion())
  // Day or night, by Settings → Time of day.
  const night = useNight()
  const props = useRef({ center, paused, still, accent, night })
  props.current = { center, paused, still, accent, night }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // As for the black hole: back off and keep trying while the GPU is away.
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
      powerPreference: 'low-power'
    })
    if (!gl) {
      setFailed(true)
      return
    }
    if (gl.isContextLost()) return retry()

    let program: WebGLProgram
    try {
      program = link(gl, scene.fragment)
    } catch (err) {
      if (gl.isContextLost()) return retry()
      console.warn(`[scene ${scene.id}] falling back to a static drawing:`, err)
      setFailed(true)
      return
    }
    retries.current = 0
    setRecovering(false)

    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.useProgram(program)
    const u = (n: string) => gl.getUniformLocation(program, n)
    const U = {
      res: u('uRes'),
      time: u('uTime'),
      center: u('uCenter'),
      parallax: u('uParallax'),
      flare: u('uFlare'),
      density: u('uDensity'),
      accent: u('uAccent'),
      night: u('uNight')
    }
    let accentNow = ''
    // 0 day … 1 night. Sunrise and sunset ease across over a few seconds; a
    // still scene, or the first frame, simply shows the right one.
    let nightNow = props.current.night ? 1 : 0

    let dirty = true
    // Images, for scenes drawn from photographs or prints: the day one as uTex,
    // the night one as uTex2. Drawn without them until they arrive.
    const textures: WebGLTexture[] = []
    let pending = 0
    let revealed = false
    let disposed = false
    const sources: [src: string | undefined, unit: number, name: string][] = [
      [scene.image, 0, 'Tex'],
      [scene.nightImage, 1, 'Tex2']
    ]
    for (const [src, unit, name] of sources) {
      if (!src) continue
      pending++
      gl.uniform1i(u(`u${name}`), unit)
      gl.uniform1f(u(`uHas${name}`), 0)
      const img = new Image()
      img.src = src
      void img
        .decode()
        .then(() => {
          if (disposed || gl.isContextLost()) return
          // A preview is tiny: a small copy is plenty, and spares the GPU.
          let source: HTMLImageElement | HTMLCanvasElement = img
          if (forceStill && img.naturalWidth > 640) {
            const c = document.createElement('canvas')
            c.width = 640
            c.height = Math.round((img.naturalHeight * 640) / img.naturalWidth)
            const g = c.getContext('2d')!
            g.imageSmoothingQuality = 'high'
            g.drawImage(img, 0, 0, c.width, c.height)
            source = c
          }
          const texture = gl.createTexture()!
          textures.push(texture)
          gl.activeTexture(gl.TEXTURE0 + unit)
          gl.bindTexture(gl.TEXTURE_2D, texture)
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
          // Mipmapped: the photo is larger than the canvas, and drifts.
          gl.generateMipmap(gl.TEXTURE_2D)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          gl.uniform2f(u(`u${name}Size`), img.naturalWidth, img.naturalHeight)
          gl.uniform1f(u(`uHas${name}`), 1)
          pending--
          dirty = true
        })
        .catch((err) => {
          console.warn(`[scene ${scene.id}] image failed to load:`, err)
          pending--
          dirty = true
        })
    }
    // The canvas holds fewer pixels than it covers; CSS stretches it, smoothly.
    // A single still frame (a preview) can afford every device pixel.
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const scale = forceStill ? Math.min(dpr, 2) : Math.min(scene.scale, dpr)
      const w = Math.max(32, Math.round(rect.width * scale))
      const h = Math.max(32, Math.round(rect.height * scale))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      dirty = true
    }
    // Throttled, as for the black hole: a panel animating beside it resizes it every frame.
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

    const parallax = { x: 0, y: 0, sx: 0, sy: 0 }
    const onMove = (e: PointerEvent) => {
      parallax.x = e.clientX / window.innerWidth - 0.5
      parallax.y = e.clientY / window.innerHeight - 0.5
    }
    window.addEventListener('pointermove', onMove)

    let time = scene.stillTime
    let last = performance.now()
    let lastRender = 0
    let raf = 0
    const centerNow = [...props.current.center] as [number, number]

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(100, now - last) / 1000
      last = now
      if (document.hidden) return
      const P = props.current
      // A still or paused scene can't ease between day and night: it just shows the new one.
      const nightTarget = P.night ? 1 : 0
      if ((P.still || P.paused) && nightNow !== nightTarget) {
        nightNow = nightTarget
        dirty = true
      }
      if (P.paused && !dirty) return
      const flare = currentFlare(useBlackHole.getState(), now)
      if (P.accent !== accentNow) dirty = true
      const turning = Math.abs(nightTarget - nightNow) > 1e-3
      const moving = Math.abs(P.center[0] - centerNow[0]) + Math.abs(P.center[1] - centerNow[1]) > 1e-4
      if (P.still && !dirty && !moving && !turning && flare < 0.001) return
      if (!dirty && now - lastRender < 1000 / FPS - 2) return
      const sinceRender = Math.min(100, now - lastRender) / 1000
      lastRender = now
      dirty = false

      const k = 1 - Math.exp(-dt * 3)
      if (!P.still) {
        time += sinceRender
        parallax.sx += (parallax.x - parallax.sx) * k
        parallax.sy += (parallax.y - parallax.sy) * k
      }
      nightNow = turning ? nightNow + (nightTarget - nightNow) * (1 - Math.exp(-sinceRender * 1.2)) : nightTarget
      centerNow[0] += (P.center[0] - centerNow[0]) * k
      centerNow[1] += (P.center[1] - centerNow[1]) * k
      const B = useBrowser.getState()
      const tabs = (B.order[B.activeSpaceId] ?? []).length

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(U.res, canvas.width, canvas.height)
      gl.uniform1f(U.time, time)
      gl.uniform2f(U.center, centerNow[0], centerNow[1])
      gl.uniform2f(U.parallax, parallax.sx, parallax.sy)
      gl.uniform1f(U.flare, flare)
      gl.uniform1f(U.density, Math.min(1, tabs / 18))
      gl.uniform1f(U.night, nightNow)
      if (P.accent !== accentNow) {
        accentNow = P.accent
        gl.uniform3f(U.accent, ...hexToRgb(P.accent))
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      // Reveal the canvas once it holds a real frame (for an image scene, once
      // its images are in), so a blank canvas never pops in.
      if (!revealed && pending === 0) {
        revealed = true
        canvas.style.opacity = '1'
      }
    }
    raf = requestAnimationFrame(frame)

    const onLost = (e: Event) => {
      e.preventDefault()
      cancelAnimationFrame(raf)
      retries.current = 0
      setGeneration((g) => g + 1)
    }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      disposed = true
      canvas.removeEventListener('webglcontextlost', onLost)
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.clearTimeout(resizeTimer)
      window.removeEventListener('pointermove', onMove)
      if (!gl.isContextLost()) {
        for (const texture of textures) gl.deleteTexture(texture)
        gl.deleteProgram(program)
        gl.deleteBuffer(buf)
        gl.deleteVertexArray(vao)
        // Release the context now: browsers cap live WebGL contexts.
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
    }
  }, [scene, generation, forceStill])

  if (failed) return <GravityField className={cn('h-full w-full', className)} />
  return (
    <>
      {recovering && <GravityField className={cn('h-full w-full', className)} />}
      <canvas
        key={generation}
        ref={canvasRef}
        className={cn('block h-full w-full opacity-0 transition-opacity duration-700 ease-out', recovering && 'hidden', className)}
        data-testid="scene"
        data-scene={scene.id}
        data-daylight={night ? 'night' : 'day'}
        data-variant={scene.variant}
      />
    </>
  )
}
