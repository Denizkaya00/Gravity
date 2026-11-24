import { beforeEach, describe, expect, it } from 'vitest'
import { selectActiveTabId, snapshot, useBrowser } from '@/state/browser'

const B = () => useBrowser.getState()

describe('browser store', () => {
  beforeEach(() => B().hydrate(null))

  it('starts with two empty spaces', () => {
    expect(B().spaces).toHaveLength(2)
    expect(Object.keys(B().tabs)).toHaveLength(0)
  })

  it('opens, activates and closes tabs, falling back to the most recent one', () => {
    const a = B().newTab('https://a.com')
    const b = B().newTab('https://b.com')
    expect(selectActiveTabId(B())).toBe(b)
    B().activateTab(a)
    B().activateTab(b)
    B().closeTab(b)
    expect(selectActiveTabId(B())).toBe(a)
    expect(B().closed[0].url).toBe('https://b.com')
  })

  it('reopens closed tabs', () => {
    const a = B().newTab('https://a.com')
    B().closeTab(a)
    const id = B().reopenClosed()
    expect(id && B().tabs[id].url).toBe('https://a.com')
  })

  it('pins tabs to the top of the space', () => {
    const a = B().newTab('https://a.com')
    const b = B().newTab('https://b.com')
    B().togglePin(a)
    expect(B().order[B().activeSpaceId][0]).toBe(a)
    expect(B().tabs[a].pinned).toBe(true)
    expect(B().order[B().activeSpaceId]).toContain(b)
  })

  it('archives unpinned tabs only', () => {
    const a = B().newTab('https://a.com')
    const b = B().newTab('https://b.com')
    B().togglePin(a)
    const items = B().archive([a, b])
    expect(items.map((i) => i.url)).toEqual(['https://b.com'])
    expect(B().tabs[a]).toBeDefined()
    expect(B().tabs[b]).toBeUndefined()
  })

  it('clears a split when one side closes', () => {
    const a = B().newTab('https://a.com')
    const b = B().newTab('https://b.com')
    B().setSplit(B().activeSpaceId, { a, b, ratio: 0.5 })
    B().closeTab(b)
    expect(B().splits[B().activeSpaceId]).toBeNull()
    expect(selectActiveTabId(B())).toBe(a)
  })

  it('never persists private spaces or peeks', () => {
    B().newTab('https://kept.com')
    B().newTab('https://peek.com', { peek: true })
    const priv = B().addSpace({ private: true })
    B().newTab('https://secret.com', { spaceId: priv })
    const snap = snapshot(B())
    expect(snap.tabs.map((t) => t.url)).toEqual(['https://kept.com'])
    expect(snap.spaces.some((s) => s.private)).toBe(false)
  })
})
