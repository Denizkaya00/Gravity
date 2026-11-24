/**
 * Fuzzy matching + frecency ranking shared by the main process (history search)
 * and the renderer (tabs, favorites, commands).
 */

/** Scores how well `query` matches `text`. 0 = no match, higher is better. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 1
  if (!t) return 0

  const idx = t.indexOf(q)
  if (idx !== -1) {
    // Contiguous match: prefer matches at the start or at a word boundary.
    const boundary = idx === 0 || /[\s/._\-:]/.test(t[idx - 1])
    return 100 + (idx === 0 ? 60 : boundary ? 35 : 0) - Math.min(idx, 30) + Math.min(q.length * 2, 40)
  }

  // Every query word must appear somewhere.
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    let total = 0
    for (const w of words) {
      const s = fuzzyScore(w, t)
      if (!s) return 0
      total += s
    }
    return total / words.length - 10
  }

  // Subsequence match with a penalty for gaps.
  let ti = 0
  let gaps = 0
  let last = -1
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return 0
    if (last !== -1) gaps += found - last - 1
    last = found
    ti = found + 1
  }
  const score = 40 - gaps * 1.5
  return score > 0 ? score : 1
}

const HOUR = 3600_000
const DAY = 24 * HOUR

/** Mozilla-style frecency: visit count weighted by recency buckets. */
export function frecency(visitCount: number, lastVisit: number, now = Date.now()): number {
  const age = now - lastVisit
  const weight = age < 4 * HOUR ? 100 : age < DAY ? 80 : age < 4 * DAY ? 60 : age < 14 * DAY ? 40 : age < 90 * DAY ? 20 : 10
  return Math.log2(1 + visitCount) * weight
}

export interface Rankable {
  title: string
  url: string
}

/** Combined match score for a title/url pair. URLs are matched without scheme/www. */
export function matchScore(query: string, item: Rankable): number {
  const bareUrl = item.url.replace(/^[a-z]+:\/\/(www\.)?/i, '')
  const host = bareUrl.split(/[/?#]/)[0]
  return Math.max(
    fuzzyScore(query, item.title) * 1.0,
    fuzzyScore(query, host) * 1.25,
    fuzzyScore(query, bareUrl) * 0.9
  )
}

export function rankItems<T extends Rankable>(
  query: string,
  items: T[],
  boost: (item: T) => number = () => 0,
  limit = 8
): T[] {
  const scored: { item: T; score: number }[] = []
  for (const item of items) {
    const m = matchScore(query, item)
    if (m <= 0) continue
    scored.push({ item, score: m + boost(item) })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.item)
}
