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
 * iOS/Android layout, the actual store build. A green run here does NOT mean the app
 * works on a phone. It means the bundle builds, the routes resolve, the screens
 * render, and a lesson can be played start to finish.
 *
 * Font loading specifically: on web, expo declares the faces as `@font-face` in the
 * HTML head, so `useFonts` resolves immediately and there is no pending state to
 * observe. The splash's slow and failed states are therefore covered by component
 * tests only — see the cold-boot section near the bottom, which says what it can and
 * cannot prove rather than pretending.
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

    // By testID, not by "the short buttons". That heuristic picked the first button
    // in the DOM, and the moment a close button was added to the header it started
    // clicking THAT — pausing the lesson, changing the screen, and satisfying a
    // `text !== before` assertion without ever answering anything. The step went
    // green with an empty feedback string, which is the only reason it was caught.
    const options = await page.getByTestId('answer-option').all()
    const answered = options.length > 0
    if (answered) await options[0].click()

    await page.waitForTimeout(1200)
    text = await body()
    const feedback = (text.match(/Perfect!|That's [^\n]*|The answer is [^\n]*/) ?? [''])[0]
    // The feedback string itself, not just "something changed" — pausing also changes
    // the screen, and that is precisely what went undetected before.
    step('answering produces feedback', answered && feedback.length > 0, feedback)

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

  // ── starring, and the fact that it crosses screens ─────────────────────────
  //
  // The star is a toggle, so the state has to be readable and not merely visible.
  const star = page.getByRole('switch', { name: /Star this country/i })
  step('the star reports its state, not just its presence',
       (await star.getAttribute('aria-checked')) === 'false')
  await star.click()
  await page.waitForTimeout(400)
  step('starring flips the state a screen reader hears',
       (await star.getAttribute('aria-checked')) === 'true')

  // The bug worth an E2E step: a per-screen useState would leave this grid unstarred
  // after the tap above, and nothing short of crossing screens catches it.
  await page.goto(`http://localhost:${PORT}/collection/countries`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await page.getByRole('radio', { name: 'Starred' }).click()
  await page.waitForTimeout(700)
  const starred = await body()
  step('a star set on one screen filters the collection on another',
       /Sweden/.test(starred) && !/Mongolia/.test(starred))
  await page.screenshot({ path: path.join(SHOTS, 'collection-starred.png') })

  // ── achievements actually move ─────────────────────────────────────────────
  //
  // Until now `useAchievements()` was called with no progress map, so every row read
  // "Not yet" forever and no lesson could ever change that. This plays a lesson to
  // the end and then checks the screen, which is the only way to tell the difference
  // between "locked" and "cannot ever unlock".
  await page.goto(`http://localhost:${PORT}/achievements`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const beforeAch = await body()
  const lockedBefore = (beforeAch.match(/Not yet/g) ?? []).length

  await page.goto(`http://localhost:${PORT}/lesson`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  // Answer every question, then leave — the lesson must reach its summary for the
  // completion event to fire at all.
  for (let i = 0; i < 25; i++) {
    const options = await page.getByTestId('answer-option').all()
    if (options.length === 0) break
    await options[0].click()
    await page.waitForTimeout(250)
    const next = page.getByRole('button', { name: 'Continue' })
    if (await next.count()) await next.first().click()
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(800)

  // The quest, checked in the same pass — the lesson above is what should have moved
  // it. Until now `applyQuestEvent` had no caller, so five tasks read 0/5 forever no
  // matter how many lessons were finished: a promise on the home screen that the app
  // quietly broke every day.
  // By route, not by tab: the lesson is a full-screen sibling of the tabs, so there
  // is no tab bar on screen at this point in the flow.
  await page.goto(`http://localhost:${PORT}/quests`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  const questAfter = await body()
  // Matched against the copy the screen actually renders ("1 of 5 done"), not a
  // guessed "1 / 5". The first version passed on a different branch and printed an
  // empty detail, which is the same tell that caught the answer-selector bug.
  const questDone = (questAfter.match(/(\d) of 5 done/) ?? [])[1]
  step('finishing a lesson ticks a quest task',
       questDone !== undefined && Number(questDone) > 0,
       questDone === undefined ? 'no "N of 5 done" on screen' : `${questDone} of 5`)
  await page.screenshot({ path: path.join(SHOTS, 'quests.png') })

  await page.goto(`http://localhost:${PORT}/achievements`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const afterAch = await body()
  step('finishing a lesson moves an achievement off zero',
       /1 to go|2 to go|3 to go|4 to go/.test(afterAch) ||
       (afterAch.match(/Not yet/g) ?? []).length < lockedBefore,
       `${lockedBefore} locked before`)
  await page.screenshot({ path: path.join(SHOTS, 'achievements.png') })

  // ── the way out of a lesson ────────────────────────────────────────────────
  //
  // The route disables the back gesture on purpose, so this control is the ONLY exit
  // from a started lesson short of answering every question or killing the app. It did
  // not exist until now, which makes it worth a step in the only thing that runs the
  // real bundle.
  await page.goto(`http://localhost:${PORT}/lesson`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  await page.getByRole('button', { name: /Pause the lesson/i }).click()
  await page.waitForTimeout(600)
  const paused = await body()
  step('a lesson can be paused', /Paused/.test(paused))
  // Leaving keeps every answer already given, so nothing here may threaten the user
  // with losing it. This is the screen most likely to acquire an "Are you sure?"
  // in a later well-meaning edit.
  // Matches the THREAT, not the word. The first version banned /lost/ and failed on
  // "Nothing is lost." — the reassurance itself. A blunt keyword ban rejects good
  // copy and teaches whoever hits it to weaken the test rather than the sentence.
  step('and pausing threatens nothing',
       !/you'?ll lose|will lose|will be lost|lose your|are you sure|discard|start over/i.test(paused))
  await page.screenshot({ path: path.join(SHOTS, 'lesson-paused.png') })

  await page.getByRole('button', { name: /Keep going/i }).click()
  await page.waitForTimeout(600)
  step('and resuming returns to the question',
       /capital of|flag|money do people/i.test(await body()))

  // ── offline, scoped to what genuinely needs a server (H7) ──────────────────
  //
  // Real connectivity, not a prop: `context.setOffline` drops the network under the
  // page, NetInfo's web implementation reports it, and the app has to react. That is
  // the whole chain — `isOffline` was a hardcoded `false` for months and every test
  // that passed a prop would have kept passing.
  await page.goto(`http://localhost:${PORT}/streak`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const onlineStreak = await body()
  step('the streak screen says nothing about connections while online',
       !/needs a connection/i.test(onlineStreak))

  await page.context().setOffline(true)
  await page.waitForTimeout(1500)
  const offlineStreak = await body()
  step('going offline names the reason the purchase is unavailable',
       /needs a connection/i.test(offlineStreak))
  // The rest of the screen is untouched, and nothing here reads as an alarm. This
  // app works in a tunnel; offline is a "not yet", not a failure.
  step('and does not turn a tunnel into an emergency',
       /streak|freeze/i.test(offlineStreak) &&
       !/error|failed|check your|no internet|try again later/i.test(offlineStreak))
  await page.screenshot({ path: path.join(SHOTS, 'streak-offline.png') })

  // Recovery matters as much as detection. The first version of this never came back:
  // NetInfo's default reachability probe pointed at a Google endpoint, which is both a
  // third-party request from a child's device and the wrong question — it was
  // unreachable here, so the app decided it was permanently offline and the buttons
  // stayed grey forever. The probe now points at our own backend and does not run at
  // all when there is none. See lib/connectivity.ts.
  await page.context().setOffline(false)
  await page.waitForTimeout(2000)
  step('and takes it back when the connection returns',
       !/needs a connection/i.test(await body()))

  // ── cold boot ──────────────────────────────────────────────────────────────
  //
  // What this can and cannot say about the splash, precisely:
  //
  // It CANNOT exercise it. The splash renders while `useAppFonts()` is pending, and on
  // the web build that is never — expo declares the faces as `@font-face` in the HTML
  // head, so `useFonts` resolves immediately and the browser swaps the glyphs in
  // later. Holding the .ttf responses back for six seconds was tried: the requests are
  // genuinely delayed and the app boots straight past them into Home. There is no
  // pending state to catch, so the splash's three states are covered by its component
  // tests and by nothing here.
  //
  // It CAN assert the property the splash exists for, which is that a cold start never
  // shows a blank rectangle. That is true on whichever path the platform takes, and it
  // is the thing a user would actually report.
  //
  // A separate context because the main page has booted a dozen times by now and
  // everything is in its cache. A cold boot needs a cold context.
  const cold = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const boot = await cold.newPage()
  boot.on('pageerror', (e) => errors.push('cold boot: ' + String(e)))

  await boot.goto(`http://localhost:${PORT}/`, { waitUntil: 'commit' })
  await boot.waitForTimeout(1500)
  await boot.screenshot({ path: path.join(SHOTS, 'cold-boot.png') })
  const booted = await boot.evaluate(() => document.body.innerText)

  step('a cold start paints something within 1.5s', booted.trim().length > 0,
       booted.split('\n')[0] ?? '')
  // Whatever it painted, it is not the splash still sitting there. A splash that
  // outlives its work looks identical to a hang.
  step('and is not still on the splash', !/Getting your world ready/i.test(booted))
  await cold.close()

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
