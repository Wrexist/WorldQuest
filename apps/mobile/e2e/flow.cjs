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
 * ## A driver has to behave like a person
 *
 * This flow answered questions in ~250ms for most of its life, and grading discards
 * anything under 400ms as not credible (`MIN_CREDIBLE_ANSWER_MS`; xp-economy.md §
 * "Impossibly fast answers"). So every lesson it ever played graded to zero XP, zero
 * coins and zero scheduling — the anti-cheat path, not the normal one — and no step
 * noticed, because the steps that ran afterwards did not depend on a reward.
 *
 * The general shape is worth remembering: an automated driver is faster than any human
 * and will therefore trip anything that exists to catch inhuman behaviour. Where a rate
 * limit, a debounce or a credibility floor exists, the test has to be slower than it,
 * or it is silently exercising the defence rather than the feature.
 *
 * Run: pnpm e2e
 */

const { chromium } = require('playwright')
const { launchOptions } = require('../../../scripts/chromium.cjs')
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

/**
 * A check that could not run, reported as itself rather than as a pass.
 *
 * The flag-artwork block used to call `step(..., true, 'not reached in this lesson')`
 * when it never met an image question, which printed a tick. Wiring the location facts
 * changed the composed lesson, that branch started firing, and the run went from 68
 * steps to 66 with every one of them green — a check that stopped happening and said
 * nothing, which is the exact failure mode this file's own comments keep correcting.
 *
 * Skipped steps do not fail the run, because whether a given lesson contains a given
 * template is a property of the content shuffle and not a defect. They are counted in
 * the summary, so a check that quietly stops running is visible in one line.
 */
const skip = (name, why) => {
  steps.push({ name, ok: true, skipped: true })
  console.log(`  ⊘ ${name}  — skipped: ${why}`)
}

