/** Every IPC channel name lives here so main, preload and renderer never drift. */
export const IPC = {
  sessionLoad: 'session:load',
  sessionSave: 'session:save',
  historyAdd: 'history:add',
  historySearch: 'history:search',
  historyRecent: 'history:recent',
  historyClear: 'history:clear',
  favoritesGet: 'favorites:get',
  favoritesSet: 'favorites:set',
  archiveGet: 'archive:get',
  archiveAdd: 'archive:add',
  archiveRemove: 'archive:remove',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  suggest: 'suggest',
  faviconColor: 'favicon:color',
  shieldSet: 'shield:set',
  shieldBlocked: 'shield:blocked',
  tunnelGet: 'tunnel:get',
  tunnelStatus: 'tunnel:status',
  tunnelNewCircuit: 'tunnel:new-circuit',
  downloadsUpdate: 'downloads:update',
  downloadsAction: 'downloads:action',
  permissionRequest: 'permission:request',
  permissionRespond: 'permission:respond',
  command: 'command',
  openUrl: 'open-url',
  defaultBrowserGet: 'default-browser:get',
  defaultBrowserSet: 'default-browser:set',
  windowState: 'window:state',
  trafficLights: 'window:traffic-lights',
  metaKey: 'key:meta',
  clipboardWrite: 'clipboard:write',
  appInfo: 'app:info',
  /** A tab entered or left view, so its video can pause while it's away. */
  tabInView: 'tab:in-view',
  passwordsStatus: 'passwords:status',
  passwordsUnlock: 'passwords:unlock',
  passwordsLock: 'passwords:lock',
  passwordsList: 'passwords:list',
  passwordsGet: 'passwords:get',
  passwordsSave: 'passwords:save',
  passwordsRemove: 'passwords:remove',
  passwordsCopy: 'passwords:copy',
  passwordsNever: 'passwords:never',
  passwordsNeverRemove: 'passwords:never-remove',
  passwordsOffer: 'passwords:offer',
  passwordsOfferRespond: 'passwords:offer-respond'
} as const

/** Messages the guest preload sends to its host <webview> element via sendToHost. */
export const GUEST = {
  swipe: 'gravity:swipe',
  peek: 'gravity:peek'
} as const

/** Channels the guest preload talks to the main process on, directly (not via the host). */
export const GUEST_IPC = {
  /** Saved sign-ins for the page asking. Main reads the page's address itself. */
  credentials: 'guest:credentials',
  /** A credential the page was filled with, so it moves to the top next time. */
  filled: 'guest:filled',
  /** A username typed on the first step of a two-step sign-in. */
  username: 'guest:username',
  /** A sign-in form was submitted. */
  submitted: 'guest:submitted'
} as const
