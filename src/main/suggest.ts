import { net } from 'electron'
import type { SearchEngineId } from '@shared/types'
import { appTunneled } from './tunnel'

const ENDPOINTS: Record<SearchEngineId, (q: string) => string> = {
  google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&q=${q}`,
  duckduckgo: (q) => `https://duckduckgo.com/ac/?type=list&q=${q}`,
  brave: (q) => `https://search.brave.com/api/suggest?q=${q}`,
  // Kagi's suggest API needs a session token, so fall back to DuckDuckGo.
  kagi: (q) => `https://duckduckgo.com/ac/?type=list&q=${q}`,
  bing: (q) => `https://api.bing.com/osjson.aspx?query=${q}`
}

const cache = new Map<string, string[]>()

/** Fetches search suggestions in the main process (no CORS, short timeout). */
export async function suggest(query: string, engine: SearchEngineId): Promise<string[]> {
  const q = query.trim()
  if (!q || q.length > 200) return []
  const key = `${engine}:${q.toLowerCase()}`
  const hit = cache.get(key)
  if (hit) return hit

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), appTunneled() ? 5000 : 1500)
  try {
    const res = await net.fetch(ENDPOINTS[engine](encodeURIComponent(q)), {
      signal: controller.signal,
      credentials: 'omit'
    })
    if (!res.ok) return []
    const body = (await res.json()) as unknown
    const list = Array.isArray(body) && Array.isArray(body[1]) ? (body[1] as unknown[]) : []
    const out = list.filter((s): s is string => typeof s === 'string').slice(0, 6)
    if (cache.size > 300) cache.clear()
    cache.set(key, out)
    return out
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
