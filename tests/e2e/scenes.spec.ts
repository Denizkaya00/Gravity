import { test, expect, type Page } from '@playwright/test'
import { command, launch, shot } from './fixtures'
import { isNight, nextSunChange, placeOfTimeZone } from '../../src/shared/sun'

const PAINTED = ['mountains', 'wave', 'dunes', 'forest'] as const

/** Mean brightness, 0 to 1, of part of the window, read back from a screenshot. */
async function brightness(win: Page, clip: { x: number; y: number; width: number; height: number }): Promise<number> {
  const png = await win.screenshot({ clip })
  return win.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    return sum / (d.length / 4) / 255
  }, png.toString('base64'))
}

/** Some sky on Home, left of the clock and clear of the sidebar. */
const SKY = { x: 380, y: 180, width: 320, height: 100 }

test('background scenes can be chosen in Settings and draw without errors', async () => {
  const { app, win } = await launch({ settings: { theme: 'dark', motion: 'always', daylight: 'night' } })
  const warnings: string[] = []
  win.on('console', (m) => {
    if (m.text().includes('[scene') || m.text().includes('[black hole]')) warnings.push(m.text())
  })
  await expect(win.locator('canvas[data-testid="black-hole"]')).toHaveCount(1)

  await command(app, { command: 'settings' })
  const picker = win.getByTestId('scene-picker')
  await expect(picker).toBeVisible()
  // Every scene draws its own preview.
  await expect(picker.locator('canvas')).toHaveCount(5, { timeout: 4000 })
  await shot(win, '49-scene-picker')

  for (const scene of PAINTED) {
    await picker.getByTestId(`scene-${scene}`).click()
    await expect(win.locator(`canvas[data-testid="scene"][data-scene="${scene}"]`).first()).toBeAttached()
    // The window backdrop switched: no black hole outside the picker.
    await expect(win.locator('canvas[data-testid="black-hole"]')).toHaveCount(1)
  }

  // Home with the great wave behind it.
  await picker.getByTestId('scene-wave').click()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('home-clock')).toBeVisible()
  await shot(win, '50-scene-wave')

  // Light theme: Home draws the chosen scene itself.
  await command(app, { command: 'settings' })
  await picker.getByTestId('scene-mountains').click()
  await win.getByTestId('settings').getByRole('button', { name: 'Light', exact: true }).click()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('home-canvas').locator('canvas[data-scene="mountains"]')).toHaveCount(1)

  // And back to the black hole.
  await command(app, { command: 'settings' })
  await picker.getByTestId('scene-blackhole').click()
  await win.keyboard.press('Escape')
  await expect(win.locator('canvas[data-testid="scene"]')).toHaveCount(0)
  await expect(win.locator('canvas[data-testid="black-hole"]')).toHaveCount(1)

  expect(warnings).toEqual([])
  await app.close()
})

test('painted scenes have a day and a night, chosen in Settings', async () => {
  // Reduced motion: the scenes hold still, and still switch between day and night.
  const { app, win } = await launch({ settings: { theme: 'dark', motion: 'never', scene: 'dunes', daylight: 'night' } })
  const warnings: string[] = []
  win.on('console', (m) => {
    if (m.text().includes('[scene')) warnings.push(m.text())
  })
  const backdrop = (scene: string) => win.locator(`canvas[data-testid="scene"][data-scene="${scene}"]`)
  const settings = win.getByTestId('settings')
  const daylight = (label: 'Auto' | 'Day' | 'Night') => win.getByTestId('daylight').getByRole('button', { name: label, exact: true }).click()
  // Close Settings, and wait for its previews to go with it.
  const close = async () => {
    await win.keyboard.press('Escape')
    await expect(settings).toHaveCount(0)
  }
  // A new scene fades in once its first frame is drawn. Behind other windows the
  // fade only moves when a frame is made, so wait for the reveal, then out the
  // fade's 700 ms: the screenshot's own frame lands at its end.
  const settle = async (scene: string) => {
    await expect(backdrop(scene)).toHaveAttribute('style', /opacity: 1/, { timeout: 15_000 })
    await win.waitForTimeout(900)
  }

  await expect(backdrop('dunes')).toHaveAttribute('data-daylight', 'night')
  await settle('dunes')

  // The switch is in Settings, and the previews follow it.
  await command(app, { command: 'settings' })
  const picker = win.getByTestId('scene-picker')
  await expect(picker.locator('canvas[data-daylight="night"]')).toHaveCount(PAINTED.length, { timeout: 4000 })
  await daylight('Day')
  await expect(picker.locator('canvas[data-daylight="day"]')).toHaveCount(PAINTED.length)
  await close()

  // Every painted scene, by day and by night: the sky is clearly brighter by day.
  for (const scene of PAINTED) {
    await command(app, { command: 'settings' })
    await picker.getByTestId(`scene-${scene}`).click()
    await daylight('Day')
    await close()
    await expect(backdrop(scene)).toHaveAttribute('data-daylight', 'day')
    await settle(scene)
    const day = await brightness(win, SKY)
    await shot(win, `51-scene-${scene}-day`)

    await command(app, { command: 'settings' })
    await daylight('Night')
    await close()
    await expect(backdrop(scene)).toHaveAttribute('data-daylight', 'night')
    await settle(scene)
    const night = await brightness(win, SKY)
    await shot(win, `52-scene-${scene}-night`)
    expect(day, `${scene}: day ${day.toFixed(3)}, night ${night.toFixed(3)}`).toBeGreaterThan(night + 0.08)
  }

  // Automatic follows the sun. Without location services (as in tests) the time
  // zone stands in, so it should agree with the shared logic for this machine,
  // unless the sun is rising or setting right now.
  await command(app, { command: 'settings' })
  await daylight('Auto')
  await close()
  const now = Date.now()
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const place = placeOfTimeZone(zone)
  const d = new Date(now)
  const expected = isNight('auto', now, place, d.getHours() + d.getMinutes() / 60) ? 'night' : 'day'
  const change = place ? nextSunChange(now - 20 * 60_000, place) : null
  if (!change || change > now + 20 * 60_000) await expect(backdrop('forest')).toHaveAttribute('data-daylight', expected)

  // Off shows the line drawing instead, whatever the time of day. (The first Off is Background motion.)
  await command(app, { command: 'settings' })
  await settings.getByRole('button', { name: 'Off', exact: true }).first().click()
  await close()
  await expect(win.locator('canvas[data-testid="scene"]')).toHaveCount(0)

  expect(warnings).toEqual([])
  await app.close()
})

