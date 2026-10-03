// Actual Expo export, fresh browser profiles, onboarding driven through visible controls.
// This is browser evidence. Doubling glyphs does not emulate native Dynamic Type.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { browserContext, assertRoute } = require('./lib/browser-harness.cjs')

const root = path.resolve(__dirname, '..')
const web = path.resolve(process.argv[2] || path.join(root, 'node_modules/.cache/wq-native-clay-web'))
const out = path.resolve(process.env.WQ_REVIEW_OUT || path.join(root, 'docs/design/reviews/native-clay-2026-10-03/browser'))
const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]
const report = {
  source: web, realExpoExport: true, seededAccount: false, cases: [], errors: [],
  limitations: [
    'Chromium and react-native-web; no iOS/Android device or native gesture evidence.',
    'Swedish accessibility cases double rendered glyphs and honor Reduced Motion. They do not set native fontScale or emulate OS Dynamic Type.',
    'Onboarding stops at the taster. No lesson/account state or reward state is created by this script.',
  ],
}

const server = http.createServer((req, res) => {
  let file = path.resolve(web, '.' + decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname))
  if (file !== web && !file.startsWith(web + path.sep)) { res.writeHead(403); res.end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(web, 'index.html')
  res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})

async function enlargeGlyphs(page) {
  await page.evaluate(() => {
    const values = [...document.querySelectorAll('[dir="auto"]:not([data-review-scaled])')].map(node => ({ node, size: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight), factor: Math.min(2, Number(node.closest('[data-max-scale]')?.getAttribute('data-max-scale') || 2)) }))
    for (const { node, size, line, factor } of values) {
      if (Number.isFinite(size)) node.style.fontSize = size * factor + 'px'
      if (Number.isFinite(line)) node.style.lineHeight = line * factor + 'px'
      node.dataset.reviewScaled = 'true'
    }
  })
}

async function bounds(locator) {
  return locator.evaluate(node => {
    const r = node.getBoundingClientRect()
    let clipped = false
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), b = parent.getBoundingClientRect()
      if (/(hidden|scroll|auto)/.test(css.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) clipped = true
      if (/(hidden|scroll|auto)/.test(css.overflowX) && (r.left < b.left - 1 || r.right > b.right + 1)) clipped = true
    }
    return { x: r.x, y: r.y, width: r.width, height: r.height, fullyVisible: !clipped && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1 }
  })
}

async function metrics(page) {
  return page.evaluate(() => {
    const textOutsideViewport = [], textClippedHorizontally = []
    for (const node of document.querySelectorAll('[dir="auto"]')) {
      if (!node.textContent?.trim() || node.closest('[aria-hidden="true"]') || !node.getBoundingClientRect().width) continue
      const range = document.createRange(); range.selectNodeContents(node)
      const r = range.getBoundingClientRect()
      if (r.left < -1 || r.right > innerWidth + 1) textOutsideViewport.push(node.textContent.trim())
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent), b = parent.getBoundingClientRect()
        if (/(hidden|scroll|auto)/.test(css.overflowX) && (r.left < b.left - 1 || r.right > b.right + 1)) { textClippedHorizontally.push(node.textContent.trim()); break }
      }
    }
    const controls = [...document.querySelectorAll('[role="button"],[role="radio"]')].filter(node => !node.closest('[aria-hidden="true"]') && node.getBoundingClientRect().width)
    const smallTargets = controls.map(node => { const r = node.getBoundingClientRect(); return { label: node.getAttribute('aria-label') || node.textContent, width: r.width, height: r.height } }).filter(r => r.width < 43.5 || r.height < 43.5)
    return { sidewaysScroll: Math.max(0, document.documentElement.scrollWidth - innerWidth), textOutsideViewport: [...new Set(textOutsideViewport)], textClippedHorizontally: [...new Set(textClippedHorizontally)], smallTargets }
  })
}

