import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandEvent } from '../../src/shared/types'

export const SHOTS = process.env.GRAVITY_SHOTS ?? join(tmpdir(), 'gravity-shots')
mkdirSync(SHOTS, { recursive: true })

/** A tiny local website so tests never depend on the internet. */
export function startSite(): Promise<{ server: Server; url: string }> {
  const page = (title: string, color: string, body: string) => `<!doctype html><html><head><title>${title}</title>
<meta name="theme-color" content="${color}"><style>body{font:16px -apple-system;margin:0;padding:40px;background:linear-gradient(160deg,${color}22,#fff 60%);min-height:200vh}
h1{font-size:44px;margin:0 0 12px} a{color:${color}}</style></head><body><h1>${title}</h1>${body}</body></html>`
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    if (req.url?.startsWith('/two')) return res.end(page('Second Orbit', '#0ea5e9', '<p>Another world. Gravity is here too.</p>'))
    if (req.url?.startsWith('/login'))
      return res.end(
        page(
          'Sign In',
          '#16a34a',
          `<form method="post" action="/welcome"><p><input id="user" name="username" autocomplete="username" placeholder="Email"></p>
<p><input id="pass" type="password" name="password" autocomplete="current-password"></p><p><button id="go">Sign in</button></p></form>`
        )
      )
    if (req.url?.startsWith('/welcome')) return res.end(page('Welcome Back', '#16a34a', '<p>You are signed in.</p>'))
    if (req.url?.startsWith('/form'))
      return res.end(page('Text Form', '#db2777', '<p><input id="field" placeholder="Type here"></p><p><textarea id="area"></textarea></p>'))
    if (req.url?.startsWith('/three')) return res.end(page('Third Moon', '#f97316', '<p>Some findable words: nebula nebula nebula.</p>'))
    res.end(
      page(
        'Gravity Test Home',
        '#8b5cf6',
        `<p>Welcome to the local test site.</p><p><a id="peek-link" href="/two">Go to second page</a></p><p><a href="/three">Third</a></p>`
      )
    )
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    resolve({ server, url: `http://127.0.0.1:${port}` })
  }))
}

export async function launch(
  opts: { userData?: string; onboarded?: boolean; settings?: Record<string, unknown> } = {}
): Promise<{ app: ElectronApplication; win: Page; userData: string }> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'gravity-e2e-'))
  if (opts.onboarded !== false && !opts.userData) {
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({ onboarded: true, shield: false, suggestions: false, ...opts.settings })
    )
  }
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, GRAVITY_E2E: '1', GRAVITY_USER_DATA: userData, GRAVITY_DOWNLOADS: join(userData, 'downloads') }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setSize(1440, 900)
    w.center()
  })
  return { app, win, userData }
}

export async function command(app: ElectronApplication, ev: CommandEvent): Promise<void> {
  await app.evaluate(({ BrowserWindow }, e) => {
    BrowserWindow.getAllWindows()[0].webContents.send('command', e)
  }, ev)
}

export async function shot(win: Page, name: string): Promise<void> {
  await win.waitForTimeout(450)
  await win.screenshot({ path: join(SHOTS, `${name}.png`) })
}
