import type { HistoryEntry } from '@shared/types'
import { frecency, matchScore } from '@shared/rank'
import { JsonStore } from './store'

const MAX_ENTRIES = 20_000

const store = new JsonStore<HistoryEntry[]>('history', () => [], 1500)
/** url → index into the array, rebuilt lazily. */
let index: Map<string, HistoryEntry> | null = null

function byUrl(): Map<string, HistoryEntry> {
  if (!index) {
    index = new Map()
    for (const e of store.get()) index.set(e.url, e)
  }
  return index
}

function shouldRecord(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export function addVisit(entry: { url: string; title?: string; favicon?: string }): void {
  if (!shouldRecord(entry.url)) return
  const map = byUrl()
  const existing = map.get(entry.url)
  const now = Date.now()
  if (existing) {
    existing.visitCount += 1
    existing.lastVisit = now
    if (entry.title) existing.title = entry.title
    if (entry.favicon) existing.favicon = entry.favicon
    store.set(store.get())
    return
  }
  const fresh: HistoryEntry = {
    url: entry.url,
    title: entry.title || entry.url,
    favicon: entry.favicon,
    visitCount: 1,
    lastVisit: now
  }
  const list = store.get()
  list.push(fresh)
  map.set(fresh.url, fresh)
  if (list.length > MAX_ENTRIES) {
    // Drop the least valuable 10% when we overflow.
    list.sort((a, b) => frecency(b.visitCount, b.lastVisit, now) - frecency(a.visitCount, a.lastVisit, now))
    list.length = Math.floor(MAX_ENTRIES * 0.9)
    index = null
  }
  store.set(list)
}

/** Updates title/favicon for the latest visit without counting a new visit. */
export function updateMeta(entry: { url: string; title?: string; favicon?: string }): void {
  const e = byUrl().get(entry.url)
  if (!e) return
  if (entry.title) e.title = entry.title
  if (entry.favicon) e.favicon = entry.favicon
  store.set(store.get())
}

export function search(query: string, limit = 8): HistoryEntry[] {
  const now = Date.now()
  const q = query.trim()
  const list = store.get()
  if (!q) return recent(limit)
  const scored: { e: HistoryEntry; s: number }[] = []
  for (const e of list) {
    const m = matchScore(q, e)
    if (m <= 0) continue
    scored.push({ e, s: m + frecency(e.visitCount, e.lastVisit, now) * 0.6 })
  }
  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, limit).map((x) => x.e)
}

export function recent(limit = 20): HistoryEntry[] {
  return [...store.get()].sort((a, b) => b.lastVisit - a.lastVisit).slice(0, limit)
}

/** Top sites by frecency, used for the home canvas when there are no favorites. */
export function topSites(limit = 8): HistoryEntry[] {
  const now = Date.now()
  const seen = new Set<string>()
  const out: HistoryEntry[] = []
  const sorted = [...store.get()].sort(
    (a, b) => frecency(b.visitCount, b.lastVisit, now) - frecency(a.visitCount, a.lastVisit, now)
  )
  for (const e of sorted) {
    let host = e.url
    try {
      host = new URL(e.url).hostname
    } catch {
      /* ignore */
    }
    if (seen.has(host)) continue
    seen.add(host)
    out.push(e)
    if (out.length >= limit) break
  }
  return out
}

export function clear(): void {
  index = null
  store.set([])
  store.flush()
}
