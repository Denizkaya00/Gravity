/**
 * Renders resources/icon.svg to PNGs with Electron and packs build/icon.icns.
 * Usage: npx electron scripts/make-icon.cjs  (macOS, needs `iconutil`)
 */
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const svg = readFileSync(join(root, 'resources/icon.svg'), 'utf8')
const sizes = [16, 32, 64, 128, 256, 512, 1024]

app.dock?.hide()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  await win.loadURL(`data:text/html,<html><body style="margin:0;background:transparent">${encodeURIComponent(svg)}</body></html>`)
  await new Promise((r) => setTimeout(r, 400))
  const full = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  writeFileSync(join(root, 'resources/icon.png'), full.resize({ width: 512, height: 512, quality: 'best' }).toPNG())

  const set = join(root, 'build/icon.iconset')
  rmSync(set, { recursive: true, force: true })
  mkdirSync(set, { recursive: true })
  for (const s of sizes) {
    const png = full.resize({ width: s, height: s, quality: 'best' }).toPNG()
    if (s <= 512) writeFileSync(join(set, `icon_${s}x${s}.png`), png)
    if (s >= 32) writeFileSync(join(set, `icon_${s / 2}x${s / 2}@2x.png`), png)
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', join(root, 'build/icon.icns')])
  rmSync(set, { recursive: true, force: true })
  console.log('icon written: build/icon.icns, resources/icon.png')
  app.quit()
})
