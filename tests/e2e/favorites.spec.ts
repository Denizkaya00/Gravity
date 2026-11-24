import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { command, launch, shot, startSite } from './fixtures'

let site: Awaited<ReturnType<typeof startSite>>

test.beforeAll(async () => {
  site = await startSite()
})
test.afterAll(() => {
  site.server.close()
})

const pins = (win: Page) => win.getByTestId('home-pin')
const labels = (win: Page) => pins(win).locator('[data-testid="home-pin-open"]')

test('favorites: pin from a page and from Home, open, reorder, remove, and keep them', async () => {
  const { app, win, userData } = await launch()
  await expect(win.getByTestId('home-canvas')).toBeVisible()
  // Nothing pinned yet: only a quiet way to add one.
  await expect(pins(win)).toHaveCount(0)
  await expect(win.getByTestId('home-pin-add')).toBeVisible()

  // Pin the current page with the star in the address field.
  await win.getByTestId('home-search').click()
  await win.getByTestId('command-input').fill(`${site.url}/`)
  await win.getByTestId('command-input').press('Enter')
  await expect(win.locator('[data-tab-id]').filter({ hasText: 'Gravity Test Home' }).first()).toBeVisible({ timeout: 15_000 })
  await win.getByTestId('favorite-toggle').click()

  // Home shows it; 1 goes back to the open tab instead of opening a second one.
  await command(app, { command: 'go-home' })
  await expect(pins(win)).toHaveCount(1)
  await expect(labels(win).first()).toContainText('Gravity Test Home')
  await win.keyboard.press('1')
  await expect(win.getByTestId('home-canvas')).toHaveCount(0)
  await expect(win.locator('[data-tab-id]')).toHaveCount(1)

  // Add one from Home by typing its address. It doesn't know its name yet…
  await command(app, { command: 'go-home' })
  await win.getByTestId('home-pin-add').click()
  await expect(win.getByTestId('command-bar')).toBeVisible()
  await win.getByTestId('command-input').fill(`${site.url}/two`)
  await win.getByTestId('command-input').press('Enter')
  await expect(pins(win)).toHaveCount(2)
  await expect(labels(win).nth(1)).toContainText('127.0.0.1')
  // …until it has been opened once.
  await labels(win).nth(1).click()
  await expect(win.locator('[data-tab-id]').filter({ hasText: 'Second Orbit' }).first()).toBeVisible({ timeout: 15_000 })
  await command(app, { command: 'go-home' })
  await expect(labels(win).nth(1)).toContainText('Second Orbit')

  // ⇧⌘D on a page adds it too.
  await win.getByTestId('home-search').click()
  await win.getByTestId('command-input').fill(`${site.url}/three`)
  await win.getByTestId('command-input').press('Enter')
  await expect(win.locator('[data-tab-id]').filter({ hasText: 'Third Moon' }).first()).toBeVisible({ timeout: 15_000 })
  await command(app, { command: 'favorite' })
  await command(app, { command: 'go-home' })
  await expect(pins(win)).toHaveCount(3)

  // Keyboard: ↓ from the search field, ⌥→ moves a favorite, ⌫ removes one.
  await win.getByTestId('home-search').focus()
  await win.keyboard.press('ArrowDown')
  await expect(labels(win).first()).toBeFocused()
  await win.keyboard.press('Alt+ArrowRight')
  await expect(labels(win).nth(0)).toContainText('Second Orbit')
  await expect(labels(win).nth(1)).toContainText('Gravity Test Home')
  await expect(labels(win).nth(1)).toBeFocused()
  await win.keyboard.press('Backspace')
  await expect(pins(win)).toHaveCount(2)
  await expect(labels(win).nth(1)).toContainText('Third Moon')
  await expect(labels(win).nth(1)).toBeFocused()

  // The ✕ removes one with the pointer.
  await pins(win).nth(1).hover()
  await pins(win).nth(1).getByTestId('home-pin-remove').click()
  await expect(pins(win)).toHaveCount(1)

  // Favorites survive a restart, in their order.
  await win.waitForTimeout(800)
  await app.close()
  const second = await launch({ userData })
  // The session comes back on Home, where it was left.
  await expect(second.win.getByTestId('home-canvas')).toBeVisible()
  await expect(pins(second.win)).toHaveCount(1)
  await expect(labels(second.win).first()).toContainText('Second Orbit')
  await second.app.close()
})

