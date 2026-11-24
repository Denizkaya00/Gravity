import { test, expect, type ElectronApplication } from '@playwright/test'
import { command, launch, shot, startSite } from './fixtures'

const open = (app: ElectronApplication, url: string) =>
  app.evaluate(({ BrowserWindow }, u) => BrowserWindow.getAllWindows()[0].webContents.send('open-url', { url: u, mode: 'foreground' }), url)

test('black hole renders on Home and responds to orbit and zoom', async () => {
  const { app, win } = await launch()
  const problems: string[] = []
  win.on('console', (m) => {
    if (m.text().includes('black hole')) problems.push(m.text())
  })
  await expect(win.getByTestId('black-hole')).toBeVisible()
  await expect(win.getByTestId('home-clock').locator('time')).toHaveText(/\d{1,2}\D\d{2}/)
  await win.waitForTimeout(2500)
  await shot(win, '40-blackhole')

  const box = (await win.getByTestId('home-orbit').boundingBox())!
  await win.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3)
  await win.mouse.down()
  await win.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.42, { steps: 12 })
  await win.mouse.up()
  for (let i = 0; i < 4; i++) await win.mouse.wheel(0, -160)
  await win.waitForTimeout(2000)
  await shot(win, '41-blackhole-orbit')
  expect(problems).toEqual([])
  await app.close()
})

test('closing a tab in the Overview drops it into the black hole', async () => {
  const site = await startSite()
  const { app, win } = await launch()
  await open(app, `${site.url}/`)
  await open(app, `${site.url}/two`)
  await open(app, `${site.url}/three`)
  await expect(win.locator('[data-tab-id]')).toHaveCount(3)
  await win.waitForTimeout(1200)
  await command(app, { command: 'tab-overview' })
  await expect(win.getByTestId('well-card')).toHaveCount(3)
  await win.waitForTimeout(900)
  await shot(win, '42-overview-blackhole')

  const card = win.getByTestId('well-card').nth(1)
  await card.hover()
  // The GPU is busy rendering the hole, so skip Playwright's stability wait for this button.
  await card.getByTitle(/Close tab/).click({ force: true })
  await win.waitForTimeout(450)
  await shot(win, '43-falling-in')
  await expect(win.getByTestId('well-card')).toHaveCount(2, { timeout: 4000 })
  await expect(win.locator('[data-tab-id]')).toHaveCount(2)
  await app.close()
  site.server.close()
})

test('the scene hides behind an open page and comes back on Home and in the Overview', async () => {
  const site = await startSite()
  const { app, win } = await launch()
  const backdrop = win.getByTestId('scene-backdrop')
  const opacity = () => backdrop.evaluate((el) => getComputedStyle(el).opacity)

  await expect(win.getByTestId('black-hole')).toBeVisible()
  await expect.poll(opacity).toBe('1')

  await open(app, `${site.url}/`)
  await expect(win.locator('[data-tab-id]')).toHaveCount(1)
  // Nothing of the scene glimmers through the sidebar glass or the page margins.
  await expect.poll(opacity).toBe('0')
  await shot(win, '44-page-no-scene')

  await command(app, { command: 'tab-overview' })
  await expect(win.getByTestId('well-card')).toHaveCount(1)
  await expect.poll(opacity).toBe('1')
  await win.keyboard.press('Escape')
  await expect.poll(opacity).toBe('0')

  await command(app, { command: 'close-tab' })
  await expect(win.locator('[data-tab-id]')).toHaveCount(0)
  await expect.poll(opacity).toBe('1')
  await app.close()
  site.server.close()
})

test('the black hole comes back after the GPU refuses contexts for a while', async () => {
  const { app, win } = await launch()
  const field = win.locator('svg[viewBox="0 0 1000 660"]')
  const canvas = win.locator('canvas[data-testid="black-hole"]')
  await expect(canvas).toBeVisible()
  await win.waitForTimeout(800)

  // Lose the context, and hand back dead contexts for the next three attempts,
  // as happens while the GPU process restarts after sleep or a driver reset.
  await win.evaluate(() => {
    const proto = HTMLCanvasElement.prototype
    const original = proto.getContext
    const live = document.querySelector('canvas[data-testid="black-hole"]') as HTMLCanvasElement
    const current = original.call(live, 'webgl2') as WebGL2RenderingContext
    let refuse = 3
    proto.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
      const ctx = original.call(this, type as 'webgl2', attrs as WebGLContextAttributes)
      if (type === 'webgl2' && ctx && refuse > 0) {
        refuse -= 1
        ;(ctx as WebGL2RenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
      }
      return ctx
    } as typeof proto.getContext
    current.getExtension('WEBGL_lose_context')?.loseContext()
  })

  // The drawing stands in while it waits, then the live black hole returns on its own.
  await expect(field).toBeVisible({ timeout: 4000 })
  await expect(canvas).toBeVisible({ timeout: 8000 })
  await expect(field).toHaveCount(0)
  await expect(canvas).toHaveCount(1)
  await app.close()
})

test('the black hole survives settings changes and a lost GPU context', async () => {
  const { app, win } = await launch({ settings: { motion: 'never', blackHole: 'still' } })
  const warnings: string[] = []
  win.on('console', (m) => {
    if (m.text().includes('black hole')) warnings.push(m.text())
  })
  await expect(win.locator('canvas[data-testid="black-hole"]')).toHaveCount(1)

  // Switch to full motion and a live black hole while it is running.
  await command(app, { command: 'settings' })
  const settings = win.getByTestId('settings')
  await settings.getByRole('button', { name: 'Full', exact: true }).click()
  await settings.getByRole('button', { name: 'Live', exact: true }).click()
  await win.keyboard.press('Escape')
  await win.waitForTimeout(800)

  // Simulate the GPU dropping the context.
  await win.evaluate(() => {
    const canvas = document.querySelector('canvas[data-testid="black-hole"]') as HTMLCanvasElement
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
  })
  await win.waitForTimeout(1500)
  await expect(win.locator('canvas[data-testid="black-hole"]')).toHaveCount(1)
  await shot(win, '44-recovered')
  expect(warnings).toEqual([])
  await app.close()
})
