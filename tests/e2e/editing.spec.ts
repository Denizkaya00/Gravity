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

async function openUrl(app: ElectronApplication, url: string) {
  await app.evaluate(({ BrowserWindow }, u) => BrowserWindow.getAllWindows()[0].webContents.send('open-url', { url: u, mode: 'foreground' }), url)
}

/** Runs `js` in the page at `path`. */
async function inPage<T>(app: ElectronApplication, path: string, js: string): Promise<T> {
  return app.evaluate(async ({ webContents }, [p, code]) => {
    const wc = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && new URL(w.getURL()).pathname + new URL(w.getURL()).search === p)
    if (!wc) throw new Error(`no page at ${p}`)
    return wc.executeJavaScript(code)
  }, [path, js] as const) as Promise<T>
}

const field = (app: ElectronApplication, path: string) =>
  inPage<{ value: string; start: number; end: number }>(
    app,
    path,
    `(() => { const f = document.getElementById('field'); return { value: f.value, start: f.selectionStart, end: f.selectionEnd } })()`
  )

const area = (app: ElectronApplication) => inPage<string>(app, '/form', `document.getElementById('area').value`)

/** Where the user's click would leave the caret: in the page's text field. */
const clickField = (app: ElectronApplication, path: string) => inPage(app, path, `document.getElementById('field').focus()`)

const EDIT: Record<string, string> = { 'Meta+z': 'undo', 'Shift+Meta+z': 'redo', 'Meta+a': 'selectAll' }

/**
 * The keyboard, sent where Chromium sends it: into the page whose <webview> has focus, otherwise to Gravity's
 * own UI. Playwright's keyboard only reaches the UI, so keys for a page go through that page's DevTools session.
 * As Playwright does on macOS, ⌘Z and friends carry their editing command (the test window is never the key
 * window, so the app menu can't deliver them). The page runs it in the frame Chromium has focused, so a page
 * that looks focused but isn't gets nothing, just as a real ⌘Z would go elsewhere.
 */
async function keyboard(app: ElectronApplication, win: Page, keys: { press?: string; type?: string }) {
  const target = await win.evaluate(() => {
    const el = document.activeElement as (HTMLElement & { getWebContentsId?: () => number }) | null
    return el?.tagName === 'WEBVIEW' ? el.getWebContentsId!() : null
  })
  if (target === null) {
    if (keys.type) await win.keyboard.insertText(keys.type)
    if (keys.press) await win.keyboard.press(keys.press)
    return
  }
  await app.evaluate(
    async ({ webContents }, { id, text, combo, cmd }) => {
      const wc = webContents.fromId(id)!
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
      if (text) await wc.debugger.sendCommand('Input.insertText', { text })
      if (combo) {
        const parts = combo.split('+')
        const key = parts.pop()!
        const modifiers = (parts.includes('Meta') ? 4 : 0) | (parts.includes('Shift') ? 8 : 0)
        const ev = { modifiers, key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) }
        await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ev, commands: cmd ? [cmd] : [] })
        await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...ev })
      }
    },
    { id: target, text: keys.type, combo: keys.press, cmd: keys.press ? EDIT[keys.press] : undefined }
  )
}

/** The <webview> element with the keyboard, by the path of its page. */
const pageWithKeyboard = (win: Page) =>
  win.evaluate(() => {
    const el = document.activeElement as (HTMLElement & { getURL?: () => string }) | null
    if (el?.tagName !== 'WEBVIEW') return null
    try {
      const url = new URL(el.getURL!())
      return url.pathname + url.search
    } catch {
      return 'loading'
    }
  })

