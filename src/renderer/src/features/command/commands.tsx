import type { ReactNode } from 'react'
import {
  Archive,
  Code2,
  Columns2,
  Copy,
  Eye,
  History,
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
  Globe2
} from 'lucide-react'
import { selectActiveTab, useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { clearSpace, copyActiveUrl, toggleSplit } from '@/browser/actions'
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
    { id: 'gravity-well', title: 'Gravity Well — see all tabs', keywords: 'overview tabs grid expose', hint: '⇧⌘\\', icon: <LayoutGrid size={15} />, run: () => void openOverview() },
    { id: 'new-space', title: 'New Space', keywords: 'workspace create', hint: '⌥⌘N', icon: <Plus size={15} />, run: () => useBrowser.getState().addSpace() },
    { id: 'new-private', title: 'New Private Space', keywords: 'incognito private', hint: '⇧⌘N', icon: <VenetianMask size={15} />, run: () => useBrowser.getState().addSpace({ private: true }) },
    { id: 'focus', title: 'Toggle Focus Mode', keywords: 'zen distraction fullscreen', hint: '⇧⌘F', icon: <Eye size={15} />, run: () => ui().set({ focusMode: !ui().focusMode }) },
    { id: 'sidebar', title: 'Toggle Sidebar', keywords: 'hide show', hint: '⌘S', icon: <PanelLeft size={15} />, run: () => void settings.update({ sidebarCollapsed: !settings.sidebarCollapsed }) },
    { id: 'split', title: 'Toggle Split View', keywords: 'side by side two', hint: '⌥⌘\\', icon: <Columns2 size={15} />, run: () => toggleSplit() },
    { id: 'reopen', title: 'Reopen Closed Tab', keywords: 'undo restore', hint: '⇧⌘T', icon: <RotateCcw size={15} />, run: () => useBrowser.getState().reopenClosed() },
    { id: 'clear-space', title: 'Clear Space — archive unpinned tabs', keywords: 'sweep archive close all', icon: <Archive size={15} />, run: () => clearSpace() },
    { id: 'shield', title: settings.shield ? 'Turn Shield Off' : 'Turn Shield On', keywords: 'adblock tracker privacy', icon: <Shield size={15} />, run: () => void settings.update({ shield: !settings.shield }) },
    {
      id: 'theme',
      title: settings.theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme',
      keywords: 'appearance dark light mode',
      icon: settings.theme === 'light' ? <Moon size={15} /> : <Sun size={15} />,
      run: () => void settings.update({ theme: settings.theme === 'light' ? 'dark' : 'light' })
    },
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
      {
        id: 'favorite',
        title: 'Add Page to Favorites',
        keywords: 'bookmark star',
        icon: <Star size={15} />,
        run: () => {
          settings.addFavorite({ url: tab.url, title: tab.title, favicon: tab.favicon })
          ui().toast('Added to Favorites', 'check')
        }
      },
      { id: 'pin', title: tab.pinned ? 'Unpin Tab' : 'Pin Tab', keywords: 'keep', hint: '⌘D', icon: <Pin size={15} />, run: () => useBrowser.getState().togglePin(tab.id) },
      { id: 'devtools', title: 'Developer Tools', keywords: 'inspect console', hint: '⌥⌘I', icon: <Code2 size={15} />, run: () => page.devtools(tab.id) },
      { id: 'history-back', title: 'Go Back', keywords: 'previous', hint: '⌘[', icon: <History size={15} />, run: () => page.back(tab.id) }
    )
  }
  return list
}
