import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Heart, KeyRound, X } from 'lucide-react'
import type { BackgroundScope, BlackHoleMode, DaylightMode, MotionPref, SearchEngineId, ThemeMode, TunnelBridge, TunnelMode, TunnelStatus } from '@shared/types'
import { bridgeName } from '@shared/tunnel'
import { SEARCH_ENGINES } from '@shared/url'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { useBrowser } from '@/state/browser'
import ElasticSlider from '@/components/bits/ElasticSlider'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'
import { ScenePicker } from '@/features/scenes/ScenePicker'
import { PasswordsPage } from '@/features/passwords/PasswordsPage'

/** Muted accents. The default is a quiet terracotta; none of them shout. */
export const ACCENTS = ['#b4694a', '#a88a52', '#7c9278', '#74869c', '#8a7186', '#8a857c']

function Row({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div>
        <div className="text-[13px] text-text">{title}</div>
        {detail && <div className="mt-0.5 text-[11.5px] text-faint">{detail}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn('relative h-[20px] w-[34px] rounded-full border border-hairline transition-colors', on ? 'bg-accent' : 'bg-active')}
    >
      <motion.span layout transition={spring.snappy} className={cn('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow', on ? 'right-[2px]' : 'left-[2px]')} />
    </button>
  )
}

function Segmented<T extends string>({ value, options, onChange, id }: { value: T; options: [T, string][]; onChange: (v: T) => void; id: string }) {
  return (
    <div className="flex rounded-lg bg-hover p-0.5">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className="relative px-3 py-1 text-[12px]">
          {value === v && <motion.span layoutId={`seg-${id}`} transition={spring.snappy} className="absolute inset-0 rounded-md bg-active shadow" />}
          <span className={cn('relative', value === v ? 'text-text' : 'text-dim')}>{label}</span>
        </button>
      ))}
    </div>
  )
}

function tunnelDetail(mode: TunnelMode, t: TunnelStatus): string {
  if (mode === 'off') return 'Hides your IP address by sending pages through Tor. No account or server needed.'
  if (t.state === 'error') return t.message ?? 'The Tunnel stopped.'
  const bridge = bridgeName(t.transport)
  const via = bridge ? ` through ${bridge}` : ''
  if (t.state !== 'on') return `Connecting to Tor${via} (${t.progress}%).${t.message ? ` ${t.message}` : ''}`
  const what = mode === 'private' ? 'Private spaces go' : 'All tabs go'
  return `${what} through Tor${bridge ? `, over ${bridge}` : ''}. Pages load slower, and some sites ask for a CAPTCHA.`
}

const BRIDGE_DETAIL: Record<TunnelBridge, string> = {
  auto: 'Switches to a bridge when Tor is blocked, and remembers what works on each network.',
  always: 'Uses a Snowflake or meek bridge, so your network can’t see that you use Tor. Slower.',
  never: 'Always connects to Tor directly.'
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="label mb-1.5">{title}</h3>
      <div className="divide-y divide-[var(--hairline)] rounded-[9px] border border-hairline px-4">{children}</div>
    </section>
  )
}