;(async () => {
  fs.mkdirSync(SHOTS, { recursive: true })
  await new Promise((resolve) => server.listen(PORT, resolve))

  // Resolved by scripts/chromium.cjs: the image's browser when there is one, and
  // Playwright's own download when there is not. Hardcoding the image's path here is
  // what killed this step on CI for the first run that ever reached it.
  const browser = await chromium.launch(launchOptions())
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

  /**
   * "Are we in a lesson, and what is it asking?" — structurally, never by subject.
   *
   * Every one of these checks used to be a regex over the English prompt copy:
   * `/capital of|flag|money do people/i`. Three separate problems with that, and all
   * three bit. It could not see `lesson:prompt.currency_reverse` ("Which country uses
   * the krona?"), which matches none of those words. It hardcoded the subject into a
   * harness for an app whose entire thesis is that the subject is data — an astronomy
   * pack would have failed a green suite. And it passed for years only because a
   * selection bug meant every lesson was capitals; the day lessons drew from all three
   * attributes, four steps went red with nothing wrong in the app.
   *
   * A lesson is a prompt heading above answer options. That is true of every template
   * in every pack, and it is what these steps were always trying to say.
   */
  const lessonPrompt = async () => {
    const options = await page.getByTestId('answer-option').all()
    if (options.length === 0) return undefined
    // `.first()` matched the PREVIOUS route's heading — expo-router leaves it mounted
    // at zero height, so this reported "Explorer!" as the lesson's question. The step
    // still passed (a heading existed), which is exactly why it went unnoticed: the
    // assertion was structural and only the printed detail was wrong. Filter to
    // headings that are actually laid out.
    const heading = await page.evaluate(() => {
      const visible = [...document.querySelectorAll('[role="heading"]')].find(
        (h) => h.getBoundingClientRect().height > 0,
      )
      return visible?.textContent ?? ''
    })
    return heading.trim() || undefined
  }

  /**
   * Doubles every rendered font size, the way the OS setting does natively.
   *
   * Except where the component has declared a lower ceiling. React Native's
   * `maxFontSizeMultiplier` bounds how far a given string may grow, and
   * react-native-web has no way to express it — so a component that uses it
   * (currently only the tab labels) mirrors the value into `data-max-scale`, and this
   * honours it. Otherwise the harness would test a configuration the runtime cannot
   * produce and report a failure nobody can act on.
   */
  const scaleText = () =>
    page.evaluate(() => {
      for (const node of Array.from(document.querySelectorAll('*'))) {
        const size = parseFloat(getComputedStyle(node).fontSize)
        if (!Number.isFinite(size) || size === 0) continue
        const capped = node.closest('[data-max-scale]')
        const factor = capped ? parseFloat(capped.getAttribute('data-max-scale')) || 2 : 2
        node.style.setProperty('font-size', `${size * factor}px`, 'important')
        const lh = parseFloat(getComputedStyle(node).lineHeight)
        if (Number.isFinite(lh)) {
          node.style.setProperty('line-height', `${lh * factor}px`, 'important')
        }
      }
    })

  /**
   * Scale, measure, photograph, report — for one screen that is already on display.
   *
   * A function rather than the body of the loop below because onboarding cannot be
   * reached by URL once it has been walked through, so it has to be measured in place,
   * up in the first-launch section. Copying a hundred lines of geometry to do that is
   * how the two copies start disagreeing about what counts as clipped.
   */
  const check200 = async (name) => {
    await scaleText()
    await page.waitForTimeout(400)

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      // A few pixels of slack: sub-pixel rounding on a scaled layout is not a bug.
      const sideways = doc.scrollWidth - doc.clientWidth
      // Text that has been cut off rather than wrapped. `text-overflow: ellipsis` and
      // a fixed height are the two ways this happens, and both are the same defect:
      // a box sized to an English string at 100 %.
      /**
       * Leaf elements whose text is language rather than ornament.
       *
       * The letter-or-digit test is what separates copy from the decorative glyphs —
       * "⚑", "◉", "✦" — that stand in for artwork we do not have yet. Those are
       * deliberately cropped by their art slots, and counting that as a defect
       * reported the collection grid as broken while it was working correctly.
       */
      const isCopy = (node) =>
        node.children.length === 0 && /[\p{L}\p{N}]/u.test((node.textContent ?? '').trim())

      /**
       * The part of an element its own component lets you see.
       *
       * Intersected with the NEAREST `overflow: hidden` ancestor only, not the whole
       * chain. That ancestor is the box that would crop the text — the card, the art
       * slot, the tile. Walking further up reaches the scroll viewport, and being
       * below the fold of a ScrollView is not clipping: it is content you scroll to.
       * The first version walked to the root and duly reported Home, Explore and the
       * country page as broken because each had more in it than one screenful.
       *
       * `getBoundingClientRect` alone is not enough either: it returns the LAYOUT box,
       * which for a glyph inside a clipping container can be twice the height of the
       * container that crops it. Both halves are needed.
       */
      const visibleRect = (node) => {
        const rect = node.getBoundingClientRect()
        let cropper = null
        for (let p = node.parentElement; p !== null; p = p.parentElement) {
          const style = getComputedStyle(p)
          if (style.overflowX === 'hidden' || style.overflowY === 'hidden') {
            cropper = { box: p.getBoundingClientRect(), style }
            break
          }
        }
        if (cropper === null) return rect
        const { box, style } = cropper
        const left = style.overflowX === 'hidden' ? Math.max(rect.left, box.left) : rect.left
        const right = style.overflowX === 'hidden' ? Math.min(rect.right, box.right) : rect.right
        const top = style.overflowY === 'hidden' ? Math.max(rect.top, box.top) : rect.top
        const bottom =
          style.overflowY === 'hidden' ? Math.min(rect.bottom, box.bottom) : rect.bottom
        return { left, top, right, bottom, width: right - left, height: bottom - top }
      }

      // Text cut off by an ancestor, which is how it actually happens: the Text itself
      // never overflows, the card around it does the cropping. The first version of
      // this looked only at each element's own scroll box and therefore could not see
      // the case it was written for — a country name spilling out of its tile.
      const clipped = Array.from(document.querySelectorAll('*'))
        .filter(isCopy)
        .filter((node) => {
          const laid = node.getBoundingClientRect()
          const seen = visibleRect(node)
          return laid.width - seen.width > 2 || laid.height - seen.height > 2
        })
        // Named, not counted. "2 clipped" sends whoever sees it hunting through a
        // screenshot; the actual string tells them which component to open.
        // Named, not counted. "2 clipped" sends whoever sees it hunting through a
        // screenshot; the actual string tells them which component to open.
        .map((node) => JSON.stringify((node.textContent ?? '').trim().slice(0, 40)))

      // Text that has run into other text. This is the third failure the a11y spec
      // names and the first version of this check could not see it: the tab bar's five
      // labels overlapped into an unreadable smear at 200 %, and because nothing was
      // clipped and the page did not scroll sideways, every assertion passed. It was
      // caught by looking at the screenshot, which is exactly the thing a check is
      // supposed to make unnecessary.
      /**
       * Whether this node is painted anywhere at all right now.
       *
       * Content scrolled past the edge of its own scroll view is not: the container
       * clips it. Its layout rect still says otherwise — `getBoundingClientRect` returns
       * where the box WOULD be — so a chip 30pt below the fold reports coordinates that
       * land on top of the fixed footer, and two elements that are never on screen
       * together get reported as overlapping.
       *
       * That is not hypothetical. Adding the onboarding age step to this pass produced
       * "1960s / Continue", "1950s / Continue", "1940s / Continue" at 200 % text: three
       * decade chips whose boxes sit at y 774–822 inside a scroller that ends at 752.
       * `document.elementFromPoint` at the middle of the 1960s chip returns the Continue
       * button, which is the browser saying plainly that the chip is not there.
       *
       * The NEAREST scrollable ancestor only, for the same reason `visibleRect` crops at
       * the nearest hidden one: that is the box doing the clipping.
       *
       * This is the general form of the `sameLayer` rule below, which knows one element
       * by name. Both are needed — `sameLayer` covers chrome drawn OVER content that is
       * genuinely in view, and this covers content that has left.
       */
      const painted = (node) => {
        const rect = node.getBoundingClientRect()
        for (let p = node.parentElement; p !== null; p = p.parentElement) {
          const style = getComputedStyle(p)
          // `hidden` as well as `auto|scroll`, and the two for the same reason.
          //
          // This walked scrollable ancestors only, which left a blind spot the size of
          // every clipping container in the app: `WheelPicker` draws its rows inside a
          // fixed-height well with `overflow: hidden`, and react-native-web's ScrollView
          // inside it does not constrain its own height — so a row scrolled out of the
          // well had no scrollable ancestor to be cropped against and reported the
          // coordinates it WOULD have had. The onboarding age step failed this check
          // with "2025 overlaps Continue" while the screenshot showed a clipped wheel
          // and a button with clear air above it.
          //
          // The comment on `visibleRect` above already says it "crops at the nearest
          // hidden one" — this is the same rule, finally applied in both places.
          const clips =
            /^(auto|scroll|hidden)$/.test(style.overflowY) ||
            /^(auto|scroll|hidden)$/.test(style.overflowX)
          if (!clips) continue
          const box = p.getBoundingClientRect()
          const inside =
            rect.bottom > box.top + 1 &&
            rect.top < box.bottom - 1 &&
            rect.right > box.left + 1 &&
            rect.left < box.right - 1
          // EVERY clipping ancestor, not just the nearest — an element is on screen only
          // if it survives all of them, and clippers nest.
          //
          // Returning on the first one produced a false alarm nobody could act on:
          // `WheelPicker` puts its rows in a 220 pt well, and at 200 % text that well
          // hangs below the bottom of the step's own scroller. A row can therefore be
          // perfectly visible INSIDE the well while the well itself is off screen — and
          // the check stopped at the well, decided the row was painted, and reported it
          // overlapping the Continue button underneath. Measured rather than guessed:
          // the row sat at 766–800 inside a well at 585–803 inside a scroller ending at
          // 754. Two of those three boxes agreed it was there and the one that mattered
          // never got asked.
          if (!inside) return false
        }
        return true
      }

      const texts = Array.from(document.querySelectorAll('*')).filter((node) => {
        if (!isCopy(node)) return false
        const style = getComputedStyle(node)
        // Absolutely-positioned glyphs sit on top of their siblings on purpose —
        // the correctness tick, the favourite star. Overlap is their job.
        if (style.position === 'absolute' || style.visibility === 'hidden') return false
        return painted(node)
      })

      // Whether two elements are even comparable.
      //
      // The tab bar is fixed chrome and the page scrolls underneath it, so measuring a
      // tab label against whatever happens to be behind it measures the scroll
      // position. But the five labels DO have to be measured against each other —
      // overlapping one another is precisely the bug this check was written for, and
      // an earlier version excluded the whole bar and was therefore blind to it.
      const sameLayer = (a, b) =>
        (a.closest('[role="tablist"]') === null) === (b.closest('[role="tablist"]') === null)

      const overlapping = []
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          if (!sameLayer(texts[i], texts[j])) continue
          const a = visibleRect(texts[i])
          const b = visibleRect(texts[j])
          if (a.width <= 0 || b.width <= 0 || a.height <= 0 || b.height <= 0) continue
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
          const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
          if (x > 2 && y > 2) {
            overlapping.push(
              `${JSON.stringify((texts[i].textContent ?? '').trim().slice(0, 16))}/${JSON.stringify((texts[j].textContent ?? '').trim().slice(0, 16))}`,
            )
          }
        }
      }
      return { sideways, clipped, overlapping }
    })

    await page.screenshot({ path: path.join(SHOTS, `scale200-${name}.png`), fullPage: true })
    const problems = [
      ...overflow.clipped.map((c) => `clipped ${c}`),
      ...overflow.overlapping.map((o) => `overlap ${o}`),
    ]
    // A grid gone wrong reports every tile in it — 59 country names on one line, once.
    // The first four name the component; the count says how bad it is.
    const reported =
      problems.length > 4 ? `${problems.slice(0, 4).join(' · ')} · +${problems.length - 4} more` : problems.join(' · ')
    step(
      `200 % text on ${name}: nothing clipped, nothing overlapping`,
      overflow.sideways <= 2 && problems.length === 0,
      problems.length > 0 ? reported : `overflow ${overflow.sideways}px`,
    )
  }

  // ── first launch: a brand-new user meets onboarding, not Home ─────────────
  await home()
  await page.waitForTimeout(1500)
  let text = await body()
  step(
    'first launch opens onboarding, not Home',
    /Choose your language|five minutes a day|Get started|Next/i.test(text),
  )
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-slide.png') })

  /** Slide one to the age step. A function because the 200 % check below rewinds. */
  const toAgeStep = async () => {
    // The language step has no button any more: answering IS the navigation, so the
    // row is what moves the flow on. This drives it the way a user does rather than
    // through the shared walker, because the checks below rewind to this point and
    // assert between steps — see the note on `scripts/lib/onboarding-walk.cjs`.
    const language = page.getByRole('radio', { name: 'English' }).first()
    if ((await language.count()) > 0) {
      await language.click()
      await page.waitForTimeout(700)
    }
    for (let i = 0; i < 2; i++) {
      await page.getByText('Next', { exact: true }).first().click()
      await page.waitForTimeout(400)
    }
    await page.getByText('Get started', { exact: true }).first().click()
    await page.waitForTimeout(600)
  }

  await toAgeStep()
  text = await body()
  step('age gate asks for a birth year, never "are you over 13?"',
       /When were you born/i.test(text) && !/over 13|13\+/i.test(text))
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-age.png') })

  // ── the onboarding step that is taller than the phone, at 200 % text ───────
  //
  // Not a duplicate of the KEY_SCREENS pass below: onboarding is a gate this harness
  // walks through on its way to everything else, so by the time that loop runs it can
  // never be on screen again by URL. It had no 200 % coverage at all, and it used to be
  // the app's tallest screen — eleven decade chips and ten year chips, which reached the
  // CTA at 320 before anything was scaled and became 1044pt of content in a 684pt view
  // once it was.
  //
  // The chips are a wheel now, whose height is five rows whatever the text scale and
  // however many years it holds, so the overflow this was written for cannot recur in
  // that form. The pass stays: 200 % text is still where a heading, a body paragraph and
  // a fixed-height control fall out with each other, and this is still the only place
  // the harness can catch onboarding at all.
  //
  // The check that was written FIRST for this spot asserted reachability — that a
  // centred scroll view had not pushed its own first child above scroll position zero,
  // where a phone cannot reach it. It passed against a deliberately centred container:
  // Chromium extended the scrollable overflow region to include centred leading
  // overflow, so the browser scrolls back to content a phone would strand. It was
  // deleted rather than kept, because a check that cannot fail is worse than no check —
  // it reads in the output as coverage. The reason the screen avoids the pattern anyway
  // is written down beside the spacers in `OnboardingScreen`.
  await check200('onboarding-age')

  // Rewound rather than un-styled: `scaleText` writes inline `!important` sizes over
  // whatever react-native-web computed, and removing them again would not restore a
  // component's own inline size. Onboarding is not complete yet, so a reload lands back
  // on slide one with a clean document.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await toAgeStep()

  // An adult year, so the flow continues past the child branch.
  //
  // One tap. The picker was deliberately two — a decade chip, then a year chip — because
  // a grid cannot hold a hundred options; it is a wheel now, and every row of the wheel
  // is a real radio so that a driver, a keyboard and VoiceOver all reach it without a
  // scroll gesture. That is the same property this line depends on.
  const adultYear = new Date().getFullYear() - 30
  await page.getByRole('radio', { name: String(adultYear) }).click()
  await page.waitForTimeout(300)
  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(600)
  step('daily goal picker appears', /How much a day|min/i.test(await body()))
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-goal.png') })

  // Back works, and it works on a step whose answer commits on tap — which is the pair
  // that makes auto-advance safe rather than a trap. Asserted here rather than in a unit
  // test as well, because this is the only place the real transition runs.
  await page.getByRole('button', { name: 'Back' }).first().click()
  await page.waitForTimeout(700)
  step('back returns to the previous question', /When were you born/i.test(await body()))
  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(600)

  // A slider now, like the level step: it does not advance on being answered, because a
  // drag passes through every value on its way to one. Its default is ten minutes.
  const goalTrack = await page.getByRole('slider').first().boundingBox()
  if (goalTrack !== null) {
    await page.mouse.click(goalTrack.x + goalTrack.width - 4, goalTrack.y + goalTrack.height / 2)
    await page.waitForTimeout(300)
  }
  step('the goal slider answers to a tap on its track', /20 min/i.test(await body()))
  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(600)

  // The two content questions — which continent, and how well do you know the world.
  // Both are checked rather than clicked through blind: they are the steps whose answers
  // reach `app/lesson.tsx`, and a step that silently stopped rendering would otherwise
  // show up here only as a timeout four lines later.
  step('continent picker appears', /Where do you want to start/i.test(await body()))
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-region.png') })
  await page.getByRole('radio', { name: 'Europe' }).first().click()
  await page.waitForTimeout(700)

  step('starting level appears', /How well do you know the world/i.test(await body()))
  // The difficulty answer is a real slider. Driven by an actual drag rather than by
  // tapping its legend, because the drag is the interaction that was added and a test
  // that only clicked a label would leave the gesture — and the PanResponder wiring
  // behind it — completely unexercised.
  const track = await page.getByRole('slider').first().boundingBox()
  if (track !== null) {
    await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2)
    await page.mouse.down()
    await page.mouse.move(track.x + track.width - 4, track.y + track.height / 2, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(300)
  }
  step('the difficulty slider answers to a drag', /Bring it on/i.test(await body()))
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-level.png') })
  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(600)

  // The closing step: the answers read back, then straight to the taster.
  //
  // There is no premium step here. One was built and removed: `/paywall` already makes
  // that case AFTER the taster lesson, personalised with the countries the user just
  // learned, and a flat perk list before the first lesson was a worse version of it in
  // a worse place.
  step('the plan reads the answers back', /Here is your plan/i.test(await body()))
  step('onboarding asks for no money before the first lesson',
       !/Premium|per month|billed yearly|Try it free/i.test(await body()))
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-plan.png') })
  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(600)

  step('taster promises a lesson with no account', /no account needed/i.test(await body()))

  await page.getByText('Start learning', { exact: true }).first().click()
  await page.waitForTimeout(1800)
  text = await body()
  step('onboarding ends INSIDE a lesson, before any sign-up ask',
       (await lessonPrompt()) !== undefined && !/sign up|create account/i.test(text))
  await page.screenshot({ path: path.join(SHOTS, 'onboarding-taster.png') })

  // ── onboarding is remembered ──────────────────────────────────────────────
  await home()
  await page.waitForTimeout(1500)
  const afterOnboarding = await body()
  step('a returning user goes straight to Home', afterOnboarding.includes('Explorer'))
  await page.screenshot({ path: path.join(SHOTS, 'home.png') })

  // ── the taster lesson, which is the whole product in one flow ─────────────
  //
  // Two taps now, not one. Home's quest button opens the quest's COVER PAGE — what
  // today is, what it pays, start when you are ready — and the lesson begins from
  // there. This step failed the first time that landed, which is the whole reason the
  // E2E drives the real bundle: the change was deliberate, and nothing else in the
  // repo would have noticed that the path to the core loop had grown a screen.
  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(1000)
  const cover = await body()
  step('Continue opens the quest cover page', cover.includes('Daily Quest'), cover.slice(0, 60))

  // `Start quest` on a fresh day, `Continue` once some of it is done — the cover page
  // says so with the same words the card did, so either is a correct label to find.
  const start = page.getByText('Start quest', { exact: true }).first()
  if ((await start.count()) > 0) await start.click()
  else await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(1500)
  text = await body()
  const prompt = await lessonPrompt()
  step('the cover page opens a lesson', prompt !== undefined, prompt)

  if (prompt !== undefined) {
    await page.screenshot({ path: path.join(SHOTS, 'lesson.png') })

    // By testID, not by "the short buttons". That heuristic picked the first button
    // in the DOM, and the moment a close button was added to the header it started
    // clicking THAT — pausing the lesson, changing the screen, and satisfying a
    // `text !== before` assertion without ever answering anything. The step went
    // green with an empty feedback string, which is the only reason it was caught.
    const options = await page.getByTestId('answer-option').all()
    const answered = options.length > 0

    // The question and its answers must read as one thing.
    //
    // The screenshot harness's reconstruction of this screen carried
    // `marginTop: 'auto'` on the options, which bottom-anchored them and opened a
    // half-screen void under the prompt. It looked plausible in a gallery and it was
    // never true of the app — but nothing here could tell, so the design docs showed
    // that layout for as long as it existed.
    //
    // The app's own version of that mistake is one line away, so it is measured
    // rather than trusted. 120px is generous: the real gap is 24px, and anything
    // beyond ~a third of the viewport means the prompt and the answers have stopped
    // being a single question.
    const layout = await page.evaluate(() => {
      const first = document.querySelector('[data-testid="answer-option"]')
      if (!first) return null
      const optTop = first.getBoundingClientRect().top
      // The LAST laid-out piece of QUESTION above the options, not the first in the
      // DOM.
      //
      // Every kind of thing a question is made of, because a question is not always
      // only text. expo-router leaves the previous route mounted, so `[role="heading"]`
      // still matches Home's "Explorer!" at zero height — measuring from that reported
      // a 160px gap for a screen whose real gap is 24px. A flag question puts a 150pt
      // image between the prompt and the answers, which is the question rather than a
      // void. And a currency or capital question carries a locator map for context,
      // which this list was missing: the first question the lesson happened to compose
      // changed to "What money do people use in Japan?", the measurement ran straight
      // over the map to the heading, and reported 198px for a screen whose layout was
      // exactly right.
      //
      // Same shape as the first-button-in-the-DOM bug above, three times now: the
      // selector was right about the kind of thing and wrong about which ones. The rule
      // this step is actually asserting is "no VOID between the question and the
      // answers", so everything the question is built from belongs in the list.
      const above = [
        ...document.querySelectorAll(
          '[role="heading"], [data-testid="prompt-art"], [data-testid="prompt-map"], [data-testid="prompt-locator"]',
        ),
      ]
        .map((h) => h.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.bottom <= optTop)
      if (above.length === 0) return null
      return Math.round(optTop - Math.max(...above.map((r) => r.bottom)))
    })
    step(
      'the answers sit with the question, not flung to the bottom',
      layout !== null && layout < 120,
      layout === null ? 'not measurable' : `${layout}px below the prompt`,
    )

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

    // ── the flag question, which is the mockup's lesson screen ──────────────
    //
    // "Which country's flag is this?" is an image-modality template that was filtered
    // out of every lesson for the life of the project, because no flag file existed to
    // draw. The unit tests prove the composer selects it again; only this proves it
    // RENDERS — through Metro's asset pipeline, in the real bundle, with bytes that
    // actually decode.
    //
    // `naturalWidth > 0` is the whole point. A broken asset reference renders an <img>
    // with the right src, the right size and the right alt, and shows nothing: every
    // structural assertion in this repo passes over a blank rectangle. The decoded
    // width is the one property that cannot be faked by the DOM being correct.
    //
    // Walks forward rather than seeking: which question comes first is the composer's
    // business, and a step that demanded one in a fixed position would be asserting
    // the RNG. It gives up quietly after the lesson's length — reporting "not reached"
    // instead of failing, because a lesson legitimately might not contain one.
    // Clicks the Continue the USER can see.
    //
    // expo-router leaves the previous route mounted, so while a lesson is open Home's
    // own "Continue" is still in the DOM — hidden, and first. `.first().click()` waits
    // thirty seconds on it and then fails with "element is not visible". This is the
    // third bug in this file caused by a selector matching the right kind of thing on
    // the wrong route; the other two are the zero-height heading and the close button.
    const clickVisibleContinue = async () => {
      for (const candidate of await page.getByText('Continue', { exact: true }).all()) {
        if (await candidate.isVisible()) {
          await candidate.click()
          return true
        }
      }
      return false
    }

    let flag = null
    // The whole lesson, not twelve of it. A lesson is sized from the user's measured
    // pace and tops out at MAX_LESSON_ITEMS = 20; looking at twelve meant an image
    // question in the back third was simply never seen. Two extra laps for the feedback
    // cards this advances through on the way.
    for (let i = 0; i < 24 && flag === null; i++) {
      // The block above already answered, so this arrives on the feedback card with
      // every option disabled. Advance FIRST, and on every later lap too — an option
      // that is present but disabled is exactly what Playwright waits thirty seconds
      // on before failing with "element is not enabled".
      const waiting = await page.getByTestId('answer-option').first().isDisabled()
      if (waiting) {
        if (!(await clickVisibleContinue())) break
        await page.waitForTimeout(800)
      }

      const art = await page.evaluate(() => {
        const slot = document.querySelector('[data-testid="prompt-art"]')
        if (!slot) return null
        const img = slot.querySelector('img')
        if (!img) return { drawn: false, src: null, alt: null, w: 0, h: 0 }
        // The IMAGE's box, not the slot's. The slot centres the flag and so spans the
        // full content width — measuring that reported 358×150 for a 200×150 flag and
        // called a correct 4:3 image a 2.39 one.
        const box = img.getBoundingClientRect()
        return {
          drawn: img.naturalWidth > 0 && img.naturalHeight > 0,
          src: img.getAttribute('src'),
          alt: img.getAttribute('alt'),
          w: Math.round(box.width),
          h: Math.round(box.height),
        }
      })
      if (art !== null) {
        flag = art
        break
      }
      const next = await page.getByTestId('answer-option').all()
      if (next.length === 0) break
      await next[0].click()
      await page.waitForTimeout(700)
    }

    if (flag === null) {
      // Not a tick. `content.test.ts` asserts `tpl.flag-to-country.mc4` is selectable at
      // all — that is the invariant, and it belongs in a unit test where it is
      // deterministic. This block checks how the artwork DRAWS, which needs a real
      // browser and a lesson that happens to contain one.
      skip('flag question renders its artwork', 'no image question in this lesson')
    } else {
      step(
        'flag question renders its artwork',
        flag.drawn === true,
        flag.drawn ? `${flag.src} decoded at ${flag.w}×${flag.h}` : `${flag.src} did not decode`,
      )
      // 4:3, measured off the laid-out box rather than trusted from the stylesheet.
      // The slot this replaced was 3:2, and squeezing flag-icons' 4:3 artwork into it
      // would stretch Japan's disc into an ellipse — a wrong fact, drawn.
      const ratio = flag.h > 0 ? flag.w / flag.h : 0
      step(
        'and at the ratio the artwork was drawn for',
        Math.abs(ratio - 4 / 3) < 0.05,
        `${flag.w}×${flag.h} = ${ratio.toFixed(2)}`,
      )
      // It IS the question, so unlike every other flag in the app it must announce
      // itself. react-native-web silently drops `alt` on `Image` — the first version
      // of this component passed it and announced nothing.
      step(
        'and announces itself, because here the picture is the question',
        typeof flag.alt === 'string' && flag.alt.length > 0,
        flag.alt ?? '(none)',
      )
    }
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
    // Shop, where More used to be. The fifth tab changed in the August 2026 redesign
    // (PROJECT.md §7) and Settings moved behind the gear on Profile — which this walk
    // reaches one step further down, because a destination that no longer has a tab
    // still has to be reachable or it is gone.
    { name: 'Shop', proof: /coins|titles|spend/i },
  ]
  const homeText = await (async () => {
    await home()
    return body()
  })()

  // ── the tab icons actually decode ──────────────────────────────────────────
  //
  // `naturalWidth > 0`, for the same reason the flag question checks it: a broken
  // asset reference renders an `<img>` with the right src, the right size and the
  // right alt, and shows NOTHING. Every structural assertion in this repo passes over
  // a blank rectangle, and the tab bar is five of them across the app's primary
  // navigation. This is the check that would have caught a build:icons run that never
  // happened, or an index that drifted from the files on disk.
  //
  // These replaced `⌂ ◎ ◈ ☺ ⋯` — literal text characters, which is why the bar used
  // to need no asset check at all and also why it rendered in a different typeface on
  // every device.
  const tabIcons = await page.evaluate(() => {
    const bar = document.querySelector('[role="tablist"]')
    if (bar === null) return null
    return Array.from(bar.querySelectorAll('img')).map((i) => ({
      w: i.naturalWidth,
      src: i.getAttribute('src') ?? '',
    }))
  })
  step(
    'the five tab icons are real artwork, not blank rectangles',
    tabIcons !== null &&
      tabIcons.length === 5 &&
      tabIcons.every((i) => i.w > 0 && /icons\//.test(i.src)),
    tabIcons === null ? 'no tablist' : `${tabIcons.filter((i) => i.w > 0).length}/5 decoded`,
  )

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

  // ── Settings, now that it is not a tab ─────────────────────────────────────
  //
  // The one step this walk gained rather than swapped. Moving a destination off the tab
  // bar is exactly how a screen becomes unreachable without anybody noticing: the tab is
  // gone from the bar, the route still exists, and nothing fails. So the walk follows
  // the path a user now has to take — Profile, then the gear.
  await home()
  await page.getByRole('tab', { name: 'Profile' }).click()
  await page.waitForTimeout(1000)
  const gear = page.getByRole('button', { name: 'More' }).first()
  const hasGear = (await gear.count()) > 0
  if (hasGear) {
    await gear.click()
    await page.waitForTimeout(1200)
  }
  const settings = await body()
  step(
    'Settings is still reachable, through the gear on Profile',
    hasGear && /settings|about|language/i.test(settings),
    hasGear ? settings.slice(0, 40) : 'no gear on Profile',
  )

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

  // ── the paywall, in the shipped bundle ─────────────────────────────────────
  //
  // Three of these assertions are App Review and FTC exposure rather than preferences,
  // which is why they are checked against the real bundle and not only against jsdom:
  // learning is never gated, the exit is always there, and nothing on the screen
  // applies pressure. The fourth is the one that only the real bundle can answer —
  // with no billing SDK installed the store is genuinely unreachable here, so this is
  // the store-failure path running for real rather than a mocked version of it.
  await page.goto(`http://localhost:${PORT}/paywall?source=settings`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const paywall = await body()
  step('paywall renders', /premium|every lesson stays free/i.test(paywall))
  await page.screenshot({ path: path.join(SHOTS, 'paywall.png') })

  step('paywall promises learning stays free', /every lesson stays free/i.test(paywall))
  step('paywall applies no urgency, scarcity or shame',
       !/hurry|limited time|expires soon|only \d+ (left|spots)|last chance|don'?t miss|you'?ll lose/i
         .test(paywall))
  // With no SDK the store cannot answer, and the screen must say so and stay usable
  // rather than showing a price it invented or a spinner that never stops.
  step('paywall survives a store it cannot reach',
       /couldn'?t reach the store|nothing to buy here yet|checking prices/i.test(paywall) &&
       /not now/i.test(paywall))

  const dismissed = await page.getByText('Not now', { exact: true }).first().isVisible()
  step('paywall is escapable on the first frame, at full size', dismissed)

  // ── Settings owns the subscription, and does not bury cancelling ───────────
  // `/settings`, not `/more`. The route moved when Shop took the fifth tab, and a URL
  // that 404s here would have failed as "Settings has no Premium section" — a check
  // reporting the wrong defect is worse than one that does not run.
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const more = await body()
  step('Settings has a Premium section', /premium/i.test(more))
  step('Settings offers restore, which both stores require', /restore purchases/i.test(more))
  await page.screenshot({ path: path.join(SHOTS, 'settings-premium.png') })

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
  step('speed round starts a timed lesson', (await lessonPrompt()) !== undefined)
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
    // Think first. `MIN_CREDIBLE_ANSWER_MS` is 400 and grading DISCARDS anything
    // faster — no XP, no coins, and deliberately no reach into the scheduler, because
    // a sub-400ms answer is a bot and letting one through would corrupt the memory
    // model. This loop used to answer in ~250ms, which meant every lesson it ever
    // played graded to zero and the summary it produced was the rejected-everything
    // case. The quest and achievement steps below passed anyway, so nothing said so.
    await page.waitForTimeout(600)
    await options[0].click()
    await page.waitForTimeout(250)
    const next = page.getByRole('button', { name: 'Continue' })
    if (await next.count()) await next.first().click()
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(800)

  // ── the summary, in the only place its animation is real ───────────────────
  //
  // jsdom cannot check any of this. It has no `matchMedia`, so react-native-web reports
  // reduce-motion as ON for every component test, and its `Animated.timing` finishes in
  // a single frame either way — a count-up that did nothing at all would pass there.
  // Chromium runs the actual animation, so this is the one place the tally can be
  // caught short.
  //
  // Longer than `motion.celebrate` (900ms), because the assertion is that the number
  // LANDS. An `Animated` listener is throttled and its final frame is not guaranteed;
  // without the completion callback in `useCountUp` this reads 79 of 80.
  await page.waitForTimeout(1400)
  const summary = await body()
  const headline = await page.getByRole('heading').first().textContent()
  step('the lesson ends on a real headline, not a key',
       /^(Flawless\.|Nice work\.|Lesson complete\.)$/.test((headline ?? '').trim()),
       headline ?? 'no heading')

  const xpCard = page.getByTestId('summary-xp')
  const xpShown = ((await xpCard.textContent()) ?? '').match(/\+(\d+)/)?.[1]
  const xpSpoken = ((await xpCard.getAttribute('aria-label')) ?? '').match(/(\d+)/)?.[1]
  // Non-zero matters as much as the two agreeing: zero is what the anti-cheat path
  // produces, and a lesson answered at human speed must never land there.
  step('the XP tally finishes on the figure the screen reader was given',
       xpShown !== undefined && xpShown === xpSpoken && Number(xpShown) > 0,
       `shown +${xpShown ?? '?'} · spoken ${xpSpoken ?? '?'}`)

  step('the summary reports facts moved forward, not just points',
       /Facts stronger/.test(summary))

  // The flags of the countries just answered about. Same check as the lesson prompt:
  // a broken image and a missing one look identical in a screenshot.
  const practisedFlags = await page
    .getByTestId('summary-practised')
    .locator('img')
    .evaluateAll((imgs) => imgs.map((i) => ({ w: i.naturalWidth, alt: i.getAttribute('alt') })))
  step('and draws real flags for where the user just was',
       practisedFlags.length > 0 &&
         practisedFlags.every((f) => f.w > 0 && (f.alt ?? '').length > 0),
       `${practisedFlags.length} flag(s)`)
  await page.screenshot({ path: path.join(SHOTS, 'lesson-summary.png') })

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
  step('and resuming returns to the question', (await lessonPrompt()) !== undefined)

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

  // ── keyboard-only: the primary task, without a pointer ─────────────────────
  //
  // The accessibility spec's hardest rule is that a user must be able to complete a
  // screen's primary task without sight, and its instruction is to turn on VoiceOver
  // and set the brightness to zero. Neither VoiceOver nor TalkBack exists in this
  // container, so that check has sat unticked since the first week.
  //
  // What CAN be checked here is keyboard operability, and it is not a consolation
  // prize: a control that a screen reader cannot activate is almost always a control
  // the keyboard cannot activate either — both go through the same accessibility
  // action rather than through a touch sequence. That is exactly how the tab bar
  // shipped inert on web with `onTouchEnd`, unreachable by keyboard AND by screen
  // reader on every platform.
  //
  // So: answer a question using nothing but Tab and Enter. If that works, the option
  // is a real button with a real role, focusable and activatable through the
  // accessibility layer. If it does not, no screen reader could have used it either.
  //
  // What this still does NOT prove: announcement quality, focus order sanity to a
  // person, whether the labels make sense read aloud, or that the reader's own
  // gestures work. Those need a device.
  await page.goto(`http://localhost:${PORT}/lesson`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const before = await lessonPrompt()
  step('keyboard: a lesson opens', before !== undefined, before)

  if (before !== undefined) {
    // Tab until focus lands on an answer option, then activate it with the keyboard.
    // Bounded so a focus trap fails the step instead of hanging the run.
    let landed = false
    for (let i = 0; i < 40 && !landed; i++) {
      await page.keyboard.press('Tab')
      landed = await page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') === 'answer-option',
      )
    }
    step('keyboard: an answer option can be reached with Tab alone', landed)

    if (landed) {
      const label = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1200)
      const text = await body()
      // The feedback panel is the proof the answer was actually scored — focus moving
      // is not the same as the control doing its job.
      const scored = /Perfect!|That's [^\n]*|The answer is [^\n]*/.test(text)
      step('keyboard: Enter scores it, with no pointer involved', scored, label)
    }
  }

  // ── 200 % text ─────────────────────────────────────────────────────────────
  //
  // The Definition of Done has asked for this since the first week and nothing has
  // ever checked it. Larger text is, by an order of magnitude, the most-used
  // accessibility feature on both platforms — this is not a niche case, and two of the
  // eight personas depend on it directly.
  //
  // ## How this simulates it, and why that is honest
  //
  // React Native multiplies every `fontSize` by the OS accessibility scale before it
  // reaches the view. react-native-web does not — it writes the number straight into
  // an inline style — so the browser has no equivalent to turn on. Doubling every
  // inline `font-size` and `line-height` in the document reproduces exactly what the
  // native runtime does, on the real bundle, with the real layout engine.
  //
  // What it therefore CAN prove: that nothing clips, nothing overlaps, and the page
  // does not start scrolling sideways when every string doubles. Those are the three
  // failures the a11y spec names, and all three are layout consequences that jsdom
  // cannot see because it does not lay anything out.
  //
  // What it CANNOT prove: how it feels, whether the reading order still makes sense,
  // or anything about the platform's own scaling curve. `maxFontScale` is 2.0 in the
  // tokens and this tests exactly that ceiling.
  const KEY_SCREENS = [
    ['/', 'home'],
    ['/lesson', 'lesson'],
    ['/explore', 'explore'],
    ['/collection/flags', 'collection'],
    ['/country/SE', 'country'],
    ['/profile', 'profile'],
    // Text-heavy, with a fixed footer holding two buttons and a link. The screen most
    // likely to clip its own exit at 200 %, and the one where clipping the exit is a
    // review-team problem rather than a cosmetic one.
    ['/paywall?source=settings', 'paywall'],
    // Onboarding is deliberately absent: it is a gate this harness has already walked
    // through by the time it gets here, so it cannot be revisited by URL. It is checked
    // in place, up in the first-launch section, where it is genuinely on screen.
  ]

  // `scaleText` lives above the first-launch walk, which is the only moment onboarding
  // can be measured.

  for (const [route, name] of KEY_SCREENS) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await check200(name)
  }

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
  const skipped = steps.filter((s) => s.skipped).length
  console.log(
    `\n${steps.length - failed}/${steps.length} steps passed` +
      (skipped > 0 ? ` (${skipped} skipped — see ⊘ above)` : ''),
  )
  console.log(`screenshots → ${SHOTS}\n`)

  await browser.close()
  server.close()
  process.exit(failed > 0 ? 1 : 0)
})()
