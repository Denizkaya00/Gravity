import { app } from 'electron'

export function isDefaultBrowser(): boolean {
  return app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https')
}

/** Asks macOS to make Gravity the default browser (the OS shows its own confirmation). */
export function setDefaultBrowser(): boolean {
  const a = app.setAsDefaultProtocolClient('http')
  const b = app.setAsDefaultProtocolClient('https')
  return a && b
}
