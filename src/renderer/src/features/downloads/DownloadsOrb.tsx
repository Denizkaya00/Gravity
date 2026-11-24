import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, FileDown, FolderOpen, X } from 'lucide-react'
import { useUI } from '@/state/ui'
import { AnimatedCircularProgressBar } from '@/components/magic/animated-circular-progress-bar'
import { AnimatedList } from '@/components/magic/animated-list'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}

export function DownloadsOrb() {
  const downloads = useUI((s) => s.downloads)
  const open = useUI((s) => s.downloadsOpen)
  const set = useUI((s) => s.set)
  const pulse = useUI((s) => s.downloadPulse)
  const done = useUI((s) => s.downloadDone)
  const [bump, setBump] = useState(0)

  const active = downloads.filter((d) => d.state === 'progressing')
  const total = active.reduce((a, d) => a + (d.total || 0), 0)
  const received = active.reduce((a, d) => a + d.received, 0)
  const pct = total ? Math.round((received / total) * 100) : active.length ? 35 : 0

  // A small nudge when a download starts or finishes; no fireworks.
  useEffect(() => {
    if (pulse || done) setBump((b) => b + 1)
  }, [pulse, done])

  if (!downloads.length) return null

  return (
    <>
      <motion.button
        type="button"
        title="Downloads (⌥⌘L)"
        onClick={() => set({ downloadsOpen: !open })}
        key={bump}
        animate={{ scale: bump ? [1, 1.12, 1] : 1 }}
        transition={spring.settle}
        whileTap={{ scale: 0.85 }}
        className="no-drag relative flex h-7 w-7 items-center justify-center rounded-lg text-dim hover:bg-hover hover:text-text"
        data-testid="downloads-orb"
      >
        {active.length ? (
          <AnimatedCircularProgressBar
            value={pct}
            gaugePrimaryColor="var(--text-dim)"
            gaugeSecondaryColor="var(--hairline)"
            className="size-[22px] [&>span]:hidden"
          />
        ) : null}
        <ArrowDown size={13} strokeWidth={2.4} className={cn(active.length ? 'absolute' : '')} />
      </motion.button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-[74]" onClick={() => set({ downloadsOpen: false })} />
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.96 }}
                transition={spring.gentle}
                className="glass-strong fixed bottom-14 left-3 z-[75] w-[320px] overflow-hidden rounded-[10px] p-2"
              >
                <div className="flex items-center justify-between px-2 pt-1 pb-2">
                  <span className="label">Downloads</span>
                  <button type="button" onClick={() => set({ downloadsOpen: false })} className="rounded p-0.5 text-faint hover:text-text">
                    <X size={13} />
                  </button>
                </div>
                <div className="scroll-thin max-h-[320px] overflow-y-auto">
                  <AnimatedList delay={70} className="gap-1">
                    {/* AnimatedList reveals items one by one and shows the last one first. */}
                    {[...downloads].reverse().map((d) => (
                      <div key={d.id} className="flex w-[300px] items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-hover">
                        <FileDown size={18} className="shrink-0 text-dim" />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => window.gravity.downloads.action(d.id, 'open')}
                        >
                          <div className="truncate text-[12.5px] text-text">{d.filename}</div>
                          <div className="font-mono text-[10.5px] text-faint">
                            {d.state === 'progressing'
                              ? `${formatBytes(d.received)} of ${formatBytes(d.total)}`
                              : d.state === 'completed'
                                ? formatBytes(d.total || d.received)
                                : d.state}
                          </div>
                          {d.state === 'progressing' && (
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-hover">
                              <motion.div
                                className="h-full rounded-full bg-text/60"
                                animate={{ width: d.total ? `${(d.received / d.total) * 100}%` : '40%' }}
                              />
                            </div>
                          )}
                        </button>
                        {d.state === 'progressing' ? (
                          <button type="button" title="Cancel" onClick={() => window.gravity.downloads.action(d.id, 'cancel')} className="rounded p-1 text-faint hover:text-text">
                            <X size={13} />
                          </button>
                        ) : (
                          <button type="button" title="Show in Finder" onClick={() => window.gravity.downloads.action(d.id, 'show')} className="rounded p-1 text-faint hover:text-text">
                            <FolderOpen size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </AnimatedList>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
