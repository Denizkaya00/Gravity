import type { SearchEngineId } from './types'

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; search: string }> = {
  google: { name: 'Google', search: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', search: 'https://duckduckgo.com/?q=' },
  brave: { name: 'Brave Search', search: 'https://search.brave.com/search?q=' },
  kagi: { name: 'Kagi', search: 'https://kagi.com/search?q=' },
  bing: { name: 'Bing', search: 'https://www.bing.com/search?q=' }
}

export function searchUrl(query: string, engine: SearchEngineId): string {
  return SEARCH_ENGINES[engine].search + encodeURIComponent(query.trim())
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/
const LOCALHOST_RE = /^localhost(:\d+)?(\/.*)?$/i
// host.tld with optional port/path; tld must be letters (2+) so "3.14" stays a search/calc.
const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i

/** Schemes we are willing to navigate to from user input. */
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'about:', 'file:'])

/**
 * Turns whatever the user typed into a URL to load.
 * Returns `{ kind: 'url' }` for things that look like addresses and
 * `{ kind: 'search' }` for everything else.
 */
export function parseInput(
  raw: string,
  engine: SearchEngineId
): { kind: 'url' | 'search'; url: string } {
  const input = raw.trim()
  if (!input) return { kind: 'search', url: searchUrl('', engine) }

  // Hosts first: "localhost:3000" and "example.com:8080" look like schemes otherwise.
  if (!/\s/.test(input)) {
    if (LOCALHOST_RE.test(input) || IPV4_RE.test(input)) return { kind: 'url', url: `http://${input}` }
    if (DOMAIN_RE.test(input)) return { kind: 'url', url: `https://${input}` }
  }

  if (/\s/.test(input)) return { kind: 'search', url: searchUrl(input, engine) }

  if (SCHEME_RE.test(input) && !/\s/.test(input)) {
    try {
      const u = new URL(input)
      if (ALLOWED_SCHEMES.has(u.protocol)) return { kind: 'url', url: u.toString() }
    } catch {
      /* fall through to search */
    }
    // "mailto:", "javascript:" and friends are treated as searches on purpose.
    if (!/^[a-z]+:\/\//i.test(input)) return { kind: 'search', url: searchUrl(input, engine) }
  }

  return { kind: 'search', url: searchUrl(input, engine) }
}

/** "https://www.example.com/a/b?c" → "example.com" */
export function displayHost(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol === 'about:') return url
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A tidy, human version of a URL for the address pill. */
export function prettyUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname === '/' ? '' : u.pathname
    return host + path + (u.search || '')
  } catch {
    return url
  }
}

export function isSecure(url: string): boolean {
  return url.startsWith('https:')
}

export function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}