/** A realistic set of favorites, to see how Home looks over each background. */
const SAMPLE = [
  ['https://github.com/', 'GitHub', 'https://github.githubassets.com/favicons/favicon.svg'],
  ['https://www.youtube.com/', 'YouTube', 'https://www.youtube.com/s/desktop/28b0985e/img/favicon_32x32.png'],
  ['https://mail.google.com/mail/u/0/', 'Inbox (3) - me@example.com - Gmail', 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico'],
  ['https://www.figma.com/files/', 'Figma', 'https://static.figma.com/app/icon/1/favicon.svg'],
  ['https://news.ycombinator.com/', 'Hacker News', 'https://news.ycombinator.com/favicon.ico'],
  ['https://en.wikipedia.org/wiki/Main_Page', 'Wikipedia, the free encyclopedia', 'https://en.wikipedia.org/static/favicon/wikipedia.ico'],
  ['https://www.are.na/', '', '']
].map(([url, title, favicon], i) => ({ id: `f${i}`, url, title, favicon: favicon || undefined }))

async function home(win: Page) {
  await expect(win.getByTestId('home-canvas')).toBeVisible()
  // Keep the real pointer's hover out of the pictures.
  await win.mouse.move(700, 300)
  await expect(win.getByTestId('home-pins')).toBeVisible()
  await win.waitForTimeout(900)
}

test('favorites on Home: how they look', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'gravity-e2e-'))
  writeFileSync(join(userData, 'favorites.json'), JSON.stringify(SAMPLE))
  const looks: [string, Record<string, unknown>][] = [
    ['blackhole', { theme: 'dark', scene: 'blackhole' }],
    ['mountains-day', { theme: 'dark', scene: 'mountains', daylight: 'day' }],
    ['dunes-day', { theme: 'dark', scene: 'dunes', daylight: 'day' }],
    ['forest-day', { theme: 'dark', scene: 'forest', daylight: 'day' }],
    ['wave', { theme: 'dark', scene: 'wave', daylight: 'day' }],
    ['mountains-night', { theme: 'dark', scene: 'mountains', daylight: 'night', mountainStars: true }],
    ['light-blackhole', { theme: 'light', scene: 'blackhole' }],
    ['light-dunes-day', { theme: 'light', scene: 'dunes', daylight: 'day' }],
    ['still-off', { theme: 'dark', blackHole: 'off' }]
  ]
  for (const [name, settings] of looks) {
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({ onboarded: true, shield: false, suggestions: false, motion: 'always', ...settings })
    )
    const { app, win } = await launch({ userData })
    await home(win)
    await expect(pins(win)).toHaveCount(SAMPLE.length)
    await shot(win, `fav-${name}`)
    if (name === 'blackhole') {
      // Drag YouTube onto Gmail's place: it moves there and the others make room.
      const from = (await pins(win).nth(1).boundingBox())!
      const to = (await pins(win).nth(2).boundingBox())!
      await win.mouse.move(from.x + 20, from.y + from.height / 2)
      await win.mouse.down()
      await win.mouse.move(to.x + 30, to.y + to.height / 2, { steps: 12 })
      await shot(win, 'fav-drag')
      await win.mouse.up()
      await expect(labels(win).nth(1)).toContainText('Gmail')
      await expect(labels(win).nth(2)).toContainText('YouTube')
      // Thrown up past the search field, a favorite is gone.
      const last = (await pins(win).nth(6).boundingBox())!
      await win.mouse.move(last.x + 20, last.y + last.height / 2)
      await win.mouse.down()
      await win.mouse.move(last.x + 40, last.y - 160, { steps: 10 })
      await win.mouse.up()
      await expect(pins(win)).toHaveCount(SAMPLE.length - 1)
      await win.waitForTimeout(600)

      // Hover, keyboard focus, and the Command Bar choosing a page to add.
      await pins(win).nth(2).hover()
      await shot(win, 'fav-hover')
      await win.mouse.move(10, 600)
      await win.getByTestId('home-search').focus()
      await win.keyboard.press('ArrowDown')
      await win.keyboard.press('ArrowRight')
      await shot(win, 'fav-focus')
      await win.getByTestId('home-pin-add').click()
      await win.getByTestId('command-input').fill('lobste.rs')
      await shot(win, 'fav-add')
    }
    await app.close()
    // Put back anything a step changed, for the next background.
    writeFileSync(join(userData, 'favorites.json'), JSON.stringify(SAMPLE))
  }
})
