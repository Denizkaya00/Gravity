import { useEffect, useRef } from 'react'
import { selectActiveTabId, useBrowser } from '@/state/browser'
import { useRuntime } from '@/state/runtime'
import { useUI } from '@/state/ui'
import { useAssignments } from './WebviewLayer'
import { page } from './registry'

/** Where Gravity's own typing happens: the Command Bar, Find, Settings and so on keep the keyboard. */
const KEEPS_KEYBOARD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

/** How many times, 16 ms apart, to try focusing a page that isn't focusable yet. */
const TRIES = 30

/** The tab whose page has the keyboard, if a page has it. */
function pageWithKeyboard(el: Element | null): string | null {
  if (!(el instanceof HTMLElement) || el.tagName !== 'WEBVIEW') return null
  return el.closest('[data-tab-surface]')?.getAttribute('data-tab-surface') ?? null
}

/**
 * The keyboard follows the page on screen. A <webview> keeps focus after it's hidden, so without this, typing
 * and the Edit menu (⌘Z, ⇧⌘Z, ⌘X, ⌘C, ⌘V and ⌘A act on the focused page) would reach a tab you switched away
 * from, or nothing at all. As in Safari and Chrome, showing a tab hands its page the keyboard, and the page puts
 * the caret back where it was. Text fields in Gravity's own UI keep the keyboard, until the Command Bar, the
 * Overview or Settings closes and gives it back to the page.
 */
export function usePageFocus(): void {
  const activeId = useBrowser(selectActiveTabId)
  const assigned = useAssignments()
  const visible = Object.entries(assigned).sort().join('|')
  // A tab opened a moment ago can only take focus once its page exists.
  const webContentsId = useRuntime((s) => (activeId ? s.tabs[activeId]?.webContentsId : undefined))
  const covered = useUI((s) => s.command.open || s.overview || s.settingsOpen)
  const wasCovered = useRef(covered)

  // Let go of the old page the moment the active tab changes, before React renders the switch. If its <webview>
  // still has focus during that render, React hands focus back to it afterwards, and Chromium applies that only
  // after the new page has taken focus: the page on screen would look focused but get no keys.
  useEffect(
    () =>
      useBrowser.subscribe((s, prev) => {
        const id = selectActiveTabId(s)
        if (id === selectActiveTabId(prev)) return
        const el = document.activeElement
        const holder = pageWithKeyboard(el)
        if (holder && holder !== id && useUI.getState().peek?.tabId !== holder) (el as HTMLElement).blur()
      }),
    []
  )

  useEffect(() => {
    // The text field that has the keyboard now belongs to the overlay that's fading out.
    const closing = wasCovered.current && !covered
    wasCovered.current = covered
    if (covered) return
    const target = activeId && assigned[activeId] && assigned[activeId] !== 'peek' && webContentsId ? activeId : null
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = (tries: number) => {
      const el = document.activeElement
      const holder = pageWithKeyboard(el)
      if (holder === target) return
      if (holder && assigned[holder] === 'peek') return
      if (!holder && !closing && el instanceof HTMLElement && el !== document.body && el.closest(KEEPS_KEYBOARD)) return
      if (!target) {
        if (holder) (el as HTMLElement).blur()
        return
      }
      page.focus(target)
      // The page we're switching to only becomes focusable once its surface is visible, a frame or two into its
      // animation. (Timers, not animation frames, which stop while the window is covered.)
      if (pageWithKeyboard(document.activeElement) !== target && tries > 0) timer = setTimeout(attempt, 16, tries - 1)
    }
    timer = setTimeout(attempt, 0, TRIES)
    return () => clearTimeout(timer)
    // `assigned` is new on every change of `visible`, which is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, visible, webContentsId, covered])
}
