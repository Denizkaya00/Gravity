import { test, type Page, type ElectronApplication } from '@playwright/test'
import { command, launch, startSite } from './fixtures'

// Frame-timing probe. Run with: GRAVITY_PERF=1 npx playwright test perf
test.skip(!process.env.GRAVITY_PERF, 'set GRAVITY_PERF=1 to measure frame timing')

async function measure(win: Page, ms: number, during?: () => Promise<void>) {
  await win.evaluate((dur) => {
    const w = window as unknown as { __frames: number[] }
    w.__frames = []
    let last = performance.now()
    const end = last + dur
    const tick = (t: number) => {
      w.__frames.push(t - last)
      last = t
      if (t < end) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms)
  if (during) await during()
  await win.waitForTimeout(ms + 100)
  const frames: number[] = await win.evaluate(() => (window as unknown as { __frames: number[] }).__frames.slice(1))
  frames.sort((a, b) => a - b)
  const avg = frames.reduce((a, b) => a + b, 0) / frames.length
  const p95 = frames[Math.floor(frames.length * 0.95)]
  const long = frames.filter((f) => f > 25).length
  return `avg ${avg.toFixed(1)}ms  p95 ${p95.toFixed(1)}ms  >25ms: ${long}/${frames.length}`
}

async function scenario(app: ElectronApplication, win: Page, label: string, url: string) {
  console.log(label, 'home idle      ', await measure(win, 2500))
  console.log(label, 'command bar    ', await measure(win, 1500, () => command(app, { command: 'new-tab' })))
  await win.keyboard.press('Escape')
  await win.waitForTimeout(400)
  console.log(label, 'sidebar toggle ', await measure(win, 1500, () => command(app, { command: 'toggle-sidebar' })))
  await command(app, { command: 'toggle-sidebar' })
  await win.waitForTimeout(600)
  await app.evaluate(({ BrowserWindow }, u) => BrowserWindow.getAllWindows()[0].webContents.send('open-url', { url: u, mode: 'foreground' }), url)
  await win.waitForTimeout(1500)
  console.log(label, 'page idle      ', await measure(win, 1500))
  console.log(label, 'overview open  ', await measure(win, 1500, () => command(app, { command: 'tab-overview' })))
}

test('frame timing', async () => {
  const site = await startSite()
  for (const bh of ['live', 'off']) {
    const { app, win } = await launch({ settings: { motion: 'always', blackHole: bh, theme: 'dark' } })
    await win.waitForTimeout(2000)
    await scenario(app, win, `[bh ${bh}]`, `${site.url}/`)
    await app.close()
  }
  site.server.close()
})
