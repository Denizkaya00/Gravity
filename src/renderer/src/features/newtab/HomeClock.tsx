import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring } from '@/lib/springs'

/** The current time, updated on each minute boundary rather than every second. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const d = new Date()
      const untilNext = 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds())
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, untilNext + 25)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return now
}

/** A digit group that settles in from below when it changes, like the rest of Gravity. */
function Ticking({ value }: { value: string }) {
  return (
    // The clip box reaches well past the digits (and gives the room back), so it
    // never cuts off their soft shadow, which shows over a bright sky.
    <span className="relative -mx-[0.45em] -my-[0.4em] inline-flex overflow-hidden px-[0.45em] py-[0.4em]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '0.45em', opacity: 0, filter: 'blur(4px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: '-0.45em', opacity: 0, filter: 'blur(4px)' }}
          transition={spring.gentle}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/** 12- or 24-hour, as the Mac's region uses it (24-hour in most of the world). */
function regionHourCycle(): 'h12' | 'h23' {
  const region = window.gravity?.systemLocale ?? navigator.language
  try {
    const loc = new Intl.Locale(region) as Intl.Locale & { getHourCycles?: () => string[]; hourCycles?: string[] }
    const cycle = loc.getHourCycles?.()[0] ?? loc.hourCycles?.[0] ?? new Intl.DateTimeFormat(region, { hour: 'numeric' }).resolvedOptions().hourCycle
    return cycle === 'h11' || cycle === 'h12' ? 'h12' : 'h23'
  } catch {
    return 'h23'
  }
}

/**
 * The time and date on Home: a large, light time and a monospaced date beneath
 * it. English like the rest of the interface, in the clock format of the Mac's region.
 */
export function HomeClock() {
  const now = useMinute()
  const { time, weekday, date } = useMemo(
    () => ({
      time: new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', hourCycle: regionHourCycle() }),
      weekday: new Intl.DateTimeFormat('en', { weekday: 'long' }),
      date: new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long' })
    }),
    []
  )

  return (
    <div className="flex flex-col items-center" data-testid="home-clock">
      <time
        dateTime={now.toISOString()}
        className="font-display text-[clamp(40px,7vh,68px)] leading-none font-extralight tracking-[-0.035em] text-text tabular-nums [text-shadow:0_2px_28px_rgb(0_0_0/0.55)]"
      >
        {time.formatToParts(now).map((part, i) =>
          part.type === 'hour' || part.type === 'minute' ? (
            <Ticking key={i} value={part.value} />
          ) : part.type === 'dayPeriod' ? (
            <span key={i} className="ml-[0.2em] align-[0.9em] font-mono text-[0.2em] tracking-[0.08em] text-dim uppercase">
              {part.value}
            </span>
          ) : (
            // The separator sits a touch higher and quieter than the digits.
            <span key={i} className="relative -top-[0.06em] mx-[0.02em] text-dim">
              {part.value.trim() || part.value}
            </span>
          )
        )}
      </time>
      <div lang="en" className="label mt-3.5 flex items-center gap-2 text-[10.5px] text-dim [text-shadow:0_1px_12px_rgb(0_0_0/0.6)]">
        <span>{weekday.format(now)}</span>
        <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
        <span>{date.format(now)}</span>
      </div>
    </div>
  )
}
