import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { useSettings } from '@/state/settings'
import { Kbd } from '@/components/ui/Kbd'
import { ACCENTS } from '@/features/settings/SettingsSheet'
import { BlackHole } from '@/features/blackhole/BlackHole'
import { fallEase, spring } from '@/lib/springs'
import { cn } from '@/lib/utils'

const ESSENTIALS: [string, string, string][] = [
  ['⌘ T', 'Command bar', 'Search, open addresses, switch tabs, run commands.'],
  ['⇧ click', 'Peek', 'Open a link above the page. Keep it, split it, or let it drop.'],
  ['⇧ ⌘ \\', 'Overview', 'All tabs in the space as cards. Flick one up to close it.'],
  ['drag →', 'Split view', 'Drag a tab from the sidebar onto the page.'],
  ['⌘ S', 'Sidebar', 'Hide it. Touch the left edge to bring it back.']
]

/** The wordmark settles into place letter by letter, as if it had weight. */
function Wordmark() {
  return (
    <div className="flex text-[15px] font-medium tracking-[0.32em] text-text" aria-label="Gravity">
      {'GRAVITY'.split('').map((c, i) => (
        <motion.span
          key={i}
          initial={{ y: -36, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...spring.heavy, delay: 0.15 + i * 0.06 }}
        >
          {c}
        </motion.span>
      ))}
    </div>
  )
}

function PrimaryButton({ children, onClick, testId }: { children: ReactNode; onClick: () => void; testId?: string }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="flex items-center gap-2 rounded-[8px] px-4 py-2 text-[13px] font-medium"
      style={{ background: 'var(--text)', color: 'var(--frame-bg)' }}
      data-testid={testId}
    >
      {children}
    </motion.button>
  )
}

const page = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: spring.gentle },
  exit: { opacity: 0, y: 24, transition: { duration: 0.25, ease: fallEase } }
}

/** First run: three short, quiet screens. */
export function Onboarding() {
  const onboarded = useSettings((s) => s.onboarded)
  const loaded = useSettings((s) => s.loaded)
  const accent = useSettings((s) => s.accent)
  const theme = useSettings((s) => s.theme)
  const update = useSettings((s) => s.update)
  const [step, setStep] = useState(0)

  return (
    <AnimatePresence>
      {loaded && !onboarded && (
        <motion.div
          className="theme-dark fixed inset-0 z-[100] overflow-hidden bg-[#050505]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          data-testid="onboarding"
        >
          <div className="drag absolute inset-x-0 top-0 h-10" />
          {/* The first thing you see: falling toward a black hole from far away. */}
          <div className="absolute inset-0">
            <BlackHole center={[0.42, 0.02]} camera={{ distance: 24, inclination: 0.12 }} introDistance={80} exposure={0.95} />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />

          <div className="absolute top-12 left-14">
            <Wordmark />
          </div>
          <div className="label absolute top-12 right-14 tabular-nums">{String(step + 1).padStart(2, '0')} / 03</div>

          <div className="relative flex h-full items-center px-14">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div key="s0" {...page} className="max-w-[620px]">
                  <h1 className="font-display text-[52px] leading-[1.04] font-light tracking-[-0.03em] text-text">
                    A browser that keeps
                    <br />
                    out of your way.
                  </h1>
                  <p className="mt-6 max-w-[460px] text-[15px] leading-relaxed text-dim">
                    Vertical tabs, spaces, a single command bar and a few physical gestures. No feeds, no clutter, no
                    accounts. Everything you open has a little weight, and settles where you put it.
                  </p>
                  <div className="mt-10">
                    <PrimaryButton onClick={() => setStep(1)} testId="onboarding-step-1">
                      Continue <ArrowRight size={14} />
                    </PrimaryButton>
                  </div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div key="s1" {...page} className="max-w-[560px]">
                  <h2 className="font-display text-[36px] leading-tight font-light tracking-[-0.02em] text-text">Appearance</h2>
                  <p className="mt-3 text-[14px] text-dim">One accent, used sparingly. You can change this later in Settings.</p>

                  <div className="label mt-10 mb-3">Accent</div>
                  <div className="flex gap-2.5">
                    {ACCENTS.map((c) => (
                      <motion.button
                        key={c}
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={() => void update({ accent: c })}
                        className="h-7 w-7 rounded-[6px]"
                        style={{
                          background: c,
                          boxShadow: accent === c ? '0 0 0 2px var(--canvas), 0 0 0 3px var(--text-dim)' : undefined
                        }}
                        aria-label={`Accent ${c}`}
                      />
                    ))}
                  </div>

                  <div className="label mt-8 mb-3">Theme</div>
                  <div className="inline-flex rounded-[8px] border border-hairline p-0.5">
                    {(['dark', 'light', 'system'] as const).map((t) => (
                      <button key={t} type="button" onClick={() => void update({ theme: t })} className="relative px-4 py-1.5 text-[12.5px] capitalize">
                        {theme === t && <motion.span layoutId="onb-theme" className="absolute inset-0 rounded-[6px] bg-active" transition={spring.snappy} />}
                        <span className={cn('relative', theme === t ? 'text-text' : 'text-faint')}>{t === 'system' ? 'Auto' : t}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-12">
                    <PrimaryButton onClick={() => setStep(2)} testId="onboarding-step-2">
                      Continue <ArrowRight size={14} />
                    </PrimaryButton>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="s2" {...page} className="w-full max-w-[680px]">
                  <h2 className="font-display text-[36px] leading-tight font-light tracking-[-0.02em] text-text">Five things to know</h2>
                  <div className="mt-8 border-t border-hairline">
                    {ESSENTIALS.map(([keys, title, text], i) => (
                      <motion.div
                        key={title}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...spring.settle, delay: 0.08 + i * 0.05 }}
                        className="grid grid-cols-[110px_140px_1fr] items-baseline gap-4 border-b border-hairline py-3.5"
                      >
                        <Kbd>{keys}</Kbd>
                        <span className="text-[13.5px] text-text">{title}</span>
                        <span className="text-[13px] text-dim">{text}</span>
                      </motion.div>
                    ))}
                  </div>
                  <div className="mt-10 flex items-center gap-3">
                    <PrimaryButton onClick={() => void update({ onboarded: true })} testId="onboarding-done">
                      Start browsing <ArrowRight size={14} />
                    </PrimaryButton>
                    <button
                      type="button"
                      onClick={() => void window.gravity.defaultBrowser.set()}
                      className="rounded-[8px] border border-hairline px-4 py-2 text-[13px] text-dim hover:bg-hover hover:text-text"
                    >
                      Make default browser
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
