// Downloads the Tor Project's official tor builds for macOS and keeps only what
// Gravity's Tunnel needs: the tor binary, its libevent library, the GeoIP files,
// lyrebird and the built-in bridge lines (for Snowflake), and the licences. Each archive must match a pinned SHA-256 before anything is extracted.
//
//   node scripts/fetch-tor.mjs          both architectures
//   node scripts/fetch-tor.mjs arm64    only one (arm64 or x64)
//
// Output: resources/tor/<arch>/ (git-ignored), packaged by electron-builder.
// To update, change VERSION and the hashes from
// https://dist.torproject.org/torbrowser/<VERSION>/sha256sums-signed-build.txt
//
// Where torproject.org is blocked, the download falls back to an official
// mirror. The pinned hash means a mirror can only ever deliver the same file.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '16.0.1'
const SOURCES = ['https://dist.torproject.org/torbrowser', 'https://ftp.acc.umu.se/mirror/torproject.org/dist/torbrowser']
const BUNDLES = {
  arm64: { name: 'aarch64', sha256: '0b7d022017c31e3f972d06465bcd7ac50feb66ac825547419a934914fe4bb156' },
  x64: { name: 'x86_64', sha256: '15464d99adc3bb4de1308260d79878336b04a1ac1aeff83e10f192de7d235946' }
}

const root = fileURLToPath(new URL('..', import.meta.url))
const only = process.argv[2]
if (only && !(only in BUNDLES)) {
  console.error(`Unknown architecture "${only}". Use arm64 or x64.`)
  process.exit(1)
}

/** Tries each source in turn and returns the first copy whose SHA-256 matches. */
async function download(file, sha256) {
  const problems = []
  for (const base of SOURCES) {
    const url = `${base}/${VERSION}/${file}`
    try {
      console.log(`Downloading ${url}`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const archive = Buffer.from(await res.arrayBuffer())
      const hash = createHash('sha256').update(archive).digest('hex')
      if (hash !== sha256) throw new Error(`SHA-256 mismatch (expected ${sha256}, got ${hash})`)
      return archive
    } catch (err) {
      const why = err.cause?.code ?? err.message
      console.warn(`  could not use it: ${why}`)
      problems.push(`${url}: ${why}`)
    }
  }
  throw new Error(`${file}: no source worked\n  ${problems.join('\n  ')}`)
}

for (const [arch, bundle] of Object.entries(BUNDLES)) {
  if (only && only !== arch) continue
  const dest = join(root, 'resources', 'tor', arch)
  const stamp = join(dest, 'VERSION')
  if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === VERSION && existsSync(join(dest, 'lyrebird'))) {
    console.log(`tor ${VERSION} (${arch}) is already in place`)
    continue
  }

  const file = `tor-expert-bundle-macos-${bundle.name}-${VERSION}.tar.gz`
  const archive = await download(file, bundle.sha256)

  const tmp = mkdtempSync(join(tmpdir(), 'gravity-tor-'))
  try {
    const tarball = join(tmp, file)
    const extracted = join(tmp, 'x')
    writeFileSync(tarball, archive)
    mkdirSync(extracted)
    execFileSync('tar', ['-xzf', tarball, '-C', extracted])

    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    const torDir = join(extracted, 'tor')
    copyFileSync(join(torDir, 'tor'), join(dest, 'tor'))
    chmodSync(join(dest, 'tor'), 0o755)
    for (const lib of readdirSync(torDir).filter((f) => f.endsWith('.dylib'))) copyFileSync(join(torDir, lib), join(dest, lib))
    for (const geo of ['geoip', 'geoip6']) copyFileSync(join(extracted, 'data', geo), join(dest, geo))
    for (const pt of ['lyrebird', 'pt_config.json']) copyFileSync(join(torDir, 'pluggable_transports', pt), join(dest, pt))
    chmodSync(join(dest, 'lyrebird'), 0o755)
    // tor (GPL-3.0 as built by the Tor Project), lyrebird, libevent and OpenSSL licences ship with the binaries.
    mkdirSync(join(dest, 'licenses'))
    for (const doc of ['tor.txt', 'lyrebird.txt', 'libevent.txt', 'openssl.txt']) copyFileSync(join(extracted, 'docs', doc), join(dest, 'licenses', doc))
    // The upstream binaries carry a stale ad-hoc signature, which Apple silicon
    // refuses to run. Re-sign ad-hoc; a signed Gravity build re-signs them again.
    const libs = readdirSync(dest).filter((f) => f.endsWith('.dylib')).map((f) => join(dest, f))
    execFileSync('codesign', ['--force', '--sign', '-', ...libs, join(dest, 'tor'), join(dest, 'lyrebird')], { stdio: 'ignore' })
    writeFileSync(stamp, `${VERSION}\n`)
    console.log(`tor ${VERSION} (${arch}) → resources/tor/${arch}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
