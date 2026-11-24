import { app, powerMonitor, session, webContents, type Session, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { connect as connectSocket, createServer, type AddressInfo, type Server } from 'node:net'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { IPC } from '@shared/ipc'
import { bridgeArgs, bypassRules, networkIdentity, parseTorLog, transportPlan, TUNNEL_PARTITIONS, tunneledPartitions } from '@shared/tunnel'
import type { TunnelBridge, TunnelMode, TunnelStatus, TunnelTransport } from '@shared/types'
import { TOR_DIR } from './paths'
import { JsonStore } from './store'

/**
 * The Tunnel: a bundled tor process acting as a local SOCKS5 proxy, and the
 * sessions pointed at it. There is no server of Gravity's own; traffic leaves
 * through the Tor network.
 *
 * - Each partition gets its own SOCKS port, and tor never puts streams from
 *   different ports on the same circuit, so normal, private and Gravity's own
 *   requests can't be linked by their exit.
 * - SOCKS5 makes Chromium resolve host names at the exit, so DNS doesn't leak.
 * - Sessions are pointed at tor before it's ready and never fall back to a
 *   direct connection: if tor is down, pages fail to load instead of leaking.
 * - Networks differ in what they block, so tor tries transports in turn
 *   (direct, Snowflake, meek), moving on when one stops making progress. What
 *   worked is remembered per network and tried first next time. Changing the
 *   Bridge setting checks again from the start.
 * - When the Mac moves to another network, tor reconnects with what suits it.
 * - Some sites block or drop Tor exits. The UI can ask for new circuits (a new
 *   exit) through tor's control port, and sites the user chooses to open
 *   without the Tunnel bypass it in normal spaces; private spaces never do.
 */

const PARTITIONS = Object.values(TUNNEL_PARTITIONS)
const MAX_RESTARTS = 3
/** How long each transport may go without bootstrap progress before the next is tried. */
const STALL_MS: Record<TunnelTransport, number> = { direct: 20_000, snowflake: 45_000, meek: 60_000 }
/**
 * From 25% on, tor is talking to the Tor network through this transport and
 * downloading its directory, which can take minutes over a slow bridge with
 * few progress lines. Blocking shows up before that, so allow much longer.
 */
const THROUGH_PROGRESS = 25
const THROUGH_STALL_MS = 120_000
const NETWORK_POLL_MS = 4_000
const REMEMBERED_NETWORKS = 30

export interface TunnelConfig {
  mode: TunnelMode
  bridge: TunnelBridge
  /** Sites that skip the Tunnel in normal spaces. */
  bypass: string[]
}

/** The transport that last worked on each network, keyed by its subnets. */
const memory = new JsonStore<{ networks?: Record<string, TunnelTransport> }>('tunnel', () => ({ networks: {} }))

let mode: TunnelMode = 'off'
let bridgeSetting: TunnelBridge = 'auto'
let bypass: string[] = []
let transport: TunnelTransport = 'direct'
/** Transports still to try on this network, in order. */
let plan: TunnelTransport[] = []
/** Why the current attempt is happening, shown until tor connects. */
let note: string | undefined
let network = { id: '', key: '' }
let status: TunnelStatus = { state: 'off', progress: 0 }
let host: WebContents | null = null
let tor: ChildProcess | null = null
let ports: Record<string, number> | null = null
let restarts = 0
let restartTimer: NodeJS.Timeout | null = null
let stallTimer: NodeJS.Timeout | null = null
let networkTimer: NodeJS.Timeout | null = null
let queue: Promise<void> = Promise.resolve()

function sessionOf(partition: string): Session {
  return partition ? session.fromPartition(partition) : session.defaultSession
}

function emit(next: TunnelStatus): void {
  status = next.state === 'off' ? next : { ...next, transport }
  if (host && !host.isDestroyed()) host.send(IPC.tunnelStatus, status)
}

export function setTunnelHost(wc: WebContents): void {
  host = wc
}

export function getTunnelStatus(): TunnelStatus {
  return status
}

/** True while Gravity's own requests go through Tor (they're slower, so callers wait longer). */
export function appTunneled(): boolean {
  return mode !== 'off'
}

/** Runs tunnel work in order, after anything already queued. */
function enqueue(work: () => Promise<void>): Promise<void> {
  queue = queue.then(work).catch((err) => {
    console.warn('[tunnel]', err)
    emit({ state: 'error', progress: 0, message: 'The Tunnel could not be set up.' })
  })
  return queue
}

/** Reserves one free loopback port per partition and one for tor's control port, holding them all open so none repeats. */
async function allocatePorts(): Promise<Record<string, number>> {
  const servers: Server[] = []
  try {
    const out: Record<string, number> = {}
    for (const p of [...PARTITIONS, 'control']) {
      const srv = createServer()
      servers.push(srv)
      await new Promise<void>((resolve, reject) => {
        srv.once('error', reject)
        srv.listen(0, '127.0.0.1', resolve)
      })
      out[p] = (srv.address() as AddressInfo).port
    }
    return out
  } finally {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))))
  }
}

