import type { Session, WebContents } from 'electron'
import { clientHintHeaders, type UABrand } from '@shared/clientHints'

/**
 * Electron doesn't send the Sec-CH-UA client hints that every Chromium browser
 * sends to secure sites, while pages can still read the same brands from
 * navigator.userAgentData. A "Chrome" that never sends them looks like an
 * embedded browser to sign-in pages (Google's in particular), so Gravity adds
 * the default, low-entropy ones itself, copied from what Chromium tells pages.
 */

let headers: Record<string, string> | null = null
const sessions = new Set<Session>()

function install(ses: Session): void {
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!headers || !isSecure(details.url)) return callback({ requestHeaders: details.requestHeaders })
    const requestHeaders = { ...details.requestHeaders }
    const present = new Set(Object.keys(requestHeaders).map((k) => k.toLowerCase()))
    for (const [k, v] of Object.entries(headers)) if (!present.has(k)) requestHeaders[k] = v
    callback({ requestHeaders })
  })
}

/** Chrome sends client hints only to potentially trustworthy origins. */
function isSecure(url: string): boolean {
  return /^(https|wss):/i.test(url) || /^(http|ws):\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url)
}

/** Adds client hints to a session's requests (once Chromium's brand list is known). */
export function sendClientHints(ses: Session): void {
  if (sessions.has(ses)) return
  sessions.add(ses)
  install(ses)
}

/** Reads the brand list from a page Gravity controls, so headers always match navigator.userAgentData. */
export async function learnClientHints(wc: WebContents): Promise<void> {
  try {
    const ua = (await wc.executeJavaScript(
      'navigator.userAgentData ? { brands: navigator.userAgentData.brands, mobile: navigator.userAgentData.mobile, platform: navigator.userAgentData.platform } : null'
    )) as { brands: UABrand[]; mobile: boolean; platform: string } | null
    if (ua?.brands?.length) headers = clientHintHeaders(ua.brands, ua.mobile, ua.platform)
  } catch (err) {
    console.warn('[client hints]', err)
  }
}