async function capture(page, copy, state, viewport, accessible) {
  assertRoute(page, '/onboarding')
  if (accessible) await enlargeGlyphs(page)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  const name = `${state}-${viewport.width}-${accessible ? 'sv-dark-text200-reduced' : 'en-light-normal'}`
  const actionKey = state === 'welcome' ? 'cta.start' : state === 'taster' ? 'taster.start' : 'age.continue'
  const action = page.getByRole('button', { name: copy[`onboarding:${actionKey}`], exact: true })
  const evidence = { name, state, ...viewport, language: accessible ? 'sv' : 'en', theme: accessible ? 'dark' : 'light', glyphScale: accessible ? 2 : 1, reducedMotion: accessible, layout: await metrics(page), action: await bounds(action) }
  await page.screenshot({ path: path.join(out, name + '.png') })
  if (state === 'region' || state === 'goal') {
    const options = page.getByRole('radio')
    evidence.options = []
    for (const option of await options.all()) {
      await option.scrollIntoViewIfNeeded()
      evidence.options.push({ label: await option.getAttribute('aria-label'), selected: await option.getAttribute('aria-checked'), ...(await bounds(option)) })
    }
    evidence.actionAfterScroll = await bounds(action)
    if (accessible || viewport.width === 320) await page.screenshot({ path: path.join(out, name + '-scrolled.png') })
  }
  if (state === 'welcome' || state === 'taster') {
    const body = page.getByText(copy[`onboarding:${state}.body`], { exact: true })
    await body.scrollIntoViewIfNeeded()
    evidence.bodyAfterScroll = await bounds(body)
    evidence.actionAfterScroll = await bounds(action)
    if (accessible && viewport.width === 320) await page.screenshot({ path: path.join(out, name + '-scrolled.png') })
  }
  if (accessible) {
    const mascot = page.getByTestId('world-mascot').first()
    evidence.mascotTransforms = []
    for (let sample = 0; sample < 3; sample++) {
      evidence.mascotTransforms.push(await mascot.evaluate(node => [node, ...node.querySelectorAll('*')].map(child => getComputedStyle(child).transform).join('|')))
      await page.waitForTimeout(120)
    }
    evidence.mascotStill = new Set(evidence.mascotTransforms).size === 1
  }
  report.cases.push(evidence)
  assert.equal(evidence.action.fullyVisible, true, `${name}: primary action visible without scrolling`)
  assert.equal(evidence.actionAfterScroll?.fullyVisible ?? true, true, `${name}: primary action stays visible after scrolling`)
  assert.equal(evidence.bodyAfterScroll?.fullyVisible ?? true, true, `${name}: body remains reachable`)
  assert.ok(evidence.options?.every(option => option.fullyVisible) ?? true, `${name}: every option is reachable`)
  assert.equal(evidence.layout.sidewaysScroll, 0, `${name}: no page overflow`)
  assert.deepEqual(evidence.layout.textOutsideViewport, [], `${name}: all text stays within viewport width`)
  assert.deepEqual(evidence.layout.textClippedHorizontally, [], `${name}: no horizontal text clipping`)
  assert.deepEqual(evidence.layout.smallTargets, [], `${name}: targets >=44px`)
  assert.equal(evidence.mascotStill ?? true, true, `${name}: reduced motion is still`)
  console.log(`PASS ${name}`)
}

async function walk(page, origin, viewport, accessible) {
  const copy = require(`../packages/i18n/locales/${accessible ? 'sv' : 'en'}/onboarding.json`)
  const click = async key => { await page.getByRole('button', { name: copy[`onboarding:${key}`], exact: true }).click(); await page.waitForTimeout(450) }
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: copy['onboarding:cta.start'], exact: true }).waitFor()
  await capture(page, copy, 'welcome', viewport, accessible)
  await click('cta.start')
  await page.getByRole('radio', { name: accessible ? 'Svenska' : 'English', exact: true }).click()
  await page.waitForTimeout(700)
  await click('cta.skip')
  await page.getByRole('radio', { name: String(new Date().getFullYear() - 30), exact: true }).click()
  await click('age.continue')
  await capture(page, copy, 'goal', viewport, accessible)
  const goal = page.getByRole('radio', { name: /20 min/ })
  await goal.click()
  assert.equal(await goal.getAttribute('aria-checked'), 'true')
  await click('age.continue')
  await capture(page, copy, 'region', viewport, accessible)
  const region = page.getByRole('radio', { name: accessible ? 'Europa' : 'Europe', exact: true })
  await region.click()
  assert.equal(await region.getAttribute('aria-checked'), 'true')
  await click('age.continue')
  await click('age.continue')
  await click('age.continue')
  await capture(page, copy, 'taster', viewport, accessible)
}

;(async () => {
  assert.ok(fs.existsSync(path.join(web, 'index.html')), 'Export the Expo app first')
  fs.mkdirSync(out, { recursive: true })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch(launchOptions())
  try {
    for (const accessible of [false, true]) for (const viewport of viewports) {
      const context = await browser.newContext({ ...browserContext, locale: accessible ? 'sv-SE' : 'en-US', viewport, deviceScaleFactor: 2, colorScheme: accessible ? 'dark' : 'light', reducedMotion: accessible ? 'reduce' : 'no-preference' })
      const page = await context.newPage()
      page.setDefaultTimeout(20000)
      page.on('pageerror', error => report.errors.push(error.message))
      try { await walk(page, origin, viewport, accessible) } finally { await context.close() }
    }
    assert.deepEqual(report.errors, [], 'No uncaught browser errors')
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
  console.log(JSON.stringify({ cases: report.cases.length, errors: report.errors, output: out }))
})().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
