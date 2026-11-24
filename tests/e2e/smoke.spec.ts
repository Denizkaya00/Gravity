import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { command, launch, shot, startSite } from './fixtures'

let site: Awaited<ReturnType<typeof startSite>>

test.beforeAll(async () => {
  site = await startSite()
})
test.afterAll(() => {
  site.server.close()
})

const tabs = (win: Page) => win.locator('[data-tab-id]')

async function openViaCommandBar(win: Page, text: string) {
  await expect(win.getByTestId('command-bar')).toBeVisible()
  await win.getByTestId('command-input').fill(text)
  await win.getByTestId('command-input').press('Enter')
}

async function openUrl(app: ElectronApplication, url: string, mode: 'foreground' | 'background' | 'peek' | 'split') {
  await app.evaluate(({ BrowserWindow }, r) => BrowserWindow.getAllWindows()[0].webContents.send('open-url', r), { url, mode })
}

test('browse, overview, peek, split, find, focus, settings and restore', async () => {
  const { app, win, userData } = await launch()

  // Home canvas in an empty space.
  await expect(win.getByTestId('home-canvas')).toBeVisible()
  await shot(win, '01-home')

  // Open a page from the Command Bar.
  await win.getByTestId('home-search').click()
  await win.getByTestId('command-input').fill('gravity')
  await shot(win, '02-command-bar')
  await win.getByTestId('command-input').fill(`${site.url}/`)
  await win.getByTestId('command-input').press('Enter')
  await expect(tabs(win)).toHaveCount(1)
  await expect(tabs(win).filter({ hasText: 'Gravity Test Home' }).first()).toBeVisible({ timeout: 15_000 })
  await shot(win, '03-page')

  // ⌘T → second page, then ⌘W closes it again.
  await command(app, { command: 'new-tab' })
  await openViaCommandBar(win, `${site.url}/two`)
  await expect(tabs(win)).toHaveCount(2)
  await expect(tabs(win).filter({ hasText: 'Second Orbit' }).first()).toBeVisible({ timeout: 15_000 })
  await command(app, { command: 'close-tab' })
  await expect(tabs(win)).toHaveCount(1)

  // A few more tabs for the overview.
  await openUrl(app, `${site.url}/two`, 'foreground')
  await openUrl(app, `${site.url}/three`, 'foreground')
  await expect(tabs(win)).toHaveCount(3)
  await expect(tabs(win).filter({ hasText: 'Third Moon' }).first()).toBeVisible({ timeout: 15_000 })
  await win.waitForTimeout(1200)

  // Gravity Well.
  await command(app, { command: 'tab-overview' })
  await expect(win.getByTestId('gravity-well')).toBeVisible()
  await expect(win.getByTestId('well-card')).toHaveCount(3)
  await shot(win, '04-gravity-well')
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('gravity-well')).toHaveCount(0, { timeout: 5_000 })

  // Peek a link, then expand it into a real tab.
  await openUrl(app, `${site.url}/two?peek`, 'peek')
  await expect(win.getByTestId('peek-bar')).toBeVisible()
  await shot(win, '05-peek')
  await win.getByTestId('peek-expand').click()
  await expect(tabs(win)).toHaveCount(4)

  // Split view.
  await command(app, { command: 'toggle-split' })
  await expect(win.locator('[data-slot="split-a"]')).toHaveCount(1)
  await shot(win, '06-split')
  await command(app, { command: 'toggle-split' })
  await expect(win.locator('[data-slot="split-a"]')).toHaveCount(0)

  // Find in page.
  await openUrl(app, `${site.url}/three?find`, 'foreground')
  await expect(tabs(win).filter({ hasText: 'Third Moon' }).first()).toBeVisible({ timeout: 15_000 })
  await command(app, { command: 'find' })
  await win.getByTestId('find-bar').locator('input').fill('nebula')
  await expect(win.getByTestId('find-bar')).toContainText('/3', { timeout: 5_000 })
  await shot(win, '07-find')
  await win.getByTestId('find-bar').locator('input').press('Escape')

  // Focus mode.
  await command(app, { command: 'focus-mode' })
  await shot(win, '08-focus')
  await command(app, { command: 'focus-mode' })

  // Settings + cheatsheet.
  await command(app, { command: 'settings' })
  await expect(win.getByTestId('settings')).toBeVisible()
  await shot(win, '09-settings')
  await win.keyboard.press('Escape')
  await command(app, { command: 'cheatsheet' })
  await expect(win.getByTestId('cheatsheet')).toBeVisible()
  await shot(win, '10-cheatsheet')
  await win.keyboard.press('Escape')

  // A new space slides in.
  await command(app, { command: 'new-space' })
  await expect(win.getByTestId('home-canvas')).toBeVisible()
  await shot(win, '11-new-space')
  await command(app, { command: 'select-space', arg: 0 })
  await expect(tabs(win)).toHaveCount(5)

  // Session restore.
  await win.waitForTimeout(800)
  await app.close()
  const second = await launch({ userData })
  await expect(tabs(second.win)).toHaveCount(5, { timeout: 10_000 })
  await shot(second.win, '12-restored')
  await second.app.close()
})

