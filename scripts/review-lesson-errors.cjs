#!/usr/bin/env node
// Real D1 export, UI-completed onboarding, and intercepted local failures only.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { browserContext, assertRoute } = require('./lib/browser-harness.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')

const root = path.resolve(__dirname, '..')
const web = path.resolve(process.argv[2] || path.join(root, 'node_modules/.cache/wq-web-d1'))
const out = path.resolve(process.env.WQ_REVIEW_OUT || path.join(root, 'docs/design/reviews/native-clay-2026-10-03/errors'))
const port = Number(process.env.WQ_LESSON_ERRORS_PORT || 4246)
const base = `http://127.0.0.1:${port}`
const report = { source: web, realApp: true, onboardingCompletedThroughUI: true, seededAccount: false,
  network: 'Every API request intercepted; no Worker or production connection', cases: [], interactions: [], pageErrors: [], blockedExternal: [],
  limitations: ['Chromium/react-native-web, not an iPhone.', '200% enlarges rendered glyphs; it does not emulate native fontScale layout branches.'] }
const copy = Object.fromEntries(['en', 'sv'].map(locale => [locale, JSON.parse(fs.readFileSync(path.join(root, 'packages/i18n/locales', locale, 'common.json'), 'utf8'))]))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.json': 'application/json' }
const server = http.createServer((request, response) => {
  let file = path.resolve(web, '.' + decodeURIComponent(new URL(request.url, base).pathname))
  if (file !== web && !file.startsWith(web + path.sep)) { response.writeHead(403); response.end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(web, 'index.html')
  response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(response)
})
const screenshot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') })
async function top(page) {
  await page.evaluate(() => { for (const node of document.querySelectorAll('*')) if (node.scrollHeight > node.clientHeight && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) node.scrollTop = 0 })
}
async function enlargeGlyphs(page) {
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('[dir="auto"]:not([data-error-scaled])')].map(node => ({ node, font: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight) }))
    for (const { node, font, line } of items) {
      if (Number.isFinite(font)) node.style.fontSize = font * 2 + 'px'
      if (Number.isFinite(line)) node.style.lineHeight = line * 2 + 'px'
      node.setAttribute('data-error-scaled', 'true')
    }
  })
}
async function bounds(locator) {
  return locator.evaluate(node => {
    const r = node.getBoundingClientRect()
    let clipped = false
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const p = parent.getBoundingClientRect(), style = getComputedStyle(parent)
      if (/(hidden|auto|scroll)/.test(style.overflowY) && (r.top < p.top - 1 || r.bottom > p.bottom + 1)) clipped = true
    }
    return { x: r.x, y: r.y, width: r.width, height: r.height, reachable: !clipped && r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1 }
  })
}
async function capture(page, fault, locale, width, enlarged) {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
  if (enlarged) await enlargeGlyphs(page)
  await top(page)
  await page.waitForTimeout(250)
  assertRoute(page, '/lesson')
  const title = copy[locale][`common:error.${fault === 'unavailable' ? 'service' : 'generic'}.title`]
  const heading = page.getByRole('heading', { name: title, exact: true })
  await heading.waitFor()
  assert.equal(await page.getByTestId('mascot-pose-thinking').count(), 1)
  assert.equal(await page.getByTestId('cloud-backdrop').count(), 1)
  assert.equal(await page.getByTestId('mascot-film').count(), 0)
  const images = await page.getByTestId('mascot-still').evaluate(async node => {
    const images = [...node.querySelectorAll('img')]
    await Promise.all(images.map(image => image.decode()))
    return images.map(image => ({ file: new URL(image.currentSrc || image.src).pathname.split('/').pop(), decoded: image.complete && image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight }))
  })
  assert.ok(images.length && images.every(image => image.decoded), 'Thoughtful Atlas must decode')
  const card = await heading.locator('..').evaluate(node => ({
    radius: getComputedStyle(node).borderRadius,
    shadow: getComputedStyle(node).boxShadow,
    gradients: [...node.querySelectorAll('*')].filter(child => getComputedStyle(child).backgroundImage.includes('linear-gradient')).length,
  }))
  assert.ok(card.gradients > 0, 'Error content must use the clay card')
  const layout = await page.evaluate(() => {
    const overflow = []
    for (const node of document.querySelectorAll('[dir="auto"]')) {
      if (!node.textContent.trim() || node.closest('[aria-hidden="true"]')) continue
      const range = document.createRange(); range.selectNodeContents(node)
      const r = range.getBoundingClientRect()
      if (r.width && (r.left < -1 || r.right > innerWidth + 1)) overflow.push(node.textContent.trim())
    }
    return { sidewaysScroll: Math.max(0, document.documentElement.scrollWidth - innerWidth), textOutsideViewport: overflow }
  })
  assert.equal(layout.sidewaysScroll, 0)
  assert.deepEqual(layout.textOutsideViewport, [])
  const name = `${fault}-${width}-${locale}${enlarged ? '-dark-glyph2-reduced' : '-normal'}`
  await screenshot(page, name)
  const back = page.getByRole('button', { name: copy[locale]['common:back'], exact: true })
  const retry = page.getByRole('button', { name: copy[locale]['common:retry'], exact: true })
  assert.equal(await retry.count(), fault === 'unavailable' ? 0 : 1)
  const actions = []
  for (const button of fault === 'unavailable' ? [back] : [retry, back]) {
    await button.scrollIntoViewIfNeeded()
    const measured = await bounds(button)
    assert.ok(measured.reachable, 'Recovery action must be reachable after scrolling')
    assert.ok(measured.width >= 44 && measured.height >= 44, 'Recovery target must be at least 44pt')
    actions.push({ label: await button.innerText(), ...measured })
  }
  await screenshot(page, name + '-actions')
  report.cases.push({ name, route: page.url(), width, locale, enlarged, title, images, card, layout, actions })
  console.log(`Captured ${name}`)
}
async function stableRequests(page, requests, label) {
  // Allow the shared query client's bounded 1s/2s/4s recovery attempts to finish.
  await page.waitForTimeout(8500)
  const before = requests.length
  await page.waitForTimeout(3000)
  assert.equal(requests.length, before, 'An idle lesson error must not keep retrying')
  return { label, requestsAfterSettling: before, requestsAfterIdle: requests.length, quietWindowMs: 3000 }
}
async function exercise(page, fault, locale, requests) {
  const idle = await stableRequests(page, requests, `${fault}-${locale}`)
  let retryRequests = 0
  if (fault === 'transport') {
    const before = requests.length
    await page.getByRole('button', { name: copy[locale]['common:retry'], exact: true }).click()
    await page.getByRole('heading', { name: copy[locale]['common:error.generic.title'], exact: true }).waitFor()
    retryRequests = requests.length - before
    assert.ok(retryRequests > 0, 'An explicit retry must attempt the request again')
  }
  await page.getByRole('button', { name: copy[locale]['common:back'], exact: true }).click()
  await page.waitForURL(url => url.pathname !== '/lesson')
  report.interactions.push({ ...idle, retryRequests, returnedTo: new URL(page.url()).pathname })
}
async function run(browser, fault) {
  const context = await browser.newContext({ ...browserContext, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' })
  const requests = []
  const origins = new Set()
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS', 'Cache-Control': 'no-store' }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname === '/health') return route.fulfill({ status: 200, headers, body: request.method() === 'HEAD' ? '' : JSON.stringify({ apiEnabled: true }) })
    if (url.pathname.startsWith('/v1/')) {
      origins.add(url.origin)
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      if (url.pathname === '/v1/auth/guest') {
        requests.push({ path: url.pathname, method: request.method(), at: Date.now() })
        if (fault === 'transport') return route.abort('failed')
      }
      return route.fulfill({ status: 503, contentType: 'application/json', headers, body: JSON.stringify({ error: 'API_NOT_READY' }) })
    }
    if (url.origin === base) return route.continue()
    report.blockedExternal.push({ origin: url.origin, path: url.pathname })
    return route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.pageErrors.push(String(error)))
  try {
    await page.goto(base, { waitUntil: 'networkidle' })
    assert.equal(await walkOnboarding(page), true, 'Each failure scenario must complete the real onboarding')
    await page.getByRole('heading', { name: copy.en[`common:error.${fault === 'unavailable' ? 'service' : 'generic'}.title`], exact: true }).waitFor()
    for (const width of [320, 390]) await capture(page, fault, 'en', width, false)
    await exercise(page, fault, 'en', requests)
    await page.goto(base + '/settings', { waitUntil: 'networkidle' })
    await page.getByRole('radio', { name: 'Dark', exact: true }).click()
    await page.getByRole('radio', { name: 'Svenska', exact: true }).click()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(base + '/lesson', { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: copy.sv[`common:error.${fault === 'unavailable' ? 'service' : 'generic'}.title`], exact: true }).waitFor()
    for (const width of [320, 390]) await capture(page, fault, 'sv', width, true)
    await exercise(page, fault, 'sv', requests)
    report.interactions.push({ fault, interceptedApiOrigins: [...origins], guestRequestCount: requests.length })
  } catch (error) {
    await screenshot(page, `${fault}-diagnostic`)
    throw error
  } finally { await context.close() }
}

;(async () => {
  fs.mkdirSync(out, { recursive: true })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  const browser = await chromium.launch(launchOptions({ headless: true }))
  try {
    for (const fault of ['unavailable', 'transport']) await run(browser, fault)
    assert.deepEqual(report.pageErrors, [])
    assert.deepEqual(report.blockedExternal, [])
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
  console.log(JSON.stringify({ cases: report.cases.length, interactions: report.interactions, pageErrors: report.pageErrors }, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
