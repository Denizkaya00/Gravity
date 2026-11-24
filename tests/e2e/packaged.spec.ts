import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SHOTS, startSite } from './fixtures'

// Runs only when GRAVITY_APP points at a packaged binary, e.g.
// GRAVITY_APP=dist/mac-arm64/Gravity.app/Contents/MacOS/Gravity npx playwright test packaged
const executablePath = process.env.GRAVITY_APP

test.skip(!executablePath, 'set GRAVITY_APP to test a packaged build')

test('packaged app boots and browses', async () => {
  const site = await startSite()
  const userData = mkdtempSync(join(tmpdir(), 'gravity-pkg-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboarded: true, suggestions: false }))
  const app = await electron.launch({ executablePath, env: { ...process.env, GRAVITY_E2E: '1', GRAVITY_USER_DATA: userData } })
  const win = await app.firstWindow()
  await expect(win.getByTestId('home-canvas')).toBeVisible()
  await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows()[0].webContents.send('open-url', { url, mode: 'foreground' }), `${site.url}/`)
  await expect(win.locator('[data-tab-id]').filter({ hasText: 'Gravity Test Home' })).toBeVisible({ timeout: 15_000 })
  await expect(win.getByTestId('shield')).toBeVisible()
  await win.waitForTimeout(600)
  await win.screenshot({ path: join(SHOTS, '30-packaged.png') })
  await app.close()
  site.server.close()
})
