/**
 * The accessibility tree, as a screen reader receives it.
 *
 * ## The gap this closes
 *
 * Three things in this repo already touch accessibility, and none of them looks at
 * the thing a screen reader actually consumes:
 *
 * - `pnpm lint:a11y` reads source. It can see that an `accessibilityLabel` prop was
 *   written; it cannot see what the label computes to at runtime.
 * - `pnpm design:shots` counts "unlabelled controls" as `aria-label` **or**
 *   `textContent` being non-empty. A button whose only content is `✕` passes that,
 *   and is announced as "close, black cross mark" or in some readers as nothing.
 * - `pnpm e2e` proves an answer can be reached with Tab and scored with Enter. That
 *   rules out the mechanical failure — the tab bar once shipped inert on web *and*
 *   unreachable by reader on every platform — but says nothing about whether what is
 *   announced makes sense.
 *
 * Chromium computes a real accessibility tree, with real accessible names resolved
 * through the same precedence rules the platform APIs use. Playwright exposes it.
 * That is a genuine screen-reader-adjacent signal and it was sitting unused.
 *
 * ## What this proves, and what it emphatically does not
 *
 * It proves the **mechanical** half: every interactive node has a name, that name is
 * words rather than a glyph, roles are what they claim, and focus order follows
 * reading order.
 *
 * It does not prove the app is usable by a blind person. Chromium's tree is not
 * VoiceOver's and is not TalkBack's — they differ in what they flatten, what they
 * announce on focus, and how they group. `docs/plan/device-pass.md` §4 is still the
 * real test, and the instruction there is still the right one: turn the reader on,
 * turn the screen brightness to zero, and complete a lesson. Nothing here replaces
 * that. This catches the failures that should never have reached a human tester.
 *
 * Run: pnpm a11y:tree
 */

const { chromium } = require('playwright')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = process.env.WQ_WEB ?? path.join(process.cwd(), 'node_modules', '.cache', 'wq-web')
const PORT = 4175

const ROUTES = [
  '/',
  '/lesson',
  '/explore',
  '/quests',
  '/profile',
  '/more',
  '/collection/flags',
  '/country/SE',
  '/achievements',
  '/streak',
]

/**
 * Routes outside the tab bar, which must each offer a way back.
 *
 * The root `Stack` sets `headerShown: false`, so nothing supplies one for free. All
 * four of these shipped without one — `/achievements` had zero interactive nodes of
 * any kind. Android's hardware key and iOS's edge-swipe hid it from anyone testing by
 * hand; on web it is a dead end, and for a reader user on any platform there is no
 * announced way out.
 *
 * `/lesson` is deliberately absent: it is a full-screen modal whose close control is
 * an ✕ labelled `lesson:close`, and quitting a lesson mid-question is a different
 * action from going back.
 */
const NEEDS_BACK = new Set(['/collection/flags', '/country/SE', '/achievements', '/streak'])

/** Accessible names that count as "a way back", in the app's two locales. */
const BACK_NAME = /^(back|tillbaka)$/i

/** Roles that a user operates. A name is not optional on any of them. */
const INTERACTIVE = new Set([
  'button',
  'link',
  'tab',
  'radio',
  'checkbox',
  'switch',
  'menuitem',
  'combobox',
  'textbox',
  'slider',
])

/**
 * Names that are technically present and useless when spoken.
 *
 * The rule is the same one `flow.cjs` arrived at for its 200 %-text check: a label is
 * copy if it contains a letter or a digit. `✕`, `→`, `♥`, `🔥` are decoration. A
 * reader announcing "button, black right-pointing triangle" has told the user nothing
 * about what the button does.
 */
const isSpeakable = (name) => /[\p{L}\p{N}]/u.test(name ?? '')

/**
 * Names that are present, speakable, and still wrong.
 *
 * `worldquest-a11y` is explicit: every control announces its *purpose*, not its icon.
 * "Back", not "chevron". These are the icon names most likely to leak from a design
 * handoff into a label.
 */
const ICON_WORDS =
  /^(chevron|caret|arrow|icon|glyph|cross|tick|check ?mark|hamburger|kebab|ellipsis|dots?)\b/i

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

/**
 * Pull the computed tree over CDP.
 *
 * `page.accessibility.snapshot()` was removed in Playwright 1.6x. `Accessibility.
 * getFullAXTree` is what it was built on and is what Chromium hands the platform
 * layer, so this is the same data one level down rather than a workaround.
 *
 * `ignored` nodes are dropped: those are the ones Chromium has already decided a
 * reader will not see (`aria-hidden`, presentational, zero-size). Keeping them would
 * flag every decorative glyph the app correctly hides.
 */
async function axTree(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Accessibility.enable')
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  await cdp.detach()
  return nodes
    .filter((n) => n.ignored !== true)
    .map((n) => ({
      role: n.role?.value ?? '',
      name: typeof n.name?.value === 'string' ? n.name.value : '',
    }))
}