export function SettingsSheet() {
  const open = useUI((s) => s.settingsOpen)
  const set = useUI((s) => s.set)
  const s = useSettings()
  const tunnel = useUI((u) => u.tunnel)
  const page = useUI((u) => u.settingsPage)
  const spaceCount = useBrowser((b) => b.spaces.length)
  const [isDefault, setIsDefault] = useState(false)
  const [version, setVersion] = useState('')
  const [saved, setSaved] = useState<number | null>(null)

  const focus = useUI((u) => u.settingsFocus)
  useEffect(() => {
    if (!open || !focus) return
    const frame = requestAnimationFrame(() => {
      document.getElementById(`settings-${focus}`)?.scrollIntoView({ block: 'center' })
      set({ settingsFocus: null })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, focus, set])

  useEffect(() => {
    if (!open) return
    void window.gravity.defaultBrowser.get().then(setIsDefault)
    void window.gravity.appInfo().then((i) => setVersion(i.version))
  }, [open])

  useEffect(() => {
    if (open && page === 'main') void window.gravity.passwords.status().then((v) => setSaved(v.available ? v.count : null))
  }, [open, page])

  // Closing Settings locks the passwords again and comes back to the first page next time.
  useEffect(() => {
    if (open) return
    window.gravity.passwords.lock()
    if (useUI.getState().settingsPage !== 'main') set({ settingsPage: 'main' })
  }, [open, set])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[76] bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => set({ settingsOpen: false })}
          />
          <motion.aside
            initial={{ x: 460 }}
            animate={{ x: 0 }}
            exit={{ x: 460 }}
            transition={spring.gentle}
            className="glass-strong fixed top-2 right-2 bottom-2 z-[77] flex w-[440px] flex-col overflow-hidden rounded-[12px]"
            data-testid="settings"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {page === 'passwords' ? (
                <motion.div
                  key="passwords"
                  className="flex min-h-0 flex-1 flex-col"
                  initial={{ x: 60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 60, opacity: 0 }}
                  transition={spring.gentle}
                >
                  <PasswordsPage onBack={() => set({ settingsPage: 'main' })} />
                </motion.div>
              ) : (
                <motion.div
                  key="main"
                  className="flex min-h-0 flex-1 flex-col"
                  initial={{ x: -60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -60, opacity: 0 }}
                  transition={spring.gentle}
                >
                  <div className="flex items-center justify-between px-6 pt-5 pb-3">
                    <h2 className="text-[17px] font-medium tracking-tight">Settings</h2>
                    <button type="button" onClick={() => set({ settingsOpen: false })} className="rounded-lg p-1.5 text-dim hover:bg-hover hover:text-text">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-6">
                    <Section title="Browsing">
                      <Row title="Search engine">
                        <select
                          value={s.searchEngine}
                          onChange={(e) => void s.update({ searchEngine: e.target.value as SearchEngineId })}
                          className="rounded-lg bg-active px-2 py-1 text-[12.5px] text-text outline-none"
                        >
                          {Object.entries(SEARCH_ENGINES).map(([id, e]) => (
                            <option key={id} value={id}>
                              {e.name}
                            </option>
                          ))}
                        </select>
                      </Row>
                      <Row title="Search suggestions" detail="Sends what you type to your search engine">
                        <Toggle label="Search suggestions" on={s.suggestions} onChange={(v) => void s.update({ suggestions: v })} />
                      </Row>
                      <Row title="Default browser" detail={isDefault ? 'Gravity opens your links' : 'Open links from other apps in Gravity'}>
                        <button
                          type="button"
                          disabled={isDefault}
                          onClick={() => void window.gravity.defaultBrowser.set().then(() => window.gravity.defaultBrowser.get().then(setIsDefault))}
                          className="rounded-lg bg-active px-3 py-1 text-[12px] text-text disabled:opacity-50"
                        >
                          {isDefault ? 'Default ✓' : 'Make default'}
                        </button>
                      </Row>
                    </Section>

                    <Section title="Appearance">
                      <Row title="Theme">
                        <Segmented<ThemeMode>
                          id="theme"
                          value={s.theme}
                          options={[
                            ['dark', 'Dark'],
                            ['light', 'Light'],
                            ['system', 'Auto']
                          ]}
                          onChange={(v) => void s.update({ theme: v })}
                        />
                      </Row>
                      <Row title="Accent">
                        <div className="flex gap-1.5">
                          {ACCENTS.map((c) => (
                            <motion.button
                              key={c}
                              type="button"
                              whileTap={{ scale: 0.9 }}
                              onClick={() => void s.update({ accent: c })}
                              className="h-4 w-4 rounded-[4px]"
                              style={{ background: c, boxShadow: s.accent === c ? `0 0 0 2px var(--glass-strong), 0 0 0 3px var(--text-dim)` : undefined }}
                            />
                          ))}
                        </div>
                      </Row>
                      <Row title="Motion" detail="Follows the system setting unless you choose otherwise.">
                        <Segmented<MotionPref>
                          id="motion"
                          value={s.motion}
                          options={[
                            ['always', 'Full'],
                            ['user', 'System'],
                            ['never', 'Reduced']
                          ]}
                          onChange={(v) => void s.update({ motion: v })}
                        />
                      </Row>
                      <div className="py-3" id="settings-background" data-testid="scene-picker">
                        <ScenePicker />
                      </div>
                      {spaceCount > 1 && (
                        <div data-testid="background-scope">
                          <Row title="Apply to" detail="Each space can keep its own background.">
                            <Segmented<BackgroundScope>
                              id="background-scope"
                              value={s.backgroundScope}
                              options={[
                                ['ask', 'Ask'],
                                ['space', 'This space'],
                                ['all', 'All spaces']
                              ]}
                              onChange={(v) => void s.update({ backgroundScope: v })}
                            />
                          </Row>
                        </div>
                      )}
                      <Row title="Background motion" detail="On Home and in Overview. Still uses less power.">
                        <Segmented<BlackHoleMode>
                          id="blackhole"
                          value={s.blackHole}
                          options={[
                            ['live', 'Live'],
                            ['still', 'Still'],
                            ['off', 'Off']
                          ]}
                          onChange={(v) => void s.update({ blackHole: v })}
                        />
                      </Row>
                      <div data-testid="daylight">
                        <Row title="Time of day" detail="Automatic follows sunrise and sunset where you are, worked out on this Mac. Space has no day.">
                          <Segmented<DaylightMode>
                            id="daylight"
                            value={s.daylight}
                            options={[
                              ['auto', 'Auto'],
                              ['day', 'Day'],
                              ['night', 'Night']
                            ]}
                            onChange={(v) => void s.update({ daylight: v })}
                          />
                        </Row>
                      </div>
                    </Section>

                    <Section title="Tabs">
                      <div className="py-3">
                        <div className="text-[13px] text-text">Put background tabs to sleep after</div>
                        <ElasticSlider
                          className="mt-2"
                          defaultValue={s.sleepAfterMinutes}
                          startingValue={5}
                          maxValue={120}
                          isStepped
                          stepSize={5}
                          valuePosition="bubble"
                          formatValue={(v) => `${Math.round(v)} min`}
                          leftIcon={<span className="text-[11px] text-faint">5m</span>}
                          rightIcon={<span className="text-[11px] text-faint">2h</span>}
                          rangeColor="var(--text-dim)"
                          onChangeEnd={(v) => void s.update({ sleepAfterMinutes: Math.round(v) })}
                        />
                      </div>
                      <div className="py-3">
                        <div className="text-[13px] text-text">Archive unpinned tabs after</div>
                        <ElasticSlider
                          className="mt-2"
                          defaultValue={s.archiveAfterHours}
                          startingValue={1}
                          maxValue={168}
                          isStepped
                          stepSize={1}
                          valuePosition="bubble"
                          formatValue={(v) => (v >= 168 ? 'Never' : v >= 24 ? `${Math.round(v / 24)} days` : `${Math.round(v)} h`)}
                          leftIcon={<span className="text-[11px] text-faint">1h</span>}
                          rightIcon={<span className="text-[11px] text-faint">never</span>}
                          rangeColor="var(--text-dim)"
                          onChangeEnd={(v) => void s.update({ archiveAfterHours: Math.round(v) })}
                        />
                      </div>
                    </Section>

                    <Section title="Passwords">
                      <button
                        type="button"
                        id="settings-passwords"
                        onClick={() => set({ settingsPage: 'passwords' })}
                        className="flex w-full items-center justify-between gap-6 py-3 text-left"
                        data-testid="settings-passwords"
                      >
                        <div className="flex items-center gap-3">
                          <KeyRound size={15} className="text-dim" />
                          <div>
                            <div className="text-[13px] text-text">Saved passwords</div>
                            <div className="mt-0.5 text-[11.5px] text-faint">
                              {saved === null ? 'Encrypted with your Mac’s keychain' : saved === 0 ? 'None yet · encrypted with your Mac’s keychain' : `${saved} saved · encrypted with your Mac’s keychain`}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={15} className="text-faint" />
                      </button>
                      <Row title="Fill in automatically" detail="Signs you in faster on sites you have a password for">
                        <Toggle label="Fill in passwords" on={s.passwordsAutofill} onChange={(v) => void s.update({ passwordsAutofill: v })} />
                      </Row>
                      <Row title="Offer to save" detail="After you sign in somewhere new. Never in private spaces.">
                        <Toggle label="Offer to save passwords" on={s.passwordsOffer} onChange={(v) => void s.update({ passwordsOffer: v })} />
                      </Row>
                    </Section>

                    <Section title="Privacy">
                      <Row title="Shield" detail="Blocks ads and trackers with Ghostery's engine">
                        <Toggle label="Shield" on={s.shield} onChange={(v) => void s.update({ shield: v })} />
                      </Row>
                      <div id="settings-tunnel" className="py-3">
                        <div className="flex items-center justify-between gap-6">
                          <div className="text-[13px] text-text">Tunnel</div>
                          <Segmented<TunnelMode>
                            id="tunnel"
                            value={s.tunnel}
                            options={[
                              ['off', 'Off'],
                              ['private', 'Private spaces'],
                              ['all', 'All tabs']
                            ]}
                            onChange={(v) => void s.update({ tunnel: v })}
                          />
                        </div>
                        <div className="mt-1 text-[11.5px] text-faint" data-testid="tunnel-status">
                          {tunnelDetail(s.tunnel, tunnel)}
                        </div>
                      </div>
                      <Row title="Bridge" detail={BRIDGE_DETAIL[s.tunnelBridge]}>
                        <Segmented<TunnelBridge>
                          id="tunnel-bridge"
                          value={s.tunnelBridge}
                          options={[
                            ['auto', 'Auto'],
                            ['always', 'Always'],
                            ['never', 'Never']
                          ]}
                          onChange={(v) => void s.update({ tunnelBridge: v })}
                        />
                      </Row>
                      {s.tunnelBypass.length > 0 && (
                        <div className="py-3" data-testid="tunnel-bypass">
                          <div className="text-[13px] text-text">Sites that skip the Tunnel</div>
                          <div className="mt-0.5 text-[11.5px] text-faint">
                            They don’t work over Tor, so in normal spaces they load directly and see your IP address.
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {s.tunnelBypass.map((site) => (
                              <span key={site} className="flex items-center gap-1 rounded-md bg-active py-0.5 pr-0.5 pl-2 font-mono text-[11.5px] text-dim">
                                {site}
                                <button
                                  type="button"
                                  aria-label={`Send ${site} through the Tunnel again`}
                                  title="Send it through the Tunnel again"
                                  onClick={() => void s.update({ tunnelBypass: s.tunnelBypass.filter((x) => x !== site) })}
                                  className="rounded p-0.5 text-faint hover:bg-hover hover:text-text"
                                >
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <Row title="Browsing history">
                        <button
                          type="button"
                          onClick={() => {
                            void window.gravity.history.clear()
                            useUI.getState().toast('History cleared', 'check')
                          }}
                          className="rounded-lg bg-active px-3 py-1 text-[12px] text-text hover:text-rose-300"
                        >
                          Clear history
                        </button>
                      </Row>
                    </Section>

                    <div className="mt-6 flex items-center justify-between text-[11.5px] text-faint">
                      <span className="font-mono">Gravity {version} · MIT</span>
                      <span className="flex items-center gap-1">
                        <Heart size={12} /> Open source
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
