import { describe, expect, it } from 'vitest'
import { coarsen, isNight, isSunUp, nextSunChange, placeOfTimeZone, solarElevation } from '../../src/shared/sun'
import { TIME_ZONE_ALIASES, TIME_ZONE_PLACES } from '../../src/shared/timezones'

const ISTANBUL = { lat: 41.01, lon: 28.98 }
const LONDON = { lat: 51.51, lon: -0.13 }
const SYDNEY = { lat: -33.87, lon: 151.21 }
const TROMSO = { lat: 69.65, lon: 18.96 }

const utc = (s: string) => Date.parse(`${s}Z`)
const minutes = (ms: number) => Math.abs(ms) / 60_000

describe('solarElevation', () => {
  it('puts the sun high at local noon in summer and below the horizon at midnight', () => {
    // London, June solstice: noon elevation is 90 − 51.5 + 23.4 ≈ 62°.
    expect(solarElevation(utc('2026-06-21T12:02:00'), LONDON)).toBeCloseTo(61.9, 0)
    expect(solarElevation(utc('2026-06-21T00:00:00'), LONDON)).toBeLessThan(-10)
  })
})

describe('nextSunChange', () => {
  it('finds sunrise and sunset within a couple of minutes', () => {
    // London, June solstice: sunrise 04:43, sunset 21:21 (BST, UTC+1).
    const sunrise = nextSunChange(utc('2026-06-21T00:00:00'), LONDON)!
    expect(minutes(sunrise - utc('2026-06-21T03:43:00'))).toBeLessThan(2)
    expect(minutes(nextSunChange(sunrise, LONDON)! - utc('2026-06-21T20:21:00'))).toBeLessThan(2)
    // Istanbul, 23 November: sunrise 08:00, sunset 17:39 (UTC+3 all year).
    const rise = nextSunChange(utc('2026-11-23T00:00:00'), ISTANBUL)!
    expect(minutes(rise - utc('2026-11-23T05:00:00'))).toBeLessThan(2)
    expect(minutes(nextSunChange(rise, ISTANBUL)! - utc('2026-11-23T14:39:00'))).toBeLessThan(2)
  })

  it('works in the southern hemisphere', () => {
    // Sydney, 21 December: sunrise 05:41, sunset 20:05 local time (UTC+11).
    const sunrise = nextSunChange(utc('2026-12-20T15:00:00'), SYDNEY)!
    expect(minutes(sunrise - utc('2026-12-20T18:41:00'))).toBeLessThan(3)
    const sunset = nextSunChange(sunrise, SYDNEY)!
    expect(minutes(sunset - utc('2026-12-21T09:05:00'))).toBeLessThan(3)
  })

  it('returns null during polar night and midnight sun', () => {
    expect(nextSunChange(utc('2026-12-21T11:00:00'), TROMSO)).toBeNull()
    expect(isSunUp(utc('2026-12-21T11:00:00'), TROMSO)).toBe(false)
    expect(nextSunChange(utc('2026-06-21T23:00:00'), TROMSO)).toBeNull()
    expect(isSunUp(utc('2026-06-21T23:00:00'), TROMSO)).toBe(true)
  })
})

describe('isNight', () => {
  const evening = utc('2026-11-23T17:01:00') // 20:01 in Istanbul
  const morning = utc('2026-11-23T07:00:00') // 10:00 in Istanbul

  it('follows the sun in Automatic', () => {
    expect(isNight('auto', evening, ISTANBUL, 20)).toBe(true)
    expect(isNight('auto', morning, ISTANBUL, 10)).toBe(false)
  })

  it('keeps Day and Night fixed', () => {
    expect(isNight('day', evening, ISTANBUL, 20)).toBe(false)
    expect(isNight('night', morning, ISTANBUL, 10)).toBe(true)
  })

  it('falls back to the local clock with no place', () => {
    expect(isNight('auto', evening, null, 20)).toBe(true)
    expect(isNight('auto', evening, null, 7)).toBe(false)
    expect(isNight('auto', evening, null, 6.99)).toBe(true)
    expect(isNight('auto', evening, null, 18.5)).toBe(false)
  })
})

describe('placeOfTimeZone', () => {
  it('places a time zone at its principal city', () => {
    expect(placeOfTimeZone('Europe/Istanbul')).toEqual({ lat: 41, lon: 29 })
    expect(placeOfTimeZone('America/New_York')).toEqual({ lat: 40.7, lon: -74 })
  })

  it('understands the older names Chromium reports', () => {
    expect(placeOfTimeZone('Asia/Calcutta')).toEqual(placeOfTimeZone('Asia/Kolkata'))
    expect(placeOfTimeZone('Europe/Kiev')).toEqual(placeOfTimeZone('Europe/Kyiv'))
    for (const target of Object.values(TIME_ZONE_ALIASES)) expect(TIME_ZONE_PLACES[target]).toBeDefined()
  })

  it('returns null for zones that are not places', () => {
    expect(placeOfTimeZone('UTC')).toBeNull()
    expect(placeOfTimeZone('Etc/GMT+3')).toBeNull()
    expect(placeOfTimeZone(undefined)).toBeNull()
  })

  it('is close enough to the real place for sunrise', () => {
    // Istanbul's zone coordinates give the same sunrise as the city itself.
    const fromZone = nextSunChange(utc('2026-11-23T00:00:00'), placeOfTimeZone('Europe/Istanbul')!)!
    const fromCity = nextSunChange(utc('2026-11-23T00:00:00'), ISTANBUL)!
    expect(minutes(fromZone - fromCity)).toBeLessThan(2)
  })
})

describe('coarsen', () => {
  it('keeps about 10 km of precision', () => {
    expect(coarsen({ lat: 41.01234, lon: 28.97654 })).toEqual({ lat: 41, lon: 29 })
    expect(coarsen({ lat: -33.8688, lon: 151.2093 })).toEqual({ lat: -33.9, lon: 151.2 })
  })
})
