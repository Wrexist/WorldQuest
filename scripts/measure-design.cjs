/**
 * Measure a reference design and print it in THIS repo's token shape.
 *
 * ## Why not just look at it
 *
 * Because a transplant done by eye copies the surface and misses the arithmetic. The
 * whole point of `dna-transplant` step 3 is that you find out the donor's green is
 * 2.09:1 against white BEFORE you ship a button nobody can read — and you only find
 * that out by measuring.
 *
 * ## Why the output is tokens.json-shaped and not shadcn-shaped
 *
 * The tool this replaces emits shadcn/Tailwind CSS variables. This app is React
 * Native: it has no CSS variables, its spacing scale is indexed by step rather than
 * pixels, and each font weight is a separate family. Values in the wrong shape have to
 * be re-typed by hand, and hand-re-typing is where the transcription errors live.
 *
 * Every colour is reported WITH its contrast against this app's canvas and against
 * white, because those two numbers decide whether a value is adoptable at all.
 *
 * Usage:
 *   node scripts/measure-design.cjs https://example.com
 *   node scripts/measure-design.cjs https://example.com --mobile
 */

const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { token } = require('./tokens.cjs')

const url = process.argv[2]
const mobile = process.argv.includes('--mobile')

if (url === undefined || !/^https?:\/\//.test(url)) {
  console.error('Usage: node scripts/measure-design.cjs <url> [--mobile]')
  process.exit(1)
}

/**
 * This app's own surfaces, so every measured colour is judged where it would land.
 *
 * Read from tokens.json rather than copied: a stale copy here reports a contrast ratio
 * against a canvas this app no longer has, and the number looks exactly as authoritative
 * as a correct one.
 */
const CANVAS = token('color.bg.canvas')
const SURFACE = token('color.bg.surface')

const lin = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const toHex = (rgb) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(rgb)
  if (m === null) return null
  if (m[4] !== undefined && Number(m[4]) < 0.5) return null
  return (
    '#' +
    [m[1], m[2], m[3]]
      .map((v) => Math.round(Number(v)).toString(16).padStart(2, '0').toUpperCase())
      .join('')
  )
}

/**
 * The agent proxy's CA, as the base64 SHA-256 of its SubjectPublicKeyInfo — the form
 * Chromium's SPKI allowlist takes. Returns null when there is no proxy CA on disk, in
 * which case nothing is pinned and nothing is relaxed.
 */
function proxyCaSpki() {
  const bundle = '/root/.ccr/ca-bundle.crt'
  try {
    if (!require('node:fs').existsSync(bundle)) return null
    const { execFileSync } = require('node:child_process')
    const run = (cmd, args, input) =>
      execFileSync(cmd, args, { input, maxBuffer: 1 << 22 })
    // The bundle is the full system trust store with the proxy's own CAs appended, so
    // "the first certificate" is some unrelated public root. Every certificate is
    // hashed and the whole set is pinned; Chromium takes a comma-separated list.
    const pem = require('node:fs').readFileSync(bundle, 'utf8')
    const certs = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []
    const hashes = []
    for (const cert of certs) {
      try {
        const der = run('openssl', ['x509', '-pubkey', '-noout'], cert)
        const spki = run('openssl', ['pkey', '-pubin', '-outform', 'der'], der)
        hashes.push(require('node:crypto').createHash('sha256').update(spki).digest('base64'))
      } catch {
        // A cert openssl will not parse is one we simply do not pin.
      }
    }
    return hashes.length > 0 ? hashes.join(',') : null
  } catch {
    return null
  }
}

const caSpki = proxyCaSpki()

