import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { command, launch, shot, startSite } from './fixtures'

let site: Awaited<ReturnType<typeof startSite>>

test.beforeAll(async () => {
  site = await startSite()
})
test.afterAll(() => {
  site.server.close()
})

/** Runs script in the (only) web page, in the page's own world. */
function inPage<T>(app: ElectronApplication, script: string): Promise<T> {
  return app.evaluate(({ webContents }, js) => {
    const wc = webContents.getAllWebContents().find((w) => w.getType() === 'webview')
    return wc ? wc.executeJavaScript(js) : null
  }, script) as Promise<T>
}

const fields = (app: ElectronApplication) =>
  inPage<[string, string] | null>(app, `[document.querySelector('#user')?.value ?? '', document.querySelector('#pass')?.value ?? '']`)

async function open(win: Page, url: string, title: string) {
  await win.getByTestId('home-search').click()
  await win.getByTestId('command-input').fill(url)
  await win.getByTestId('command-input').press('Enter')
  await expect(win.locator('[data-tab-id]').filter({ hasText: title }).first()).toBeVisible({ timeout: 15_000 })
}

/** Loads the sign-in page again in the open tab. */
async function reload(app: ElectronApplication, url: string) {
  await app.evaluate(async ({ webContents }, u) => {
    await webContents.getAllWebContents().find((w) => w.getType() === 'webview')?.loadURL(u)
  }, url)
}

async function openPasswords(app: ElectronApplication, win: Page) {
  await command(app, { command: 'settings' })
  await expect(win.getByTestId('settings')).toBeVisible()
  await win.getByTestId('settings-passwords').click()
  await expect(win.getByTestId('passwords-page')).toBeVisible()
}

async function signIn(app: ElectronApplication, user: string, pass: string) {
  await inPage(
    app,
    `(() => {
      const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }
      set(document.querySelector('#user'), ${JSON.stringify(user)})
      set(document.querySelector('#pass'), ${JSON.stringify(pass)})
      document.querySelector('#go').click()
      return true
    })()`
  )
}

test('passwords: add, autofill, offer to save and update, and keep them encrypted', async () => {
  const { app, win, userData } = await launch()
  await expect(win.getByTestId('home-canvas')).toBeVisible()

  // An empty vault, unlocked (no Touch ID under test).
  await openPasswords(app, win)
  await expect(win.getByText('No passwords yet')).toBeVisible()

  // Add one by hand. The dice make a strong password.
  await win.getByTestId('passwords-add').click()
  await win.getByTestId('form-url').fill(site.url)
  await win.getByTestId('form-username').fill('astronaut')
  await win.getByTestId('form-generate').click()
  await expect(win.getByTestId('form-password')).toHaveValue(/^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/)
  await win.getByTestId('form-password').fill('Orbit-Secret-42')
  await win.getByTestId('form-title').fill('Test Site')
  await shot(win, 'passwords-01-form')
  await win.getByTestId('form-save').click()
  await expect(win.getByTestId('password-detail')).toBeVisible()
  await expect(win.getByTestId('detail-username')).toHaveText('astronaut')
  await expect(win.getByTestId('detail-password')).not.toContainText('Orbit')
  await win.getByTestId('detail-reveal').click()
  await expect(win.getByTestId('detail-password')).toHaveText('Orbit-Secret-42')
  await win.getByTestId('passwords-back').click()
  await expect(win.getByTestId('password-row')).toHaveCount(1)
  await shot(win, 'passwords-02-list')
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('settings')).toHaveCount(0)

  // The sign-in page fills itself in.
  await open(win, `${site.url}/login`, 'Sign In')
  await expect.poll(() => fields(app), { timeout: 10_000 }).toEqual(['astronaut', 'Orbit-Secret-42'])
  await shot(win, 'passwords-03-autofilled')

  // Signing in as someone new offers to save it.
  await signIn(app, 'cosmonaut', 'Vostok-1961-Gagarin')
  await expect(win.getByTestId('password-offer')).toBeVisible({ timeout: 10_000 })
  await expect(win.getByTestId('password-offer')).toContainText('Save password for')
  await expect(win.getByTestId('password-offer')).toContainText('cosmonaut')
  await shot(win, 'passwords-04-offer')
  await win.getByTestId('password-offer-save').click()
  await expect(win.getByTestId('password-offer')).toHaveCount(0)

  // A changed password offers an update instead.
  await reload(app, `${site.url}/login`)
  await expect.poll(async () => (await fields(app))?.[0], { timeout: 10_000 }).toBeTruthy()
  await signIn(app, 'astronaut', 'Orbit-Secret-43')
  await expect(win.getByTestId('password-offer')).toContainText('Update the saved password')
  await win.getByTestId('password-offer-save').click()

  // Signing in again with what's saved asks nothing.
  await reload(app, `${site.url}/login`)
  await expect.poll(async () => (await fields(app))?.[0], { timeout: 10_000 }).toBeTruthy()
  await signIn(app, 'astronaut', 'Orbit-Secret-43')
  await win.waitForTimeout(1200)
  await expect(win.getByTestId('password-offer')).toHaveCount(0)

  await openPasswords(app, win)
  await expect(win.getByTestId('password-row')).toHaveCount(2)
  await win.getByTestId('passwords-search').fill('cosmo')
  await expect(win.getByTestId('password-row')).toHaveCount(1)

  // On disk it's ciphertext, and only the owner can read it.
  await win.waitForTimeout(300)
  const raw = readFileSync(join(userData, 'passwords.json'), 'utf8')
  expect(raw).not.toContain('Orbit-Secret')
  expect(raw).not.toContain('astronaut')
  expect(raw).not.toContain('Vostok')
  expect(JSON.parse(raw)).toMatchObject({ version: 1 })

  // Pages can't reach the vault: the API isn't in the page, and main ignores pages asking to manage it.
  expect(await inPage(app, `typeof window.gravity`)).toBe('undefined')

  await app.close()

  // Still there after a restart.
  const second = await launch({ userData })
  await openPasswords(second.app, second.win)
  await expect(second.win.getByTestId('password-row')).toHaveCount(2)
  await second.app.close()
})
