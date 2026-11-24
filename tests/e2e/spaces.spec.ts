import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { command, launch, shot } from './fixtures'

const backdrop = (win: Page) => win.getByTestId('scene-backdrop')
const sceneIs = async (win: Page, scene: string) =>
  scene === 'blackhole'
    ? expect(backdrop(win).locator('canvas[data-testid="black-hole"]')).toHaveCount(1)
    : expect(backdrop(win).locator(`canvas[data-testid="scene"][data-scene="${scene}"]`)).toHaveCount(1)

test('each space keeps its own background and favorites', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'gravity-e2e-'))
  // Favorites from before spaces had their own: every space gets a copy.
  const legacy = [
    { id: 'f0', url: 'https://example.com/', title: 'Example' },
    { id: 'f1', url: 'https://example.org/', title: 'Example Org' }
  ]
  writeFileSync(join(userData, 'favorites.json'), JSON.stringify(legacy))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboarded: true, shield: false, suggestions: false, theme: 'dark', motion: 'never', daylight: 'day' }))
  const { app, win } = await launch({ userData })
  const pins = win.getByTestId('home-pin')
  await expect(pins).toHaveCount(2)

  // Personal: Dunes, kept here. The card asks; the change shows at once.
  await command(app, { command: 'settings' })
  const picker = win.getByTestId('scene-picker')
  await expect(win.getByTestId('background-kind')).toHaveText('· Default')
  await picker.getByTestId('scene-dunes').click()
  await expect(win.getByTestId('background-ask')).toBeVisible()
  await sceneIs(win, 'dunes')
  await shot(win, 'spaces-ask')
  await win.getByTestId('background-this-space').click()
  await expect(win.getByTestId('background-ask')).toHaveCount(0)
  await expect(win.getByTestId('background-kind')).toHaveText('· Own')
  await shot(win, 'spaces-own')
  await win.getByTestId('background-scope').scrollIntoViewIfNeeded()
  await shot(win, 'spaces-scope')

  // Work still has the default, and its favorites are its own.
  await win.keyboard.press('Escape')
  await command(app, { command: 'next-space' })
  await sceneIs(win, 'blackhole')
  await pins.first().hover()
  await win.getByTestId('home-pin-remove').first().click()
  await expect(pins).toHaveCount(1)
  await command(app, { command: 'prev-space' })
  await sceneIs(win, 'dunes')
  await expect(pins).toHaveCount(2)

  // From Work: Forest for every space, remembered.
  await command(app, { command: 'next-space' })
  await command(app, { command: 'settings' })
  await picker.getByTestId('scene-forest').click()
  await expect(win.getByText('All spaces replaces one other space’s own')).toBeVisible()
  await win.getByTestId('background-remember').click()
  await win.getByTestId('background-all-spaces').click()
  await expect(win.getByTestId('background-kind')).toHaveText('· Default')
  // Remembered: the setting says so, and the next change doesn't ask.
  await expect(win.getByTestId('background-scope').getByRole('button', { name: 'All spaces' })).toBeVisible()
  await picker.getByTestId('scene-wave').click()
  await expect(win.getByTestId('background-ask')).toHaveCount(0)
  await win.keyboard.press('Escape')
  await command(app, { command: 'prev-space' })
  await sceneIs(win, 'wave')

  await app.close()
  const saved = JSON.parse(readFileSync(join(userData, 'favorites.json'), 'utf8')) as Record<string, unknown[]>
  expect(Object.values(saved).map((l) => l.length).sort()).toEqual([1, 2])
  const settings = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
  expect(settings).toMatchObject({ scene: 'wave', backgroundScope: 'all' })
})
