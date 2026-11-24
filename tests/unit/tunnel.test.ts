import { describe, expect, it } from 'vitest'
import { bridgeArgs, bypassRules, isRouteError, networkIdentity, parseTorLog, siteOf, transportPlan, TUNNEL_PARTITIONS, tunneledPartitions } from '@shared/tunnel'

describe('tunneledPartitions', () => {
  const { normal, private: priv, app } = TUNNEL_PARTITIONS

  it('routes nothing when off', () => {
    expect(tunneledPartitions('off')).toEqual([])
  })

  it('routes private spaces and Gravity’s own requests, not normal tabs', () => {
    expect(tunneledPartitions('private').sort()).toEqual([priv, app].sort())
    expect(tunneledPartitions('private')).not.toContain(normal)
  })

  it('routes everything when on for all tabs', () => {
    expect(tunneledPartitions('all').sort()).toEqual([normal, priv, app].sort())
  })
})

describe('parseTorLog', () => {
  it('reads bootstrap progress', () => {
    expect(parseTorLog('Nov 23 12:49:45.000 [notice] Bootstrapped 45% (requesting_descriptors): Asking for relay descriptors')).toEqual({
      kind: 'progress',
      progress: 45,
      summary: 'Asking for relay descriptors'
    })
    expect(parseTorLog('Nov 23 12:49:47.000 [notice] Bootstrapped 100% (done): Done')).toMatchObject({ kind: 'progress', progress: 100 })
  })

  it('notices when bootstrapping is stuck', () => {
    const line =
      'Nov 23 12:50:12.000 [warn] Problem bootstrapping. Stuck at 5% (conn): Connecting to a relay. (Connection refused; CONNECTREFUSED; count 10; recommendation warn; host ABC at 1.2.3.4:443)'
    expect(parseTorLog(line)).toEqual({ kind: 'stuck', progress: 5, summary: 'Connecting to a relay', reason: 'Connection refused' })
  })

  it('surfaces errors', () => {
    expect(parseTorLog('Nov 23 12:50:12.000 [err] Failed to bind one of the listener ports.')).toEqual({
      kind: 'error',
      message: 'Failed to bind one of the listener ports.'
    })
  })

  it('ignores everything else', () => {
    expect(parseTorLog('Nov 23 12:49:41.212 [notice] Opening Socks listener on 127.0.0.1:59101')).toBeNull()
    expect(parseTorLog('')).toBeNull()
  })
})

describe('bridgeArgs', () => {
  const snow = (ip: string) => `snowflake ${ip}:80 2B280B23E1107BB62ABFC40DDCC8824814F80A72 fingerprint=2B28 url=https://example.cdn/ fronts=a.example,b.example`
  const meek = 'meek_lite 192.0.2.20:80 url=https://example.cdn front=www.example.net utls=HelloRandomizedALPN'
  const config = {
    recommendedDefault: 'obfs4',
    pluggableTransports: {
      lyrebird: 'ClientTransportPlugin meek_lite,obfs2,obfs3,obfs4,scramblesuit,webtunnel exec ${pt_path}lyrebird',
      snowflake: 'ClientTransportPlugin snowflake exec ${pt_path}lyrebird'
    },
    bridges: { obfs4: ['obfs4 1.2.3.4:443 ABC cert=x iat-mode=0'], snowflake: [snow('192.0.2.3'), snow('192.0.2.4')], meek: [meek] }
  }

  it('turns the Tor Project’s pt_config into tor arguments, with a relative plugin path', () => {
    expect(bridgeArgs(config, 'snowflake')).toEqual([
      '--UseBridges', '1',
      '--ClientTransportPlugin', 'snowflake exec ./lyrebird',
      '--Bridge', snow('192.0.2.3'),
      '--Bridge', snow('192.0.2.4')
    ])
    expect(bridgeArgs(config, 'meek')).toEqual(['--UseBridges', '1', '--ClientTransportPlugin', 'meek_lite exec ./lyrebird', '--Bridge', meek])
  })

  it('refuses configs it does not understand', () => {
    expect(bridgeArgs(null, 'snowflake')).toBeNull()
    expect(bridgeArgs({}, 'meek')).toBeNull()
    expect(bridgeArgs({ ...config, bridges: { snowflake: [] } }, 'snowflake')).toBeNull()
    expect(bridgeArgs({ ...config, bridges: { snowflake: ['obfs4 1.2.3.4:443 X'] } }, 'snowflake')).toBeNull()
    // A plugin path that could point outside the tor folder is not used.
    expect(bridgeArgs({ ...config, pluggableTransports: { snowflake: 'ClientTransportPlugin snowflake exec ${pt_path}../../evil' } }, 'snowflake')).toBeNull()
    expect(bridgeArgs({ ...config, pluggableTransports: { snowflake: 'ClientTransportPlugin snowflake exec /bin/sh' } }, 'snowflake')).toBeNull()
  })
})

