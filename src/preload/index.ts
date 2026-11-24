import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  OfferResponse,
  PasswordDraft,
  PasswordEntry,
  PasswordOffer,
  PasswordSummary,
  VaultStatus
} from '../shared/passwords'
import type {
  ArchivedTab,
  CommandEvent,
  DownloadInfo,
  Favorite,
  FavoritesBySpace,
  HistoryEntry,
  OpenUrlRequest,
  PermissionRequest,
  SearchEngineId,
  SessionData,
  Settings,
  TunnelStatus
} from '../shared/types'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const LOCALE_ARG = '--gravity-locale='

const api = {
  platform: process.platform,
  /** The Mac's region format, such as `en-TR`. The interface itself is always English. */
  systemLocale: process.argv.find((a) => a.startsWith(LOCALE_ARG))?.slice(LOCALE_ARG.length) || 'en-US',
  session: {
    load: (): Promise<SessionData | null> => ipcRenderer.invoke(IPC.sessionLoad),
    save: (data: SessionData): void => ipcRenderer.send(IPC.sessionSave, data)
  },
  history: {
    add: (entry: { url: string; title?: string; favicon?: string; meta?: boolean }): void =>
      ipcRenderer.send(IPC.historyAdd, entry),
    search: (q: string, limit?: number): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC.historySearch, q, limit),
    recent: (limit?: number): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC.historyRecent, 'recent', limit),
    top: (limit?: number): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC.historyRecent, 'top', limit),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC.historyClear)
  },
  favorites: {
    /** Per space; an array is the list from before spaces had their own. */
    get: (): Promise<FavoritesBySpace | Favorite[]> => ipcRenderer.invoke(IPC.favoritesGet),
    set: (bySpace: FavoritesBySpace): void => ipcRenderer.send(IPC.favoritesSet, bySpace)
  },
  archive: {
    get: (): Promise<ArchivedTab[]> => ipcRenderer.invoke(IPC.archiveGet),
    add: (items: ArchivedTab[]): void => ipcRenderer.send(IPC.archiveAdd, items),
    remove: (url: string | null): void => ipcRenderer.send(IPC.archiveRemove, url)
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  suggest: (q: string, engine: SearchEngineId): Promise<string[]> => ipcRenderer.invoke(IPC.suggest, q, engine),
  faviconColor: (url: string): Promise<string | null> => ipcRenderer.invoke(IPC.faviconColor, url),
  downloads: {
    onUpdate: (cb: (d: DownloadInfo) => void) => on(IPC.downloadsUpdate, cb),
    action: (id: string, action: 'open' | 'show' | 'cancel'): void => ipcRenderer.send(IPC.downloadsAction, id, action)
  },
  permissions: {
    onRequest: (cb: (r: PermissionRequest) => void) => on(IPC.permissionRequest, cb),
    respond: (id: string, granted: boolean): void => ipcRenderer.send(IPC.permissionRespond, id, granted)
  },
  shield: {
    onBlocked: (cb: (e: { webContentsId: number; count: number }) => void) => on(IPC.shieldBlocked, cb)
  },
  passwords: {
    status: (): Promise<VaultStatus> => ipcRenderer.invoke(IPC.passwordsStatus),
    /** Asks for Touch ID where the Mac has it. */
    unlock: (): Promise<boolean> => ipcRenderer.invoke(IPC.passwordsUnlock),
    lock: (): void => ipcRenderer.send(IPC.passwordsLock),
    list: (): Promise<PasswordSummary[]> => ipcRenderer.invoke(IPC.passwordsList),
    get: (id: string): Promise<PasswordEntry | null> => ipcRenderer.invoke(IPC.passwordsGet, id),
    save: (draft: PasswordDraft): Promise<PasswordSummary> => ipcRenderer.invoke(IPC.passwordsSave, draft),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.passwordsRemove, id),
    copy: (id: string, field: 'username' | 'password'): Promise<boolean> => ipcRenderer.invoke(IPC.passwordsCopy, id, field),
    never: (): Promise<string[]> => ipcRenderer.invoke(IPC.passwordsNever),
    neverRemove: (site: string): Promise<void> => ipcRenderer.invoke(IPC.passwordsNeverRemove, site),
    onOffer: (cb: (o: PasswordOffer) => void) => on(IPC.passwordsOffer, cb),
    respondOffer: (id: string, answer: OfferResponse): void => ipcRenderer.send(IPC.passwordsOfferRespond, id, answer)
  },
  tunnel: {
    get: (): Promise<TunnelStatus> => ipcRenderer.invoke(IPC.tunnelGet),
    onStatus: (cb: (s: TunnelStatus) => void) => on(IPC.tunnelStatus, cb),
    /** New Tor circuits (a different exit) for the next connections. False if tor isn't connected. */
    newCircuit: (): Promise<boolean> => ipcRenderer.invoke(IPC.tunnelNewCircuit)
  },
  onCommand: (cb: (e: CommandEvent) => void) => on(IPC.command, cb),
  onOpenUrl: (cb: (r: OpenUrlRequest) => void) => on(IPC.openUrl, cb),
  onMetaKey: (cb: (e: { down: boolean; combo?: boolean }) => void) => on(IPC.metaKey, cb),
  onWindowState: (cb: (s: { fullscreen: boolean }) => void) => on(IPC.windowState, cb),
  defaultBrowser: {
    get: (): Promise<boolean> => ipcRenderer.invoke(IPC.defaultBrowserGet),
    set: (): Promise<boolean> => ipcRenderer.invoke(IPC.defaultBrowserSet)
  },
  setTrafficLights: (visible: boolean): void => ipcRenderer.send(IPC.trafficLights, visible),
  /** Whether a tab's page is in view; video in a tab that's away pauses until it's back. */
  setTabInView: (webContentsId: number, inView: boolean): void => ipcRenderer.send(IPC.tabInView, webContentsId, inView),
  copy: (text: string): void => ipcRenderer.send(IPC.clipboardWrite, text),
  appInfo: (): Promise<{ version: string; name: string }> => ipcRenderer.invoke(IPC.appInfo)
}

export type GravityAPI = typeof api

contextBridge.exposeInMainWorld('gravity', api)