const findings = []
const finding = (route, kind, detail) => findings.push({ route, kind, detail })

;(async () => {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error(
      `✗ No exported bundle at ${ROOT}.\n` +
        `  Run: pnpm --filter @worldquest/mobile exec expo export --platform web --output-dir ${ROOT}`,
    )
    process.exit(1)
  }

  await new Promise((resolve) => server.listen(PORT, resolve))
  const browser = await chromium.launch({
    executablePath: process.env.WQ_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

  // Same reason as design-shots: without this the whole tool audits the onboarding
  // screen ten times and reports one confident, uniform, wrong answer.
  const completeOnboarding = async () => {
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    if (!/Get started|Next/i.test(await page.evaluate(() => document.body.innerText))) return
    for (let i = 0; i < 2; i++) {
      await page.getByText('Next', { exact: true }).first().click()
      await page.waitForTimeout(350)
    }
    await page.getByText('Get started', { exact: true }).first().click()
    await page.waitForTimeout(500)
    const adultYear = new Date().getFullYear() - 30
    await page.getByRole('radio', { name: `${Math.floor(adultYear / 10) * 10}s` }).click()
    await page.waitForTimeout(250)
    await page.getByRole('radio', { name: String(adultYear) }).click()
    await page.waitForTimeout(250)
    await page.getByText('Continue', { exact: true }).first().click()
    await page.waitForTimeout(500)
    await page.getByText('Continue', { exact: true }).first().click()
    await page.waitForTimeout(500)
    await page.getByText('Start learning', { exact: true }).first().click()
    await page.waitForTimeout(1200)
  }

  await completeOnboarding()

  console.log('Accessibility tree — what a reader receives\n')

  for (const route of ROUTES) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)

    const nodes = await axTree(page)
    const controls = nodes.filter((n) => INTERACTIVE.has(n.role))
    for (const control of controls) {
      const name = (control.name ?? '').trim()
      if (name === '') {
        finding(route, 'unnamed', `<${control.role}> has no accessible name`)
      } else if (!isSpeakable(name)) {
        finding(route, 'glyph-only', `<${control.role}> is announced as ${JSON.stringify(name)}`)
      } else if (ICON_WORDS.test(name)) {
        finding(route, 'icon-name', `<${control.role}> named ${JSON.stringify(name)} — say what it does`)
      }
    }

    if (NEEDS_BACK.has(route) && !controls.some((c) => BACK_NAME.test((c.name ?? '').trim()))) {
      finding(route, 'no-way-back', 'a full-screen route with no control named "Back"')
    }

    // Focus order against reading order. A reader moves through the tree in DOM
    // order; if that disagrees with where things visually are, the screen is being
    // read out of sequence.
    const order = await page.evaluate(() => {
      const focusable = [...document.querySelectorAll('[role],[tabindex],button,a,input')].filter(
        (el) => {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return false
          return el.tabIndex >= 0
        },
      )
      return focusable.map((el) => {
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), left: Math.round(r.left) }
      })
    })
    // Allow a generous slack: rows legitimately go right-to-left within a line, and
    // a sticky header or tab bar sits outside the flow. Only a large backwards jump
    // means the DOM disagrees with the page.
    let regressions = 0
    for (let i = 1; i < order.length; i++) {
      if (order[i].top < order[i - 1].top - 120) regressions++
    }
    if (regressions > 1) {
      finding(route, 'focus-order', `${regressions} large backwards jumps in focus order`)
    }

    const named = controls.length - findings.filter((f) => f.route === route).length
    console.log(
      `  ${route.padEnd(20)} ${String(controls.length).padStart(3)} controls, ` +
        `${Math.max(0, named)} cleanly named`,
    )
  }

  console.log()
  if (findings.length > 0) {
    const byKind = {}
    for (const f of findings) (byKind[f.kind] ??= []).push(f)
    for (const [kind, items] of Object.entries(byKind)) {
      console.log(`  ${kind}:`)
      for (const item of items) console.log(`    ✗ ${item.route}  ${item.detail}`)
    }
    console.error(
      `\n✗ ${findings.length} accessibility-tree problem(s).\n\n` +
        '  Every one of these is what a screen reader will actually say. A control with\n' +
        '  no name is a control a blind user cannot identify; one named for its icon is\n' +
        '  one they have to guess at. Fix the label, not the check.\n',
    )
    await browser.close()
    server.close()
    process.exit(1)
  }

  console.log(
    '✓ every interactive node has a speakable name, and focus follows reading order.\n' +
      '  This is the MECHANICAL half only. Chromium is not VoiceOver and is not TalkBack.\n' +
      "  Whether the app makes sense when heard is device-pass.md §4, and it still hasn't\n" +
      '  been done.\n',
  )
  await browser.close()
  server.close()
})()
