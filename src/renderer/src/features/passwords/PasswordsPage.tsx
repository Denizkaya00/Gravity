import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Check,
  ChevronLeft,
  Copy,
  Dices,
  ExternalLink,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-react'
import {
  defaultTitle,
  filterEntries,
  generatePassword,
  isWeak,
  normalizeSite,
  siteOf,
  type PasswordDraft,
  type PasswordEntry,
  type PasswordSummary,
  type VaultStatus
} from '@shared/passwords'
import { selectActiveTab, useBrowser } from '@/state/browser'
import { useUI } from '@/state/ui'
import { openUrl } from '@/browser/actions'
import { Favicon } from '@/components/ui/Favicon'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'

type View = { kind: 'list' } | { kind: 'detail'; id: string } | { kind: 'edit'; draft: PasswordDraft }

const api = () => window.gravity.passwords

/** Electron wraps errors from main as "Error invoking remote method '…': Error: message". */
function message(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const isLockedError = (err: unknown) => /locked/i.test(message(err))

const field = 'w-full rounded-lg bg-active px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-faint focus:ring-1 focus:ring-[var(--hairline-strong)]'
const button = 'rounded-lg bg-active px-3 py-1 text-[12px] text-text hover:bg-hover disabled:opacity-50'

function Badge({ tone, children }: { tone: 'warn' | 'dim'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-[4px] border px-1.5 py-px font-mono text-[10px] tracking-wide uppercase',
        tone === 'warn' ? 'border-amber-500/30 text-amber-500/90' : 'border-hairline text-faint'
      )}
    >
      {children}
    </span>
  )
}

function IconAction({ label, onClick, children, testId }: { label: string; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      data-testid={testId}
      className="rounded-md p-1.5 text-dim hover:bg-hover hover:text-text"
    >
      {children}
    </button>
  )
}