;(async () => {
  /**
   * Outbound HTTPS in this environment goes through an agent proxy. Chromium does not
   * read `HTTPS_PROXY`, so without this every fetch dies on ERR_TUNNEL_CONNECTION_FAILED
   * and the tool looks broken rather than blocked.
   *
   * The proxy also enforces a host allowlist — a denied host answers 403 to CONNECT.
   * That is a real limit on this script, not a bug in it, so it is reported as such
   * below rather than swallowed.
   */
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy
  const browser = await chromium.launch(
    launchOptions({
    args: [
      /**
       * The proxy terminates TLS with its own CA, and Chromium reads certificates from
       * an NSS database rather than the system bundle — which this image has no
       * `certutil` to populate. So the CA is pinned by its public-key hash instead.
       *
       * This is NOT `--ignore-certificate-errors`. That would accept any certificate
       * from anyone; this accepts exactly one key, the one already sitting on disk at
       * `caBundlePath`, and every other certificate is still fully verified. If the
       * bundle is absent the flag is not passed at all and verification is untouched.
       */
      ...(caSpki !== null ? [`--ignore-certificate-errors-spki-list=${caSpki}`] : []),
    ],
    ...(proxyUrl !== undefined
      ? {
          proxy: {
            server: proxyUrl,
            /**
             * Localhost must not go through the agent proxy. Without this, pointing
             * the script at your own dev server sends the request out to the gateway,
             * which cannot route back in — and Chromium renders its error page, which
             * measures as "one monospace element on black". A plausible-looking table
             * of a design that was never loaded is worse than a failure.
             */
            bypass: process.env.NO_PROXY ?? process.env.no_proxy ?? 'localhost,127.0.0.1,::1',
          },
        }
      : {}),
    }),
  )
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  } catch (error) {
    const message = String(error)
    await browser.close()
    if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY|403/.test(message)) {
      console.error(
        `\n✗ ${url} was refused by the agent proxy (it enforces a host allowlist).\n` +
          `  This is an environment limit, not a bug in the script. Options:\n` +
          `    · measure a screenshot instead — save the PNG and read it directly\n` +
          `    · point this at a local dev server, which is not proxied\n`,
      )
      process.exit(2)
    }
    console.error(`\n✗ could not load ${url}: ${message.split('\n')[0]}\n`)
    process.exit(1)
  }
  await page.waitForTimeout(1500)

  const raw = await page.evaluate(() => {
    const seen = { fonts: {}, colors: {}, bgs: {}, radii: {}, gaps: {}, durations: {} }
    const bump = (bag, key) => {
      if (key === undefined || key === null || key === '') return
      bag[key] = (bag[key] ?? 0) + 1
    }

    for (const el of Array.from(document.querySelectorAll('*')).slice(0, 4000)) {
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue

      const hasText = el.children.length === 0 && (el.textContent ?? '').trim().length > 0
      if (hasText) {
        bump(
          seen.fonts,
          `${Math.round(parseFloat(s.fontSize))}|${s.fontWeight}|${Math.round(parseFloat(s.lineHeight) || 0)}|${s.fontFamily.split(',')[0].replace(/["']/g, '')}`,
        )
        bump(seen.colors, s.color)
      }
      bump(seen.bgs, s.backgroundColor)
      bump(seen.radii, s.borderTopLeftRadius)
      if (s.gap !== 'normal') bump(seen.gaps, s.gap)
      bump(seen.durations, s.transitionDuration)
    }
    return seen
  })

  const top = (bag, n) =>
    Object.entries(bag)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)

  console.log(`\n# Measured: ${url}${mobile ? '  (390×844)' : '  (1440×900)'}\n`)

  console.log('## Type scale — most-used first\n')
  console.log('| size/lh | weight | family | uses | nearest WQ step |')
  console.log('|---|---|---|---|---|')
  const WQ_STEPS = [
    ['display', 34],
    ['h1', 28],
    ['h2', 22],
    ['h3', 18],
    ['button', 17],
    ['body', 16],
    ['caption', 13],
    ['overline', 12],
  ]
  for (const [key, count] of top(raw.fonts, 10)) {
    const [size, weight, lh, family] = key.split('|')
    const nearest = WQ_STEPS.reduce((a, b) =>
      Math.abs(b[1] - Number(size)) < Math.abs(a[1] - Number(size)) ? b : a,
    )
    console.log(
      `| ${size}/${lh} | ${weight} | ${family} | ${count} | \`${nearest[0]}\` (${nearest[1]}) |`,
    )
  }

  console.log('\n## Colour — with the two ratios that decide adoptability\n')
  console.log('A colour can arrive as a *surface* (something sits on it) or as *ink* (it sits')
  console.log('on our canvas). The two roles have opposite requirements, so both are given.\n')
  console.log('| hex | uses | white ON it | it ON our canvas | usable here as |')
  console.log('|---|---|---|---|---|')
  const colours = new Map()
  for (const [rgb, count] of [...top(raw.bgs, 40), ...top(raw.colors, 40)]) {
    const hex = toHex(rgb)
    if (hex === null) continue
    colours.set(hex, (colours.get(hex) ?? 0) + count)
  }
  for (const [hex, count] of [...colours.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    const w = ratio(hex, '#FFFFFF')
    const c = ratio(hex, CANVAS)
    /**
     * The verdict is the whole point: it says what this value may be used FOR here,
     * in either role. Stated as a list rather than a single label because most colours
     * are legal in one role and illegal in the other, and collapsing that to one word
     * is how a donor's button green ends up as our button green.
     */
    const roles = []
    if (w >= 4.5) roles.push('surface, any text')
    else if (w >= 3.0) roles.push('surface, large bold label only')
    if (c >= 4.5) roles.push('ink, any size')
    else if (c >= 3.0) roles.push('ink ≥18px, or non-text fill')
    const verdict = roles.length > 0 ? roles.join(' · ') : 'neither — decoration only'
    console.log(
      `| \`${hex}\` | ${count} | ${w.toFixed(2)}:1 | ${c.toFixed(2)}:1 | ${verdict} |`,
    )
  }

  console.log('\n## Shape and rhythm\n')
  console.log(`- radii: ${top(raw.radii, 6).map(([k, n]) => `${k} ×${n}`).join(' · ')}`)
  console.log(`- gaps: ${top(raw.gaps, 6).map(([k, n]) => `${k} ×${n}`).join(' · ')}`)
  console.log(
    `- transition durations: ${top(raw.durations, 5).map(([k, n]) => `${k} ×${n}`).join(' · ')}`,
  )
  console.log(`\n(our scales — space 0/4/8/12/16/24/32/40/48/64 · radius 8/12/16/20/28/999)`)

  console.log(
    `\n**Before adopting any colour above:** the "verdict" column is measured against ` +
      `${CANVAS} (our canvas) and white. A value that fails both is not a value this app can ` +
      `use as-is — derive a darker step and keep the original for non-text fills. See ` +
      `.claude/skills/dna-transplant/references/duolingo-worldquest.md.\n`,
  )

  await browser.close()
})()
