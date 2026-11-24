import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Favorite } from '@shared/types'
import {
  favoriteCovers,
  favoriteKey,
  favoriteLabel,
  findFavorite,
  learnedFavorite,
  MAX_FAVORITES,
  movedFavorite,
  withFavorite
} from '@shared/favorites'

const fav = (url: string, title = '', id = url): Favorite => ({ id, url, title })

describe('favoriteKey', () => {
  it('ignores the scheme, www, a trailing slash and the fragment', () => {
    expect(favoriteKey('https://www.example.com/')).toBe('example.com')
    expect(favoriteKey('http://example.com')).toBe('example.com')
    expect(favoriteKey('https://example.com/a/b/#top')).toBe('example.com/a/b')
  })

  it('keeps the port, path and query', () => {
    expect(favoriteKey('http://localhost:3000/x?y=1')).toBe('localhost:3000/x?y=1')
    expect(favoriteKey('http://localhost:3000')).not.toBe(favoriteKey('http://localhost:4000'))
  })
})

describe('favoriteCovers', () => {
  it('lets a site’s home page cover the whole site', () => {
    expect(favoriteCovers('https://youtube.com/', 'https://www.youtube.com/watch?v=1')).toBe(true)
    expect(favoriteCovers('https://youtube.com/', 'https://youtube.com/feed/library')).toBe(true)
  })

  it('lets a page cover only itself and what is under it', () => {
    const repo = 'https://github.com/a/b'
    expect(favoriteCovers(repo, 'https://github.com/a/b/issues')).toBe(true)
    expect(favoriteCovers(repo, 'https://github.com/a/bc')).toBe(false)
    expect(favoriteCovers(repo, 'https://github.com/')).toBe(false)
  })
})

describe('the favorites list', () => {
  it('adds a page once, whatever its spelling', () => {
    let { list, result } = withFavorite([], fav('https://example.com/'))
    expect(result).toBe('added')
    ;({ list, result } = withFavorite(list, fav('http://www.example.com', '', 'other')))
    expect(result).toBe('exists')
    expect(list).toHaveLength(1)
    expect(findFavorite(list, 'https://example.com/#x')?.id).toBe('https://example.com/')
  })

  it('stops at the limit instead of dropping the new one silently', () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => fav(`https://s${i}.com/`))
    const { list, result } = withFavorite(full, fav('https://one-more.com/'))
    expect(result).toBe('full')
    expect(list).toBe(full)
  })

  it('moves a favorite, clamped to the ends', () => {
    const list = ['a', 'b', 'c', 'd'].map((x) => fav(`https://${x}.com/`, '', x))
    expect(movedFavorite(list, 'a', 2).map((f) => f.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(movedFavorite(list, 'd', 0).map((f) => f.id)).toEqual(['d', 'a', 'b', 'c'])
    expect(movedFavorite(list, 'b', 99).map((f) => f.id)).toEqual(['a', 'c', 'd', 'b'])
    expect(movedFavorite(list, 'b', 1)).toBe(list)
    expect(movedFavorite(list, 'zz', 0)).toBe(list)
  })

  it('learns a missing title and icon, and never overwrites them', () => {
    const typed = fav('https://example.com/')
    const page = { url: 'https://example.com/', title: 'Example', favicon: 'https://example.com/i.png' }
    expect(learnedFavorite(typed, page)).toMatchObject({ title: 'Example', favicon: page.favicon })
    const named = { ...typed, title: 'Mine', favicon: 'a.png' }
    expect(learnedFavorite(named, page)).toBe(named)
    // A tab's placeholder title is its address: not worth learning.
    expect(learnedFavorite(typed, { url: 'https://example.com/', title: 'https://example.com/' }).title).toBe('')
    expect(learnedFavorite(typed, { url: 'https://example.com/', title: 'example.com' }).title).toBe('')
  })
})