/** WebRTC can reveal the real IP over UDP, which Tor doesn't carry; keep it to the proxy. */
function applyWebRtcPolicy(wc: WebContents): void {
  if (wc.isDestroyed()) return
  const tunneled = tunneledPartitions(mode).some((p) => sessionOf(p) === wc.session)
  wc.setWebRTCIPHandlingPolicy(tunneled ? 'disable_non_proxied_udp' : 'default')
}

async function applyProxies(): Promise<void> {
  const covered = new Set(tunneledPartitions(mode))
  const skip = bypassRules(bypass)
  await Promise.all(
    PARTITIONS.map(async (p) => {
      const ses = sessionOf(p)
      const port = ports && covered.has(p) ? ports[p] : null
      // Private spaces never bypass: the list is for sites that don't work over Tor in normal browsing.
      const proxyBypassRules = p === TUNNEL_PARTITIONS.private ? '' : skip
      await ses.setProxy(port ? { mode: 'fixed_servers', proxyRules: `socks5://127.0.0.1:${port}`, proxyBypassRules } : { mode: 'system' })
      // Drop sockets opened under the previous route so nothing reuses them.
      await ses.closeAllConnections()
    })
  )
  for (const wc of webContents.getAllWebContents()) applyWebRtcPolicy(wc)
}

/** tor's arguments for a transport, or null if this build can't do it. */
function argsFor(t: TunnelTransport): string[] | null {
  if (t === 'direct') return []
  if (!existsSync(join(TOR_DIR, 'lyrebird'))) return null
  try {
    return bridgeArgs(JSON.parse(readFileSync(join(TOR_DIR, 'pt_config.json'), 'utf8')), t)
  } catch {
    return null
  }
}

function currentNetwork(): { id: string; key: string } {
  return networkIdentity(networkInterfaces())
}

function remember(t: TunnelTransport): void {
  const key = network.key
  if (!key || bridgeSetting === 'never') return
  memory.update((m) => {
    const networks = { ...(m.networks ?? {}) }
    delete networks[key] // re-insert so the most recent networks are kept
    networks[key] = t
    const keys = Object.keys(networks)
    for (const k of keys.slice(0, Math.max(0, keys.length - REMEMBERED_NETWORKS))) delete networks[k]
    return { networks }
  })
}

const VIA: Record<TunnelTransport, string> = { direct: 'Tor directly', snowflake: 'a Snowflake bridge', meek: 'a meek bridge' }

function switchNote(from: TunnelTransport, to: TunnelTransport): string {
  const why = from === 'direct' ? 'Tor seems blocked here.' : `${from === 'snowflake' ? 'Snowflake' : 'meek'} isn’t getting through.`
  return `${why} Trying ${VIA[to]}.`
}

function clearStall(): void {
  if (stallTimer) clearTimeout(stallTimer)
  stallTimer = null
}

/** A bootstrap that stops moving early means this transport is probably blocked here. */
function armStall(progress: number): void {
  clearStall()
  if (!tor) return
  const ms = progress >= THROUGH_PROGRESS ? THROUGH_STALL_MS : STALL_MS[transport]
  stallTimer = setTimeout(() => {
    stallTimer = null
    if (status.state !== 'on' && mode !== 'off') void enqueue(nextTransport)
  }, ms)
}

