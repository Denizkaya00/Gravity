import { app } from 'electron'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const here = fileURLToPath(new URL('.', import.meta.url))

export const PRELOAD = join(here, '../preload/index.cjs')
export const GUEST_PRELOAD = join(here, '../preload/guest.cjs')
export const RENDERER_HTML = join(here, '../renderer/index.html')
export const ICON = join(here, '../../resources/icon.png')
/** tor and its files: Contents/Resources/tor when packaged, resources/tor/<arch> in development. */
export const TOR_DIR = app.isPackaged ? join(process.resourcesPath, 'tor') : join(here, '../../resources/tor', process.arch)
