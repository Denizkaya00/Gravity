import { useSyncExternalStore } from 'react'
import { coarsen, isNight, placeOfTimeZone, type Place } from '@shared/sun'
import { useSettings } from '@/state/settings'

/**
 * Day or night for the painted scenes. Day and Night are fixed; Automatic
 * follows the sun where you are. The sun's position is worked out here, from
 * the clock and a place, by `shared/sun.ts`.
 *
 * The place comes from the Mac's location services, asked once a painted scene
 * is showing in Automatic. It is coarsened to about 10 km, kept in memory only,
 * and never saved or sent anywhere. Until it arrives, or if it's denied, the
 * time zone's main city stands in (Europe/Istanbul → Istanbul); failing that,
 * 07:00 to 19:00 on the clock is day.
 */

/** How often to look at the sun again. A minute late at sunrise is fine. */
const TICK = 30_000
/** How long a location answer is good for before asking again (people travel). */
const RELOCATE = 6 * 3600_000

let located: Place | null = null
let askedAt = -Infinity

let current = false
const listeners = new Set<() => void>()
let stop: (() => void) | null = null

function zonePlace(): Place | null {
  try {
    return placeOfTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return null
  }
}

function evaluate(): boolean {
  const now = new Date()
  const place = located ?? zonePlace()
  return isNight(useSettings.getState().daylight, now.getTime(), place, now.getHours() + now.getMinutes() / 60)
}

function locate(then: () => void): void {
  if (useSettings.getState().daylight !== 'auto' || !navigator.geolocation) return
  if (Date.now() - askedAt < RELOCATE) return
  askedAt = Date.now()
  navigator.geolocation.getCurrentPosition(
    (p) => {
      located = coarsen({ lat: p.coords.latitude, lon: p.coords.longitude })
      then()
    },
    // Denied, unavailable or too slow: the time zone keeps standing in.
    () => {},
    { enableHighAccuracy: false, maximumAge: RELOCATE, timeout: 20_000 }
  )
}

function start(): () => void {
  const tick = () => {
    const next = evaluate()
    if (next === current) return
    current = next
    for (const l of listeners) l()
  }
  current = evaluate()
  locate(tick)
  const timer = window.setInterval(() => {
    locate(tick)
    tick()
  }, TICK)
  const unsubscribe = useSettings.subscribe((s, prev) => {
    if (s.daylight === prev.daylight) return
    locate(tick)
    tick()
  })
  return () => {
    window.clearInterval(timer)
    unsubscribe()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!stop) stop = start()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && stop) {
      stop()
      stop = null
    }
  }
}

/** Whether the painted scenes show night right now. Only the scenes that draw a sky should ask. */
export function useNight(): boolean {
  return useSyncExternalStore(subscribe, () => (stop ? current : evaluate()))
}
