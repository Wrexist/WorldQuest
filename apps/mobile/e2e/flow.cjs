/**
 * End-to-end smoke test against the REAL exported bundle.
 *
 * ## Why this exists, and what it is not
 *
 * The plan called for Maestro against a simulator, and this is not that. There is no
 * iOS Simulator without macOS and no Android emulator without `/dev/kvm`, so a Maestro
 * flow written here would be a file of guesses about selectors and timing that nobody
 * had ever watched run. This runs the actual app instead — expo-router, the real
 * providers, the real i18n catalogue, the real engines, the real content packs —
 * exported through Metro and driven in Chromium via react-native-web.
 *
 * **What it does not cover:** anything native. MMKV, haptics, real gesture handling,
 * iOS/Android layout, splash and font loading on device, the actual store build. A
 * green run here does NOT mean the app works on a phone. It means the bundle builds,
 * the routes resolve, the screens render, and a lesson can be played start to finish.
 *
 * That is worth having on its own terms: the first time this ran it found that the app
 * had never bundled on ANY platform — 71 imports used TypeScript's `.js` convention
 * and Metro does not rewrite `.js` to `.ts`. `pnpm typecheck` runs tsc and `pnpm test`
 * runs vitest; neither one is the bundler, so neither could ever have caught it.
 *
 * Run: pnpm e2e
 */

const { chromium } = require('playwright')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = process.argv[2]
const SHOTS = process.argv[3] ?? path.join(ROOT, '..', 'wq-e2e-shots')
const PORT = 4173

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

/** Static server with SPA fallback — expo-router owns the routing, not this. */
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  let file = path.join(ROOT, url)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const asHtml = path.join(ROOT, url + '.html')
    file = fs.existsSync(asHtml) ? asHtml : path.join(ROOT, 'index.html')
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

const steps = []
const step = (name, ok, detail = '') => {
  steps.push({ name, ok })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? '  — ' + detail : ''}`)
}

;(async () => {
  fs.mkdirSync(SHOTS, { recursive: true })
  await new Promise((resolve) => server.listen(PORT, resolve))

  const browser = await chromium.launch({
    // Provided by the image; never downloaded. See PLAYWRIGHT_BROWSERS_PATH.
    executablePath: process.env.WQ_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  })
  // iPhone 14-ish. The layout is phone-first and a desktop viewport hides overflow bugs.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

  /**
   * Any uncaught error fails the run. A screen that renders while throwing is a screen
   * that is one state change away from the crash boundary.
   */
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text())
  })

  const body = () => page.evaluate(() => document.body.innerText)
  const home = async () => {
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
  }

  // ── cold start ────────────────────────────────────────────────────────────
  await home()
  await page.waitForTimeout(1200)
  step('cold start renders Home', (await body()).includes('Explorer'))
  await page.screenshot({ path: path.join(SHOTS, 'home.png') })

  // ── the taster lesson, which is the whole product in one flow ─────────────
  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(1500)
  let text = await body()
  const prompt = text.split('\n').find((line) => /capital of|flag/i.test(line))
  step('Continue opens a lesson', prompt !== undefined, prompt)

  if (prompt !== undefined) {
    await page.screenshot({ path: path.join(SHOTS, 'lesson.png') })

    const before = text
    let answered = false
    for (const button of await page.getByRole('button').all()) {
      const label = (await button.innerText().catch(() => '')).trim()
      // The options are the short buttons; the prompt and the CTA are not.
      if (label && label.length < 40 && !/capital of|which country|what does/i.test(label)) {
        await button.click()
        answered = true
        break
      }
    }
    await page.waitForTimeout(1200)
    text = await body()
    const feedback = (text.match(/Perfect!|That's [^\n]*|The answer is [^\n]*/) ?? [''])[0]
    step('answering produces feedback', answered && text !== before, feedback)

    // The voice rule, asserted rather than trusted: never "Wrong!", never "Oops!".
    // See docs/design/voice-and-tone.md. This is the one place a copy regression
    // would reach a child before it reached a reviewer.
    step('wrong-answer copy does not shame', !/Wrong!|Oops!|Incorrect!/i.test(text))
    await page.screenshot({ path: path.join(SHOTS, 'feedback.png') })
  }

  // ── every tab, because a white screen on one of five is a shipped white screen ──
  for (const tab of ['Explore', 'Quests', 'Profile', 'More']) {
    await home()
    await page.getByText(tab, { exact: true }).first().click()
    await page.waitForTimeout(900)
    const shown = await body()
    step(`${tab} tab renders`, shown.length > 40 && !/Something broke/.test(shown))
    if (tab === 'Explore') await page.screenshot({ path: path.join(SHOTS, 'explore.png') })
  }

  // ── a deep route, which is also a content check ────────────────────────────
  await page.goto(`http://localhost:${PORT}/region/EU`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const region = await body()
  const found = (region.match(/Sweden|Germany|France|Spain|Poland/g) ?? []).slice(0, 4)
  step('deep route /region/EU lists real countries', found.length >= 3, found.join(', '))
  await page.screenshot({ path: path.join(SHOTS, 'region.png') })

  // ── the screen whose absence is a white screen ─────────────────────────────
  await page.goto(`http://localhost:${PORT}/no-such-route`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const missing = await body()
  step('unknown route shows the 404, not a crash', !/Something broke/.test(missing) && missing.length > 20)

  // ── reporting ──────────────────────────────────────────────────────────────
  const unique = [...new Set(errors)]
  step(`no uncaught errors on any screen`, unique.length === 0, unique[0]?.slice(0, 160) ?? '')
  for (const error of unique.slice(0, 10)) console.log('      ' + error.slice(0, 240))

  const failed = steps.filter((s) => !s.ok).length
  console.log(`\n${steps.length - failed}/${steps.length} steps passed`)
  console.log(`screenshots → ${SHOTS}\n`)

  await browser.close()
  server.close()
  process.exit(failed > 0 ? 1 : 0)
})()
