import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { command, launch } from './fixtures'

/**
 * Video in a tab pauses when the tab leaves view and plays on when it's back.
 * Sound-only playback keeps going, and anything still in view (split, under Peek) is left alone.
 */

/** One second of silence, so the looping <audio> really plays without making noise. */
function silentWav(): Buffer {
  const rate = 8000
  const data = rate * 2
  const b = Buffer.alloc(44 + data)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + data, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20) // PCM
  b.writeUInt16LE(1, 22) // mono
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(data, 40)
  return b
}

const html = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body style="margin:0;padding:24px;font:16px -apple-system">${body}</body></html>`

// A looping <video> drawn from a canvas (no video file or codec needed).
const videoPage = html(
  'Video Page',
  `<canvas id="c" width="320" height="180" hidden></canvas><video id="m" autoplay loop playsinline muted width="320" height="180"></video>
<script>
  const c = document.getElementById('c'), x = c.getContext('2d'); let n = 0
  setInterval(() => { x.fillStyle = 'hsl(' + (n++ % 360) + ' 80% 50%)'; x.fillRect(0, 0, 320, 180) }, 33)
  const v = document.getElementById('m'); v.srcObject = c.captureStream(30); v.play()
</script>`
)

let server: Server
let base = ''
let port = 0

test.beforeAll(async () => {
  const wav = silentWav()
  server = createServer((req, res) => {
    const path = req.url ?? '/'
    if (path.startsWith('/tone.wav')) {
      res.setHeader('content-type', 'audio/wav')
      return res.end(wav)
    }
    res.setHeader('content-type', 'text/html')
    if (path.startsWith('/video') || path.startsWith('/clip')) return res.end(videoPage)
    if (path.startsWith('/audio'))
      return res.end(html('Audio Page', '<audio id="m" src="/tone.wav" autoplay loop controls></audio>'))
    // A video in a cross-origin iframe (localhost vs 127.0.0.1), the usual YouTube-embed shape.
    if (path.startsWith('/embed'))
      return res.end(html('Embed Page', `<iframe src="http://localhost:${port}/clip" width="400" height="240"></iframe>`))
    res.end(html('Plain Page', '<p>Nothing playing here.</p>'))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  port = typeof addr === 'object' && addr ? addr.port : 0
  base = `http://127.0.0.1:${port}`
})
test.afterAll(() => {
  server.close()
})

const tabs = (win: Page) => win.locator('[data-tab-id]')

async function openUrl(app: ElectronApplication, url: string, mode: 'foreground' | 'peek') {
  await app.evaluate(({ BrowserWindow }, r) => BrowserWindow.getAllWindows()[0].webContents.send('open-url', r), { url, mode })
}

/** The state of `#m` in the page (or iframe) whose address has this path. */
async function media(app: ElectronApplication, path: string): Promise<{ paused: boolean; time: number } | null> {
  return app.evaluate(async ({ webContents }, p): Promise<{ paused: boolean; time: number } | null> => {
    for (const wc of webContents.getAllWebContents()) {
      if (wc.getType() !== 'webview' || wc.isDestroyed()) continue
      for (const frame of wc.mainFrame.framesInSubtree) {
        if (new URL(frame.url || 'about:blank').pathname !== p) continue
        return (await frame.executeJavaScript(
          `(() => { const m = document.getElementById('m'); return m ? { paused: m.paused, time: m.currentTime } : null })()`
        )) as { paused: boolean; time: number } | null
      }
    }
    return null
  }, path)
}

async function expectPlaying(app: ElectronApplication, path: string) {
  await expect.poll(async () => (await media(app, path))?.paused, { timeout: 10_000 }).toBe(false)
  const a = (await media(app, path))!.time
  await expect.poll(async () => (await media(app, path))!.time, { timeout: 5_000 }).toBeGreaterThan(a)
}

async function expectStopped(app: ElectronApplication, path: string) {
  await expect.poll(async () => (await media(app, path))?.paused, { timeout: 5_000 }).toBe(true)
  const a = (await media(app, path))!.time
  await new Promise((r) => setTimeout(r, 600))
  expect((await media(app, path))!.time).toBe(a)
}

test('video pauses when its tab leaves view and plays on when it comes back', async () => {
  const { app, win } = await launch()

  await openUrl(app, `${base}/video`, 'foreground')
  await expect(tabs(win).filter({ hasText: 'Video Page' }).first()).toBeVisible({ timeout: 15_000 })
  await expectPlaying(app, '/video')

  // Switching to another tab stops the video; the tab now in view plays normally.
  await openUrl(app, `${base}/audio`, 'foreground')
  await expect(tabs(win).filter({ hasText: 'Audio Page' }).first()).toBeVisible({ timeout: 15_000 })
  await expectStopped(app, '/video')
  await expectPlaying(app, '/audio')

  // Back to the video: it plays on. The music tab, now away, keeps playing (sound only).
  await tabs(win).filter({ hasText: 'Video Page' }).first().click()
  await expectPlaying(app, '/video')
  await expectPlaying(app, '/audio')

  // Split view shows both halves, so nothing pauses.
  await command(app, { command: 'toggle-split' })
  await expect(win.locator('[data-slot="split-a"]')).toHaveCount(1)
  await expectPlaying(app, '/video')
  await expectPlaying(app, '/audio')
  await command(app, { command: 'toggle-split' })
  await expect(win.locator('[data-slot="split-a"]')).toHaveCount(0)

  // Peek opens over the tab, which stays in view behind it.
  await openUrl(app, `${base}/plain`, 'peek')
  await expect(win.getByTestId('peek-bar')).toBeVisible()
  await expectPlaying(app, '/video')
  await command(app, { command: 'escape' })
  await expect(win.getByTestId('peek-bar')).toHaveCount(0, { timeout: 5_000 })

  // Video inside a cross-origin iframe pauses too.
  await openUrl(app, `${base}/embed`, 'foreground')
  await expect(tabs(win).filter({ hasText: 'Embed Page' }).first()).toBeVisible({ timeout: 15_000 })
  await expectStopped(app, '/video')
  await expectPlaying(app, '/clip')
  await tabs(win).filter({ hasText: 'Video Page' }).first().click()
  await expectStopped(app, '/clip')
  await expectPlaying(app, '/video')

  await app.close()
})
