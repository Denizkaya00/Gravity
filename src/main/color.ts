import { nativeImage, net } from 'electron'

const cache = new Map<string, string | null>()

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/**
 * Downloads a favicon and returns its most "characterful" colour: the average
 * of its saturated, non-transparent pixels. Used to tint the chrome per site.
 */
export async function faviconColor(url: string): Promise<string | null> {
  if (!/^https?:\/\//.test(url)) return null
  if (cache.has(url)) return cache.get(url) ?? null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const res = await net.fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(String(res.status))
    const buf = Buffer.from(await res.arrayBuffer())
    let img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) throw new Error('empty')
    img = img.resize({ width: 24, height: 24, quality: 'good' })
    const bmp = img.toBitmap() // BGRA on macOS
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    let fr = 0
    let fg = 0
    let fb = 0
    let fn = 0
    for (let i = 0; i < bmp.length; i += 4) {
      const B = bmp[i]
      const G = bmp[i + 1]
      const R = bmp[i + 2]
      const A = bmp[i + 3]
      if (A < 128) continue
      fr += R
      fg += G
      fb += B
      fn++
      const max = Math.max(R, G, B)
      const min = Math.min(R, G, B)
      const sat = max === 0 ? 0 : (max - min) / max
      if (sat < 0.25 || max < 40 || min > 235) continue
      r += R
      g += G
      b += B
      n++
    }
    const color = n > 6 ? toHex(r / n, g / n, b / n) : fn > 0 ? toHex(fr / fn, fg / fn, fb / fn) : null
    cache.set(url, color)
    return color
  } catch {
    cache.set(url, null)
    return null
  }
}
