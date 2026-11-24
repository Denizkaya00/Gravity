/// <reference lib="dom" />
/**
 * The only script Gravity injects into web pages. It runs in an isolated world
 * with no access to the page's JS. It reports two things to the host:
 *  - horizontal overscroll (for two-finger swipe back/forward)
 *  - shift-clicks on links (for Peek)
 * and fills and offers to save passwords (see autofill.ts).
 */
import { ipcRenderer } from 'electron'
import { GUEST } from '../shared/ipc'
import { installAutofill } from './autofill'

installAutofill()

function canScrollX(el: Element | null, dx: number): boolean {
  let node: Element | null = el
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node)
    const overflowX = style.overflowX
    if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1) {
      if (dx < 0 && node.scrollLeft > 0) return true
      if (dx > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth - 1) return true
    }
    node = node.parentElement
  }
  const root = document.scrollingElement ?? document.documentElement
  if (dx < 0 && root.scrollLeft > 0) return true
  if (dx > 0 && root.scrollLeft + window.innerWidth < root.scrollWidth - 1) return true
  return false
}

window.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey) return // pinch-zoom
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5 || Math.abs(e.deltaX) < 1) return
    if (canScrollX(e.target as Element, e.deltaX)) return
    ipcRenderer.sendToHost(GUEST.swipe, { deltaX: e.deltaX })
  },
  { passive: true, capture: true }
)

window.addEventListener(
  'click',
  (e) => {
    if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.button !== 0) return
    const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!link || !/^https?:/.test(link.href)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    ipcRenderer.sendToHost(GUEST.peek, { url: link.href, x: e.clientX, y: e.clientY })
  },
  true
)
