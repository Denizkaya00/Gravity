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
  /** This space's own background. Without one, it shows the default from Settings. */
  background?: SpaceBackground
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
export type BlackHoleMode = 'live' | 'still' | 'off'

/** The scene behind Home and the Overview. */
export type SceneId = 'blackhole' | 'mountains' | 'wave' | 'dunes' | 'forest'

/** Whether the painted scenes show day or night. Automatic follows the sun where you are. */
export type DaylightMode = 'auto' | 'day' | 'night'

/** The photographs the Mountains background can show. */
export type MountainPhoto = 'valleys' | 'ama-dablam' | 'everest' | 'fitz-roy' | 'khumbu'

/** Everything that makes up a background: the scene and, for Mountains, its photo and night sky. */
export interface SpaceBackground {
  scene: SceneId
  mountainPhoto: MountainPhoto
  mountainStars: boolean
}

/** Where a new background goes: ask each time, only the space you're in, or every space. */
export type BackgroundScope = 'ask' | 'space' | 'all'

/** Favorites, per space id. */
export type FavoritesBySpace = Record<string, Favorite[]>

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
  /** How the background scene moves: Live, Still or Off (the key predates the other scenes). */
  blackHole: BlackHoleMode
  /** Which scene is behind Home and the Overview. Onboarding always uses the black hole. */
  scene: SceneId
  /** Day or night in the painted scenes (the black hole is always in space). */
  daylight: DaylightMode
  /** Which photo the Mountains background shows. At night it turns to moonlight… */
  mountainPhoto: MountainPhoto
  /** …or gives way to the Milky Way. */
  mountainStars: boolean
  /** Whether changing the background asks, changes only the current space, or changes every space. */
  backgroundScope: BackgroundScope
  /** Which pages go through Tor. Gravity's own requests do whenever this isn't 'off'. */
  tunnel: TunnelMode
  /** When the Tunnel connects through a Snowflake bridge instead of directly to Tor. */
  tunnelBridge: TunnelBridge
  /** Sites (host names) that load without the Tunnel in normal spaces, because they don't work over Tor. */
  tunnelBypass: string[]
  /** Fill saved passwords into sign-in forms on their sites. */
  passwordsAutofill: boolean
  /** Ask to save a password after signing in with one Gravity doesn't know. */
  passwordsOffer: boolean
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
  suggestions: true,
  blackHole: 'live',
  scene: 'blackhole',
  daylight: 'auto',
  mountainPhoto: 'valleys',
  mountainStars: false,
  backgroundScope: 'ask',
  tunnel: 'off',
  tunnelBridge: 'auto',
  tunnelBypass: [],
  passwordsAutofill: true,
  passwordsOffer: true
}

export type TunnelMode = 'off' | 'private' | 'all'

/** auto: direct first, then bridges if Tor seems blocked. always: bridges only. never: direct only. */
export type TunnelBridge = 'auto' | 'always' | 'never'

/** How tor reaches the Tor network: directly, or through a Snowflake or meek bridge. */
export type TunnelTransport = 'direct' | 'snowflake' | 'meek'

export interface TunnelStatus {
  state: 'off' | 'connecting' | 'on' | 'error'
  /** Tor's bootstrap progress, 0 to 100. */
  progress: number
  /** What Tor is doing, or what went wrong. */
  message?: string
  /** How this connection reaches Tor. */
  transport?: TunnelTransport
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
  | 'go-home'
  | 'toggle-split'
  | 'copy-url'
  | 'pin-tab'
  | 'favorite'
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
