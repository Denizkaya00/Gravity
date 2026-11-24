import { describe, expect, it } from 'vitest'
import { displayHost, parseInput, prettyUrl } from '@shared/url'

describe('parseInput', () => {
  const p = (s: string) => parseInput(s, 'google')

  it('treats bare domains as https URLs', () => {
    expect(p('example.com')).toEqual({ kind: 'url', url: 'https://example.com' })
    expect(p('news.ycombinator.com/item?id=1')).toEqual({ kind: 'url', url: 'https://news.ycombinator.com/item?id=1' })
  })

  it('keeps explicit schemes', () => {
    expect(p('http://example.com').url).toBe('http://example.com/')
    expect(p('https://a.b/c').kind).toBe('url')
  })

  it('sends localhost and IPs over http', () => {
    expect(p('localhost:3000')).toEqual({ kind: 'url', url: 'http://localhost:3000' })
    expect(p('127.0.0.1:8080/x')).toEqual({ kind: 'url', url: 'http://127.0.0.1:8080/x' })
  })

  it('searches for words, sentences and numbers', () => {
    expect(p('gravity').kind).toBe('search')
    expect(p('how does gravity work').url).toBe('https://www.google.com/search?q=how%20does%20gravity%20work')
    expect(p('3.14').kind).toBe('search')
  })

  it('never navigates to javascript: or other odd schemes', () => {
    expect(p('javascript:alert(1)').kind).toBe('search')
    expect(p('mailto:me@example.com').kind).toBe('search')
  })

  it('uses the chosen search engine', () => {
    expect(parseInput('cats', 'duckduckgo').url).toBe('https://duckduckgo.com/?q=cats')
  })
})

describe('display helpers', () => {
  it('strips www and protocol', () => {
    expect(displayHost('https://www.example.com/a')).toBe('example.com')
    expect(prettyUrl('https://www.example.com/')).toBe('example.com')
    expect(prettyUrl('https://example.com/a/b?c=1')).toBe('example.com/a/b?c=1')
  })
})
