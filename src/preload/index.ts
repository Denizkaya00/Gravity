import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  ArchivedTab,
  CommandEvent,
  DownloadInfo,
  Favorite,
  HistoryEntry,
  OpenUrlRequest,
  PermissionRequest,
  SearchEngineId,
  SessionData,
  Settings
} from '../shared/types'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  platform: process.platform,
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
    get: (): Promise<Favorite[]> => ipcRenderer.invoke(IPC.favoritesGet),
    set: (list: Favorite[]): void => ipcRenderer.send(IPC.favoritesSet, list)
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
  onCommand: (cb: (e: CommandEvent) => void) => on(IPC.command, cb),
  onOpenUrl: (cb: (r: OpenUrlRequest) => void) => on(IPC.openUrl, cb),
  onMetaKey: (cb: (e: { down: boolean; combo?: boolean }) => void) => on(IPC.metaKey, cb),
  onWindowState: (cb: (s: { fullscreen: boolean }) => void) => on(IPC.windowState, cb),
  defaultBrowser: {
    get: (): Promise<boolean> => ipcRenderer.invoke(IPC.defaultBrowserGet),
    set: (): Promise<boolean> => ipcRenderer.invoke(IPC.defaultBrowserSet)
  },
  setTrafficLights: (visible: boolean): void => ipcRenderer.send(IPC.trafficLights, visible),
  copy: (text: string): void => ipcRenderer.send(IPC.clipboardWrite, text),
  appInfo: (): Promise<{ version: string; name: string }> => ipcRenderer.invoke(IPC.appInfo)
}

export type GravityAPI = typeof api

contextBridge.exposeInMainWorld('gravity', api)