async function nextTransport(): Promise<void> {
  if (status.state === 'on' || mode === 'off') return
  const next = plan.shift()
  if (!next) {
    const message =
      bridgeSetting === 'never'
        ? 'Can’t reach the Tor network. It may be blocked here; Bridge set to Auto can get around that.'
        : 'Can’t reach Tor on this network, even through bridges.'
    emit({ state: 'connecting', progress: status.progress, message })
    return
  }
  note = switchNote(transport, next)
  await stopTor()
  transport = next
  emit({ state: 'connecting', progress: 0, message: note })
  startTor()
}

/** (Re)connects on the current network, trying what worked here before first. */
async function connect(useMemory: boolean, why?: string): Promise<void> {
  await stopTor()
  network = currentNetwork()
  const known = useMemory && network.key ? memory.get().networks?.[network.key] : undefined
  plan = transportPlan(bridgeSetting, known, (t) => argsFor(t) !== null)
  const first = plan.shift()
  if (!first) {
    const message = app.isPackaged ? 'Bridges are missing from this copy of Gravity.' : 'Bridges aren’t downloaded yet. Run npm run tor.'
    emit({ state: 'error', progress: 0, message })
    return
  }
  transport = first
  note = why
  emit({ state: 'connecting', progress: 0, message: note })
  startTor()
}

function onLog(line: string): void {
  const ev = parseTorLog(line)
  if (!ev) return
  if (ev.kind === 'progress') {
    if (ev.progress >= 100) {
      clearStall()
      restarts = 0
      note = undefined
      remember(transport)
      emit({ state: 'on', progress: 100 })
    } else if (status.state !== 'on') {
      armStall(ev.progress)
      emit({ state: 'connecting', progress: ev.progress, message: note })
    }
  } else if (ev.kind === 'stuck') {
    // Single failures are normal (an IPv6 relay on an IPv4 network); while other
    // transports remain, the stall timer decides when to move on.
    if (status.state === 'on' || plan.length) return
    emit({ state: 'connecting', progress: ev.progress, message: 'Having trouble reaching Tor on this network.' })
  } else {
    console.warn('[tunnel]', ev.message)
    emit({ state: 'error', progress: status.progress, message: ev.message })
  }
}

function startTor(): void {
  if (tor || !ports) return
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = null
  const bin = join(TOR_DIR, 'tor')
  if (!existsSync(bin)) {
    const message = app.isPackaged ? 'Tor is missing from this copy of Gravity.' : 'Tor isn’t downloaded yet. Run npm run tor.'
    emit({ state: 'error', progress: 0, message })
    return
  }
  const extra = argsFor(transport)
  if (!extra) {
    emit({ state: 'error', progress: 0, message: 'This bridge is missing from this copy of Gravity.' })
    return
  }
  const dataDir = torDataDir()
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })

  // No torrc: everything is set here, so a system-wide tor config can't change it.
  const args = ['--defaults-torrc', '/dev/null', '-f', '/dev/null', '--ignore-missing-torrc']
  for (const p of PARTITIONS) args.push('--SocksPort', `127.0.0.1:${ports[p]}`)
  args.push(
    '--DataDirectory', dataDir,
    // Only Gravity can use the control port: it needs the cookie tor writes into the data directory.
    '--ControlPort', `127.0.0.1:${ports.control}`,
    '--CookieAuthentication', '1',
    '--ClientOnly', '1',
    '--AvoidDiskWrites', '1',
    '--GeoIPFile', join(TOR_DIR, 'geoip'),
    '--GeoIPv6File', join(TOR_DIR, 'geoip6'),
    // tor exits on its own if Gravity goes away without stopping it.
    '--__OwningControllerProcess', String(process.pid),
    '--Log', 'notice stdout',
    ...extra
  )

  if (status.state !== 'connecting') emit({ state: 'connecting', progress: 0, message: note })
  // cwd is the tor folder: bridge plugin paths are relative, so app paths with spaces still work.
  const child = spawn(bin, args, { cwd: TOR_DIR, stdio: ['ignore', 'pipe', 'ignore'] })
  tor = child
  armStall(0)
  if (child.stdout) createInterface({ input: child.stdout }).on('line', onLog)
  child.on('error', (err) => {
    console.warn('[tunnel] could not start tor', err)
    if (tor === child) tor = null
    clearStall()
    emit({ state: 'error', progress: 0, message: 'Tor could not start.' })
  })
  child.on('exit', () => {
    if (tor !== child) return // stopped on purpose
    tor = null
    clearStall()
    if (mode === 'off') return
    if (restarts >= MAX_RESTARTS) {
      emit({ state: 'error', progress: 0, message: status.state === 'error' ? status.message : 'Tor stopped unexpectedly.' })
      return
    }
    restarts++
    emit({ state: 'connecting', progress: 0, message: 'Restarting Tor' })
    restartTimer = setTimeout(() => {
      restartTimer = null
      if (mode !== 'off') startTor()
    }, 2000)
  })
}

