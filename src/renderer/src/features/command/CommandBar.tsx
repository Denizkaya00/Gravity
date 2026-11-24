import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AppWindow, Archive, ArrowRight, Calculator, Clock, Globe, Search, Star } from 'lucide-react'
import type { ArchivedTab, Favorite, HistoryEntry, OpenMode, SearchEngineId } from '@shared/types'
import { favoriteKey, findFavorite, MAX_FAVORITES } from '@shared/favorites'
import { calculate, formatNumber } from '@shared/calc'
import { rankItems, fuzzyScore } from '@shared/rank'
import { parseInput, prettyUrl, SEARCH_ENGINES, searchUrl } from '@shared/url'
import { selectActiveSpace, selectActiveTab, useBrowser } from '@/state/browser'
import { useSettings } from '@/state/settings'
import { useUI } from '@/state/ui'
import { openUrl, submitInput } from '@/browser/actions'
import { addToFavorites } from '@/browser/favorites'
import { page } from '@/browser/registry'
import { Favicon } from '@/components/ui/Favicon'
import { Kbd } from '@/components/ui/Kbd'
import { spring } from '@/lib/springs'
import { cn } from '@/lib/utils'
import { getCommands } from './commands'

type Modifier = 'enter' | 'cmd' | 'shift' | 'alt'

interface Item {
  id: string
  group: string
  title: string
  subtitle?: string
  icon: ReactNode
  hint?: string
  run: (mod: Modifier) => void
}

