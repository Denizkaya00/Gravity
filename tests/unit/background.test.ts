import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'

describe('backgrounds per space', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', { gravity: { settings: { set: async (p: object) => ({ ...DEFAULT_SETTINGS, ...p }) }, favorites: { set: vi.fn() } } })
    const { useBrowser } = await import('@/state/browser')
    const { useSettings } = await import('@/state/settings')
    useBrowser.getState().hydrate(null)
    useSettings.setState({ ...DEFAULT_SETTINGS })
  })

  it('gives one space its own, sends one to every space, and goes back to the default', async () => {
    const { useBrowser } = await import('@/state/browser')
    const { useSettings } = await import('@/state/settings')
    const { currentBackground, followDefaultBackground, setBackground } = await import('@/features/scenes/background')
    const B = () => useBrowser.getState()
    const [personal, work] = B().spaces

    setBackground({ scene: 'dunes' }, 'space')
    expect(currentBackground().scene).toBe('dunes')
    expect(useSettings.getState().scene).toBe('blackhole')
    B().setActiveSpace(work.id)
    expect(currentBackground().scene).toBe('blackhole')

    // Choosing the default again in a space lets it follow the default.
    setBackground({ scene: 'forest' }, 'space')
    setBackground({ scene: 'blackhole' }, 'space')
    expect(B().spaces.find((s) => s.id === work.id)?.background).toBeUndefined()

    setBackground({ scene: 'mountains', mountainPhoto: 'everest' }, 'all')
    expect(useSettings.getState()).toMatchObject({ scene: 'mountains', mountainPhoto: 'everest' })
    expect(B().spaces.every((s) => !s.background)).toBe(true)
    B().setActiveSpace(personal.id)
    expect(currentBackground().scene).toBe('mountains')

    setBackground({ scene: 'wave' }, 'space')
    followDefaultBackground()
    expect(currentBackground().scene).toBe('mountains')
  })
})
