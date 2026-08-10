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
 * Writes to node_modules/.cache/wq-design-shots/, one PNG per route per viewport, plus
 * the flow shots — the onboarding steps, the lesson's four phases, and the offline pass
 * — and `report.json` with the measured values a review should be arguing about rather
 * than eyeballing. The run prints how many flow shots it actually took; no number is
 * written down here, because the last one was stale within a day of being typed.
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
  /**
   * 320×568 is iPhone SE 1 — a real phone, unlike the 320×700 this used to be.
   *
   * That height was invented, and inventing it hid a defect for as long as it existed: no
   * 320-wide phone has ever been 700 tall, and at the real 568 the lesson's fourth answer
   * option sat at 559–618 of 568. Two comments in `LessonScreen` recorded "four answers
   * still fit below it at 320pt" — true at this harness's height and at no device's.
   *
   * 320 dp is also live on small Android and on a folded Fold's cover screen, so this is
   * the floor rather than a museum piece. The lesson now compacts below 700 (`SHORT_SCREEN`),
   * which means the old height photographed the wrong branch as well as the wrong phone.
   */
  { name: '320', width: 320, height: 568 },
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
 *
 * This flag gates the offline pass below as well — it is the same idea applied to a
 * state rather than a screen, and anyone turning flows off to iterate on one route
 * wants it off too.
 */
const SHOOT_FLOWS = process.env.WQ_NO_FLOWS === undefined

/**
 * The routes worth photographing a SECOND time with the network pulled out.
 *
 * The five states are content, loading, empty, error and offline, and a review that
 * only walks routes sees the first three. Loading and error are not reachable here and
 * saying so is more useful than pretending: content ships in the binary and
 * `useContent` builds its index synchronously, so there is no loading window to
 * photograph and no failure to induce short of corrupting a pack. The paywall's error
 * state is the exception and shows up unprompted — there is no store to reach from a
 * test harness, which is why every paywall shot in this folder is already the error
 * branch.
 *
 * Offline IS reachable, and it is the state this product cares most about. Two of the
 * three personas are defined by it — Priya on the metro, Emma's tablet with no SIM —
 * and the banner written for them was unreachable for the app's entire first month
 * because `isOffline` was a hardcoded `false`. A regression back to that would look
 * exactly like nothing at all.
 *
 * `context.setOffline` fires the browser's own `offline` event, which is the same
 * path `connectivity.ts` listens on in a real browser. Not a mock, not a test seam.
 */
const OFFLINE_ROUTES = ['/', '/shop', '/streak', '/more', '/paywall?source=settings']

/**
 * The routes worth photographing with every string inflated by ~40 %.
 *
 * Chosen for where long copy actually lands rather than for coverage: the screens with
 * the most words per pixel (Settings, the paywall), the ones whose numbers sit beside
 * labels that could push them (Home, Streak), and the lesson, whose answer options are
 * the only place in the app where a wrapped string costs a tap target.
 */