const MOD_MODE: Record<Exclude<Modifier, 'enter'>, OpenMode> = { cmd: 'background', shift: 'peek', alt: 'split' }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function Panel() {
  const { mode, initial } = useUI((s) => s.command)
  const close = useUI((s) => s.closeCommand)
  const activeTab = useBrowser(selectActiveTab)
  const space = useBrowser(selectActiveSpace)
  const engine = useSettings((s) => s.searchEngine)
  const suggestOn = useSettings((s) => s.suggestions)
  const favorites = useSettings((s) => s.favorites)

  const startValue = initial ?? (mode === 'edit' && activeTab ? activeTab.url : '')
  const [query, setQuery] = useState(startValue)
  const [touched, setTouched] = useState(false)
  const [index, setIndex] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [archive, setArchive] = useState<ArchivedTab[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const q = touched ? query : mode === 'edit' ? '' : query
  const dq = useDebounced(q, 70)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  useEffect(() => {
    void window.gravity.archive.get().then(setArchive)
  }, [])

  useEffect(() => {
    let live = true
    const p = dq.trim() ? window.gravity.history.search(dq, 8) : window.gravity.history.recent(6)
    void p.then((h) => live && setHistory(h))
    return () => {
      live = false
    }
  }, [dq])

  useEffect(() => {
    let live = true
    const text = dq.trim()
    const looksUrl = parseInput(text, engine).kind === 'url'
    if (!text || looksUrl || !suggestOn || space?.private || mode === 'pin') {
      setSuggestions([])
      return
    }
    void window.gravity.suggest(text, engine).then((s) => live && setSuggestions(s))
    return () => {
      live = false
    }
  }, [dq, engine, suggestOn, space?.private, mode])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    const text = q.trim()
    const B = useBrowser.getState()
    const openMode = (mod: Modifier): OpenMode | 'replace' =>
      mod !== 'enter' ? MOD_MODE[mod] : mode === 'edit' ? 'replace' : mode === 'split' ? 'split' : 'foreground'
    const go = (url: string) => (mod: Modifier) => {
      const m = openMode(mod)
      if (m === 'replace') submitInput(url, 'replace')
      else openUrl(url, m)
    }

    if (mode === 'pin') return pinItems(text, history, favorites, engine)

    const calc = calculate(text)
    if (calc !== null) {
      const value = formatNumber(calc)
      out.push({
        id: 'calc',
        group: 'Calculator',
        title: `= ${value}`,
        subtitle: 'Press Enter to copy',
        icon: <Calculator size={16} />,
        run: () => {
          window.gravity.copy(String(calc))
          useUI.getState().toast(`Copied ${value}`, 'copy')
        }
      })
    }

    if (text) {
      const parsed = parseInput(text, engine)
      out.push(
        parsed.kind === 'url'
          ? { id: 'go', group: 'Go', title: prettyUrl(parsed.url), subtitle: mode === 'edit' ? 'Open here' : 'Open in new tab', icon: <Globe size={16} />, run: go(parsed.url) }
          : {
              id: 'go',
              group: 'Go',
              title: text,
              subtitle: `Search ${SEARCH_ENGINES[engine].name}`,
              icon: <Search size={16} />,
              run: go(parsed.url)
            }
      )
    } else if (mode === 'edit' && activeTab) {
      out.push({ id: 'go', group: 'Go', title: prettyUrl(activeTab.url), subtitle: 'Reload', icon: <Globe size={16} />, run: () => page.reload(activeTab.id) })
    }

    // Open tabs, from every space.
    const allTabs = Object.values(B.tabs).filter((t) => !t.peek && t.id !== activeTab?.id)
    const tabMatches = text ? rankItems(text, allTabs, (t) => (t.spaceId === B.activeSpaceId ? 8 : 0), 4) : []
    for (const t of tabMatches) {
      const sp = B.spaces.find((s) => s.id === t.spaceId)
      out.push({
        id: `tab-${t.id}`,
        group: 'Switch to Tab',
        title: t.title || t.url,
        subtitle: `${sp?.emoji ?? ''} ${prettyUrl(t.url)}`,
        icon: <Favicon src={t.favicon} url={t.url} size={16} />,
        hint: 'Switch',
        run: () => useBrowser.getState().activateTab(t.id)
      })
    }
    const seen = new Set(tabMatches.map((t) => t.url))

    for (const f of text ? rankItems(text, favorites, () => 20, 3) : []) {
      if (seen.has(f.url)) continue
      seen.add(f.url)
      out.push({ id: `fav-${f.id}`, group: 'Favorites', title: f.title || f.url, subtitle: prettyUrl(f.url), icon: <Star size={15} />, run: go(f.url) })
    }

    for (const h of history) {
      if (seen.has(h.url) || out.length > 14) continue
      seen.add(h.url)
      out.push({
        id: `h-${h.url}`,
        group: text ? 'History' : 'Recently Visited',
        title: h.title || h.url,
        subtitle: prettyUrl(h.url),
        icon: h.favicon ? <Favicon src={h.favicon} url={h.url} size={16} /> : <Clock size={15} />,
        run: go(h.url)
      })
    }

    for (const s of suggestions.slice(0, 4)) {
      if (s.toLowerCase() === text.toLowerCase()) continue
      out.push({ id: `s-${s}`, group: 'Suggestions', title: s, icon: <Search size={15} />, run: go(searchUrl(s, engine)) })
    }

    if (text) {
      for (const a of rankItems(text, archive, () => 0, 2)) {
        if (seen.has(a.url)) continue
        out.push({ id: `a-${a.url}`, group: 'Archive', title: a.title || a.url, subtitle: prettyUrl(a.url), icon: <Archive size={15} />, run: go(a.url) })
      }
    }

    const commands = getCommands()
    const cmdMatches = text
      ? commands
          .map((c) => ({ c, s: Math.max(fuzzyScore(text, c.title), fuzzyScore(text, c.keywords ?? '') * 0.8) }))
          .filter((x) => x.s > 30)
          .sort((a, b) => b.s - a.s)
          .slice(0, 4)
          .map((x) => x.c)
      : mode === 'edit'
        ? []
        : commands.slice(0, 4)
    for (const c of cmdMatches) {
      out.push({ id: `c-${c.id}`, group: 'Commands', title: c.title, icon: c.icon, hint: c.hint, run: () => c.run() })
    }
    return out
  }, [q, engine, mode, activeTab, history, suggestions, archive, favorites])

  useEffect(() => setIndex(0), [q])
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const run = (i: number, mod: Modifier) => {
    const item = items[i]
    if (!item) return
    close()
    item.run(mod)
  }

  let lastGroup = ''
  return (
    <motion.div
      layoutId="omnibox"
      transition={spring.morph}
      className="glass-strong pointer-events-auto w-[min(640px,90vw)] overflow-hidden"
      style={{ borderRadius: 12 }}
      data-testid="command-bar"
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14, delay: 0.04 }}>
        <div className="flex items-center gap-3 px-4 py-3.5">
          {mode === 'pin' ? <Star size={16} className="shrink-0 text-faint" /> : <Search size={16} className="shrink-0 text-faint" />}
          <input
            ref={inputRef}
            value={query}
            spellCheck={false}
            placeholder={
              mode === 'split' ? 'Open beside this page…' : mode === 'pin' ? 'Add a favorite: type an address, or find a tab or a page you visited' : 'Search, enter a URL, or type a command'
            }
            onChange={(e) => {
              setTouched(true)
              setQuery(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(items.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(index, mode === 'pin' ? 'enter' : e.metaKey ? 'cmd' : e.shiftKey ? 'shift' : e.altKey ? 'alt' : 'enter')
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              } else if (e.key === 'Tab') {
                e.preventDefault()
                const item = items[index]
                if (item && item.group !== 'Commands') {
                  setTouched(true)
                  setQuery(item.subtitle && /\./.test(item.subtitle) && item.group !== 'Suggestions' ? item.subtitle.replace(/^\S+\s/, '') : item.title)
                }
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-faint"
            data-testid="command-input"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="h-px bg-hairline" />
        <div ref={listRef} className="scroll-thin max-h-[min(420px,56vh)] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-faint">
              {mode === 'pin' ? 'Type an address, or part of a page’s name' : 'Type to search the web, your tabs and history'}
            </div>
          )}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            const selected = i === index
            return (
              <div key={item.id}>
                {header && <div className="label px-2.5 pt-3 pb-1.5">{header}</div>}
                <motion.div
                  data-index={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.14, delay: touched ? 0 : Math.min(i * 0.015, 0.12) }}
                  onMouseMove={() => index !== i && setIndex(i)}
                  onClick={(e) => run(i, mode === 'pin' ? 'enter' : e.metaKey ? 'cmd' : e.shiftKey ? 'shift' : e.altKey ? 'alt' : 'enter')}
                  className="relative flex h-9 items-center gap-3 rounded-[7px] px-2.5"
                  data-testid="command-item"
                >
                  {selected && (
                    <motion.div layoutId="command-highlight" transition={spring.snappy} className="absolute inset-0 rounded-[7px] bg-active">
                      <span className="absolute top-1/2 left-0 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
                    </motion.div>
                  )}
                  <span className={cn('relative flex h-5 w-5 shrink-0 items-center justify-center [&_svg]:h-[14px] [&_svg]:w-[14px]', selected ? 'text-text' : 'text-faint')}>
                    {item.icon}
                  </span>
                  <span className="relative flex min-w-0 flex-1 items-baseline gap-2">
                    <span className={cn('truncate', item.id === 'calc' ? 'font-mono text-[15px] text-text' : 'text-[13px] text-text')}>{item.title}</span>
                    {item.subtitle && <span className="shrink truncate font-mono text-[10.5px] text-faint">{item.subtitle}</span>}
                  </span>
                  {selected ? (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative flex items-center gap-1.5 font-mono text-[10.5px] text-faint">
                      {item.hint && item.group === 'Commands' ? <Kbd>{item.hint.split('').join(' ')}</Kbd> : item.hint}
                      <ArrowRight size={13} />
                    </motion.span>
                  ) : item.hint && item.group === 'Commands' ? (
                    <Kbd className="relative opacity-60">{item.hint.split('').join(' ')}</Kbd>
                  ) : item.group === 'Switch to Tab' ? (
                    <AppWindow size={13} className="relative text-faint" />
                  ) : null}
                </motion.div>
              </div>
            )
          })}
        </div>
        {mode === 'pin' ? (
          <div className="flex items-center gap-4 border-t border-hairline px-4 py-2 font-mono text-[10.5px] text-faint">
            <span className="flex items-center gap-1.5">
              <Kbd>↩</Kbd> add to favorites
            </span>
            <span className="ml-auto tracking-wider uppercase tabular-nums">
              {String(favorites.length).padStart(2, '0')} / {MAX_FAVORITES}
            </span>
          </div>
        ) : (
        <div className="flex items-center gap-4 border-t border-hairline px-4 py-2 font-mono text-[10.5px] text-faint">
          <span className="flex items-center gap-1.5">
            <Kbd>↩</Kbd> open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>⌘ ↩</Kbd> background
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>⇧ ↩</Kbd> peek
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>⌥ ↩</Kbd> split
          </span>
          <span className="ml-auto truncate uppercase tracking-wider">{space?.name ?? ''}</span>
        </div>
        )}
      </motion.div>
    </motion.div>
  )
}

