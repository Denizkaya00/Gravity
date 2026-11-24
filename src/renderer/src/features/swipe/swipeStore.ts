import { create } from 'zustand'
import { runtimeOf } from '@/state/runtime'
import { page } from '@/browser/registry'

/** Horizontal distance (in wheel delta units) needed to trigger back/forward. */
export const SWIPE_THRESHOLD = 240

interface SwipeState {
  tabId: string | null
  /** Negative = back, positive = forward. */
  amount: number
  committed: boolean
}

export const useSwipe = create<SwipeState>(() => ({ tabId: null, amount: 0, committed: false }))

let releaseTimer: ReturnType<typeof setTimeout> | null = null
let cooldownUntil = 0

function release() {
  const { tabId, amount } = useSwipe.getState()
  if (tabId && Math.abs(amount) >= SWIPE_THRESHOLD) {
    const rt = runtimeOf(tabId)
    if (amount < 0 && rt.canGoBack) page.back(tabId)
    if (amount > 0 && rt.canGoForward) page.forward(tabId)
    useSwipe.setState({ committed: true })
    // Ignore the trackpad's momentum events after a navigation.
    cooldownUntil = Date.now() + 700
    setTimeout(() => useSwipe.setState({ tabId: null, amount: 0, committed: false }), 260)
    return
  }
  useSwipe.setState({ tabId: null, amount: 0, committed: false })
}

export const swipe = {
  push(tabId: string, deltaX: number) {
    if (Date.now() < cooldownUntil) return
    const rt = runtimeOf(tabId)
    const s = useSwipe.getState()
    const base = s.tabId === tabId ? s.amount : 0
    let amount = base + deltaX
    // Only build up in a direction we can actually go.
    if (amount < 0 && !rt.canGoBack) amount = Math.max(amount, -40)
    if (amount > 0 && !rt.canGoForward) amount = Math.min(amount, 40)
    useSwipe.setState({ tabId, amount: Math.max(-SWIPE_THRESHOLD * 1.4, Math.min(SWIPE_THRESHOLD * 1.4, amount)) })
    if (releaseTimer) clearTimeout(releaseTimer)
    releaseTimer = setTimeout(release, 140)
  }
}
