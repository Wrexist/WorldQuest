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

  // ── first launch: a brand-new user meets onboarding, not Home ─────────────
  await home()
  await page.waitForTimeout(1500)
  let text = await body()
  step('first launch opens onboarding, not Home', /five minutes a day|Get started|Next/i.test(text))
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-slide.png') })

  // Three value slides.
  for (let i = 0; i < 2; i++) {
    await page.getByText('Next', { exact: true }).first().click()
    await page.waitForTimeout(400)
  }
  await page.getByText('Get started', { exact: true }).first().click()
  await page.waitForTimeout(600)
  text = await body()
  step('age gate asks for a birth year, never "are you over 13?"',
       /When were you born/i.test(text) && !/over 13|13\+/i.test(text))
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-age.png') })

  // An adult year, so the flow continues past the child branch. Decade first — the
  // picker is deliberately two taps rather than one wall of ninety chips.
  const adultYear = new Date().getFullYear() - 30
  await page.getByRole('radio', { name: `${Math.floor(adultYear / 10) * 10}s` }).click()
  await page.waitForTimeout(300)
  await page.getByRole('radio', { name: String(adultYear) }).click()
  await page.waitForTimeout(300)
  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(600)
  step('daily goal picker appears', /How much a day|min/i.test(await body()))
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-goal.png') })

  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(600)
  step('taster promises a lesson with no account', /no account needed/i.test(await body()))

  await page.getByText('Start learning', { exact: true }).first().click()
  await page.waitForTimeout(1800)
  text = await body()
  step('onboarding ends INSIDE a lesson, before any sign-up ask',
       /capital of|flag/i.test(text) && !/sign up|create account/i.test(text))
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-taster.png') })

  // ── onboarding is remembered ──────────────────────────────────────────────
  await home()
  await page.waitForTimeout(1500)
  const afterOnboarding = await body()
  step('a returning user goes straight to Home', afterOnboarding.includes('Explorer'))
  await page.screenshot({ path: path.join(SHOTS, 'home.png') })

  // ── the taster lesson, which is the whole product in one flow ─────────────
  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(1500)
  text = await body()
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
  //
  // By ROLE, not by text. Clicking the tab's label hits the Text inside the Pressable
  // and never fires the handler, so an earlier version of this loop "passed" on four
  // tabs while sitting on Home the whole time — the assertion was `length > 40`, which
  // Home satisfies. Both halves were wrong: the click did nothing and the check could
  // not tell. Now the tab must actually become selected AND the screen must show
  // something only that screen says.
  const TABS = [
    { name: 'Explore', proof: /continents/i },
    { name: 'Quests', proof: /quest/i },
    { name: 'Profile', proof: /level|streak|explorer/i },
    { name: 'More', proof: /settings|about|language/i },
  ]
  const homeText = await (async () => {
    await home()
    return body()
  })()

  for (const tab of TABS) {
    await home()
    await page.getByRole('tab', { name: tab.name }).click()
    await page.waitForTimeout(1000)
    const shown = await body()
    const selected = await page
      .getByRole('tab', { name: tab.name })
      .getAttribute('aria-selected')
    step(
      `${tab.name} tab navigates and renders its own screen`,
      selected === 'true' && shown !== homeText && tab.proof.test(shown) && !/Something broke/.test(shown),
    )
    if (tab.name === 'Explore') await page.screenshot({ path: path.join(SHOTS, 'explore.png') })
  }

  // ── the collection, reached the way a user reaches it ──────────────────────
  await home()
  await page.getByRole('tab', { name: 'Explore' }).click()
  await page.waitForTimeout(1000)
  await page.getByText('Flags', { exact: true }).first().click()
  await page.waitForTimeout(1200)
  const collection = await body()
  step('Explore opens the flag collection', /of 6[0-9]|Still to find/.test(collection))
  await page.screenshot({ path: path.join(SHOTS, 'collection.png') })

  // Uncollected tiles are DIMMED, never hidden — seeing the gap is the motivation,
  // and a collection that hides what you lack feels smaller than it is.
  const tiles = await page.evaluate(() => document.body.innerText.split('\n').length)
  step('uncollected tiles are shown rather than hidden', tiles > 40, `${tiles} lines of tiles`)

  // Search, which is the only way to navigate 65 tiles without scrolling.
  await page.getByPlaceholder(/Search countries/i).fill('swed')
  await page.waitForTimeout(700)
  const searched = await body()
  step('search narrows the collection', /Sweden/.test(searched) && !/Mongolia/.test(searched))

  await page.getByPlaceholder(/Search countries/i).fill('zzzz')
  await page.waitForTimeout(700)
  step('a search with no match offers a way onward', /browse by continent/i.test(await body()))

  // ── the streak screen, and the promises its copy makes ─────────────────────
  await page.goto(`http://localhost:${PORT}/streak`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const streak = await body()
  step('streak screen renders', /streak|freeze/i.test(streak))
  await page.screenshot({ path: path.join(SHOTS, 'streak.png') })

  // The rules from docs/systems/xp-economy.md, asserted in the shipped bundle rather
  // than trusted to review. Coins are earned; nothing here sells an advantage; and
  // nothing pressures a child into a purchase.
  step('streak copy sells no advantage and applies no pressure',
       !/buy coins|get coins|top up|last chance|hurry|expires soon|double xp|skip/i.test(streak) &&
       /never from money/i.test(streak))

  // ── a deep route, which is also a content check ────────────────────────────
  await page.goto(`http://localhost:${PORT}/region/EU`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const region = await body()
  const found = (region.match(/Sweden|Germany|France|Spain|Poland/g) ?? []).slice(0, 4)
  step('deep route /region/EU lists real countries', found.length >= 3, found.join(', '))
  await page.screenshot({ path: path.join(SHOTS, 'region.png') })

  // ── the speed round ────────────────────────────────────────────────────────
  await page.goto(`http://localhost:${PORT}/lesson?mode=speed`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  const speed = await body()
  step('speed round starts a timed lesson', /capital of|flag|money do people/i.test(speed))
  await page.screenshot({ path: path.join(SHOTS, 'speed-round.png') })

  // The clock must run out on its own and the copy must stay neutral. Ten seconds
  // plus slack — this is the one step that genuinely has to wait.
  await page.waitForTimeout(11_000)
  const timedOut = await body()
  step("a timeout says the clock ran out, never 'too slow'",
       /Time's up/i.test(timedOut) && !/too slow|hurry|failed/i.test(timedOut))

  // ── the returning user ─────────────────────────────────────────────────────
  //
  // Reached by the gate in real use; driven directly here because faking a week of
  // absence would mean writing to MMKV from the test, which couples the E2E to a
  // storage key rather than to the screen.
  await page.goto(`http://localhost:${PORT}/welcome-back`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const welcome = await body()
  step('welcome-back renders', /missed you|still here/i.test(welcome))
  await page.screenshot({ path: path.join(SHOTS, 'welcome-back.png') })

  // The no-guilt rule from voice-and-tone.md, asserted in the shipped bundle. This is
  // the screen most likely to acquire a "you haven't practised in 12 days!" in a
  // later well-meaning edit.
  step('welcome-back copy carries no guilt and no deadline',
       !/you haven'?t|you missed|at risk|don'?t lose|overdue|behind|last chance/i.test(welcome) &&
       /still here/i.test(welcome))

  // ── the content-as-data claim, end to end ──────────────────────────────────
  //
  // Currency was authored as a pack and a template. If it reaches the country page
  // without anyone editing a screen, the architecture's central bet is holding. If it
  // ever stops, that is the leak worth knowing about immediately.
  await page.goto(`http://localhost:${PORT}/country/SE`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const country = await body()
  step('a new ATTRIBUTE reaches the country page with no screen change',
       /currency/i.test(country), (country.match(/Currency[^\n]*/) ?? [''])[0])
  await page.screenshot({ path: path.join(SHOTS, 'country.png') })

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
