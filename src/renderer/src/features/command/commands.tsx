import type { ReactNode } from 'react'
import {
  Archive,
  Code2,
  Columns2,
  Copy,
  Eye,
  History,
  House,
  Keyboard,
  LayoutGrid,
  Moon,
  PanelLeft,
  Pin,
  Plus,
  RotateCcw,
  Settings2,
  Shield,
  Star,
  Sun,
  Trash2,
  VenetianMask,
  Globe2,
  KeyRound,
  Waypoints
} from 'lucide-react'
import { selectActiveTab, useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { clearSpace, copyActiveUrl, toggleHome, toggleSplit } from '@/browser/actions'
import { toggleFavorite } from '@/browser/favorites'
import { findFavorite } from '@shared/favorites'
import { page } from '@/browser/registry'
import { openOverview } from '@/features/overview/openOverview'

export interface Command {
  id: string
  title: string
  keywords?: string
  hint?: string
  icon: ReactNode
  run: () => void
}

const ui = () => useUI.getState()

export function getCommands(): Command[] {
  const tab = selectActiveTab(useBrowser.getState())
  const settings = useSettings.getState()
  const list: Command[] = [
    ...(tab ? [{ id: 'home', title: 'Go Home — tabs stay open', keywords: 'start new tab page background', hint: '⇧⌘H', icon: <House size={15} />, run: () => toggleHome() }] : []),
    { id: 'gravity-well', title: 'Gravity Well — see all tabs', keywords: 'overview tabs grid expose', hint: '⇧⌘\\', icon: <LayoutGrid size={15} />, run: () => void openOverview() },
    { id: 'new-space', title: 'New Space', keywords: 'workspace create', hint: '⌥⌘N', icon: <Plus size={15} />, run: () => useBrowser.getState().addSpace() },
    { id: 'new-private', title: 'New Private Space', keywords: 'incognito private', hint: '⇧⌘N', icon: <VenetianMask size={15} />, run: () => useBrowser.getState().addSpace({ private: true }) },
    { id: 'focus', title: 'Toggle Focus Mode', keywords: 'zen distraction fullscreen', hint: '⇧⌘F', icon: <Eye size={15} />, run: () => ui().set({ focusMode: !ui().focusMode }) },
    { id: 'sidebar', title: 'Toggle Sidebar', keywords: 'hide show', hint: '⌘S', icon: <PanelLeft size={15} />, run: () => void settings.update({ sidebarCollapsed: !settings.sidebarCollapsed }) },
    { id: 'split', title: 'Toggle Split View', keywords: 'side by side two', hint: '⌥⌘\\', icon: <Columns2 size={15} />, run: () => toggleSplit() },
    { id: 'reopen', title: 'Reopen Closed Tab', keywords: 'undo restore', hint: '⇧⌘T', icon: <RotateCcw size={15} />, run: () => useBrowser.getState().reopenClosed() },
    { id: 'passwords', title: 'Passwords', keywords: 'password login sign in keychain vault autofill credentials', icon: <KeyRound size={15} />, run: () => ui().set({ settingsOpen: true, settingsPage: 'passwords' }) },
    { id: 'clear-space', title: 'Clear Space — archive unpinned tabs', keywords: 'sweep archive close all', icon: <Archive size={15} />, run: () => clearSpace() },
    { id: 'shield', title: settings.shield ? 'Turn Shield Off' : 'Turn Shield On', keywords: 'adblock tracker privacy', icon: <Shield size={15} />, run: () => void settings.update({ shield: !settings.shield }) },
    ...(settings.tunnel === 'off'
      ? [
          { id: 'tunnel-all', title: 'Tunnel All Tabs Through Tor', keywords: 'vpn tor proxy ip privacy anonymous', icon: <Waypoints size={15} />, run: () => void settings.update({ tunnel: 'all' }) },
          { id: 'tunnel-private', title: 'Tunnel Private Spaces Through Tor', keywords: 'vpn tor proxy ip privacy anonymous incognito', icon: <Waypoints size={15} />, run: () => void settings.update({ tunnel: 'private' }) }
        ]
      : [{ id: 'tunnel-off', title: 'Turn Tunnel Off', keywords: 'vpn tor proxy ip', icon: <Waypoints size={15} />, run: () => void settings.update({ tunnel: 'off' }) }]),
    {
      id: 'theme',
      title: settings.theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme',
      keywords: 'appearance dark light mode',
      icon: settings.theme === 'light' ? <Moon size={15} /> : <Sun size={15} />,
      run: () => void settings.update({ theme: settings.theme === 'light' ? 'dark' : 'light' })
    },
    { id: 'add-favorite', title: 'Add a Favorite…', keywords: 'pin page home shortcut bookmark star tile', icon: <Star size={15} />, run: () => ui().openCommand('pin') },
    { id: 'settings', title: 'Settings', keywords: 'preferences options', hint: '⌘,', icon: <Settings2 size={15} />, run: () => ui().set({ settingsOpen: true }) },
    { id: 'shortcuts', title: 'Keyboard Shortcuts', keywords: 'help cheatsheet keys', hint: '⌘/', icon: <Keyboard size={15} />, run: () => ui().set({ cheatsheet: true }) },
    {
      id: 'clear-history',
      title: 'Clear Browsing History',
      keywords: 'delete forget privacy',
      icon: <Trash2 size={15} />,
      run: () => {
        void window.gravity.history.clear()
        ui().toast('History cleared', 'check')
      }
    },
    {
      id: 'default-browser',
      title: 'Make Gravity the Default Browser',
      keywords: 'default system',
      icon: <Globe2 size={15} />,
      run: () => void window.gravity.defaultBrowser.set()
    }
  ]
  if (tab) {
    list.push(
      { id: 'copy-url', title: 'Copy Page URL', keywords: 'link share', hint: '⇧⌘C', icon: <Copy size={15} />, run: () => copyActiveUrl() },
      ...(/^https?:/.test(tab.url)
        ? [
            {
              id: 'favorite',
              title: findFavorite(settings.favorites, tab.url) ? 'Remove Page from Favorites' : 'Add Page to Favorites',
              keywords: 'bookmark star pin home shortcut',
              hint: '⇧⌘D',
              icon: <Star size={15} />,
              run: () => toggleFavorite(tab)
            }
          ]
        : []),
      { id: 'pin', title: tab.pinned ? 'Unpin Tab' : 'Pin Tab', keywords: 'keep', hint: '⌘D', icon: <Pin size={15} />, run: () => useBrowser.getState().togglePin(tab.id) },
      { id: 'devtools', title: 'Developer Tools', keywords: 'inspect console', hint: '⌥⌘I', icon: <Code2 size={15} />, run: () => page.devtools(tab.id) },
      { id: 'history-back', title: 'Go Back', keywords: 'previous', hint: '⌘[', icon: <History size={15} />, run: () => page.back(tab.id) }
    )
  }
  return list
}