/**
 * Choosing a page for Favorites: an address typed in, a tab that's open (this
 * space's first) or a page from history. Nothing here opens anything.
 */
function pinItems(text: string, history: HistoryEntry[], favorites: Favorite[], engine: SearchEngineId): Item[] {
  const out: Item[] = []
  const B = useBrowser.getState()
  const kept = (url: string) => !!findFavorite(favorites, url)
  const pin = (p: { url: string; title?: string; favicon?: string }) => () => void addToFavorites(p)
  const seen = new Set<string>()

  const parsed = text ? parseInput(text, engine) : null
  if (parsed?.kind === 'url') {
    seen.add(favoriteKey(parsed.url))
    out.push({
      id: 'go',
      group: 'Address',
      title: prettyUrl(parsed.url),
      subtitle: kept(parsed.url) ? 'Already a favorite' : undefined,
      icon: <Globe size={16} />,
      run: pin({ url: parsed.url })
    })
  }

  const web = Object.values(B.tabs).filter((t) => !t.peek && /^https?:/.test(t.url) && !kept(t.url))
  const tabs = text
    ? rankItems(text, web, (t) => (t.spaceId === B.activeSpaceId ? 8 : 0), 4)
    : web
        .filter((t) => t.spaceId === B.activeSpaceId)
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
        .slice(0, 5)
  for (const t of tabs) {
    if (seen.has(favoriteKey(t.url))) continue
    seen.add(favoriteKey(t.url))
    out.push({
      id: `tab-${t.id}`,
      group: 'Open Tabs',
      title: t.title || t.url,
      subtitle: prettyUrl(t.url),
      icon: <Favicon src={t.favicon} url={t.url} size={16} />,
      run: pin(t)
    })
  }

  for (const h of history) {
    if (out.length >= 12 || seen.has(favoriteKey(h.url)) || kept(h.url) || !/^https?:/.test(h.url)) continue
    seen.add(favoriteKey(h.url))
    out.push({
      id: `h-${h.url}`,
      group: text ? 'History' : 'Recently Visited',
      title: h.title || h.url,
      subtitle: prettyUrl(h.url),
      icon: h.favicon ? <Favicon src={h.favicon} url={h.url} size={16} /> : <Clock size={15} />,
      run: pin(h)
    })
  }
  return out
}

export function CommandBar() {
  const open = useUI((s) => s.command.open)
  const mode = useUI((s) => s.command.mode)
  const close = useUI((s) => s.closeCommand)
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="command" className="fixed inset-0 z-[70] flex justify-center pt-[14vh]" initial="hidden" animate="visible" exit="hidden">
          <motion.div
            className="absolute inset-0"
            style={{ background: 'var(--scrim)' }}
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: 0.16 }}
            onMouseDown={close}
          />
          <div className="pointer-events-none relative">
            {/* A new mode (a command can switch to `pin`) starts with a clean field. */}
            <Panel key={mode} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
