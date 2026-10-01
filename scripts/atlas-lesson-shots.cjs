#!/usr/bin/env node
/**
 * Lesson screens with the atlas, photographed and MEASURED at the sizes that matter.
 *
 * For each viewport (320×568, 390×844, 430×932, 768×1024) and each focus (a capital
 * question, a "which country is this?" map question) it walks to a matching question,
 * photographs it before and after answering, and records what a picture can hide:
 *   - horizontal overflow (document wider than the viewport — the clipping bug),
 *   - elements cut by the right edge (prompt, options, Check),
 *   - whether the prompt, every option and Check are on screen without scrolling.
 *
 * `WQ_TEXT_SCALE=2` doubles the root font size to stand in for large accessibility text,
 * and `WQ_LOCALE=sv` runs in Swedish, whose country names are the long ones.
 *
 * Run: node scripts/atlas-lesson-shots.cjs [exportDir] [outDir]
 */

const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')
const { beginLesson, waitForQuestion } = require('./lib/lesson-walk.cjs')
const { browserContext } = require('./lib/browser-harness.cjs')

const ROOT = path.resolve(process.argv[2] ?? 'node_modules/.cache/wq-web-atlas')
const OUT = path.resolve(process.argv[3] ?? 'docs/design/world-atlas/evidence/lesson')
const PORT = Number(process.env.WQ_ATLAS_PORT ?? 4197)
const LOCALE = process.env.WQ_LOCALE ?? 'en'
const SCALE = Number(process.env.WQ_TEXT_SCALE ?? 1)

const VIEWPORTS = (process.env.WQ_VIEWPORTS ?? '320x568,390x844,430x932,768x1024').split(',').map((v) => {
  const [width, height] = v.split('x').map(Number)
  return { width, height }
})
/**
 * `revealOnly`: a question the map would answer by itself ("where in the world is X?").
 * The walk looks for one by its PROMPT, and the check is the inverse: no map before
 * answering, a map after.
 */
const FOCI = [
  { name: 'capital', query: 'attr=capital&entity=ES,JP,SE,FJ,BR', want: 'prompt-locator', prompt: /capital|huvudstad/i },
  { name: 'currency', query: 'attr=currency&entity=JP,SE,BR,CH', want: 'prompt-locator', prompt: /money|currency|valuta|pengar/i },
  { name: 'location', query: 'attr=location&entity=JP,SE,BR,FJ', want: null, prompt: /where in the world|var i världen/i },
]

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ttf': 'font/ttf' }
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
    const rect = (el) => (el ? el.getBoundingClientRect() : null)
    const options = [...document.querySelectorAll('[data-testid="answer-option"]')].map(rect)
    const prompt = rect(document.querySelector('[role="heading"]'))
    const check = rect(document.querySelector('[data-testid="lesson-check"]'))
    const atlas = rect(document.querySelector('[data-testid="prompt-locator"], [data-testid="prompt-map"]'))
    const cut = (r) => r !== null && (r.right > vw + 0.5 || r.left < -0.5)
    const onScreen = (r) => r !== null && r.top >= -0.5 && r.bottom <= vh + 0.5
    const wide = [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed'
    }).length
    return {
      horizontalOverflow: document.documentElement.scrollWidth > vw,
      elementsPastRightEdge: wide,
      promptCut: cut(prompt),
      optionsCut: options.some(cut),
      promptVisible: onScreen(prompt),
      optionsVisible: options.length > 0 && options.every(onScreen),
      checkVisible: onScreen(check),
      atlas: atlas && { top: Math.round(atlas.top), height: Math.round(atlas.height), width: Math.round(atlas.width) },
      options: options.length,
    }
  })
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  await new Promise((r) => server.listen(PORT, r))
  const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }))
  const results = []
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      ...browserContext,
      locale: LOCALE === 'sv' ? 'sv-SE' : 'en-US',
      viewport,
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await sleep(1200)
    await walkOnboarding(page, () => {})
    for (const focus of FOCI) {
      const tag = `${focus.name}-${viewport.width}x${viewport.height}${LOCALE === 'sv' ? '-sv' : ''}${SCALE !== 1 ? `-text${SCALE}x` : ''}`
      await page.goto(`http://localhost:${PORT}/lesson?${focus.query}`, { waitUntil: 'networkidle' })
      if (SCALE !== 1) await page.addStyleTag({ content: `html { font-size: ${SCALE * 100}% } * { font-size-adjust: none }` })
      await sleep(1200)
      await beginLesson(page)
      await waitForQuestion(page)
      // Walk forward until the question carries the picture this focus is about.
      let found = false
      for (let i = 0; i < 12 && !found; i++) {
        const heading = (await page.getByRole('heading').first().textContent().catch(() => '')) ?? ''
        found = focus.prompt.test(heading) && (focus.want === null || (await page.getByTestId(focus.want).count()) > 0)
        if (found) break
        const options = await page.getByTestId('answer-option').all()
        if (options.length === 0) break
        await options[0].click()
        await page.getByTestId('lesson-check').click()
        await sleep(400)
        await page.getByRole('button', { name: /Continue|Fortsätt/ }).first().click()
        await sleep(600)
      }
      await sleep(1800)
      const before = await measure(page)
      before.mapBeforeAnswer = (await page.locator('[data-testid="prompt-locator"], [data-testid="prompt-map"]').count()) > 0
      await page.screenshot({ path: path.join(OUT, `${tag}-question.png`) })
      const options = await page.getByTestId('answer-option').all()
      let after = null
      if (options.length > 0) {
        await options[options.length - 1].click()
        await sleep(300)
        await page.screenshot({ path: path.join(OUT, `${tag}-selected.png`) })
        await page.getByTestId('lesson-check').click()
        await sleep(1600)
        after = await measure(page)
        after.mapAfterAnswer = (await page.locator('[data-testid="prompt-locator"], [data-testid="prompt-map"]').count()) > 0
        await page.screenshot({ path: path.join(OUT, `${tag}-revealed.png`) })
      }
      results.push({ tag, found, before, after })
      console.log(tag, found ? '' : '(no matching question found)', JSON.stringify(before))
    }
    await context.close()
  }
  fs.writeFileSync(path.join(OUT, `report${LOCALE === 'sv' ? '-sv' : ''}${SCALE !== 1 ? `-text${SCALE}x` : ''}.json`), JSON.stringify(results, null, 2) + '\n')
  await browser.close()
  server.close()
})().catch((error) => {
  console.error('✗', error)
  process.exit(1)
})