test('undo, redo and select all keep working after switching tabs and navigating', async () => {
  const { app, win } = await launch()

  await openUrl(app, `${site.url}/form`)
  await expect(tabs(win).filter({ hasText: 'Text Form' }).first()).toBeVisible({ timeout: 15_000 })
  // A page opened in front gets the keyboard.
  await expect.poll(() => pageWithKeyboard(win)).toBe('/form')
  await clickField(app, '/form')
  await keyboard(app, win, { type: 'hello' })
  await expect.poll(() => field(app, '/form')).toMatchObject({ value: 'hello' })

  // Open another tab, then come back with ⌘1.
  await openUrl(app, `${site.url}/two`)
  await expect(tabs(win)).toHaveCount(2)
  await expect.poll(() => pageWithKeyboard(win)).toBe('/two')
  await command(app, { command: 'select-tab', arg: 0 })
  await expect.poll(() => pageWithKeyboard(win)).toBe('/form')

  await keyboard(app, win, { press: 'Meta+z' })
  await expect.poll(() => field(app, '/form')).toMatchObject({ value: '' })
  await keyboard(app, win, { press: 'Shift+Meta+z' })
  await expect.poll(() => field(app, '/form')).toMatchObject({ value: 'hello' })
  await keyboard(app, win, { press: 'Meta+a' })
  await expect.poll(() => field(app, '/form')).toEqual({ value: 'hello', start: 0, end: 5 })

  // Switching by clicking tabs in the sidebar, with the caret in another field. The page left behind isn't
  // reloaded while it's away: its text and undo history are still there.
  await inPage(app, '/form', `document.getElementById('area').focus()`)
  await keyboard(app, win, { type: 'note' })
  await expect.poll(() => area(app)).toBe('note')
  const formPage = await inPage<number>(app, '/form', `performance.timeOrigin`)
  await tabs(win).filter({ hasText: 'Second Orbit' }).first().click()
  await expect.poll(() => pageWithKeyboard(win)).toBe('/two')
  await tabs(win).filter({ hasText: 'Text Form' }).first().click()
  await expect.poll(() => pageWithKeyboard(win)).toBe('/form')
  expect(await inPage<number>(app, '/form', `performance.timeOrigin`)).toBe(formPage)
  expect(await field(app, '/form')).toMatchObject({ value: 'hello' })
  await keyboard(app, win, { press: 'Meta+z' })
  await expect.poll(() => area(app)).toBe('')
  expect(await field(app, '/form')).toMatchObject({ value: 'hello' })

  // Gravity's own text fields: the Command Bar takes the keyboard, undoes in place, and gives it back on Escape.
  await command(app, { command: 'open-location' })
  const input = win.getByTestId('command-input')
  await expect(input).toBeFocused()
  const address = await input.inputValue()
  await keyboard(app, win, { type: 'orbit' })
  await expect(input).toHaveValue('orbit')
  await keyboard(app, win, { press: 'Meta+z' })
  await expect(input).toHaveValue(address)
  await keyboard(app, win, { press: 'Escape' })
  await expect(win.getByTestId('command-bar')).toHaveCount(0)
  await expect.poll(() => pageWithKeyboard(win)).toBe('/form')

  // Navigate the tab, then edit on the new page. (Not from the Command Bar: there, Enter hands the page focus
  // mid-keypress, and Playwright's synthetic key release can then hang.)
  await app.evaluate(({ webContents }, url) => webContents.getAllWebContents().find((w) => w.getURL().endsWith('/form'))!.loadURL(url), `${site.url}/form?next`)
  await expect.poll(() => pageWithKeyboard(win)).toBe('/form?next')
  await expect.poll(() => inPage(app, '/form?next', `document.readyState`)).toBe('complete')
  await clickField(app, '/form?next')
  await keyboard(app, win, { type: 'again' })
  await expect.poll(() => field(app, '/form?next')).toMatchObject({ value: 'again' })
  await keyboard(app, win, { press: 'Meta+z' })
  await expect.poll(() => field(app, '/form?next')).toMatchObject({ value: '' })

  // And after the page itself navigates, then a trip to the other tab and back.
  await app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().find((w) => w.getURL().endsWith('/form?next'))!.executeJavaScript(`location.href = '/form?third'`, true)
  )
  await expect.poll(() => pageWithKeyboard(win)).toBe('/form?third')
  await expect.poll(() => inPage(app, '/form?third', `document.readyState`)).toBe('complete')
  await clickField(app, '/form?third')
  await keyboard(app, win, { type: 'third' })
  await command(app, { command: 'select-tab', arg: 1 })
  await expect.poll(() => pageWithKeyboard(win)).toBe('/two')
  await command(app, { command: 'select-tab', arg: 0 })
  await expect.poll(() => pageWithKeyboard(win)).toBe('/form?third')
  await keyboard(app, win, { press: 'Meta+z' })
  await expect.poll(() => field(app, '/form?third')).toMatchObject({ value: '' })

  // Back still knows where the tab has been.
  await command(app, { command: 'back' })
  await expect.poll(() => pageWithKeyboard(win)).toBe('/form?next')

  await app.close()
})