function torDataDir(): string {
  return join(app.getPath('userData'), 'tor')
}

/**
 * Asks tor for new circuits, so the next connections leave from a different
 * exit. Used when a site fails over Tor: many sites block only some exits.
 */
export async function newCircuit(): Promise<boolean> {
  if (!tor || !ports || status.state !== 'on') return false
  let cookie: Buffer
  try {
    cookie = await readFile(join(torDataDir(), 'control_auth_cookie'))
  } catch {
    return false
  }
  const port = ports.control
  return new Promise((resolve) => {
    let reply = ''
    const sock = connectSocket(port, '127.0.0.1')
    const done = (ok: boolean) => {
      sock.destroy()
      resolve(ok)
    }
    sock.setTimeout(5000, () => done(false))
    sock.on('error', () => done(false))
    sock.on('data', (d) => (reply += d.toString()))
    // AUTHENTICATE and SIGNAL each answer "250 OK"; QUIT answers "250 closing connection".
    sock.on('end', () => done((reply.match(/^250 OK\r?$/gm) ?? []).length >= 2))
    sock.write(`AUTHENTICATE ${cookie.toString('hex')}\r\nSIGNAL NEWNYM\r\nQUIT\r\n`)
  })
}

/** Stops tor and resolves once it has exited, so a new one can take its ports. */
function stopTor(): Promise<void> {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = null
  clearStall()
  restarts = 0
  const child = tor
  tor = null
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const force = setTimeout(() => child.kill('SIGKILL'), 3000)
    child.once('exit', () => {
      clearTimeout(force)
      resolve()
    })
    child.kill()
  })
}

/** Reconnects when the Mac's addresses change: a new network may block different things. */
function checkNetwork(): void {
  if (mode === 'off') return
  const now = currentNetwork()
  if (!now.id || now.id === network.id) return // offline, or the same network
  void enqueue(() => connect(true, 'Your network changed. Reconnecting.'))
}

function watchNetwork(on: boolean): void {
  if (on && !networkTimer) networkTimer = setInterval(checkNetwork, NETWORK_POLL_MS)
  if (!on && networkTimer) {
    clearInterval(networkTimer)
    networkTimer = null
  }
}

async function apply(next: TunnelConfig): Promise<void> {
  const bridgeChanged = next.bridge !== bridgeSetting
  mode = next.mode
  bridgeSetting = next.bridge
  bypass = next.bypass
  if (mode === 'off') {
    watchNetwork(false)
    await stopTor()
    await applyProxies()
    emit({ state: 'off', progress: 0 })
    return
  }
  ports ??= await allocatePorts()
  // Point the sessions at tor first: until it's ready, pages wait or fail rather than go out directly.
  await applyProxies()
  watchNetwork(true)
  if (!tor) await connect(true)
  else if (bridgeChanged) await connect(false) // the user asked for something else: check again from the start
}

/** Applies the Tunnel settings. Calls run in order. */
export function setTunnel(next: TunnelConfig): Promise<void> {
  return enqueue(() => apply(next))
}

/** Call once when the app is ready, before any page loads. */
export function initTunnel(): void {
  app.on('web-contents-created', (_e, wc) => applyWebRtcPolicy(wc))
  app.on('will-quit', () => {
    watchNetwork(false)
    void stopTor()
  })
  // Waking up is when the network most often changes; don't wait for the next poll.
  powerMonitor.on('resume', () => setTimeout(checkNetwork, 1500))
}
