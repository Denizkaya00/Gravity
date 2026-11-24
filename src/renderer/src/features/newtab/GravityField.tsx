import { useEffect } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react'

const RINGS = 16
const SPOKES = 12
const CX = 500
const CY = 330

/**
 * A contour drawing of a gravity well: hairline ellipses that crowd toward the
 * centre, like a field diagram in a physics textbook. The well leans gently
 * toward the cursor. Purely decorative, drawn in the hairline colour.
 */
export function GravityField({ className }: { className?: string }) {
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 40, damping: 18, mass: 1.4 })
  const sy = useSpring(my, { stiffness: 40, damping: 18, mass: 1.4 })
  const x = useTransform(sx, (v) => v * 26)
  const y = useTransform(sy, (v) => v * 16)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5)
      my.set(e.clientY / window.innerHeight - 0.5)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [mx, my])

  return (
    <svg viewBox="0 0 1000 660" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <radialGradient id="gf-fade" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="gf-mask">
          <rect width="1000" height="660" fill="url(#gf-fade)" />
        </mask>
      </defs>
      <g mask="url(#gf-mask)">
        <motion.g style={{ x, y }} fill="none" stroke="var(--hairline-strong)" strokeWidth="0.75">
          {Array.from({ length: RINGS }, (_, i) => {
            // Radii grow quadratically, so rings bunch up near the centre like a steep well.
            const t = (i + 1) / RINGS
            const r = 18 + t * t * 560
            return (
              <motion.ellipse
                key={i}
                cx={CX}
                cy={CY + t * 40}
                rx={r}
                ry={r * 0.42}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 - t * 0.55 }}
                transition={{ duration: 1.2, delay: 0.15 + (RINGS - i) * 0.035 }}
              />
            )
          })}
          {Array.from({ length: SPOKES }, (_, i) => {
            const a = (i / SPOKES) * Math.PI * 2
            return (
              <motion.line
                key={`s${i}`}
                x1={CX}
                y1={CY}
                x2={CX + Math.cos(a) * 620}
                y2={CY + 40 + Math.sin(a) * 260}
                strokeDasharray="2 6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                transition={{ duration: 1.6, delay: 0.6 }}
              />
            )
          })}
        </motion.g>
      </g>
    </svg>
  )
}
