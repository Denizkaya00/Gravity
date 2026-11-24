import { describe, expect, it } from 'vitest'
import {
  credentialsFor,
  filterEntries,
  generatePassword,
  isWeak,
  matchesSite,
  normalizeSite,
  offerKind,
  siteOf,
  summarize,
  type PasswordEntry
} from '@shared/passwords'

const entry = (url: string, username: string, password: string, extra: Partial<PasswordEntry> = {}): PasswordEntry => ({
  id: `${url}|${username}`,
  title: siteOf(url) ?? url,
  url,
  username,
  password,
  createdAt: 1,
  updatedAt: 1,
  ...extra
})

describe('siteOf', () => {
  it('drops www and keeps a port', () => {
    expect(siteOf('https://www.github.com/login')).toBe('github.com')
    expect(siteOf('http://127.0.0.1:5173/x')).toBe('127.0.0.1:5173')
  })
  it('ignores anything that isn’t a web page', () => {
    expect(siteOf('about:blank')).toBeNull()
    expect(siteOf('file:///etc/passwd')).toBeNull()
    expect(siteOf('nonsense')).toBeNull()
  })
})

describe('matchesSite', () => {
  it('fills the site and its subdomains', () => {
    expect(matchesSite('https://github.com', 'https://github.com/login')).toBe(true)
    expect(matchesSite('https://github.com', 'https://www.github.com/login')).toBe(true)
    expect(matchesSite('https://github.com', 'https://gist.github.com/')).toBe(true)
  })
  it('never fills a look-alike or a parent domain', () => {
    expect(matchesSite('https://github.com', 'https://evilgithub.com/')).toBe(false)
    expect(matchesSite('https://github.com', 'https://github.com.evil.io/')).toBe(false)
    expect(matchesSite('https://accounts.example.com', 'https://example.com/')).toBe(false)
  })
  it('keeps an https password off plain http, except on this Mac', () => {
    expect(matchesSite('https://bank.com', 'http://bank.com/')).toBe(false)
    expect(matchesSite('http://bank.com', 'https://bank.com/')).toBe(true)
    expect(matchesSite('https://localhost:3000', 'http://localhost:3000/')).toBe(true)
  })
  it('matches an explicit port', () => {
    expect(matchesSite('http://127.0.0.1:8080', 'http://127.0.0.1:8080/login')).toBe(true)
    expect(matchesSite('http://127.0.0.1:8080', 'http://127.0.0.1:9090/login')).toBe(false)
  })
  it('only matches web pages', () => {
    expect(matchesSite('https://github.com', 'data:text/html,github.com')).toBe(false)
    expect(matchesSite('javascript:alert(1)', 'https://github.com')).toBe(false)
  })
})

describe('normalizeSite', () => {
  it('turns what was typed into an origin', () => {
    expect(normalizeSite('github.com')).toBe('https://github.com')
    expect(normalizeSite(' https://github.com/login?x=1 ')).toBe('https://github.com')
    expect(normalizeSite('localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeSite('http://192.168.1.1')).toBe('http://192.168.1.1')
  })
  it('refuses what isn’t a site', () => {
    expect(normalizeSite('')).toBeNull()
    expect(normalizeSite('github')).toBeNull()
    expect(normalizeSite('javascript:alert(1)')).toBeNull()
    expect(normalizeSite('ftp://files.example.com')).toBeNull()
  })
})

describe('isWeak', () => {
  it('flags short and predictable passwords', () => {
    expect(isWeak('hunter2')).toBe(true)
    expect(isWeak('password123')).toBe(true)
    expect(isWeak('aaaaaaaaaaaaaaaa')).toBe(true)
    expect(isWeak('summertime')).toBe(true)
  })
  it('accepts long or varied ones', () => {
    expect(isWeak('correct horse battery staple')).toBe(false)
    expect(isWeak('Tr0ub4dor&3x')).toBe(false)
    expect(isWeak(generatePassword())).toBe(false)
  })
})

describe('summarize', () => {
  it('never includes the password or notes, and marks reuse', () => {
    const list = summarize([
      entry('https://a.com', 'me', 'Shared-Secret-99', { notes: 'pin 1234' }),
      entry('https://b.com', 'me', 'Shared-Secret-99'),
      entry('https://c.com', 'me', 'abc')
    ])
    expect(JSON.stringify(list)).not.toContain('Shared-Secret-99')
    expect(JSON.stringify(list)).not.toContain('pin 1234')
    expect(list.map((e) => e.reused)).toEqual([true, true, false])
    expect(list.map((e) => e.weak)).toEqual([false, false, true])
    expect(list[0].hasNotes).toBe(true)
  })
})

describe('filterEntries', () => {
  const list = [entry('https://zeta.io', 'z@me', 'x'), entry('https://alpha.com', 'boss', 'x'), entry('https://github.com', 'octo', 'x')]
  it('sorts by title', () => {
    expect(filterEntries(list, '').map((e) => e.title)).toEqual(['alpha.com', 'github.com', 'zeta.io'])
  })
  it('searches title, site and username', () => {
    expect(filterEntries(list, 'OCTO').map((e) => e.title)).toEqual(['github.com'])
    expect(filterEntries(list, 'zeta').map((e) => e.title)).toEqual(['zeta.io'])
  })
})

describe('credentialsFor', () => {
  it('returns the page’s sign-ins, most recently used first', () => {
    const list = [
      entry('https://github.com', 'old', 'x', { lastUsedAt: 10 }),
      entry('https://github.com', 'new', 'y', { lastUsedAt: 20 }),
      entry('https://gitlab.com', 'other', 'z')
    ]
    expect(credentialsFor(list, 'https://github.com/login').map((e) => e.username)).toEqual(['new', 'old'])
  })
})

describe('offerKind', () => {
  const list = [entry('https://github.com', 'octo', 'old-pass')]
  it('offers to save a new sign-in', () => {
    expect(offerKind(list, 'https://github.com/login', 'someone', 'pw')).toEqual({ kind: 'save' })
    expect(offerKind(list, 'https://gitlab.com/login', 'octo', 'old-pass')).toEqual({ kind: 'save' })
  })
  it('offers to update a changed password', () => {
    expect(offerKind(list, 'https://github.com/login', 'octo', 'new-pass')).toEqual({ kind: 'update', id: list[0].id })
  })
  it('stays quiet when nothing changed', () => {
    expect(offerKind(list, 'https://github.com/login', 'octo', 'old-pass')).toBeNull()
    expect(offerKind(list, 'https://github.com/login', '', 'old-pass')).toBeNull()
    expect(offerKind(list, 'https://github.com/login', 'octo', '')).toBeNull()
  })
})

describe('generatePassword', () => {
  it('makes three groups of six with a capital and a digit', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword()
      expect(pw).toMatch(/^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/)
      expect(pw).toMatch(/[A-Z]/)
      expect(pw).toMatch(/\d/)
      expect(pw).not.toMatch(/[lIO01]/)
    }
  })
  it('doesn’t repeat itself', () => {
    expect(new Set(Array.from({ length: 200 }, () => generatePassword())).size).toBe(200)
  })
})