test('Mountains has a choice of photos, and the Milky Way for the night', async () => {
  const { app, win } = await launch({ settings: { theme: 'dark', motion: 'never', scene: 'mountains', daylight: 'day' } })
  const backdrop = win.locator('canvas[data-testid="scene"][data-scene="mountains"]')
  const settings = win.getByTestId('settings')
  const photos = win.getByTestId('mountain-photos')
  const daylight = (label: 'Day' | 'Night') => win.getByTestId('daylight').getByRole('button', { name: label, exact: true }).click()
  // A new photo crossfades: the old canvas stays for 0.7 s while the new one fades
  // in. Wait for it to go, so the checks below see only the new one.
  const close = async () => {
    await win.keyboard.press('Escape')
    await expect(settings).toHaveCount(0)
    await expect(backdrop).toHaveCount(1)
  }
  const settle = async () => {
    await expect(backdrop).toHaveAttribute('style', /opacity: 1/, { timeout: 15_000 })
    await win.waitForTimeout(900)
  }
  await expect(backdrop).toHaveAttribute('data-variant', 'valleys')

  // Choosing Mountains opens its photos beneath the picker.
  await command(app, { command: 'settings' })
  await expect(photos).toBeVisible()
  await expect(photos.locator('img')).toHaveCount(6)
  await photos.scrollIntoViewIfNeeded()
  await shot(win, '53-mountain-photos')
  await photos.getByTestId('mountain-everest').click()
  await expect(photos.getByTestId('mountain-everest')).toHaveAttribute('aria-checked', 'true')
  await expect(photos.getByTestId('mountain-valleys')).toHaveAttribute('aria-checked', 'false')
  await close()
  await expect(backdrop).toHaveAttribute('data-variant', 'everest')
  await settle()
  const day = await brightness(win, SKY)
  await shot(win, '54-mountains-everest-day')

  // The Milky Way only takes the night: by day the photo stays.
  await command(app, { command: 'settings' })
  await photos.getByTestId('mountain-stars').click()
  await expect(photos.getByTestId('mountain-stars')).toHaveAttribute('aria-checked', 'true')
  await close()
  await expect(backdrop).toHaveAttribute('data-variant', 'everest+stars')
  await expect(backdrop).toHaveAttribute('data-daylight', 'day')
  await settle()
  expect(Math.abs((await brightness(win, SKY)) - day)).toBeLessThan(0.03)

  await command(app, { command: 'settings' })
  await daylight('Night')
  await close()
  await expect(backdrop).toHaveAttribute('data-daylight', 'night')
  await settle()
  expect(await brightness(win, SKY)).toBeLessThan(day - 0.1)
  await shot(win, '55-mountains-milky-way')

  // Another background closes the photos.
  await command(app, { command: 'settings' })
  await win.getByTestId('scene-picker').getByTestId('scene-dunes').click()
  await expect(photos).toHaveCount(0)
  await app.close()
})
