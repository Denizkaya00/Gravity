import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { command, launch, startSite } from './fixtures'

let site: Awaited<ReturnType<typeof startSite>>

test.beforeAll(async () => {
  site = await startSite()
})
test.afterAll(() => {
  site.server.close()
})

const tabs = (win: Page) => win.locator('[data-tab-id]')

/**
 * Real trackpad input over the page. On macOS, Chromium's synthetic gestures go
 * through the same NSView handlers as a trackpad (magnifyWithEvent:, scrollWheel:),
 * so they are routed exactly like a real pinch or two-finger swipe.
 */
async function trackpad(app: ElectronApplication, win: Page, gesture: { pinch: number } | { swipe: number }) {
  const box = await win.locator('webview').first().boundingBox()
  if (!box) throw new Error('no page on screen')
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await app.evaluate(
    async ({ BrowserWindow }, { at, gesture }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
      if ('pinch' in gesture) {
        await wc.debugger.sendCommand('Input.synthesizePinchGesture', { ...at, scaleFactor: gesture.pinch, gestureSourceType: 'mouse' })
      } else {
        await wc.debugger.sendCommand('Input.synthesizeScrollGesture', { ...at, xDistance: gesture.swipe, yDistance: 0, gestureSourceType: 'mouse', speed: 1600 })
      }
    },
    { at, gesture }
  )
  // Let the gesture end (pinchStore's END_MS), so the next one starts fresh.
  await win.waitForTimeout(700)
}

const zoomFactor = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getType() === 'webview')?.getZoomFactor() ?? 0)

async function openPage(app: ElectronApplication, win: Page, url: string) {
  await app.evaluate(({ BrowserWindow }, r) => BrowserWindow.getAllWindows()[0].webContents.send('open-url', r), { url, mode: 'foreground' })
  await expect(tabs(win).filter({ hasText: 'Gravity Test Home' }).first()).toBeVisible({ timeout: 15_000 })
  await win.waitForTimeout(800)
}

test('pinch zooms the page, keyboard zoom still works, pinching in at 100% opens the Gravity Well', async () => {
  const { app, win } = await launch()
  await openPage(app, win, `${site.url}/`)
  const toast = win.getByTestId('toast')

  // Spreading zooms the page in, following the fingers.
  await trackpad(app, win, { pinch: 1.5 })
  await expect.poll(() => zoomFactor(app)).toBeCloseTo(1.5, 1)
  await expect(toast.filter({ hasText: /Zoom 1(49|50|51)%/ })).toBeVisible()

  // ⌘+ continues from there on the keyboard's grid, ⌘0 resets.
  await command(app, { command: 'zoom-in' })
  await expect(toast.filter({ hasText: 'Zoom 158%' })).toBeVisible()
  await command(app, { command: 'zoom-reset' })
  await expect.poll(() => zoomFactor(app)).toBe(1)

  // Pinching in from above 100% stops at 100% and doesn't open the Gravity Well.
  await command(app, { command: 'zoom-in' })
  await trackpad(app, win, { pinch: 0.4 })
  await expect.poll(() => zoomFactor(app)).toBe(1)
  await expect(win.getByTestId('gravity-well')).toHaveCount(0)

  // A small pinch in at 100% does nothing.
  await trackpad(app, win, { pinch: 0.85 })
  await expect.poll(() => zoomFactor(app)).toBe(1)
  await expect(win.getByTestId('gravity-well')).toHaveCount(0)

  // A real pinch in at 100% falls into the Gravity Well.
  await trackpad(app, win, { pinch: 0.5 })
  await expect(win.getByTestId('gravity-well')).toBeVisible()
  await expect.poll(() => zoomFactor(app)).toBe(1)
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('gravity-well')).toHaveCount(0, { timeout: 5_000 })

  // Two-finger swipe still goes back.
  await app.evaluate(({ webContents }, url) => {
    void webContents.getAllWebContents().find((w) => w.getType() === 'webview')?.loadURL(url)
  }, `${site.url}/two`)
  await expect(tabs(win).filter({ hasText: 'Second Orbit' }).first()).toBeVisible({ timeout: 15_000 })
  await win.waitForTimeout(500)
  await trackpad(app, win, { swipe: 700 })
  await expect(tabs(win).filter({ hasText: 'Gravity Test Home' }).first()).toBeVisible({ timeout: 5_000 })

  await app.close()
})

test('pinch works with reduced motion', async () => {
  const { app, win } = await launch({ settings: { motion: 'never' } })
  await openPage(app, win, `${site.url}/`)
  await trackpad(app, win, { pinch: 1.3 })
  await expect.poll(() => zoomFactor(app)).toBeCloseTo(1.3, 1)
  await command(app, { command: 'zoom-reset' })
  await trackpad(app, win, { pinch: 0.5 })
  await expect(win.getByTestId('gravity-well')).toBeVisible()
  await app.close()
})
