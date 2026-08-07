/**
 * Screenshot any set of routes from the REAL exported bundle, at three viewports.
 *
 * ## Why this exists
 *
 * The design-review workflow this repo vendored (OneRedOak/claude-code-workflows,
 * MIT) is built on the "Live Environment First" principle: look at the rendered
 * screen before reading a line of the diff. Upstream it does that through the
 * Playwright MCP server, which this workspace does not have.
 *
 * It does not need one. `pnpm e2e` already exports the app through Metro and drives
 * it in Chromium — the whole apparatus is here, wired to a fixed script of assertions.
 * This is the same apparatus pointed at an arbitrary list of routes, so a review can
 * ask "show me the lesson screen at 320 pt" and get a picture rather than a guess.
 *
 * ## What a picture from here does and does not prove
 *
 * Same caveat as the E2E, and it matters more here because screenshots are
 * persuasive: this is react-native-web in Chromium. It is the real bundle, the real
 * router, the real tokens and the real content packs. It is NOT a device. Font
 * rasterisation, native gesture handling, and iOS/Android layout differences are all
 * invisible to it. A screen that looks right here can still be wrong on a phone.
 *
 * ## Usage
 *
 *   pnpm design:shots                          # every route, plus the two flows
 *   pnpm design:shots /lesson /country/SE      # specific routes (flows still run)
 *   WQ_NO_FLOWS=1 pnpm design:shots /home      # routes only, when iterating on one
 *
 * Writes to node_modules/.cache/wq-design-shots/, one PNG per route per viewport plus
 * ten per viewport for the onboarding and lesson flows, and `report.json` with the
 * measured values a review should be arguing about rather than eyeballing.
 */

const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = process.env.WQ_WEB ?? path.join(process.cwd(), 'node_modules', '.cache', 'wq-web')
const OUT =
  process.env.WQ_SHOTS ?? path.join(process.cwd(), 'node_modules', '.cache', 'wq-design-shots')
const PORT = 4174

/**
 * 320 is the floor the Definition of Done names (iPhone SE 1) and the width most
 * likely to break a layout built at 390. 390 is the design target. 768 catches a
 * tablet doing something silly with a phone-first grid.
 */