describe('favoriteLabel', () => {
  const label = (url: string, title?: string) => favoriteLabel({ url, title })

  it('picks the part of the title that names the site', () => {
    expect(label('https://mail.google.com/mail/u/0/', 'Inbox (3) - me@example.com - Gmail')).toBe('Gmail')
    expect(label('https://github.com/', 'GitHub · Build and ship software on a single, collaborative platform · GitHub')).toBe('GitHub')
    expect(label('https://linear.app/', 'Linear – Plan and build products')).toBe('Linear')
    expect(label('https://en.wikipedia.org/wiki/Main_Page', 'Wikipedia, the free encyclopedia')).toBe('Wikipedia')
    expect(label('https://news.ycombinator.com/', 'Hacker News')).toBe('Hacker News')
  })

  it('keeps a title that doesn’t mention the site, up to its first separator', () => {
    expect(label('http://127.0.0.1:5173/', 'Gravity Test Home')).toBe('Gravity Test Home')
    expect(label('https://example.com/', 'Hello, world')).toBe('Hello, world')
    expect(label('https://example.com/', 'Release notes | Docs')).toBe('Release notes')
  })

  it('falls back to the host', () => {
    expect(label('https://www.are.na/')).toBe('are.na')
    expect(label('https://example.com/a', 'https://example.com/a')).toBe('example.com')
  })
})

describe('the favorites store', () => {
  const set = vi.fn()
  beforeEach(async () => {
    set.mockClear()
    vi.stubGlobal('window', { gravity: { favorites: { set } } })
    const { useSettings } = await import('@/state/settings')
    const { useBrowser } = await import('@/state/browser')
    useBrowser.getState().hydrate(null)
    useSettings.setState({ favorites: [], favoritesBySpace: {}, loaded: true })
  })

  it('saves only when something changed', async () => {
    const { useSettings } = await import('@/state/settings')
    const S = () => useSettings.getState()
    expect(S().addFavorite({ url: 'https://a.com/', title: '' })).toBe('added')
    expect(S().addFavorite({ url: 'https://a.com', title: '' })).toBe('exists')
    expect(set).toHaveBeenCalledTimes(1)

    S().addFavorite({ url: 'https://b.com/', title: 'B' })
    const [a, b] = S().favorites
    S().moveFavorite(b.id, 0)
    expect(S().favorites.map((f) => f.url)).toEqual(['https://b.com/', 'https://a.com/'])

    set.mockClear()
    S().learnFavorite(b.id, { url: 'https://b.com/', title: 'Other' })
    expect(set).not.toHaveBeenCalled()
    S().learnFavorite(a.id, { url: 'https://a.com/', title: 'A site', favicon: 'https://a.com/i.png' })
    expect(set).toHaveBeenCalledTimes(1)
    expect(S().favorites[1]).toMatchObject({ title: 'A site', favicon: 'https://a.com/i.png' })

    S().removeFavorite(a.id)
    expect(S().favorites).toHaveLength(1)
  })

  it('keeps a list per space, and saves only the ones that aren’t private', async () => {
    const { useSettings } = await import('@/state/settings')
    const { useBrowser } = await import('@/state/browser')
    const S = () => useSettings.getState()
    const B = () => useBrowser.getState()
    const [personal, work] = B().spaces

    S().addFavorite({ url: 'https://mail.com/', title: 'Mail' })
    B().setActiveSpace(work.id)
    expect(S().favorites).toEqual([])
    S().addFavorite({ url: 'https://docs.com/', title: 'Docs' })
    expect(S().favorites.map((f) => f.url)).toEqual(['https://docs.com/'])
    B().setActiveSpace(personal.id)
    expect(S().favorites.map((f) => f.url)).toEqual(['https://mail.com/'])

    // The same page can be a favorite in two spaces.
    expect(S().addFavorite({ url: 'https://docs.com/', title: 'Docs' })).toBe('added')

    const priv = B().addSpace({ private: true })
    S().addFavorite({ url: 'https://secret.com/', title: '' })
    const saved = set.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(Object.keys(saved).sort()).toEqual([personal.id, work.id].sort())
    expect(S().favoritesBySpace[priv]).toHaveLength(1)

    // A space that's removed takes its favorites with it.
    B().removeSpace(work.id)
    expect(S().favoritesBySpace[work.id]).toBeUndefined()
  })
})
