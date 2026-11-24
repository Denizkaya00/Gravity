/**
 * Development only: renames the stock Electron.app that `npm run dev` launches to Gravity.app and gives it
 * Gravity's icon, so the menu bar, Dock and app switcher say Gravity instead of Electron. Packaged builds
 * don't need this (electron-builder sets both). Runs after `npm install` and `npm run icon`; macOS only,
 * safe to re-run. Undo with: rm -rf node_modules/electron && npm install
 */
const { execFileSync } = require('node:child_process')
const { copyFileSync, existsSync, renameSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

if (process.platform !== 'darwin') process.exit(0)

const root = join(__dirname, '..')
const electronDir = join(root, 'node_modules/electron')
const stockApp = join(electronDir, 'dist/Electron.app')
const appPath = join(electronDir, 'dist/Gravity.app')
const icns = join(root, 'build/icon.icns')

// The Dock labels the app by its bundle's folder name, so the bundle itself has to be called Gravity.app.
// path.txt tells the electron package (and electron-vite) where the binary is.
if (existsSync(stockApp)) {
  rmSync(appPath, { recursive: true, force: true })
  renameSync(stockApp, appPath)
}
const plist = join(appPath, 'Contents/Info.plist')
if (!existsSync(plist)) {
  console.log('brand-electron: Electron app bundle not found, skipped')
  process.exit(0)
}
writeFileSync(join(electronDir, 'path.txt'), 'Gravity.app/Contents/MacOS/Electron')

const setKey = (key, value) => {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist], { stdio: 'ignore' })
  } catch {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist], { stdio: 'ignore' })
  }
}
setKey('CFBundleName', 'Gravity')
setKey('CFBundleDisplayName', 'Gravity')
if (existsSync(icns)) copyFileSync(icns, join(appPath, 'Contents/Resources/electron.icns'))

// Electron.app is only linker-signed (Info.plist and resources aren't sealed), so these edits don't break it.
// Re-register it so Launch Services and the Dock pick up the new name and icon.
try {
  execFileSync('touch', [appPath])
  execFileSync(
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
    ['-f', appPath],
    { stdio: 'ignore' }
  )
} catch {
  // Not fatal: the Dock refreshes on its own eventually.
}
console.log('brand-electron: dev Electron.app now shows as Gravity')
