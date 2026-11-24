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
  appInfo: 'app:info'
} as const

/** Messages the guest preload sends to its host <webview> element via sendToHost. */
export const GUEST = {
  swipe: 'gravity:swipe',
  peek: 'gravity:peek'
} as const
