import { app, BrowserWindow, clipboard, ipcMain, nativeTheme, session, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { ArchivedTab, Favorite, OpenUrlRequest, SearchEngineId, SessionData, Settings } from '@shared/types'
import * as history from './history'
import { JsonStore, flushAllStores } from './store'
import { getSettings, setSettings } from './settings'
import { buildMenu } from './menu'
import { hardenWebviews } from './webviews'
import { suggest } from './suggest'
import { faviconColor } from './color'
import { protectSession, setShieldEnabled, setShieldHost } from './adblock'
import { downloadAction, setDownloadsHost, trackDownloads } from './downloads'
import { handlePermissions, respondPermission, setPermissionsHost } from './permissions'
import { isDefaultBrowser, setDefaultBrowser } from './defaultBrowser'
import { PRELOAD, RENDERER_HTML } from './paths'

if (process.env.GRAVITY_USER_DATA) app.setPath('userData', process.env.GRAVITY_USER_DATA)

// Sites (Google sign-in in particular) treat "Electron/x" user agents as unsafe
// embedded browsers, so present a clean Chrome user agent.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, '')
  .replace(/\sgravity-browser\/\S+/i, '')
  .replace(/\sGravity\/\S+/, '')

const sessionStore = new JsonStore<SessionData | null>('session', () => null)
const favoritesStore = new JsonStore<Favorite[]>('favorites', () => [])
const archiveStore = new JsonStore<ArchivedTab[]>('archive', () => [])

let mainWindow: BrowserWindow | null = null
/** URLs that arrived (e.g. from Finder or another app) before the window was ready. */
const pendingUrls: string[] = []

function openExternalUrl(url: string): void {
  if (!/^https?:|^file:/i.test(url)) return
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    const req: OpenUrlRequest = { url, mode: 'foreground' }
    mainWindow.webContents.send(IPC.openUrl, req)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else {
    pendingUrls.push(url)
  }
}

function prepareSession(partition: string, persist: boolean): void {
  const ses = session.fromPartition(partition)
  ses.setUserAgent(app.userAgentFallback)
  trackDownloads(ses)
  handlePermissions(ses, { persist })
  void protectSession(ses)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Gravity',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    transparent: false,
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: true,
      // Tests run with the window behind others; throttling would freeze animations.
      backgroundThrottling: !process.env.GRAVITY_E2E
    }
  })

  hardenWebviews(win)
  setShieldHost(win.webContents)
  setDownloadsHost(win.webContents)
  setPermissionsHost(win.webContents)

  // The UI itself must never navigate away or open windows.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => {
    win.show()
    if (process.env.GRAVITY_E2E) win.blur()
  })
  win.webContents.on('did-finish-load', () => {
    for (const url of pendingUrls.splice(0)) openExternalUrl(url)
  })

  const sendState = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.windowState, { fullscreen: win.isFullScreen() })
  }
  win.on('enter-full-screen', sendState)
  win.on('leave-full-screen', sendState)

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(RENDERER_HTML)

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

function registerIpc(): void {
  ipcMain.handle(IPC.sessionLoad, () => sessionStore.get())
  ipcMain.on(IPC.sessionSave, (_e, data: SessionData) => sessionStore.set(data))

  ipcMain.on(IPC.historyAdd, (_e, entry: { url: string; title?: string; favicon?: string; meta?: boolean }) => {
    if (entry.meta) history.updateMeta(entry)
    else history.addVisit(entry)
  })
  ipcMain.handle(IPC.historySearch, (_e, q: string, limit?: number) => history.search(q, limit))
  ipcMain.handle(IPC.historyRecent, (_e, kind: 'recent' | 'top', limit?: number) =>
    kind === 'top' ? history.topSites(limit) : history.recent(limit)
  )
  ipcMain.handle(IPC.historyClear, () => history.clear())

  ipcMain.handle(IPC.favoritesGet, () => favoritesStore.get())
  ipcMain.on(IPC.favoritesSet, (_e, list: Favorite[]) => favoritesStore.set(list))
  ipcMain.handle(IPC.archiveGet, () => archiveStore.get())
  ipcMain.on(IPC.archiveAdd, (_e, items: ArchivedTab[]) =>
    archiveStore.update((a) => [...items, ...a].slice(0, 500))
  )
  ipcMain.on(IPC.archiveRemove, (_e, url: string | null) =>
    archiveStore.update((a) => (url === null ? [] : a.filter((x) => x.url !== url)))
  )

  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<Settings>) => {
    const next = setSettings(patch)
    if ('shield' in patch) void setShieldEnabled(next.shield)
    if ('theme' in patch) nativeTheme.themeSource = next.theme
    return next
  })

  ipcMain.handle(IPC.suggest, (_e, q: string, engine: SearchEngineId) => suggest(q, engine))
  ipcMain.handle(IPC.faviconColor, (_e, url: string) => faviconColor(url))
  ipcMain.on(IPC.downloadsAction, (_e, id: string, action: 'open' | 'show' | 'cancel') => downloadAction(id, action))
  ipcMain.on(IPC.permissionRespond, (_e, id: string, granted: boolean) => respondPermission(id, granted))
  ipcMain.handle(IPC.defaultBrowserGet, () => isDefaultBrowser())
  ipcMain.handle(IPC.defaultBrowserSet, () => setDefaultBrowser())
  ipcMain.on(IPC.trafficLights, (_e, visible: boolean) => mainWindow?.setWindowButtonVisibility(visible))
  ipcMain.on(IPC.clipboardWrite, (_e, text: string) => clipboard.writeText(String(text)))
  ipcMain.handle(IPC.appInfo, () => ({ version: app.getVersion(), name: app.getName() }))
}

// macOS delivers links from other apps through 'open-url' (register before ready).
app.on('open-url', (event, url) => {
  event.preventDefault()
  openExternalUrl(url)
})
app.on('open-file', (event, path) => {
  event.preventDefault()
  openExternalUrl(`file://${path}`)
})

const gotLock = process.env.GRAVITY_E2E ? true : app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => /^https?:\/\//.test(a))
    if (url) openExternalUrl(url)
    else mainWindow?.focus()
  })

  app.whenReady().then(() => {
    const settings = getSettings()
    nativeTheme.themeSource = settings.theme
    registerIpc()
    prepareSession('persist:gravity', true)
    prepareSession('gravity-private', false)
    void setShieldEnabled(settings.shield)
    buildMenu(() => mainWindow)
    mainWindow = createWindow()

    app.on('activate', () => {
      if (!mainWindow) mainWindow = createWindow()
      else mainWindow.show()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => flushAllStores())
