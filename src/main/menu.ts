import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { CommandEvent, MenuCommand } from '@shared/types'
import { sendCommand } from './webviews'
import { setDefaultBrowser } from './defaultBrowser'

export const REPO_URL = 'https://github.com/Denizkaya00/Gravity'

export function buildMenu(getWin: () => BrowserWindow | null): void {
  const send = (command: MenuCommand, arg?: CommandEvent['arg']) => () => {
    const win = getWin()
    if (win) sendCommand(win.webContents, { command, arg })
  }
  const item = (
    label: string,
    accelerator: string | undefined,
    command: MenuCommand,
    arg?: CommandEvent['arg']
  ): MenuItemConstructorOptions => ({ label, accelerator, click: send(command, arg) })
  /** Extra shortcut for the same command, invisible in the menu. */
  const alias = (accelerator: string, command: MenuCommand, arg?: CommandEvent['arg']): MenuItemConstructorOptions => ({
    label: `${command}-${accelerator}`,
    accelerator,
    visible: false,
    acceleratorWorksWhenHidden: true,
    click: send(command, arg)
  })

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        item('Settings…', 'Cmd+,', 'settings'),
        { label: 'Make Gravity the Default Browser', click: () => void setDefaultBrowser() },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        item('New Tab', 'Cmd+T', 'new-tab'),
        item('Open Location…', 'Cmd+L', 'open-location'),
        item('New Space', 'Cmd+Alt+N', 'new-space'),
        item('New Private Space', 'Cmd+Shift+N', 'new-space', 'private'),
        { type: 'separator' },
        item('Close Tab', 'Cmd+W', 'close-tab'),
        { label: 'Close Window', accelerator: 'Cmd+Shift+W', role: 'close' },
        item('Reopen Closed Tab', 'Cmd+Shift+T', 'reopen-tab'),
        { type: 'separator' },
        item('Print…', 'Cmd+P', 'print')
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        item('Find…', 'Cmd+F', 'find'),
        item('Find Next', 'Cmd+G', 'find-next'),
        item('Find Previous', 'Cmd+Shift+G', 'find-prev'),
        { type: 'separator' },
        item('Copy Page URL', 'Cmd+Shift+C', 'copy-url')
      ]
    },
    {
      label: 'View',
      submenu: [
        item('Toggle Sidebar', 'Cmd+S', 'toggle-sidebar'),
        item('Focus Mode', 'Cmd+Shift+F', 'focus-mode'),
        item('Gravity Well (All Tabs)', 'Cmd+Shift+\\', 'tab-overview'),
        item('Split View', 'Cmd+Alt+\\', 'toggle-split'),
        item('Downloads', 'Cmd+Alt+L', 'downloads'),
        { type: 'separator' },
        item('Reload Page', 'Cmd+R', 'reload'),
        item('Reload Ignoring Cache', 'Cmd+Shift+R', 'hard-reload'),
        item('Stop', 'Cmd+.', 'stop'),
        { type: 'separator' },
        // ⌘= rather than ⌘+: on layouts where + needs Shift+4 (Turkish Q), ⌘+ is ⇧⌘4, which macOS
        // takes for a screenshot. ⌘* is the unshifted key beside 0 there, as = is on US keyboards.
        item('Zoom In', 'Cmd+=', 'zoom-in'),
        alias('Cmd+Plus', 'zoom-in'),
        alias('Cmd+*', 'zoom-in'),
        alias('Cmd+numadd', 'zoom-in'),
        item('Zoom Out', 'Cmd+-', 'zoom-out'),
        alias('Cmd+numsub', 'zoom-out'),
        item('Actual Size', 'Cmd+0', 'zoom-reset'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        item('Developer Tools', 'Cmd+Alt+I', 'devtools'),
        ...(app.isPackaged ? [] : [{ label: 'Inspect Gravity UI', accelerator: 'Cmd+Alt+Shift+I', role: 'toggleDevTools' } as MenuItemConstructorOptions])
      ]
    },
    {
      label: 'History',
      submenu: [item('Back', 'Cmd+[', 'back'), item('Forward', 'Cmd+]', 'forward'), item('Home', 'Cmd+Shift+H', 'go-home')]
    },
    {
      label: 'Tabs',
      submenu: [
        item('Next Tab', 'Ctrl+Tab', 'next-tab'),
        alias('Cmd+Shift+]', 'next-tab'),
        alias('Cmd+Alt+Right', 'next-tab'),
        item('Previous Tab', 'Ctrl+Shift+Tab', 'prev-tab'),
        alias('Cmd+Shift+[', 'prev-tab'),
        alias('Cmd+Alt+Left', 'prev-tab'),
        { type: 'separator' },
        ...Array.from({ length: 8 }, (_, i) => item(`Tab ${i + 1}`, `Cmd+${i + 1}`, 'select-tab', i)),
        item('Last Tab', 'Cmd+9', 'select-tab', -1),
        { type: 'separator' },
        item('Pin / Unpin Tab', 'Cmd+D', 'pin-tab'),
        item('Add / Remove Favorite', 'Cmd+Shift+D', 'favorite'),
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, i) => item(`Space ${i + 1}`, `Ctrl+${i + 1}`, 'select-space', i)),
        item('Next Space', 'Ctrl+Cmd+Right', 'next-space'),
        item('Previous Space', 'Ctrl+Cmd+Left', 'prev-space')
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        item('Keyboard Shortcuts', 'Cmd+/', 'cheatsheet'),
        { label: 'Gravity on GitHub', click: () => void shell.openExternal(REPO_URL) }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