test('Home keeps tabs open, and the same key or button goes back to the page', async () => {
  const { app, win } = await launch()
  // Pages load when first shown, so let the first one load before moving on.
  await openUrl(app, `${site.url}/`, 'foreground')
  await expect(tabs(win).filter({ hasText: 'Gravity Test Home' }).first()).toBeVisible({ timeout: 15_000 })
  await openUrl(app, `${site.url}/two`, 'foreground')
  await expect(tabs(win)).toHaveCount(2)
  await expect(tabs(win).filter({ hasText: 'Second Orbit' }).first()).toBeVisible({ timeout: 15_000 })
  const selected = win.locator('[data-tab-id] [aria-selected="true"]')

  // ⇧⌘H lives in the History menu, like Safari.
  const accel = await app.evaluate(
    ({ Menu }) =>
      Menu.getApplicationMenu()
        ?.items.find((i) => i.label === 'History')
        ?.submenu?.items.find((i) => i.label === 'Home')?.accelerator
  )
  expect(accel).toBe('Cmd+Shift+H')

  await command(app, { command: 'go-home' })
  await expect(win.getByTestId('home-canvas')).toBeVisible()
  // Nothing was closed: both tabs stay in the sidebar and their pages stay alive.
  await expect(tabs(win)).toHaveCount(2)
  await expect(selected).toHaveCount(0)
  await expect(win.locator('[data-tab-surface]')).toHaveCount(2)
  await shot(win, '13-home-with-tabs')

  // Pressed again, it returns to the page you came from.
  await command(app, { command: 'go-home' })
  await expect(win.getByTestId('home-canvas')).toHaveCount(0)
  await expect(selected).toHaveText(/Second Orbit/)

  // The button next to Back / Forward does the same.
  await win.getByTestId('home-button').click()
  await expect(win.getByTestId('home-canvas')).toBeVisible()
  await tabs(win).filter({ hasText: 'Gravity Test Home' }).first().click()
  await expect(win.getByTestId('home-canvas')).toHaveCount(0)
  await expect(selected).toHaveText(/Gravity Test Home/)
  await app.close()
})

test('onboarding walks through three screens', async () => {
  const { app, win } = await launch({ onboarded: false })
  await expect(win.getByTestId('onboarding')).toBeVisible()
  await win.waitForTimeout(2600)
  await shot(win, '20-onboarding')
  // Each step's button has its own id, so a retried click can't land on the next step's button.
  await win.getByTestId('onboarding-step-1').click()
  await expect(win.getByText('Appearance')).toBeVisible()
  await win.waitForTimeout(600)
  await shot(win, '21-onboarding-accent')
  await win.getByTestId('onboarding-step-2').click()
  await expect(win.getByText('Five things to know')).toBeVisible()
  await win.waitForTimeout(900)
  await shot(win, '22-onboarding-tricks')
  await win.getByTestId('onboarding-done').click()
  await expect(win.getByTestId('onboarding')).toHaveCount(0, { timeout: 5_000 })
  await app.close()
})