const PSEUDO_ROUTES = ['/', '/more', '/paywall?source=settings', '/streak', '/lesson', '/quests']

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
    //
    // One click, not two: the age gate was a decade chip followed by a year chip and is
    // a wheel now, whose every row is a real radio for exactly this reason — a scroll
    // gesture is invisible to a driver as well as to a screen reader.
    const adultYear = new Date().getFullYear() - 30
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
      // The offline pass disconnects the radio on purpose, and Chromium says so on the
      // console. Reporting our own instruction back as a finding is how a summary line
      // stops being read.
      if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) {
        consoleErrors.push(m.text())
      }
    })

    // Counted, not assumed. This used to be reported as a hardcoded `VIEWPORTS.length *
    // 10` and the number was wrong the moment the offline pass was added in this same
    // file — fifteen shots per viewport reported as ten. A summary line whose whole
    // purpose is "a shot that silently did not happen is worse than none" cannot itself
    // be guessing at how many there were.
    let taken = 0
    const shot = (name) => {
      taken += 1
      return page.screenshot({ path: path.join(OUT, `${name}@${viewport.name}.png`) })
    }

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
       *
       * `deadSpaceBelow` is the fourth, and it is here because it found three screens
       * a human had already looked at and passed. A screenshot shows emptiness but not
       * how much, and a reviewer's eye grades it against the screen rather than against
       * the other viewports — so onboarding's taster sat 47 % empty at 320 and 66 % at
       * 768 through several review passes. As a percentage across three widths it is
       * obvious, and it is a number a review can argue with.
       */
      const measured = await page.evaluate(() => {
        const doc = document.documentElement

        /**
         * How much of the viewport below the content is empty.
         *
         * Measured from the bottom of the deepest thing actually painted in the scroll
         * area to the top of whatever is pinned below it — a footer, the tab bar — or to
         * the bottom of the window when nothing is. Zero on any screen that scrolls,
         * which is most of them; large only where short fixed content hangs from the top
         * of a tall screen, which is the defect.
         *
         * Deliberately NOT a gate. A meditation screen might want to be mostly empty,
         * "mostly empty" is sometimes the design, and a threshold here would either fire
         * on those or be set so loose it fires on nothing. The number goes in the report
         * and a person decides.
         */
        const deadSpaceBelow = (() => {
          const scroller = Array.from(document.querySelectorAll('*')).find((node) => {
            const style = getComputedStyle(node)
            return /^(auto|scroll)$/.test(style.overflowY) && node.clientHeight > 200
          })
          if (scroller === undefined) return null
          // A screen with more in it than fits has no dead space by definition.
          if (scroller.scrollHeight > scroller.clientHeight + 4) return 0
          const box = scroller.getBoundingClientRect()
          let contentBottom = box.top
          for (const node of scroller.querySelectorAll('*')) {
            const r = node.getBoundingClientRect()
            // Painted, inside the scroller, and not a zero-height wrapper.
            if (r.height < 1 || r.width < 1 || r.top > box.bottom) continue
            if (getComputedStyle(node).visibility === 'hidden') continue
            contentBottom = Math.max(contentBottom, Math.min(r.bottom, box.bottom))
          }
          const gap = Math.round(box.bottom - contentBottom)
          return { px: gap, percentOfViewport: Math.round((gap / window.innerHeight) * 100) }
        })()
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
          deadSpaceBelow,
          headings: Array.from(document.querySelectorAll('[role="heading"]'))
            .map((h) => (h.textContent ?? '').trim())
            .slice(0, 4),
        }
      })

      report.routes[slug] ??= {}
      report.routes[slug][viewport.name] = measured
    }

    if (SHOOT_FLOWS) {
      // Serve images from disk for the offline pass, so the pictures are of the APP
      // being offline rather than of a browser that cannot fetch.
      //
      // `setOffline` blocks localhost too, and going offline SWAPS which art the paywall
      // asks for — `states/error-generic` becomes `states/offline` — so the new file has
      // never been fetched and cannot be. The shot came out with an empty bordered frame
      // where the illustration belongs, which on a real device cannot happen: that art is
      // in the binary. A screenshot that invents a broken image is worse than no
      // screenshot, because the reviewer files a bug against the app.
      //
      // `route.fulfill` answers before the network layer, so it works while offline. Only
      // images are intercepted; every other request still fails, which is the point.
      await page.route('**/*.{png,webp,jpg,jpeg,svg,ttf,otf,woff2}', async (route) => {
        const url = new URL(route.request().url())
        const file = path.join(ROOT, decodeURIComponent(url.pathname))
        if (!fs.existsSync(file)) return route.abort()
        return route.fulfill({
          status: 200,
          contentType: TYPES[path.extname(file)] ?? 'application/octet-stream',
          body: fs.readFileSync(file),
        })
      })

      for (const route of OFFLINE_ROUTES) {
        const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-')
        // Load first, THEN pull the radio. `setOffline` blocks localhost too, so a
        // navigation made while offline serves nothing and photographs a blank page —
        // which is a picture of the harness, not of the app. Toggling per route costs a
        // few hundred milliseconds and is the only order that renders the screen.
        await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(900)
        await page.context().setOffline(true)
        await page.waitForTimeout(700)
        await shot(`offline-${slug}`)
        await page.context().setOffline(false)
        await page.waitForTimeout(300)
      }
      await page.unroute('**/*.{png,webp,jpg,jpeg,svg,ttf,otf,woff2}')

      // ── pseudo-locale ─────────────────────────────────────────────────────
      //
      // "Pseudo-locale screenshots clean" is a Definition of Done box, and it had never
      // been checkable. Everything for it existed — `enablePseudoLocale()` inflates and
      // accents the English bundle in memory — and nothing could reach it: this harness
      // drives the exported bundle, which is production, so the function's `isDev()`
      // gate refused and returned false silently. It had no caller but its own test.
      //
      // Two things this catches that no other pass can. Swedish is the only other
      // language shipped and is not reliably longer than English, so a layout that
      // breaks at +40 % — German, Finnish — breaks first for a translator months from
      // now. And anything still rendering in plain ASCII here never went through `t()`,
      // which is the hardcoded-string check no grep does as well.
      /**
       * Enabled AFTER the navigation, per route — the same ordering the offline pass
       * above had to learn.
       *
       * A `page.goto` reloads the SPA: fresh JS context, `__WQ_PSEUDO__` gone, i18n
       * re-initialised to the device locale. Enabling once and then navigating six times
       * photographed six English screens and reported every string on them as
       * "untranslated plain ASCII" — which was true of the measurement and false of the
       * app. The detector was right and the pass was wrong.
       */
      const enablePseudo = () =>
        page.evaluate(async () => {
          const w = globalThis
          if (typeof w.__wqEnablePseudoLocale !== 'function') return 'no hook on the page'
          w.__WQ_PSEUDO__ = true
          return (await w.__wqEnablePseudoLocale()) ? 'on' : 'refused'
        })

      {
        for (const route of PSEUDO_ROUTES) {
          const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-')
          await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' })
          await page.waitForTimeout(900)
          const pseudo = await enablePseudo()
          if (pseudo !== 'on') {
            // Said out loud rather than skipped. A pass that silently did not happen is
            // the failure mode this whole block exists to correct.
            report.pseudoGap ??= {}
            report.pseudoGap[viewport.name] = `${slug}: ${pseudo}`
            continue
          }
          await page.waitForTimeout(600)
          await shot(`pseudo-${slug}`)
          const measured = await page.evaluate(() => {
            const doc = document.documentElement
            // Text the pseudo-locale did NOT touch. `pseudo()` accents every letter it
            // rewrites, so a leaf of pure ASCII letters is a string that never went
            // through `t()` — or a name from a content pack, which is a fact rather than
            // copy and is correctly left alone.
            const untranslated = []
            // `body` only, and only nodes that are actually laid out. The first version
            // walked the whole document and dutifully reported `<title>WorldQuest`, the
            // `@font-face` block inside a `<style>`, and the `<noscript>` fallback as
            // untranslated copy — three things that are not copy and one of which is
            // CSS. Head content and zero-height nodes are not on screen, so they cannot
            // be a string a user reads.
            for (const node of document.body.querySelectorAll('*')) {
              if (node.children.length !== 0) continue
              if (/^(STYLE|SCRIPT|NOSCRIPT|TITLE|TEMPLATE)$/.test(node.tagName)) continue
              const box = node.getBoundingClientRect()
              if (box.height < 1 || box.width < 1) continue
              const text = (node.textContent ?? '').trim()
              if (text.length < 4) continue
              if (!/^[\x20-\x7E]+$/.test(text)) continue
              if (!/[A-Za-z]{4}/.test(text)) continue
              untranslated.push(text.slice(0, 40))
            }
            return {
              sidewaysScroll: doc.scrollWidth - doc.clientWidth,
              untranslated: [...new Set(untranslated)].slice(0, 8),
            }
          })
          report.pseudo ??= {}
          report.pseudo[viewport.name] ??= {}
          report.pseudo[viewport.name][slug] = measured
        }
        // Back to English for the lesson phases below. A plain navigation is enough —
        // the reload that broke the first version of this pass is exactly what resets it.
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(600)
      }

      const phases = await shootLessonPhases(page, shot)
      if (!phases.gotCorrect || !phases.gotWrong) {
        report.flowGaps ??= {}
        report.flowGaps[viewport.name] = `lesson feedback: correct=${phases.gotCorrect} wrong=${phases.gotWrong}`
      }
      report.flowShots ??= {}
      report.flowShots[viewport.name] = taken
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
    // Reported apart from `notes`, and only when it is large at every width. A tall
    // viewport showing a short screen is normal; the SAME screen being mostly empty at
    // 320 and at 768 is a screen that is not using its space, which is what onboarding
    // was. Not counted as a problem — see `deadSpaceBelow` — so a review reads it and
    // decides rather than being told.
    const dead = Object.entries(byViewport)
      .map(([vp, m]) => [vp, m.deadSpaceBelow])
      .filter(([, d]) => d !== null && d !== 0)
    const empty =
      dead.length === VIEWPORTS.length && dead.every(([, d]) => d.percentOfViewport >= 25)
        ? dead.map(([vp, d]) => `${vp}: ${d.percentOfViewport}%`).join(' · ')
        : null

    problems += notes.length
    console.log(`  ${notes.length === 0 ? '✓' : '⚠'} ${slug}`)
    for (const n of notes) console.log(`      ${n}`)
    if (empty !== null) console.log(`      empty below the content — ${empty}`)
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
  if (report.pseudoGap) {
    problems++
    console.log(`\n  ⚠ the pseudo-locale pass did not run: ${JSON.stringify(report.pseudoGap)}`)
  }
  if (report.pseudo) {
    // Reported, never gated. Untranslated ASCII is usually a country name from a content
    // pack — a fact rather than copy, correctly left alone — so a threshold here would
    // fire on correct behaviour. A person reads the list and knows which is which.
    const notes = []
    for (const [vp, routes] of Object.entries(report.pseudo)) {
      for (const [slug, m] of Object.entries(routes)) {
        if (m.sidewaysScroll > 2) notes.push(`${vp}/${slug}: scrolls sideways ${m.sidewaysScroll}px`)
        if (m.untranslated.length > 0) {
          notes.push(`${vp}/${slug}: plain ASCII — ${m.untranslated.slice(0, 3).map((s) => JSON.stringify(s)).join(', ')}`)
        }
      }
    }
    console.log(`\n  pseudo-locale (en-XA), ${PSEUDO_ROUTES.length} routes${notes.length === 0 ? ' — nothing inflated broke' : ':'}`)
    for (const n of notes.slice(0, 12)) console.log(`      ${n}`)
    if (notes.length > 12) console.log(`      +${notes.length - 12} more in report.json`)
  }
  if (SHOOT_FLOWS) {
    const flowShots = Object.values(report.flowShots ?? {}).reduce((a, b) => a + b, 0)
    console.log(
      `\n  + ${flowShots} flow shots (onboarding-*, lesson-*, offline-*) — screens that are ` +
        `states rather than routes, or the same route with the radio pulled out, and were ` +
        `invisible to this tool until they were not`,
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