const VIEWPORTS = [
  { name: '320', width: 320, height: 700 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
]

const DEFAULT_ROUTES = [
  '/',
  '/lesson',
  '/explore',
  '/quests',
  '/profile',
  '/more',
  '/collection/flags',
  '/country/SE',
  // The continent detail. Absent from this list until it was noticed that it had no
  // illustration at all — which is the argument for the list being the whole app rather
  // than the screens somebody remembered.
  '/region/EU',
  '/achievements',
  '/streak',
  // `?source=settings` so it opens on the plans page. From onboarding it opens on
  // "you just learned N countries", which is the right screen there and an empty one
  // here — the harness has no lesson behind it.
  '/paywall?source=settings',
  '/shop',
  // Reached by a gate in the root layout and by the "we miss you" push, never by a tap.
  // It went unphotographed for that reason and was rendering "It's been 0 days." to
  // anyone who followed the notification the same afternoon.
  '/welcome-back',
]

/**
 * The screens that are not routes, and were therefore invisible to this tool.
 *
 * A review that only visits `DEFAULT_ROUTES` sees about two thirds of the app. The
 * onboarding flow is one route showing four different screens; the lesson is one route
 * showing five. Between them that is nine screens nobody could photograph, and the
 * first review that drove them by hand found a broken layout in the feedback sheet at
 * 320, a screen-reader contradiction in the onboarding dots, and two illustrations
 * missing entirely — none of which any route in the list above could have shown.
 *
 * So the script drives them. Onboarding is free: the harness already clicks through it
 * to get past the gate, and now it stops for a picture on the way. The lesson costs one
 * extra playthrough per viewport.
 */
const SHOOT_FLOWS = process.env.WQ_NO_FLOWS === undefined

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

const routes = process.argv.slice(2).filter((a) => a.startsWith('/'))
const ROUTES = routes.length > 0 ? routes : DEFAULT_ROUTES

;(async () => {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error(
      `✗ No exported bundle at ${ROOT}.\n` +
        `  Run: pnpm --filter @worldquest/mobile exec expo export --platform web --output-dir ${ROOT}`,
    )
    process.exit(1)
  }

  fs.mkdirSync(OUT, { recursive: true })
  await new Promise((resolve) => server.listen(PORT, resolve))

  const browser = await chromium.launch(launchOptions())

  const report = { routes: {}, generatedAt: null }

  /**
   * Get past the onboarding gate, once per browser context.
   *
   * Without this the whole tool is a very elaborate way to photograph the onboarding
   * screen ten times. `_layout.tsx` redirects any route to `/onboarding` until it has
   * been completed, and a fresh context has never completed it — so the first run of
   * this script produced thirty PNGs of slide one and an identical "problem" on every
   * route, which is exactly the kind of confident, uniform wrongness the tool is
   * supposed to catch in the app.
   *
   * Clicked through rather than seeded into storage, deliberately: the click path is
   * the one the E2E already proves works, and a storage shape is an implementation
   * detail that would rot the day the onboarding key changes.
   */
  const completeOnboarding = async (page, shot) => {
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    if (!/Get started|Next/i.test(await page.evaluate(() => document.body.innerText))) return

    // Each slide, on the way past. Free: the clicks were happening anyway, and the
    // three intro slides are three different screens sharing one route.
    for (let i = 0; i < 2; i++) {
      await shot(`onboarding-slide-${i + 1}`)
      await page.getByText('Next', { exact: true }).first().click()
      await page.waitForTimeout(350)
    }
    await shot('onboarding-slide-3')
    await page.getByText('Get started', { exact: true }).first().click()
    await page.waitForTimeout(500)
    await shot('onboarding-age')

    // An adult year, so the flow continues past the child branch.
    const adultYear = new Date().getFullYear() - 30
    await page.getByRole('radio', { name: `${Math.floor(adultYear / 10) * 10}s` }).click()
    await page.waitForTimeout(250)
    await page.getByRole('radio', { name: String(adultYear) }).click()
    await page.waitForTimeout(250)
    await page.getByText('Continue', { exact: true }).first().click()
    await page.waitForTimeout(500)
    await shot('onboarding-goal')
    await page.getByText('Continue', { exact: true }).first().click()
    await page.waitForTimeout(500)
    await shot('onboarding-taster')
    await page.getByText('Start learning', { exact: true }).first().click()
    await page.waitForTimeout(1200)
  }

  /**
   * The lesson's other four screens: paused, correct feedback, wrong feedback, summary.
   *
   * Answering the FIRST option every time is what gets both verdicts out of one
   * playthrough without knowing any answers — some questions have it right and some do
   * not, which is exactly the distribution needed here. The correct/wrong test reads the
   * last few lines of the body rather than a testID, because the sheet is the thing
   * being photographed and pinning it to a testID would let a redesign quietly stop
   * taking the picture.
   */
  const shootLessonPhases = async (page, shot) => {
    await page.goto(`http://localhost:${PORT}/lesson`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1600)

    const close = page.getByRole('button', { name: /close|exit|quit|pause/i }).first()
    if ((await close.count()) > 0) {
      await close.click()
      await page.waitForTimeout(600)
      await shot('lesson-paused')
      const resume = page.getByText(/^(Keep going|Resume|Continue)$/).first()
      if ((await resume.count()) > 0) {
        await resume.click()
        await page.waitForTimeout(700)
      }
    }

    let gotCorrect = false
    let gotWrong = false
    for (let q = 0; q < 40; q++) {
      const options = await page.getByTestId('answer-option').all()
      if (options.length === 0) break
      await options[0].click()
      await page.waitForTimeout(550)
      const tail = (await page.evaluate(() => document.body.innerText)).split('\n').slice(-8).join(' ')
      const correct = /Perfect|Nice|Yes/i.test(tail)
      if (correct && !gotCorrect) {
        await shot('lesson-feedback-correct')
        gotCorrect = true
      }
      if (!correct && !gotWrong) {
        await shot('lesson-feedback-wrong')
        gotWrong = true
      }
      const next = page.getByText(/^(Continue|Finish|Got it)$/).first()
      if ((await next.count()) === 0) break
      await next.click()
      await page.waitForTimeout(500)
    }
    await page.waitForTimeout(800)
    await shot('lesson-summary')
    return { gotCorrect, gotWrong }
  }

  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
    })
    const consoleErrors = []
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })

    const shot = (name) =>
      page.screenshot({ path: path.join(OUT, `${name}@${viewport.name}.png`) })

    await completeOnboarding(page, SHOOT_FLOWS ? shot : async () => {})

    for (const route of ROUTES) {
      const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-')
      await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1200)
      await page.screenshot({ path: path.join(OUT, `${slug}@${viewport.name}.png`) })

      /**
       * The measurements a review should argue about instead of eyeballing.
       *
       * Touch targets and sideways scroll are the two things a screenshot genuinely
       * cannot show you: a 30 pt button looks fine in a picture and fails under a
       * thumb, and a 4 px overflow is invisible until someone swipes.
       */
      const measured = await page.evaluate(() => {
        const doc = document.documentElement
        const interactive = Array.from(
          document.querySelectorAll('[role="button"],[role="tab"],[role="radio"],[role="link"]'),
        )
        const small = interactive
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
          .map(({ el, r }) => ({
            label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 32),
            size: `${Math.round(r.width)}×${Math.round(r.height)}`,
          }))
        const unlabelled = interactive.filter(
          (el) =>
            (el.getAttribute('aria-label') ?? '').trim() === '' &&
            (el.textContent ?? '').trim() === '',
        ).length
        return {
          sidewaysScroll: doc.scrollWidth - doc.clientWidth,
          belowMinTarget: small,
          unlabelledControls: unlabelled,
          headings: Array.from(document.querySelectorAll('[role="heading"]'))
            .map((h) => (h.textContent ?? '').trim())
            .slice(0, 4),
        }
      })

      report.routes[slug] ??= {}
      report.routes[slug][viewport.name] = measured
    }

    if (SHOOT_FLOWS) {
      const phases = await shootLessonPhases(page, shot)
      if (!phases.gotCorrect || !phases.gotWrong) {
        report.flowGaps ??= {}
        report.flowGaps[viewport.name] = `lesson feedback: correct=${phases.gotCorrect} wrong=${phases.gotWrong}`
      }
    }

    if (consoleErrors.length > 0) {
      report.consoleErrors ??= {}
      report.consoleErrors[viewport.name] = [...new Set(consoleErrors)].slice(0, 10)
    }
    await page.close()
  }

  await browser.close()
  server.close()

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))

  // A flat summary, because the point is to be read at a glance before opening a PNG.
  let problems = 0
  console.log(`\nDesign shots — ${ROUTES.length} routes × ${VIEWPORTS.length} viewports\n`)
  for (const [slug, byViewport] of Object.entries(report.routes)) {
    const notes = []
    for (const [vp, m] of Object.entries(byViewport)) {
      if (m.sidewaysScroll > 2) notes.push(`${vp}: scrolls sideways ${m.sidewaysScroll}px`)
      if (m.belowMinTarget.length > 0) {
        notes.push(
          `${vp}: ${m.belowMinTarget.length} target(s) under 44pt — ` +
            m.belowMinTarget
              .slice(0, 2)
              .map((t) => `${JSON.stringify(t.label)} ${t.size}`)
              .join(', '),
        )
      }
      if (m.unlabelledControls > 0) notes.push(`${vp}: ${m.unlabelledControls} unlabelled control(s)`)
    }
    problems += notes.length
    console.log(`  ${notes.length === 0 ? '✓' : '⚠'} ${slug}`)
    for (const n of notes) console.log(`      ${n}`)
  }
  if (report.consoleErrors) {
    problems++
    console.log(`\n  ⚠ console errors: ${JSON.stringify(report.consoleErrors).slice(0, 300)}`)
  }
  // Said out loud rather than left as a missing file. A flow shot that silently did not
  // happen is worse than no flow shots at all: the reviewer opens the folder, does not
  // notice the absence, and reports the screen as fine.
  if (report.flowGaps) {
    problems++
    console.log(`\n  ⚠ a lesson verdict was never reached: ${JSON.stringify(report.flowGaps)}`)
  }
  if (SHOOT_FLOWS) {
    console.log(
      `\n  + ${VIEWPORTS.length * 10} flow shots (onboarding-*, lesson-*) — screens that are ` +
        `states rather than routes, and were invisible to this tool until they were not`,
    )
  }

  console.log(`\nshots → ${OUT}`)
  console.log(
    problems === 0
      ? '✓ nothing measurable is wrong — now LOOK at the pictures, which is the part this cannot do\n'
      : `⚠ ${problems} measured problem(s) above, plus whatever the pictures show\n`,
  )
  // Deliberately exit 0 even with findings. This is a review aid, not a gate —
  // `pnpm verify` and `pnpm e2e` are the gates. A tool that fails the build on a
  // subjective finding gets deleted within a week.
})()
