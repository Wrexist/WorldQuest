#!/usr/bin/env node
/**
 * The map quiz, photographed at each step a learner sees: the question, a country picked, a
 * miss with its direction hint, and the reveal. Also measures what a picture can hide — the
 * map on screen with Check below it, and nothing past the right edge.
 *
 * It never knows the answer: it taps the middle of the map and then a little to either side,
 * as a learner who did not know would, so the reveal is reached after three misses unless a
 * tap happens to be right. Taps go through the real gesture surface.
 *
 * Run after `expo export --platform web`:
 *   node scripts/map-drill-shots.cjs [exportDir] [outDir]
 * `WQ_REGION` (default EU), `WQ_LOCALE=sv`, `WQ_VIEWPORTS=390x844,...`.
 */

const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')
const { beginLesson } = require('./lib/lesson-walk.cjs')
const { browserContext } = require('./lib/browser-harness.cjs')

const ROOT = path.resolve(process.argv[2] ?? 'node_modules/.cache/wq-web')
const OUT = path.resolve(process.argv[3] ?? 'node_modules/.cache/wq-drill-shots')
const PORT = Number(process.env.WQ_DRILL_PORT ?? 4199)
const REGION = process.env.WQ_REGION ?? 'EU'
const LOCALE = process.env.WQ_LOCALE ?? 'en'
const VIEWPORTS = (process.env.WQ_VIEWPORTS ?? '390x844,320x568').split(',').map((v) => {
  const [width, height] = v.split('x').map(Number)
  return { width, height }
})

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ttf': 'font/ttf', '.bin': 'application/octet-stream' }
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? null
    const map = rect('drill-map')
    const check = rect('lesson-check') ?? rect('drill-retry-check')
    const wide = [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed'
    }).length
    return {
      map: map && { top: Math.round(map.top), bottom: Math.round(map.bottom), width: Math.round(map.width) },
      check: check && { top: Math.round(check.top), bottom: Math.round(check.bottom) },
      checkOnScreen: check !== null && check.bottom <= vh + 0.5,
      elementsPastRightEdge: wide,
      heading: document.querySelector('[role="heading"]')?.textContent ?? null,
      hint: document.querySelector('[data-testid="drill-hint"]')?.textContent ?? null,
      sheet: document.querySelector('[data-testid="answer-sheet"]')?.textContent?.slice(0, 160) ?? null,
    }
  })
}

/** Tap the map at a fraction of its box, through the gesture surface the app listens on. */
async function tapMap(page, fx, fy) {
  const box = await page.getByTestId('drill-map').boundingBox()
  if (box === null) throw new Error('no drill map on screen')
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
  await sleep(350)
}

const TAPS = [[0.5, 0.5], [0.3, 0.4], [0.7, 0.62]]

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  await new Promise((r) => server.listen(PORT, r))
  const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }))
  const report = []
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ ...browserContext, viewport, deviceScaleFactor: 2 })
    const page = await context.newPage()
    page.on('pageerror', (error) => console.warn('  page error:', error.message))
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await sleep(1200)
    await walkOnboarding(page, () => {})
    if (LOCALE !== 'en') {
      await page.evaluate((language) => {
        const key = Object.keys(localStorage).find((k) => k.includes('preferences.v1')) ?? 'preferences.v1'
        localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), language }))
      }, LOCALE)
    }
    const tag = `${REGION}-${viewport.width}x${viewport.height}${LOCALE === 'sv' ? '-sv' : ''}`
    const shot = async (step) => {
      const m = await measure(page)
      report.push({ tag, step, ...m })
      console.log(tag, step, JSON.stringify(m))
      await page.screenshot({ path: path.join(OUT, `${tag}-${step}.png`) })
    }

    // Explore with the region chosen: where the quiz is offered.
    await page.goto(`http://localhost:${PORT}/explore`, { waitUntil: 'networkidle' })
    await sleep(2500)
    const chip = page.getByRole('button', { name: LOCALE === 'sv' ? /^Europa$/ : /^Europe$/ })
    if ((await chip.count()) > 0) {
      await chip.first().click()
      await sleep(2500)
      const start = page.getByTestId('explore-drill-start')
      if ((await start.count()) > 0) await start.scrollIntoViewIfNeeded()
      await sleep(600)
      await shot('explore')
    }

    await page.goto(`http://localhost:${PORT}/lesson?region=${REGION}&input=tap`, { waitUntil: 'networkidle' })
    await sleep(1500)
    await beginLesson(page)
    await page.getByTestId('drill-map').waitFor({ timeout: 20000 })
    await page.getByTestId('atlas-idle').first().waitFor({ timeout: 20000 }).catch(() => {})
    await sleep(2500)
    await shot('question')

    let settled = false
    for (let i = 0; i < TAPS.length && !settled; i++) {
      await tapMap(page, ...TAPS[i])
      await sleep(600)
      if (i === 0) await shot('selected')
      const check = (await page.getByTestId('drill-retry-check').count()) > 0 ? page.getByTestId('drill-retry-check') : page.getByTestId('lesson-check')
      if (await check.isDisabled().catch(() => true)) {
        console.warn(`  ${tag}: tap ${i + 1} selected nothing`)
        continue
      }
      await check.click()
      await sleep(2200)
      settled = (await page.getByTestId('answer-sheet').count()) > 0
      if (!settled) await shot(`retry-${i + 1}`)
    }
    await sleep(1200)
    await shot('reveal')
    await context.close()
  }
  fs.writeFileSync(path.join(OUT, `report-${REGION}${LOCALE === 'sv' ? '-sv' : ''}.json`), JSON.stringify(report, null, 2) + '\n')
  await browser.close()
  server.close()
})().catch((error) => {
  console.error('✗', error)
  server.close()
  process.exit(1)
})