describe('transportPlan', () => {
  const all = () => true

  it('tries direct, then Snowflake, then meek', () => {
    expect(transportPlan('auto', undefined, all)).toEqual(['direct', 'snowflake', 'meek'])
    expect(transportPlan('always', undefined, all)).toEqual(['snowflake', 'meek'])
    expect(transportPlan('never', undefined, all)).toEqual(['direct'])
  })

  it('starts with what worked on this network, keeping the rest as fallbacks', () => {
    expect(transportPlan('auto', 'meek', all)).toEqual(['meek', 'direct', 'snowflake'])
    expect(transportPlan('always', 'snowflake', all)).toEqual(['snowflake', 'meek'])
    // A remembered transport the setting doesn't allow is ignored.
    expect(transportPlan('always', 'direct', all)).toEqual(['snowflake', 'meek'])
    expect(transportPlan('never', 'snowflake', all)).toEqual(['direct'])
  })

  it('skips transports this build can’t do', () => {
    expect(transportPlan('auto', 'snowflake', (t) => t === 'direct')).toEqual(['direct'])
    expect(transportPlan('always', undefined, (t) => t === 'direct')).toEqual([])
  })
})

describe('networkIdentity', () => {
  const v4 = (address: string, netmask: string) => ({ address, netmask, family: 'IPv4', internal: false })
  const v6 = (address: string) => ({ address, netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', internal: false })
  const lo = { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true }

  it('keys a network by its subnets and tells addresses apart', () => {
    const school = networkIdentity({ lo0: [lo], en0: [v4('10.34.105.17', '255.255.252.0'), v6('fe80::1%en0')] })
    expect(school.key).toBe('en0:10.34.104.0/22')
    expect(school.id).toBe('en0:10.34.105.17')
    const sameNetworkNewAddress = networkIdentity({ en0: [v4('10.34.106.2', '255.255.252.0')] })
    expect(sameNetworkNewAddress.key).toBe(school.key)
    expect(sameNetworkNewAddress.id).not.toBe(school.id)
  })

  it('ignores rotating IPv6 addresses when there is IPv4', () => {
    const a = networkIdentity({ en0: [v4('192.168.1.20', '255.255.255.0'), v6('2a02:1:2:3:aaaa::1')] })
    const b = networkIdentity({ en0: [v4('192.168.1.20', '255.255.255.0'), v6('2a02:1:2:3:bbbb::9')] })
    expect(a).toEqual(b)
  })

  it('uses IPv6 /64 prefixes on IPv6-only networks, and is empty offline', () => {
    const only6 = networkIdentity({ en0: [v6('2a02:1:2:3:aaaa::1'), v6('fe80::1%en0')] })
    expect(only6.key).toBe('en0:2a02:1:2:3::/64')
    expect(networkIdentity({ lo0: [lo], en0: [v6('fe80::1%en0')] })).toEqual({ id: '', key: '' })
  })
})

describe('sites that skip the Tunnel', () => {
  it('names a page’s site by its host, without www', () => {
    expect(siteOf('https://linkedu-app.org/dashboard')).toBe('linkedu-app.org')
    expect(siteOf('https://www.Example.com/a?b')).toBe('example.com')
    expect(siteOf('http://app.example.co.uk:8080/')).toBe('app.example.co.uk')
    expect(siteOf('file:///Users/me/a.html')).toBeNull()
    expect(siteOf('http://localhost:3000/')).toBeNull()
    expect(siteOf('not a url')).toBeNull()
  })

  it('turns the list into Chromium bypass rules for each site and its subdomains', () => {
    expect(bypassRules(['linkedu-app.org', 'example.com'])).toBe('linkedu-app.org,*.linkedu-app.org,example.com,*.example.com')
    expect(bypassRules([])).toBe('')
    // Duplicates and anything that isn't a plain host name are dropped.
    expect(bypassRules(['a.com', 'A.com', '*', 'a.com,evil.com', '<-loopback>', 'nodot'])).toBe('a.com,*.a.com')
  })

  it('treats connection failures as worth another exit, and other errors not', () => {
    for (const code of [-100, -101, -7, -118, -324, -337, -2]) expect(isRouteError(code)).toBe(true)
    for (const code of [-3, -106, -200, -202, -501]) expect(isRouteError(code)).toBe(false)
  })
})
