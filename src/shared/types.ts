export type SearchEngineId = 'google' | 'duckduckgo' | 'brave' | 'kagi' | 'bing'

export interface SpaceTheme {
  /** Three aurora colour stops used for the space's chrome tint and home canvas. */
  colors: [string, string, string]
}

export interface Space {
  id: string
  name: string
  emoji: string
  theme: SpaceTheme
  /** Private spaces use an in-memory partition and never write history. */
  private?: boolean
}

export interface Tab {
  id: string
  spaceId: string
  url: string
  title: string
  favicon?: string
  pinned: boolean
  createdAt: number
  lastActiveAt: number
  zoom?: number
}

export interface Split {
  a: string
  b: string
  /** Fraction of width given to `a` (0.2 – 0.8). */
  ratio: number
}

export interface ClosedTab {
  url: string
  title: string
  favicon?: string
  spaceId: string
  closedAt: number
}

export interface SessionData {
  version: 1
  spaces: Space[]
  tabs: Tab[]
  order: Record<string, string[]>
  activeSpaceId: string
  activeTabBySpace: Record<string, string | null>
  splits: Record<string, Split | null>
  closed: ClosedTab[]
}

export interface HistoryEntry {
  url: string
  title: string
  favicon?: string
  visitCount: number
  lastVisit: number
}

export interface Favorite {
  id: string
  url: string
  title: string
  favicon?: string
}

export interface ArchivedTab {
  url: string
  title: string
  favicon?: string
  spaceId: string
  archivedAt: number
}

export type ThemeMode = 'dark' | 'light' | 'system'
export type MotionPref = 'user' | 'always' | 'never'

export interface Settings {
  searchEngine: SearchEngineId
  shield: boolean
  archiveAfterHours: number
  sleepAfterMinutes: number
  theme: ThemeMode
  accent: string
  motion: MotionPref
  onboarded: boolean
  sidebarCollapsed: boolean
  suggestions: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  searchEngine: 'google',
  shield: true,
  archiveAfterHours: 12,
  sleepAfterMinutes: 15,
  theme: 'dark',
  accent: '#b4694a',
  motion: 'user',
  onboarded: false,
  sidebarCollapsed: false,
  suggestions: true
}

export type DownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadInfo {
  id: string
  filename: string
  url: string
  savePath: string
  received: number
  total: number
  state: DownloadState
  startedAt: number
}

export type PermissionKind = 'media' | 'geolocation' | 'notifications' | 'midi' | 'clipboard-read' | 'display-capture' | 'other'

export interface PermissionRequest {
  id: string
  webContentsId: number
  origin: string
  permission: string
  /** For media requests: which devices were asked for. */
  mediaTypes?: string[]
}

export type OpenMode = 'foreground' | 'background' | 'peek' | 'split'

export interface OpenUrlRequest {
  url: string
  mode: OpenMode
  /** webContents id of the page that asked, if any. */
  sourceId?: number
}

export type MenuCommand =
  | 'new-tab'
  | 'open-location'
  | 'close-tab'
  | 'reopen-tab'
  | 'next-tab'
  | 'prev-tab'
  | 'select-tab'
  | 'select-space'
  | 'next-space'
  | 'prev-space'
  | 'new-space'
  | 'back'
  | 'forward'
  | 'reload'
  | 'hard-reload'
  | 'stop'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'find'
  | 'find-next'
  | 'find-prev'
  | 'toggle-sidebar'
  | 'focus-mode'
  | 'tab-overview'
  | 'toggle-split'
  | 'copy-url'
  | 'pin-tab'
  | 'settings'
  | 'devtools'
  | 'print'
  | 'cheatsheet'
  | 'escape'
  | 'downloads'

export interface CommandEvent {
  command: MenuCommand
  arg?: number | string | boolean
}

export interface SwipeEvent {
  deltaX: number
}
