import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { JsonStore } from './store'

const store = new JsonStore<Settings>('settings', () => ({ ...DEFAULT_SETTINGS }))

export function getSettings(): Settings {
  // Merge with defaults so new settings appear for existing users.
  return { ...DEFAULT_SETTINGS, ...store.get() }
}

export function setSettings(patch: Partial<Settings>): Settings {
  return store.update((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }))
}
