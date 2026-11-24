import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useSlots, type SlotName } from '@/state/ui'

/** Ask every slot to re-measure for a moment (after layout-changing animations). */
export function kickLayout(): void {
  window.dispatchEvent(new Event('gravity:layout'))
}

/**
 * An invisible placeholder that reports its on-screen rect every frame it
 * changes. The WebviewLayer positions live pages on top of these.
 */
export function Slot({
  name,
  className,
  style,
  children
}: {
  name: SlotName
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const setRect = useSlots((s) => s.setRect)

  useEffect(() => {
    let raf = 0
    let until = 0
    const measure = () => {
      const el = ref.current
      if (!el) return
      const b = el.getBoundingClientRect()
      setRect(name, {
        left: Math.round(b.left),
        top: Math.round(b.top),
        width: Math.round(b.width),
        height: Math.round(b.height)
      })
    }
    // Measure on every frame for a short burst after anything changes, so
    // pages track springy layout animations without polling while idle.
    const loop = () => {
      measure()
      raf = performance.now() < until ? requestAnimationFrame(loop) : 0
    }
    const kick = () => {
      until = performance.now() + 900
      if (!raf) raf = requestAnimationFrame(loop)
    }
    const ro = new ResizeObserver(kick)
    if (ref.current) ro.observe(ref.current)
    ro.observe(document.body)
    window.addEventListener('resize', kick)
    window.addEventListener('gravity:layout', kick)
    measure()
    kick()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', kick)
      window.removeEventListener('gravity:layout', kick)
      setRect(name, null)
    }
  }, [name, setRect])

  return (
    <div ref={ref} data-slot={name} className={className} style={style}>
      {children}
    </div>
  )
}
