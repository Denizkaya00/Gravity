import type { DaylightMode } from './types'
import { TIME_ZONE_ALIASES, TIME_ZONE_PLACES } from './timezones'

/**
 * Day and night for the background scenes, worked out locally: the sun's
 * position from the date and a place, with no lookups and nothing sent anywhere.
 * Good to about a minute, which is plenty for a background.
 */

export interface Place {
  lat: number
  lon: number
}

const RAD = Math.PI / 180

/** The sun is up once its upper edge clears the horizon, refraction included: −0.833°. */
export const HORIZON = -0.833

/** The sun's elevation above the horizon, in degrees, at a time (ms since the epoch) and place. */
export function solarElevation(time: number, place: Place): number {
  // Days since J2000.0, then the low-precision solar coordinates from the
  // Astronomical Almanac (good to about 0.01° between 1950 and 2050).
  const d = time / 86_400_000 + 2440587.5 - 2451545.0
  const g = (357.529 + 0.98560028 * d) * RAD
  const q = 280.459 + 0.98564736 * d
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const e = (23.439 - 0.00000036 * d) * RAD
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const gmst = (280.46061837 + 360.98564736629 * d) * RAD
  const hourAngle = gmst + place.lon * RAD - ra
  const lat = place.lat * RAD
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD
}

/** Whether the sun is up: after sunrise and before sunset. */
export function isSunUp(time: number, place: Place): boolean {
  return solarElevation(time, place) > HORIZON
}

/**
 * The next sunrise or sunset after `time`, in ms, or null if there is none in
 * the next `within` ms (polar day or night).
 */
export function nextSunChange(time: number, place: Place, within = 2 * 86_400_000): number | null {
  const up = isSunUp(time, place)
  const step = 10 * 60_000
  for (let t = time + step; t <= time + within; t += step) {
    if (isSunUp(t, place) === up) continue
    // Narrow it down to a second.
    let lo = t - step
    let hi = t
    while (hi - lo > 1000) {
      const mid = (lo + hi) / 2
      if (isSunUp(mid, place) === up) lo = mid
      else hi = mid
    }
    return Math.round(hi)
  }
  return null
}

/** Roughly where a time zone is (its principal city), or null if it's not a place (UTC, Etc/GMT+3). */
export function placeOfTimeZone(timeZone: string | undefined): Place | null {
  if (!timeZone) return null
  const p = TIME_ZONE_PLACES[timeZone] ?? TIME_ZONE_PLACES[TIME_ZONE_ALIASES[timeZone] ?? '']
  return p ? { lat: p[0], lon: p[1] } : null
}

/**
 * Whether a scene should show night. Day and Night are fixed. Automatic follows
 * the sun at `place`; with no place at all it calls 07:00 to 19:00 on the local
 * clock day (`localHour`, 0 to 24).
 */
export function isNight(mode: DaylightMode, time: number, place: Place | null, localHour: number): boolean {
  if (mode === 'day') return false
  if (mode === 'night') return true
  if (place) return !isSunUp(time, place)
  return localHour < 7 || localHour >= 19
}

/** A coarse copy of a place, about 10 km, which is all the sun needs. */
export function coarsen(place: Place): Place {
  return { lat: Math.round(place.lat * 10) / 10, lon: Math.round(place.lon * 10) / 10 }
}
