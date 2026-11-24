import type { TunnelBridge, TunnelMode, TunnelTransport } from './types'

/**
 * The sessions the Tunnel can route through Tor. `app` is Electron's default
 * session: Gravity's own requests (suggestions, favicon colours, Shield lists)
 * and the favicons the sidebar shows.
 */
export const TUNNEL_PARTITIONS = { normal: 'persist:gravity', private: 'gravity-private', app: '' } as const

/** Which partitions go through Tor in each mode. Gravity's own requests always do when it's on. */
export function tunneledPartitions(mode: TunnelMode): string[] {
  const { normal, private: priv, app } = TUNNEL_PARTITIONS
  if (mode === 'all') return [normal, priv, app]
  if (mode === 'private') return [priv, app]
  return []
}

export type TorLogEvent =
  | { kind: 'progress'; progress: number; summary: string }
  | { kind: 'stuck'; progress: number; summary: string; reason?: string }
  | { kind: 'error'; message: string }

/** Reads the lines of tor's notice log that matter to the UI. */
export function parseTorLog(line: string): TorLogEvent | null {
  let m = /\[notice\] Bootstrapped (\d+)% \([^)]*\): (.+)$/.exec(line)
  if (m) return { kind: 'progress', progress: Number(m[1]), summary: m[2].trim() }
  m = /\[warn\] Problem bootstrapping\. Stuck at (\d+)% \([^)]*\): (.+?)\.(?: \(([^;)]+))?/.exec(line)
  if (m) return { kind: 'stuck', progress: Number(m[1]), summary: m[2].trim(), reason: m[3]?.trim() }
  m = /\[err\] (.+)$/.exec(line)
  if (m) return { kind: 'error', message: m[1].trim() }
  return null
}

/**
 * The order transports are tried in. Snowflake gets through most censorship
 * but needs UDP; meek looks like ordinary HTTPS to a CDN, so it works on
 * networks that allow little else, slowly. (Tor's public obfs4 bridges are
 * left out: where Tor is blocked, they usually are too, and meek covers the
 * networks they would.)
 */
export const TRANSPORT_ORDER: Record<TunnelBridge, TunnelTransport[]> = {
  auto: ['direct', 'snowflake', 'meek'],
  always: ['snowflake', 'meek'],
  never: ['direct']
}

/**
 * Load errors that can come from the route rather than the site: a Tor exit
 * the site blocks or drops, or tor not being ready yet. Worth another exit.
 */
const ROUTE_ERRORS = new Set([-2, -7, -15, -100, -101, -102, -104, -105, -109, -118, -120, -121, -130, -324, -337])

export function isRouteError(code: number): boolean {
  return ROUTE_ERRORS.has(code)
}

/** The site a URL belongs to, for the bypass list: its host without "www.". */
export function siteOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Chromium proxy bypass rules for the sites that skip the Tunnel (each site and its subdomains). */
export function bypassRules(sites: string[]): string {
  const clean = sites.map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s))
  return [...new Set(clean)].flatMap((s) => [s, `*.${s}`]).join(',')
}

/** How the UI names a transport: '' for direct, else the bridge. */
export function bridgeName(t: TunnelTransport | undefined): string {
  return t === 'snowflake' ? 'a Snowflake bridge' : t === 'meek' ? 'a meek bridge' : ''
}

/** Transports to try, starting with the one that last worked on this network. */
export function transportPlan(
  setting: TunnelBridge,
  known: TunnelTransport | undefined,
  available: (t: TunnelTransport) => boolean
): TunnelTransport[] {
  const order = TRANSPORT_ORDER[setting].filter(available)
  return known && order.includes(known) ? [known, ...order.filter((t) => t !== known)] : order
}

/**
 * Builds tor's arguments for a bridge transport from the Tor Project's
 * pt_config.json (shipped next to tor), so bridge lines update with tor
 * itself. The plugin path is relative to tor's working directory, which must
 * be the tor folder, and may not leave it.
 */
export function bridgeArgs(config: unknown, transport: Exclude<TunnelTransport, 'direct'>): string[] | null {
  const c = config as { pluggableTransports?: Record<string, unknown>; bridges?: Record<string, unknown> } | null
  const raw = c?.bridges?.[transport]
  if (!Array.isArray(raw)) return null
  const first = raw.find((b): b is string => typeof b === 'string')
  const method = first?.split(' ')[0] ?? '' // 'snowflake', 'meek_lite'
  if (!/^\w+$/.test(method) || !method.startsWith(transport)) return null // 'meek' → 'meek_lite'
  const lines = raw.filter((b): b is string => typeof b === 'string' && b.startsWith(`${method} `))
  for (const plugin of Object.values(c?.pluggableTransports ?? {})) {
    if (typeof plugin !== 'string') continue
    const m = /^ClientTransportPlugin ([\w,]+) exec \$\{pt_path\}([\w.-]+)$/.exec(plugin.trim())
    if (!m || !m[1].split(',').includes(method) || m[2].startsWith('.')) continue
    const args = ['--UseBridges', '1', '--ClientTransportPlugin', `${method} exec ./${m[2]}`]
    for (const line of lines) args.push('--Bridge', line)
    return args
  }
  return null
}

interface NetAddress {
  address: string
  netmask: string
  family: string | number
  internal: boolean
}

function ipv4Network(address: string, netmask: string): string {
  const a = address.split('.').map(Number)
  const m = netmask.split('.').map(Number)
  const bits = m.reduce((n, o) => n + (o >>> 0).toString(2).replace(/0/g, '').length, 0)
  return `${a.map((o, i) => o & (m[i] ?? 0)).join('.')}/${bits}`
}

function ipv6Prefix(address: string): string {
  const a = address.split('%')[0]
  const [head, tail] = a.includes('::') ? a.split('::') : [a, undefined]
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g || '0', 16).toString(16))
    .join(':')}::/64`
}

/**
 * Identifies the network the Mac is on, from its interface addresses.
 * `id` changes whenever an address does (a hint that the network changed);
 * `key` is the subnets, used to remember what worked on that network.
 * IPv6 counts only on IPv6-only networks, since its temporary addresses rotate.
 */
export function networkIdentity(ifaces: Record<string, NetAddress[] | undefined>): { id: string; key: string } {
  const v4: { name: string; address: string; net: string }[] = []
  const v6 = new Set<string>()
  for (const [name, list] of Object.entries(ifaces)) {
    for (const a of list ?? []) {
      if (a.internal) continue
      if (a.family === 4 || a.family === 'IPv4') {
        if (!a.address.startsWith('169.254.')) v4.push({ name, address: a.address, net: ipv4Network(a.address, a.netmask) })
      } else if (!/^fe80:/i.test(a.address)) {
        v6.add(`${name}:${ipv6Prefix(a.address)}`)
      }
    }
  }
  if (v4.length) {
    return {
      id: v4.map((x) => `${x.name}:${x.address}`).sort().join(' '),
      key: [...new Set(v4.map((x) => `${x.name}:${x.net}`))].sort().join(' ')
    }
  }
  const prefixes = [...v6].sort().join(' ')
  return { id: prefixes, key: prefixes }
}