/** Settings → Passwords: the vault, behind Touch ID. */
export function PasswordsPage({ onBack }: { onBack: () => void }) {
  const toast = useUI((s) => s.toast)
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [entries, setEntries] = useState<PasswordSummary[]>([])
  const [never, setNever] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>({ kind: 'list' })
  const [unlocking, setUnlocking] = useState(false)
  const asked = useRef(false)

  const refresh = useCallback(async () => {
    const s = await api().status()
    setStatus(s)
    if (!s.available || s.locked) return
    try {
      const [list, nev] = await Promise.all([api().list(), api().never()])
      setEntries(list)
      setNever(nev)
    } catch (err) {
      if (isLockedError(err)) setStatus({ ...s, locked: true })
    }
  }, [])

  const unlock = useCallback(async () => {
    setUnlocking(true)
    try {
      if (await api().unlock()) await refresh()
    } finally {
      setUnlocking(false)
    }
  }, [refresh])

  // Ask for Touch ID as soon as the page opens, once.
  useEffect(() => {
    void api()
      .status()
      .then((s) => {
        setStatus(s)
        if (s.available && s.locked && !asked.current) {
          asked.current = true
          void unlock()
        } else if (s.available && !s.locked) void refresh()
      })
  }, [refresh, unlock])

  /** Runs a vault call, dropping back to the lock screen if the vault locked itself meanwhile. */
  const guarded = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn()
      } catch (err) {
        if (isLockedError(err)) {
          setStatus((s) => (s ? { ...s, locked: true } : s))
          setView({ kind: 'list' })
        } else toast(message(err), 'warn')
        return undefined
      }
    },
    [toast]
  )

  const copy = (id: string, what: 'username' | 'password') =>
    void guarded(() => api().copy(id, what)).then((ok) => {
      if (ok) toast(what === 'password' ? 'Password copied · clears in a minute' : 'Username copied', 'copy')
    })

  const startAdd = () => {
    // Adding while on a site? Start from that site.
    const tab = selectActiveTab(useBrowser.getState())
    const url = tab && /^https?:/.test(tab.url) ? new URL(tab.url).origin : ''
    setView({ kind: 'edit', draft: { title: url ? defaultTitle(url) : '', url, username: '', password: '' } })
  }

  const locked = !status || !status.available || status.locked
  const shown = filterEntries(entries, query)
  const title =
    view.kind === 'edit' ? (view.draft.id ? 'Edit password' : 'New password') : view.kind === 'detail' ? 'Password' : 'Passwords'

  return (
    <div className="flex h-full flex-col" data-testid="passwords-page">
      <div className="flex items-center gap-2 px-4 pt-5 pb-3">
        <button
          type="button"
          aria-label="Back"
          data-testid="passwords-back"
          onClick={() => (view.kind === 'list' || locked ? onBack() : setView({ kind: 'list' }))}
          className="rounded-lg p-1.5 text-dim hover:bg-hover hover:text-text"
        >
          <ChevronLeft size={17} />
        </button>
        <h2 className="flex-1 text-[17px] font-medium tracking-tight">{title}</h2>
        {!locked && view.kind === 'list' && (
          <button type="button" aria-label="Add password" data-testid="passwords-add" onClick={startAdd} className="rounded-lg p-1.5 text-dim hover:bg-hover hover:text-text">
            <Plus size={17} />
          </button>
        )}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-6">
        {!status ? null : !status.available ? (
          <Centered icon={<TriangleAlert size={18} />} title="Passwords aren’t available" detail={status.reason} />
        ) : status.locked ? (
          <Centered
            icon={<Lock size={18} />}
            title="Passwords are locked"
            detail={
              status.touchId
                ? 'Use Touch ID to see and change your saved passwords. Autofill works while they’re locked.'
                : 'This Mac has no Touch ID, so Passwords open without it. They’re still encrypted with your keychain.'
            }
          >
            <button type="button" onClick={() => void unlock()} disabled={unlocking} className={cn(button, 'mt-4 flex items-center gap-1.5')} data-testid="passwords-unlock">
              {status.touchId ? <Fingerprint size={14} /> : <KeyRound size={14} />}
              {unlocking ? 'Waiting…' : status.touchId ? 'Unlock with Touch ID' : 'Show passwords'}
            </button>
          </Centered>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view.kind === 'detail' ? view.id : view.kind}
              initial={{ opacity: 0, x: view.kind === 'list' ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={spring.snappy}
            >
              {view.kind === 'list' && (
                <ListView
                  entries={shown}
                  total={entries.length}
                  query={query}
                  setQuery={setQuery}
                  never={never}
                  onOpen={(id) => setView({ kind: 'detail', id })}
                  onAdd={startAdd}
                  onCopy={copy}
                  onForgetNever={(site) => void guarded(() => api().neverRemove(site)).then(refresh)}
                />
              )}
              {view.kind === 'detail' && (
                <DetailView
                  id={view.id}
                  load={(id) => guarded(() => api().get(id))}
                  onCopy={copy}
                  onEdit={(e) => setView({ kind: 'edit', draft: { id: e.id, title: e.title, url: e.url, username: e.username, password: e.password, notes: e.notes } })}
                  onDelete={async (id) => {
                    await guarded(() => api().remove(id))
                    toast('Password deleted', 'check')
                    setView({ kind: 'list' })
                    await refresh()
                  }}
                  summary={entries.find((e) => e.id === view.id)}
                />
              )}
              {view.kind === 'edit' && (
                <EditView
                  initial={view.draft}
                  onCancel={() => setView(view.draft.id ? { kind: 'detail', id: view.draft.id } : { kind: 'list' })}
                  onSave={async (draft) => {
                    const saved = await guarded(() => api().save(draft))
                    if (!saved) return
                    toast(draft.id ? 'Password updated' : 'Password saved', 'check')
                    await refresh()
                    setView({ kind: 'detail', id: saved.id })
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

function Centered({ icon, title, detail, children }: { icon: ReactNode; title: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 pt-20 text-center" data-testid="passwords-locked">
      <div className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-hairline text-dim">{icon}</div>
      <div className="mt-3 text-[14px] text-text">{title}</div>
      {detail && <div className="mt-1 text-[12px] leading-relaxed text-faint">{detail}</div>}
      {children}
    </div>
  )
}

function ListView({
  entries,
  total,
  query,
  setQuery,
  never,
  onOpen,
  onAdd,
  onCopy,
  onForgetNever
}: {
  entries: PasswordSummary[]
  total: number
  query: string
  setQuery: (q: string) => void
  never: string[]
  onOpen: (id: string) => void
  onAdd: () => void
  onCopy: (id: string, what: 'username' | 'password') => void
  onForgetNever: (site: string) => void
}) {
  const weak = entries.filter((e) => e.weak).length
  const reused = entries.filter((e) => e.reused).length
  return (
    <>
      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search passwords"
          className={cn(field, 'pl-8')}
          data-testid="passwords-search"
        />
      </div>

      {total === 0 ? (
        <div className="rounded-[9px] border border-dashed border-hairline px-5 py-8 text-center">
          <div className="text-[13px] text-text">No passwords yet</div>
          <div className="mt-1 text-[12px] leading-relaxed text-faint">
            Add one here, or sign in to a site and Gravity offers to save it. Saved passwords fill in on their sites by themselves.
          </div>
          <button type="button" onClick={onAdd} className={cn(button, 'mt-4')}>
            Add password
          </button>
        </div>
      ) : (
        <>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="label">{query ? `${entries.length} of ${total}` : `${total} saved`}</h3>
            {!query && (weak > 0 || reused > 0) && (
              <span className="text-[11px] text-faint">
                {[weak && `${weak} weak`, reused && `${reused} reused`].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <div className="divide-y divide-[var(--hairline)] rounded-[9px] border border-hairline" data-testid="passwords-list">
            {entries.map((e) => (
              <div key={e.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-hover" data-testid="password-row">
                <button type="button" onClick={() => onOpen(e.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Favicon url={e.url} size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-text">{e.title}</div>
                    <div className="truncate font-mono text-[11px] text-faint">{e.username || siteOf(e.url)}</div>
                  </div>
                  {e.weak && <Badge tone="warn">weak</Badge>}
                  {e.reused && <Badge tone="dim">reused</Badge>}
                </button>
                <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {e.username && (
                    <IconAction label="Copy username" onClick={() => onCopy(e.id, 'username')}>
                      <Copy size={13} />
                    </IconAction>
                  )}
                  <IconAction label="Copy password" onClick={() => onCopy(e.id, 'password')}>
                    <KeyRound size={13} />
                  </IconAction>
                </div>
              </div>
            ))}
            {entries.length === 0 && <div className="px-3 py-4 text-center text-[12px] text-faint">Nothing matches “{query}”</div>}
          </div>
        </>
      )}

      {never.length > 0 && !query && (
        <section className="mt-6">
          <h3 className="label mb-1.5">Never saved for</h3>
          <div className="divide-y divide-[var(--hairline)] rounded-[9px] border border-hairline">
            {never.map((site) => (
              <div key={site} className="flex items-center justify-between px-3 py-2 text-[12.5px] text-dim">
                <span className="font-mono">{site}</span>
                <IconAction label={`Offer to save on ${site} again`} onClick={() => onForgetNever(site)}>
                  <X size={13} />
                </IconAction>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function DetailRow({ label, children, actions }: { label: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="w-[76px] shrink-0 text-[11.5px] text-faint">{label}</div>
      <div className="min-w-0 flex-1 text-[13px] text-text">{children}</div>
      {actions && <div className="flex shrink-0">{actions}</div>}
    </div>
  )
}

const when = (t?: number) => (t ? new Date(t).toLocaleDateString(window.gravity.systemLocale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—')

function DetailView({
  id,
  summary,
  load,
  onCopy,
  onEdit,
  onDelete
}: {
  id: string
  summary?: PasswordSummary
  load: (id: string) => Promise<PasswordEntry | null | undefined>
  onCopy: (id: string, what: 'username' | 'password') => void
  onEdit: (e: PasswordEntry) => void
  onDelete: (id: string) => Promise<void>
}) {
  const [entry, setEntry] = useState<PasswordEntry | null>(null)
  const [reveal, setReveal] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    void loadRef.current(id).then((e) => setEntry(e ?? null))
  }, [id])

  if (!entry) return null
  return (
    <div data-testid="password-detail">
      <div className="mb-4 flex items-center gap-3">
        <Favicon url={entry.url} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] text-text">{entry.title}</div>
          <button
            type="button"
            onClick={() => {
              openUrl(entry.url, 'foreground')
              useUI.getState().set({ settingsOpen: false })
            }}
            className="flex items-center gap-1 font-mono text-[11.5px] text-faint hover:text-text"
          >
            {siteOf(entry.url)} <ExternalLink size={11} />
          </button>
        </div>
        {summary?.weak && <Badge tone="warn">weak</Badge>}
        {summary?.reused && <Badge tone="dim">reused</Badge>}
      </div>

      <div className="divide-y divide-[var(--hairline)] rounded-[9px] border border-hairline px-4">
        <DetailRow
          label="Username"
          actions={
            entry.username && (
              <IconAction label="Copy username" onClick={() => onCopy(entry.id, 'username')}>
                <Copy size={13} />
              </IconAction>
            )
          }
        >
          <span className="block truncate font-mono text-[12.5px]" data-testid="detail-username">
            {entry.username || <span className="text-faint">None</span>}
          </span>
        </DetailRow>
        <DetailRow
          label="Password"
          actions={
            <>
              <IconAction label={reveal ? 'Hide password' : 'Show password'} onClick={() => setReveal(!reveal)} testId="detail-reveal">
                {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
              </IconAction>
              <IconAction label="Copy password" onClick={() => onCopy(entry.id, 'password')}>
                <Copy size={13} />
              </IconAction>
            </>
          }
        >
          <span className="block truncate font-mono text-[12.5px] select-all" data-testid="detail-password">
            {reveal ? entry.password : '•'.repeat(Math.min(14, Math.max(8, entry.password.length)))}
          </span>
        </DetailRow>
        {entry.notes && (
          <DetailRow label="Notes">
            <span className="block text-[12.5px] whitespace-pre-wrap text-dim">{entry.notes}</span>
          </DetailRow>
        )}
      </div>

      {summary?.weak && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-faint">This password is short or easy to guess. Change it on the site, then here.</p>
      )}
      {summary?.reused && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">You use this password on another site too. If one leaks, both are exposed.</p>
      )}

      <div className="mt-5 flex items-center justify-between">
        <span className="font-mono text-[10.5px] text-faint">
          Added {when(entry.createdAt)} · changed {when(entry.updatedAt)}
          {entry.lastUsedAt ? ` · used ${when(entry.lastUsedAt)}` : ''}
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => onEdit(entry)} className={cn(button, 'flex items-center gap-1.5')} data-testid="detail-edit">
          <Pencil size={12} /> Edit
        </button>
        <button
          type="button"
          onClick={() => (confirm ? void onDelete(entry.id) : setConfirm(true))}
          onBlur={() => setConfirm(false)}
          className={cn(button, 'flex items-center gap-1.5', confirm ? 'text-rose-400' : 'hover:text-rose-300')}
          data-testid="detail-delete"
        >
          <Trash2 size={12} /> {confirm ? 'Delete for good?' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

function EditView({ initial, onCancel, onSave }: { initial: PasswordDraft; onCancel: () => void; onSave: (d: PasswordDraft) => Promise<void> }) {
  const [d, setD] = useState<PasswordDraft>(initial)
  const [show, setShow] = useState(!initial.id && !initial.password)
  const [saving, setSaving] = useState(false)
  const site = normalizeSite(d.url)
  const weak = !!d.password && isWeak(d.password)
  const valid = !!site && !!d.password
  const set = (patch: Partial<PasswordDraft>) => setD((x) => ({ ...x, ...patch }))

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await onSave({ ...d, title: d.title.trim() || defaultTitle(site!) })
    } finally {
      setSaving(false)
    }
  }

  const label = (text: string, child: ReactNode, hint?: ReactNode) => (
    <label className="block">
      <span className="mb-1 block text-[11.5px] text-faint">{text}</span>
      {child}
      {hint}
    </label>
  )

  return (
    <form
      className="space-y-3.5"
      data-testid="password-form"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {label(
        'Title',
        <input
          className={field}
          value={d.title}
          placeholder={site ? defaultTitle(site) : 'GitHub, Work email…'}
          onChange={(e) => set({ title: e.target.value })}
          data-testid="form-title"
        />
      )}
      {label(
        'Website',
        <input
          className={cn(field, 'font-mono text-[12.5px]')}
          value={d.url}
          placeholder="github.com"
          autoFocus={!initial.url}
          spellCheck={false}
          onChange={(e) => set({ url: e.target.value })}
          data-testid="form-url"
        />,
        d.url && !site ? <span className="mt-1 block text-[11px] text-amber-500/90">Enter an address such as github.com</span> : null
      )}
      {label(
        'Username or email',
        <input
          className={cn(field, 'font-mono text-[12.5px]')}
          value={d.username}
          autoFocus={!!initial.url && !initial.id}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => set({ username: e.target.value })}
          data-testid="form-username"
        />
      )}
      {label(
        'Password',
        <div className="relative">
          <input
            className={cn(field, 'pr-16 font-mono text-[12.5px]')}
            type={show ? 'text' : 'password'}
            value={d.password}
            spellCheck={false}
            autoComplete="new-password"
            onChange={(e) => set({ password: e.target.value })}
            data-testid="form-password"
          />
          <div className="absolute top-1/2 right-1 flex -translate-y-1/2">
            <IconAction label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
              {show ? <EyeOff size={13} /> : <Eye size={13} />}
            </IconAction>
            <IconAction
              label="Make a strong password"
              testId="form-generate"
              onClick={() => {
                set({ password: generatePassword() })
                setShow(true)
              }}
            >
              <Dices size={13} />
            </IconAction>
          </div>
        </div>,
        weak ? <span className="mt-1 block text-[11px] text-amber-500/90">Weak: short or easy to guess. The dice make a strong one.</span> : null
      )}
      {label(
        'Notes',
        <textarea
          className={cn(field, 'min-h-[64px] resize-y')}
          value={d.notes ?? ''}
          placeholder="Security questions, recovery codes…"
          onChange={(e) => set({ notes: e.target.value })}
        />
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1 text-[12px] text-dim hover:bg-hover hover:text-text">
          Cancel
        </button>
        <motion.button
          type="submit"
          whileTap={{ scale: 0.95 }}
          disabled={!valid || saving}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] text-[var(--frame-bg)] disabled:opacity-40"
          style={{ background: 'var(--text)' }}
          data-testid="form-save"
        >
          <Check size={12} /> Save
        </motion.button>
      </div>
      <p className="pt-2 text-[11px] leading-relaxed text-faint">
        Encrypted on this Mac with a key kept in your keychain. Nothing is synced or sent anywhere.
      </p>
    </form>
  )
}
