// Real exported app journey. Account state is earned through the UI, never seeded.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { browserContext, assertRoute } = require('./lib/browser-harness.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')
const { beginLesson, answerCurrent, questionShown } = require('./lib/lesson-walk.cjs')
const root = path.resolve(__dirname, '..')
const web = path.resolve(process.argv[2] || 'node_modules/.cache/wq-compact-app-web-v1')
const out = path.resolve(process.env.WQ_REVIEW_OUT || 'docs/design/reviews/compact-app-2026-10-02/browser')
const port = Number(process.env.WQ_REVIEW_PORT || 4224)
const base = `http://127.0.0.1:${port}`
const report = { source: web, realApp: true, seededAccount: false, cases: [], errors: [] }
const profileOnly = process.argv.includes('--profile-only')
const server = http.createServer((req, res) => {
  let file = path.resolve(web, '.' + decodeURIComponent(new URL(req.url, base).pathname))
  if (file !== web && !file.startsWith(web + path.sep)) { res.writeHead(403); res.end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(web, 'index.html')
  res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') })
async function visit(page, route) {
  await page.goto(base + route, { waitUntil: 'networkidle' }); assertRoute(page, route)
  await page.waitForTimeout(600)
}
async function metrics(page) {
  return page.evaluate(() => {
    const rect = node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom } }
    const controls = [...document.querySelectorAll('[role="button"],[role="tab"],button')].filter(node => !node.closest('[aria-hidden="true"]') && node.getBoundingClientRect().width)
    return {
      sidewaysScroll: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      smallTargets: controls.map(node => ({ label: node.getAttribute('aria-label') || node.textContent, ...rect(node) })).filter(b => b.width < 43.5 || b.height < 43.5),
      viewport: { width: innerWidth, height: innerHeight },
    }
  })
}
async function box(locator) {
  return locator.evaluate(node => {
    const r = node.getBoundingClientRect()
    const viewportContained = r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth
    let clipped = false
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), boundary = parent.getBoundingClientRect()
      if (/(hidden|scroll|auto)/.test(style.overflowY) && (r.top < boundary.top - 1 || r.bottom > boundary.bottom + 1)) clipped = true
      if (/(hidden|scroll|auto)/.test(style.overflowX) && (r.left < boundary.left - 1 || r.right > boundary.right + 1)) clipped = true
    }
    return { top: r.top, bottom: r.bottom, width: r.width, height: r.height, viewportContained, clipped, fullyVisible: viewportContained && !clipped }
  })
}
async function enlargeGlyphs(page) {
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('[dir="auto"]')].map(node => ({ node, size: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight), scale: Math.min(2, Number(node.closest('[data-max-scale]')?.getAttribute('data-max-scale') || 2)) }))
    for (const { node, size, line, scale } of items) { if (Number.isFinite(size)) node.style.fontSize = size * scale + 'px'; if (Number.isFinite(line)) node.style.lineHeight = line * scale + 'px' }
  })
}
async function captures(page, width, suffix = '') {
  for (const route of (profileOnly ? ['/profile'] : ['/quests', '/profile', '/shop'])) {
    await visit(page, route)
    if (suffix) await enlargeGlyphs(page)
    const details = { name: route, width, mode: suffix || 'light default', layout: await metrics(page) }
    assert.equal(details.layout.sidewaysScroll, 0)
    assert.deepEqual(details.layout.smallTargets, [])
    if (route === '/quests') {
      details.chest = await box(page.getByTestId('quest-treasure-card'))
      const next = page.getByRole('button', { name: /^(Continue quest|Fortsätt uppdrag)/ })
      details.continueBeforeScroll = await box(next)
      assert.equal(details.continueBeforeScroll.fullyVisible, true)
      await shot(page, `quests-${width}${suffix}`)
      await page.getByTestId('quest-tasks').locator('[aria-label]').last().scrollIntoViewIfNeeded()
      details.continueAfterScroll = await box(next)
      assert.equal(details.continueAfterScroll.fullyVisible, true)
      await shot(page, `quests-scrolled-${width}${suffix}`)
    } else {
      if (route === '/profile') {
        const start = page.getByRole('button', { name: /^(Start a lesson|Starta en lektion)$/ })
        details.guestStart = await box(start)
        if (!suffix) assert.equal(details.guestStart.fullyVisible, true)
      }
      if (route === '/shop') {
        for (const id of ['coin-wallet', 'shop-next-unlock', 'shop-freeze']) if (await page.getByTestId(id).count()) details[id] = await box(page.getByTestId(id))
      }
      await shot(page, `${route.slice(1)}-${width}${suffix}`)
    }
    report.cases.push(details)
  }
}
async function behavior(page) {
  await visit(page, '/quests')
  const progress = page.getByTestId('quest-progress')
  const prior = await progress.getAttribute('aria-valuenow')
  const tasksBefore = await page.getByTestId('quest-tasks').innerText()
  await page.getByTestId('quest-chest').click()
  await page.waitForTimeout(100)
  const nudged = await page.getByTestId('explorer-chest-motion').evaluate(el => getComputedStyle(el).transform)
  await page.waitForTimeout(700)
  assert.equal(await progress.getAttribute('aria-valuenow'), prior)
  assert.equal(await page.getByTestId('quest-tasks').innerText(), tasksBefore)
  await page.getByRole('tab', { name: 'Achievements', exact: true }).click(); await page.waitForURL('**/achievements')
  await visit(page, '/shop')
  const unlockBefore = await page.getByTestId('shop-next-unlock').innerText()
  const buyButtons = page.getByRole('button', { name: 'Buy', exact: true })
  const unavailablePurchases = await buyButtons.evaluateAll(nodes => nodes.every(node => node.getAttribute('aria-disabled') === 'true' || node.disabled))
  assert.equal(unavailablePurchases, true)
  await page.getByRole('button', { name: 'Open streak', exact: true }).click(); await page.waitForURL('**/streak')
  await visit(page, '/shop'); assert.equal(await page.getByTestId('shop-next-unlock').innerText(), unlockBefore)
  assert.equal(await page.getByText('Wearing', { exact: true }).count(), 1)
  report.cases.push({ name: 'navigation and protected state', chestNudgeTransform: nudged, questProgressUnchanged: true, tasksUnchanged: true, achievementsOpens: true, freezeOpensStreak: true, unaffordablePurchasesDisabled: true, unlockUnchanged: true, levelTitleWorn: true })
}
async function learn(page) {
  await visit(page, '/profile')
  await page.getByRole('button', { name: 'Start a lesson', exact: true }).click()
  await page.waitForURL('**/lesson**'); await page.waitForTimeout(800); await beginLesson(page)
  let answered = 0
  for (let step = 0; step < 60; step++) {
    if (await page.getByTestId('summary-continue').count()) break
    if (await questionShown(page)) { await page.waitForTimeout(1500); await answerCurrent(page); answered++ }
    const feedback = page.getByRole('button', { name: /^(Continue|Got it|Finish)$/ }).first()
    if (await feedback.count()) await feedback.click()
    else if (!(await questionShown(page))) throw Error('Lesson stopped before summary at ' + page.url())
    await page.waitForTimeout(400)
  }
  await page.getByTestId('summary-continue').waitFor()
  const summary = await page.locator('body').innerText(); await shot(page, 'earned-lesson-summary')
  await page.getByTestId('summary-continue').click()
  for (let beat = 0; beat < 15; beat++) {
    await page.waitForTimeout(400)
    if (await page.getByTestId('open-streak-chest').count()) { await page.getByTestId('open-streak-chest').click(); await page.getByText('+1 streak gem', { exact: true }).waitFor({ timeout: 12000 }); continue }
    if (await page.getByTestId('create-profile-later').count()) { await page.getByTestId('create-profile-later').click(); continue }
    const next = page.getByRole('button', { name: 'Continue', exact: true }).first()
    if (await next.count()) await next.click(); else break
  }
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024]]) {
    await page.setViewportSize({ width, height }); await visit(page, '/profile')
    const populated = await page.getByTestId('profile-passport').count() > 0
    await shot(page, `profile-after-lesson-${populated ? 'populated' : 'guest'}-${width}`)
    report.cases.push({ name: 'profile after actual UI lesson', width, populated, passport: populated ? await box(page.getByTestId('profile-passport')) : null, layout: await metrics(page) })
  }
  report.lesson = { answered, completed: true, summary }
}
;(async () => {
  assert.ok(fs.existsSync(path.join(web, 'index.html')), 'Provide an existing immutable Expo export')
  fs.mkdirSync(out, { recursive: true }); await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }))
  const context = await browser.newContext({ ...browserContext, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' })
  const page = await context.newPage(); page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.errors.push(String(error)))
  try {
    await page.goto(base + '/', { waitUntil: 'networkidle' }); await walkOnboarding(page)
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024]]) { await page.setViewportSize({ width, height }); await captures(page, width) }
    await page.setViewportSize({ width: 390, height: 844 }); if (!profileOnly) await behavior(page)
    const guestState = await context.storageState()
    if (!profileOnly && !process.argv.includes('--skip-lesson')) await learn(page)
    const contrastContext = await browser.newContext({ ...browserContext, storageState: guestState, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
    const contrast = await contrastContext.newPage(); contrast.on('pageerror', error => report.errors.push(String(error)))
    await visit(contrast, '/settings'); await contrast.getByRole('radio', { name: 'Dark', exact: true }).click(); await contrast.getByRole('radio', { name: 'Svenska', exact: true }).click()
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024]]) { await contrast.setViewportSize({ width, height }); await captures(contrast, width, '-sv-dark-glyph2-reduced') }
    await contrastContext.close(); assert.deepEqual(report.errors, [])
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)) }
  console.log(JSON.stringify({ cases: report.cases.length, errors: report.errors }, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
