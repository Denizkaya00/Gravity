import { app, clipboard, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions, type WebContents } from 'electron'
import type { CommandEvent, OpenMode, OpenUrlRequest } from '@shared/types'
import { IPC } from '@shared/ipc'
import { searchUrl } from '@shared/url'
import { getSettings } from './settings'
import { GUEST_PRELOAD } from './paths'

const SAFE_PROTOCOLS = /^(https?|about|data|blob):/i

function sendOpen(host: WebContents, req: OpenUrlRequest): void {
  if (!host.isDestroyed()) host.send(IPC.openUrl, req)
}

export function sendCommand(host: WebContents, ev: CommandEvent): void {
  if (!host.isDestroyed()) host.send(IPC.command, ev)
}

/**
 * Forwards keys the renderer cannot see while focus is inside a page:
 * the ⌘ key (for the hold-to-show cheatsheet) and Escape (to close Peek etc.).
 */
function forwardKeys(contents: WebContents, host: WebContents): void {
  contents.on('before-input-event', (_e, input) => {
    if (input.key === 'Meta') {
      if (input.type === 'keyDown' && !input.isAutoRepeat) host.send(IPC.metaKey, { down: true })
      if (input.type === 'keyUp') host.send(IPC.metaKey, { down: false })
    } else if (input.meta && input.type === 'keyDown') {
      host.send(IPC.metaKey, { down: false, combo: true })
    }
    if (input.key === 'Escape' && input.type === 'keyDown' && contents !== host) {
      sendCommand(host, { command: 'escape', arg: contents.id })
    }
  })
}

function contextMenu(contents: WebContents, host: WebContents): void {
  contents.on('context-menu', (_e, p) => {
    const t: MenuItemConstructorOptions[] = []
    const open = (url: string, mode: OpenMode) => sendOpen(host, { url, mode, sourceId: contents.id })

    if (p.linkURL) {
      t.push(
        { label: 'Open Link in New Tab', click: () => open(p.linkURL, 'background') },
        { label: 'Peek Link', click: () => open(p.linkURL, 'peek') },
        { label: 'Open Link in Split View', click: () => open(p.linkURL, 'split') },
        { type: 'separator' },
        { label: 'Copy Link', click: () => clipboard.writeText(p.linkURL) },
        { type: 'separator' }
      )
    }
    if (p.mediaType === 'image' && p.srcURL) {
      t.push(
        { label: 'Open Image in New Tab', click: () => open(p.srcURL, 'background') },
        { label: 'Copy Image', click: () => contents.copyImageAt(p.x, p.y) },
        { label: 'Copy Image Address', click: () => clipboard.writeText(p.srcURL) },
        { label: 'Save Image…', click: () => contents.downloadURL(p.srcURL) },
        { type: 'separator' }
      )
    }
    if (p.isEditable) {
      for (const s of p.dictionarySuggestions.slice(0, 4)) {
        t.push({ label: s, click: () => contents.replaceMisspelling(s) })
      }
      if (p.dictionarySuggestions.length) t.push({ type: 'separator' })
      t.push(
        { role: 'undo', enabled: p.editFlags.canUndo },
        { role: 'redo', enabled: p.editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: p.editFlags.canCut },
        { role: 'copy', enabled: p.editFlags.canCopy },
        { role: 'paste', enabled: p.editFlags.canPaste },
        { role: 'selectAll' },
        { type: 'separator' }
      )
    } else if (p.selectionText.trim()) {
      const text = p.selectionText.trim()
      const short = text.length > 28 ? `${text.slice(0, 28)}…` : text
      t.push(
        { role: 'copy' },
        { label: `Search for “${short}”`, click: () => open(searchUrl(text, getSettings().searchEngine), 'foreground') },
        { type: 'separator' }
      )
    }
    if (!p.linkURL && !p.isEditable && !p.selectionText) {
      t.push(
        { label: 'Back', enabled: contents.navigationHistory.canGoBack(), click: () => contents.navigationHistory.goBack() },
        { label: 'Forward', enabled: contents.navigationHistory.canGoForward(), click: () => contents.navigationHistory.goForward() },
        { label: 'Reload', click: () => contents.reload() },
        { type: 'separator' }
      )
    }
    t.push({ label: 'Inspect Element', click: () => contents.inspectElement(p.x, p.y) })
    Menu.buildFromTemplate(t).popup()
  })
}

/** Locks down every <webview> the host page tries to create, then wires it up. */
export function hardenWebviews(win: BrowserWindow): void {
  const host = win.webContents
  forwardKeys(host, host)

  host.on('will-attach-webview', (event, webPreferences, params) => {
    if (params.src && !SAFE_PROTOCOLS.test(params.src)) {
      event.preventDefault()
      return
    }
    // Strip anything the host page might have asked for and set our own.
    delete (webPreferences as Record<string, unknown>).preloadURL
    webPreferences.preload = GUEST_PRELOAD
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
    webPreferences.scrollBounce = true
    if (params.partition !== 'persist:gravity' && params.partition !== 'gravity-private') {
      params.partition = 'persist:gravity'
    }
  })

  host.on('did-attach-webview', (_event, contents) => {
    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (disposition === 'new-window') {
        // Real popups (OAuth, payment flows) need window.opener, so keep them as windows.
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 680,
            backgroundColor: '#ffffff',
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
          }
        }
      }
      sendOpen(host, {
        url,
        mode: disposition === 'background-tab' ? 'background' : 'foreground',
        sourceId: contents.id
      })
      return { action: 'deny' }
    })
    contextMenu(contents, host)
    forwardKeys(contents, host)
    contents.on('will-navigate', (e, url) => {
      if (SAFE_PROTOCOLS.test(url)) return
      e.preventDefault()
      // Hand mail and phone links to the system; silently drop everything else.
      if (/^(mailto|tel|facetime):/i.test(url)) void shell.openExternal(url)
    })
  })

  currentHost = host
  if (!popupHookInstalled) {
    popupHookInstalled = true
    app.on('web-contents-created', (_e, contents) => {
      // Popup windows opened from pages get the same context menu.
      if (contents.getType() === 'window' && currentHost && contents !== currentHost) contextMenu(contents, currentHost)
    })
  }
}

let popupHookInstalled = false
let currentHost: WebContents | null = null
