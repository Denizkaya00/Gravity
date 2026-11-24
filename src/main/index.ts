import { app, BrowserWindow, clipboard, ipcMain, nativeTheme, session, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { ArchivedTab, Favorite, FavoritesBySpace, OpenUrlRequest, SearchEngineId, SessionData, Settings } from '@shared/types'
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
import { getTunnelStatus, initTunnel, newCircuit, setTunnel, setTunnelHost } from './tunnel'
import { learnClientHints, sendClientHints } from './clientHints'
import { clearClipboard, clipboardPending, initPasswords, setPasswordsHost } from './passwords'
import { ICON, PRELOAD, RENDERER_HTML } from './paths'
import { setTabInView } from './backgroundMedia'

if (process.env.GRAVITY_USER_DATA) app.setPath('userData', process.env.GRAVITY_USER_DATA)

// Google sign-in rejects Electron that claims to be stock Chrome ("This browser
// or app may not be secure"): its scripts can tell the page isn't Chrome. A user
// agent that names its own browser passes, the way Edge and Opera add their
// tokens. So keep Electron's own "Gravity/<version>" token and full Chrome
// version, and drop only "Electron/x", which some sites treat as an embedded app.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, '')
  // Electron puts "<app name>/<version>" before Chrome/ only when it knows the app's name; say it always.
  .replace(/\s[\w.-]+\/[\d.]+(?=\sChrome\/)/, '')
  .replace(/\sChrome\//, ` Gravity/${app.getVersion()} Chrome/`)

const sessionStore = new JsonStore<SessionData | null>('session', () => null)
// Favorites per space. Before spaces had their own, this was one list (an array); the UI hands it to every space.
const favoritesStore = new JsonStore<FavoritesBySpace | Favorite[]>('favorites', () => ({}))
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
  // No ses.setUserAgent(): an explicit override makes Chromium stop sending the
  // Sec-CH-UA client hints every real Chrome sends, which gives the browser away.
  // Sessions already use app.userAgentFallback above.
  sendClientHints(ses)
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
      // The Mac's region format (e.g. en-TR), which the interface language (en-US) hides.
      additionalArguments: [`--gravity-locale=${app.getSystemLocale()}`],
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
  // The UI runs on the same Chromium, so it knows the brand list pages will see.
  win.webContents.once('dom-ready', () => void learnClientHints(win.webContents))
  setShieldHost(win.webContents)
  setDownloadsHost(win.webContents)
  setPermissionsHost(win.webContents)
  setTunnelHost(win.webContents)
  setPasswordsHost(win.webContents)

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
  ipcMain.on(IPC.favoritesSet, (_e, bySpace: FavoritesBySpace) => favoritesStore.set(bySpace))
  ipcMain.handle(IPC.archiveGet, () => archiveStore.get())
  ipcMain.on(IPC.archiveAdd, (_e, items: ArchivedTab[]) =>
    archiveStore.update((a) => [...items, ...a].slice(0, 500))
  )
  ipcMain.on(IPC.archiveRemove, (_e, url: string | null) =>
    archiveStore.update((a) => (url === null ? [] : a.filter((x) => x.url !== url)))
  )

  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, async (_e, patch: Partial<Settings>) => {
    const next = setSettings(patch)
    if ('shield' in patch) void setShieldEnabled(next.shield)
    if ('theme' in patch) nativeTheme.themeSource = next.theme
    if ('tunnel' in patch || 'tunnelBridge' in patch || 'tunnelBypass' in patch) {
      const applied = setTunnel({ mode: next.tunnel, bridge: next.tunnelBridge, bypass: next.tunnelBypass })
      // A site added to the bypass list is reloaded right after, so its route must be in place first.
      if ('tunnelBypass' in patch) await applied
    }
    return next
  })
  ipcMain.handle(IPC.tunnelGet, () => getTunnelStatus())
  ipcMain.handle(IPC.tunnelNewCircuit, () => newCircuit())

  ipcMain.handle(IPC.suggest, (_e, q: string, engine: SearchEngineId) => suggest(q, engine))
  ipcMain.handle(IPC.faviconColor, (_e, url: string) => faviconColor(url))
  ipcMain.on(IPC.downloadsAction, (_e, id: string, action: 'open' | 'show' | 'cancel') => downloadAction(id, action))
  ipcMain.on(IPC.permissionRespond, (_e, id: string, granted: boolean) => respondPermission(id, granted))
  ipcMain.handle(IPC.defaultBrowserGet, () => isDefaultBrowser())
  ipcMain.handle(IPC.defaultBrowserSet, () => setDefaultBrowser())
  ipcMain.on(IPC.trafficLights, (_e, visible: boolean) => mainWindow?.setWindowButtonVisibility(visible))
  ipcMain.on(IPC.clipboardWrite, (_e, text: string) => clipboard.writeText(String(text)))
  ipcMain.on(IPC.tabInView, (e, webContentsId: number, inView: boolean) =>
    setTabInView(e.sender, Number(webContentsId), inView === true)
  )
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

  app.whenReady().then(async () => {
    // In development the app runs inside the stock Electron.app; show Gravity's icon and
    // name instead (packaged builds get both from electron-builder).
    if (!app.isPackaged) app.dock?.setIcon(ICON)
    app.setAboutPanelOptions({ applicationName: app.name, applicationVersion: app.getVersion() })
    const settings = getSettings()
    nativeTheme.themeSource = settings.theme
    registerIpc()
    initPasswords()
    initTunnel()
    // Route the sessions before anything loads, so no page or list download goes out directly.
    await setTunnel({ mode: settings.tunnel, bridge: settings.tunnelBridge, bypass: settings.tunnelBypass })
    prepareSession('persist:gravity', true)
    prepareSession('gravity-private', false)
    sendClientHints(session.defaultSession)
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
app.on('before-quit', (e) => {
  flushAllStores()
  // A copied password shouldn't outlive Gravity on the clipboard.
  if (clipboardPending()) {
    e.preventDefault()
    void clearClipboard().finally(() => app.quit())
  }
})
