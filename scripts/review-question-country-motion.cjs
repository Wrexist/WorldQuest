// Real exported app, real onboarding and pack-derived questions. No account seeding.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')
const { beginLesson, waitForQuestion, solveBoard } = require('./lib/lesson-walk.cjs')
const { browserContext } = require('./lib/browser-harness.cjs')
const root = path.resolve(__dirname, '..')
const web = path.resolve(process.argv[2] || 'node_modules/.cache/wq-question-country-web-v1')
const countryOnly = process.argv.includes('--country-only')
const out = path.join(root, 'docs/design/reviews/question-country-motion-2026-10-02/browser', countryOnly ? 'refined' : '')
const port = 4193
const report = process.argv.includes('--finish-only') && fs.existsSync(path.join(out, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')) : { source: web, realApp: true, seededAccount: false, layouts: [], interactions: [], errors: [] }
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.ttf': 'font/ttf' }
const server = http.createServer((req, res) => {
  let file = path.join(web, decodeURIComponent(req.url.split('?')[0]))
  if (!file.startsWith(web)) { res.writeHead(404); res.end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(web, 'index.html')
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
const pause = (page, ms) => page.waitForTimeout(ms)
const scene = (page, id) => page.getByTestId(id)
const matrix = (page, id) => scene(page, id).evaluate(el => getComputedStyle(el).transform)
const still = 'matrix(1, 0, 0, 1, 0, 0)'
async function trace(page, ids, trigger) {
  await page.evaluate(ids => {
    window.motionTrace = []
    const start = performance.now()
    const frame = () => {
      const row = { time: performance.now() - start }
      for (const id of ids) {
        const el = document.querySelector(`[data-testid="${id}"]`)
        row[id] = el ? getComputedStyle(el).transform : null
      }
      window.motionTrace.push(row)
      if (row.time < 650) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }, ids)
  await trigger()
  await pause(page, 750)
  return page.evaluate(() => window.motionTrace)
}
function moved(samples, id) { return samples.some(row => row[id] && row[id] !== still && row[id] !== 'none') }
async function overflow(page) {
  return page.evaluate(() => {
    const text = [], cardText = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!node.textContent.trim() || node.parentElement.closest('[aria-hidden="true"]')) continue
      const range = document.createRange(); range.selectNodeContents(node)
      for (const box of range.getClientRects()) if (box.width > 0 && box.height > 0 && (box.left < -1 || box.right > innerWidth + 1)) {
        text.push(node.textContent)
        if (node.parentElement.closest('[data-testid="explore-atlas-card"]')) cardText.push(node.textContent)
      }
    }
    return { page: document.documentElement.scrollWidth > innerWidth, cardText, textIncludingClippedHorizontalScroll: text }
  })
}
async function largeText(page) {
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[dir="auto"]')].filter(node => !node.hasAttribute('data-proof-scaled'))
    const sizes = nodes.map(node => ({ node, font: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight), scale: Math.min(2, Number(node.closest('[data-max-scale]')?.getAttribute('data-max-scale') ?? 2)) }))
    for (const { node, font, line, scale } of sizes) { node.setAttribute('data-proof-scaled', 'true'); if (Number.isFinite(font)) node.style.fontSize = font * scale + 'px'; if (Number.isFinite(line)) node.style.lineHeight = line * scale + 'px' }
  })
}
async function lessonArrival(page, reduced, width, shoot = true, capital = false) {
  await page.goto(`http://localhost:${port}/lesson${capital ? '?attr=capital&region=EU&mode=speed' : ''}`, { waitUntil: 'networkidle' })
  await beginLesson(page)
  assert.equal(await waitForQuestion(page), true)
  if (await page.getByTestId('pairs-left').count()) await solveBoard(page)
  await scene(page, 'lesson-options-arrival').waitFor()
  await pause(page, 550)
  const beforeScroll = await scene(page, 'lesson-scroll').elementHandle()
  const hasGlobe = await page.locator('[data-testid="lesson-scroll"] canvas').count()
  const beforeCanvas = hasGlobe ? await page.locator('[data-testid="lesson-scroll"] canvas').first().elementHandle() : null
  await page.getByTestId('answer-option').first().click()
  await pause(page, 1100)
  await page.getByTestId('lesson-check').click()
  await pause(page, 550)
  const globeRetainedThroughFeedback = beforeCanvas ? await beforeCanvas.evaluate(el => el === document.querySelector('[data-testid="lesson-scroll"] canvas')) : null
  if (globeRetainedThroughFeedback !== null) assert.equal(globeRetainedThroughFeedback, true)
  const samples = await trace(page, ['lesson-prompt-arrival', 'lesson-options-arrival'], async () => {
    await page.getByRole('button', { name: /^(Continue|FortsÃ¤tt)$/ }).last().evaluate(el => el.click())
  })
  assert.equal(await beforeScroll.evaluate(el => el === document.querySelector('[data-testid="lesson-scroll"]')), true)
  assert.equal(moved(samples, 'lesson-options-arrival'), !reduced)
  const globeRetained = beforeCanvas && await page.locator('[data-testid="lesson-scroll"] canvas').count() ? await beforeCanvas.evaluate(el => el === document.querySelector('[data-testid="lesson-scroll"] canvas')) : null
  if (globeRetained !== null) assert.equal(globeRetained, true)
  const selection = await trace(page, ['lesson-options-arrival'], async () => {
    const answer = page.getByTestId('answer-option').first()
    if (await answer.count()) await answer.evaluate(el => el.click())
  })
  assert.equal(moved(selection, 'lesson-options-arrival'), false)
  if (shoot) await page.screenshot({ path: path.join(out, `lesson-${capital ? 'capital-' : ''}${reduced ? 'reduced' : 'normal'}-${width}.png`) })
  report.interactions.push({ name: 'question handoff', width, reduced, capital, scrollRetained: true, globeRetainedThroughFeedback, globeRetained, samples, noReplayOnSelection: true })
}
async function countryArrival(page, reduced, width, shoot = true, scaled = false) {
  await page.goto(`http://localhost:${port}/explore`, { waitUntil: 'networkidle' })
  const atlas = page.getByTestId('explore-atlas')
  await atlas.waitFor()
  await atlas.getByRole('button', { name: /^(Europe|Europa)$/ }).click()
  const canvas = await atlas.locator('canvas').first().elementHandle()
  const list = atlas.getByRole('list')
  const first = list.getByRole('button', { name: /^(Sweden|Sverige)$/ })
  await first.scrollIntoViewIfNeeded()
  const samples = await trace(page, ['explore-atlas-card'], () => first.evaluate(el => el.click()))
  assert.equal(moved(samples, 'explore-atlas-card'), !reduced)
  const card = page.getByTestId('explore-atlas-card')
  await card.scrollIntoViewIfNeeded()
  const cardHandle = await card.elementHandle()
  const open = page.getByTestId('explore-atlas-open')
  const openHandle = await open.elementHandle()
  await open.focus()
  const target = scaled ? /^(United Kingdom|Storbritannien)$/ : /^(Spain|Spanien)$/
  const switched = await trace(page, ['explore-atlas-card'], () => list.getByRole('button', { name: target }).evaluate(el => el.click()))
  assert.equal(moved(switched, 'explore-atlas-card'), !reduced)
  assert.equal(await cardHandle.evaluate(el => el === document.querySelector('[data-testid="explore-atlas-card"]')), true)
  assert.equal(await openHandle.evaluate(el => el === document.activeElement), true)
  assert.equal(await canvas.evaluate(el => el === document.querySelector('[data-testid="explore-globe"] canvas')), true)
  assert.match(await open.getAttribute('aria-label'), scaled ? /United Kingdom|Storbritannien/ : /Spain|Spanien/)
  await card.scrollIntoViewIfNeeded()
  if (scaled) await largeText(page)
  await pause(page, 100)
  if (shoot) await page.screenshot({ path: path.join(out, `country-${scaled ? 'large-text-' : ''}${reduced ? 'reduced' : 'normal'}-${width}.png`) })
  const layout = await overflow(page)
  assert.equal(layout.page, false)
  assert.deepEqual(layout.cardText, [])
  report.layouts.push({ name: 'country card', reduced, width, scaled, overflow: layout })
  report.interactions.push({ name: 'country reveal and switch', reduced, width, samples, switched, cardRetained: true, openFocusRetained: true, globeRetained: true })
  // Keyboard activates the new selection without waiting for another visual phase.
  await open.focus(); await page.keyboard.press('Enter')
  await page.waitForURL(scaled ? '**/country/GB' : '**/country/ES')
}
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  await new Promise(resolve => server.listen(port, resolve))
  const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }))
  const context = await browser.newContext({ ...browserContext, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  page.on('pageerror', error => report.errors.push(String(error)))
  try {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })
    await pause(page, 1000); await walkOnboarding(page)
    if (!process.argv.includes('--finish-only')) for (const [width, height] of [[390, 844], [320, 568], [768, 1024]]) for (const reduced of [false, true]) {
      await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
      if (!countryOnly) await lessonArrival(page, reduced, width)
      await countryArrival(page, reduced, width)
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'no-preference' })
    await lessonArrival(page, false, 390, true, true)
    if (!countryOnly || process.argv.includes('--refresh-video')) {
    const movieContext = await browser.newContext({ ...browserContext, storageState: await context.storageState(), viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', recordVideo: { dir: path.join(root, 'node_modules/.cache/question-country-video'), size: { width: 390, height: 844 } } })
    const movie = await movieContext.newPage()
    movie.on('pageerror', error => report.errors.push(String(error)))
    await lessonArrival(movie, false, 390, false)
    await countryArrival(movie, false, 390, false)
    const video = movie.video()
    await movieContext.close()
    fs.copyFileSync(await video.path(), path.join(out, 'question-country-motion.webm'))
    }
    await page.setViewportSize({ width: 320, height: 568 }); await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`http://localhost:${port}/settings`, { waitUntil: 'networkidle' })
    await page.getByRole('radio', { name: 'Svenska', exact: true }).click(); await pause(page, 500)
    await countryArrival(page, true, 320, true, true)
    assert.deepEqual(report.errors, [])
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve))
  }
  console.log(JSON.stringify({ layouts: report.layouts.length, interactions: report.interactions.length, errors: report.errors }, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
