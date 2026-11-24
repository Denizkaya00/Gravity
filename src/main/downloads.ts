import { app, shell, type DownloadItem, type Session, type WebContents } from 'electron'
import { existsSync } from 'node:fs'
import { join, parse } from 'node:path'
import type { DownloadInfo } from '@shared/types'
import { IPC } from '@shared/ipc'

const items = new Map<string, { item: DownloadItem | null; info: DownloadInfo }>()
let counter = 0
let host: WebContents | null = null
const attached = new WeakSet<Session>()

export function setDownloadsHost(wc: WebContents): void {
  host = wc
}

function uniquePath(dir: string, filename: string): string {
  const { name, ext } = parse(filename || 'download')
  let candidate = join(dir, `${name}${ext}`)
  let i = 1
  while (existsSync(candidate)) candidate = join(dir, `${name} (${i++})${ext}`)
  return candidate
}

function emit(info: DownloadInfo): void {
  if (host && !host.isDestroyed()) host.send(IPC.downloadsUpdate, info)
}

export function trackDownloads(ses: Session): void {
  if (attached.has(ses)) return
  attached.add(ses)
  ses.on('will-download', (_event, item) => {
    const id = `dl-${Date.now()}-${counter++}`
    const dir = process.env.GRAVITY_DOWNLOADS ?? app.getPath('downloads')
    const savePath = uniquePath(dir, item.getFilename())
    item.setSavePath(savePath)

    const info: DownloadInfo = {
      id,
      filename: parse(savePath).base,
      url: item.getURL(),
      savePath,
      received: 0,
      total: item.getTotalBytes(),
      state: 'progressing',
      startedAt: Date.now()
    }
    items.set(id, { item, info })
    emit(info)

    let last = 0
    item.on('updated', (_e, state) => {
      info.received = item.getReceivedBytes()
      info.total = item.getTotalBytes()
      info.state = state === 'interrupted' ? 'interrupted' : 'progressing'
      const now = Date.now()
      if (now - last > 120) {
        last = now
        emit({ ...info })
      }
    })
    item.once('done', (_e, state) => {
      info.received = item.getReceivedBytes()
      info.state = state
      emit({ ...info })
      items.set(id, { item: null, info })
      if (state === 'completed' && process.platform === 'darwin') app.dock?.downloadFinished(savePath)
    })
  })
}

export function downloadAction(id: string, action: 'open' | 'show' | 'cancel'): void {
  const entry = items.get(id)
  if (!entry) return
  if (action === 'cancel') entry.item?.cancel()
  if (action === 'open' && entry.info.state === 'completed') void shell.openPath(entry.info.savePath)
  if (action === 'show') shell.showItemInFolder(entry.info.savePath)
}
