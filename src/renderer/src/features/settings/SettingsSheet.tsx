import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Heart, X } from 'lucide-react'
import type { MotionPref, SearchEngineId, ThemeMode } from '@shared/types'
import { SEARCH_ENGINES } from '@shared/url'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import ElasticSlider from '@/components/bits/ElasticSlider'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'

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
  const [isDefault, setIsDefault] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (!open) return
    void window.gravity.defaultBrowser.get().then(setIsDefault)
    void window.gravity.appInfo().then((i) => setVersion(i.version))
  }, [open])

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

              <Section title="Privacy">
                <Row title="Shield" detail="Blocks ads and trackers with Ghostery's engine">
                  <Toggle label="Shield" on={s.shield} onChange={(v) => void s.update({ shield: v })} />
                </Row>
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
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
