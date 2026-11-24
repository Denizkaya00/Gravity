import { create } from 'zustand'
import type { DownloadInfo, PermissionRequest, TunnelStatus } from '@shared/types'
import type { PasswordOffer } from '@shared/passwords'

/** `pin` picks a page for Favorites instead of opening one. */
export type CommandMode = 'new' | 'edit' | 'split' | 'pin'

export interface Toast {
  id: number
  text: string
  icon?: 'copy' | 'check' | 'archive' | 'shield' | 'download' | 'warn'
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

interface UIState {
  command: { open: boolean; mode: CommandMode; initial?: string }
  overview: boolean
  peek: { tabId: string; origin: { x: number; y: number } } | null
  focusMode: boolean
  sidebarHover: boolean
  cheatsheet: boolean
  settingsOpen: boolean
  /** A Settings row to scroll to when the sheet opens, such as 'tunnel'. */
  settingsFocus: string | null
  /** Which page of Settings is showing. */
  settingsPage: 'main' | 'passwords'
  downloadsOpen: boolean
  findOpen: boolean
  fullscreenTab: string | null
  windowFullscreen: boolean
  /** True while dragging something in the UI; webviews stop eating pointer events. */
  dragging: boolean
  /** Split drop zone currently hovered while dragging a tab out of the sidebar. */
  splitDrop: 'left' | 'right' | null
  toasts: Toast[]
  permissions: PermissionRequest[]
  /** Sign-ins Gravity is asking to save, newest last. */
  passwordOffers: PasswordOffer[]
  downloads: DownloadInfo[]
  /** Increments when a new download starts, to fire the fly-to-orb animation. */
  downloadPulse: number
  /** Increments when a download completes, to fire confetti. */
  downloadDone: number
  tunnel: TunnelStatus

  openCommand: (mode: CommandMode, initial?: string) => void
  closeCommand: () => void
  set: (patch: Partial<UIState>) => void
  toast: (text: string, icon?: Toast['icon']) => void
  upsertDownload: (d: DownloadInfo) => void
}

let toastId = 0

export const useUI = create<UIState>((set, get) => ({
  command: { open: false, mode: 'new' },
  overview: false,
  peek: null,
  focusMode: false,
  sidebarHover: false,
  cheatsheet: false,
  settingsOpen: false,
  settingsFocus: null,
  settingsPage: 'main',
  downloadsOpen: false,
  findOpen: false,
  fullscreenTab: null,
  windowFullscreen: false,
  dragging: false,
  splitDrop: null,
  toasts: [],
  permissions: [],
  passwordOffers: [],
  downloads: [],
  downloadPulse: 0,
  downloadDone: 0,
  tunnel: { state: 'off', progress: 0 },

  openCommand: (mode, initial) => set({ command: { open: true, mode, initial }, overview: false, cheatsheet: false }),
  closeCommand: () => set((s) => ({ command: { ...s.command, open: false } })),
  set: (patch) => set(patch),
  toast: (text, icon) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, icon }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2200)
  },
  upsertDownload: (d) => {
    const list = get().downloads
    const i = list.findIndex((x) => x.id === d.id)
    if (i === -1) {
      set({ downloads: [d, ...list].slice(0, 30), downloadPulse: get().downloadPulse + 1 })
      return
    }
    const prev = list[i]
    const next = [...list]
    next[i] = d
    set({
      downloads: next,
      downloadDone: prev.state !== 'completed' && d.state === 'completed' ? get().downloadDone + 1 : get().downloadDone
    })
  }
}))

/** Measured screen rects of the places a webview can be shown. */
export type SlotName = 'main' | 'split-a' | 'split-b' | 'peek' | 'full'

interface SlotState {
  rects: Partial<Record<SlotName, Rect>>
  setRect: (name: SlotName, rect: Rect | null) => void
}

export const useSlots = create<SlotState>((set) => ({
  rects: {},
  setRect: (name, rect) =>
    set((s) => {
      const prev = s.rects[name]
      if (
        rect &&
        prev &&
        prev.left === rect.left &&
        prev.top === rect.top &&
        prev.width === rect.width &&
        prev.height === rect.height
      )
        return s
      const rects = { ...s.rects }
      if (rect) rects[name] = rect
      else delete rects[name]
      return { rects }
    })
}))
