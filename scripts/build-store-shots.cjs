/**
 * The store screenshots, composed from the real app.
 *
 * `asset-prompts.md` §14 asks for composites rather than raw captures — a device frame,
 * one short headline per shot, and the real screen inside it — and it names the six
 * shots and their order. This builds exactly those, at the two sizes the platform
 * actually requires.
 *
 * ## The sizes were the blocker, and they are now checked rather than guessed
 *
 * §14 carried `TODO(verify)` on the screenshot dimensions for a good reason: Apple
 * changes the required device sizes most years, and a guessed pixel dimension is a
 * rejected submission, not a cosmetic mistake. So the numbers below were read off
 * Apple's own specification rather than remembered — see SIZES for the source and the
 * date, in the same shape a content pack records `source` and `verifiedAt`, because a
 * store requirement goes stale exactly like a population figure does.
 *
 * **Google Play is deliberately absent.** Its requirements live on `support.google.com`
 * and `play.google.com`, both of which this session's egress policy blocks, so they
 * could not be checked. Building Play screenshots to a half-remembered spec is the one
 * thing §14 warns against, so they stay unbuilt and §14 keeps its TODO with the reason
 * recorded. Everything here is portrait PNG with no alpha, which is the strictest
 * intersection of what both stores accept, so these are very likely usable on Play too —
 * "very likely" is not "verified", and the difference is the whole point.
 *
 * ## Why it drives the real app rather than reusing `design:shots`
 *
 * `design:shots` renders at 320/390/768 CSS pixels for design review. A store screenshot
 * is 1320×2868 device pixels and has to be sharp at that size, so this captures at the
 * device scale factor instead of upscaling a review shot — an upscaled screenshot is the
 * tell of a listing nobody checked.
 *
 * It also needs states `design:shots` cannot reach: a lesson mid-question and the
 * celebration after one. Those need clicks, so this drives the app the way the E2E does.
 *
 * Run: `pnpm build:store:shots`. Needs `expo export` output in node_modules/.cache/wq-web,
 * which the script produces itself.
 */

const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { token } = require('./tokens.cjs')
const { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } = require('node:fs')
const { join, extname } = require('node:path')
const http = require('node:http')
const fs = require('node:fs')

const ROOT = join(__dirname, '..')
const WEB = join(ROOT, 'node_modules', '.cache', 'wq-web')
const OUT = join(ROOT, 'docs', 'design', 'assets', 'store', 'screenshots')
const FONT = join(
  ROOT,
  'node_modules/.pnpm/@expo-google-fonts+nunito@0.4.2/node_modules/@expo-google-fonts/nunito/900Black/Nunito_900Black.ttf',
)
const PORT = 4193

const CANVAS = token('color.bg.canvas')
const CANVAS_TOP = token('color.bg.canvasGradient.0')
const LIGHT = token('color.text.primary')
const GOLD = token('color.reward.xp')

/**
 * The two sizes a submission is actually rejected without.
 *
 * READ FROM THE SOURCE, not from memory:
 * https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/
 * verified 2026-08-07.
 *
 * Apple scales every other size down from these two, so shipping more than two is
 * optional work. `supportsTablet` is true in app.json, which is what makes the iPad row
 * required rather than a nicety — turning that flag on quietly added a mandatory asset.
 */
const SIZES = [
  { name: 'iphone-6.9', width: 1320, height: 2868, scale: 3, label: 'iPhone 6.9" — required' },
  { name: 'ipad-13', width: 2064, height: 2752, scale: 2, label: 'iPad 13" — required' },
]

/**
 * The six shots, in §14's order, because the first two are the only ones most people see.
 *
 * Every headline is a string the app already ships — the onboarding promises, a screen's
 * own subtitle, a summary title. None of it is written here. A listing that promises
 * something the product does not say is the same lie as a screenshot of a screen the app
 * does not have, and copy is a translator's file, not a script's.
 */
const SHOTS = [
  // No `play` — §14 asks for the lesson MID-QUESTION, which is the product. The first
  // version answered here and happened to pick a wrong option, so the shot most people
  // would see was a red rejection.
  { name: '1-lesson', route: '/lesson', headline: ['onboarding', 'onboarding:slide.1.title'] },
  { name: '2-collection', route: '/collection/flags', headline: ['onboarding', 'onboarding:slide.3.title'] },
  { name: '3-home', route: '/', headline: ['onboarding', 'onboarding:slide.2.title'] },
  { name: '4-country', route: '/country/SE', headline: ['country', 'country:source.title'] },
  // Not `quests:subtitle` — that line is printed inside the screenshot, under "Today's
  // Quest", so the composite said the same sentence twice. Same trap as shot 6.
  { name: '5-quests', route: '/quests', headline: ['welcome', 'welcome:title'] },
  // Not `lesson:summary.perfect.title` — that string is already ON this screen, in the
  // summary's own heading, so the composite printed "Flawless." twice a hundred points
  // apart. A headline that repeats the screenshot under it is a caption, not a headline.
  { name: '6-celebration', route: '/lesson', headline: ['achievements', 'achievements:explorer.continents.desc'], play: true },
]

const copy = (file, key) => {
  const strings = JSON.parse(readFileSync(join(ROOT, 'packages/i18n/locales/en', `${file}.json`), 'utf8'))
  const value = strings[key]
  if (typeof value !== 'string') throw new Error(`${key} is not in ${file}.json — headlines must be real app copy`)
  return value
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/wav',
}

const serve = () =>
  http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    let file = join(WEB, url)
    if (!existsSync(file) || fs.statSync(file).isDirectory()) {
      const asHtml = join(WEB, `${url}.html`)
      file = existsSync(asHtml) ? asHtml : join(WEB, 'index.html')
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })

/** Past the onboarding gate, once per browser context — the same walk `design-shots` does. */
async function completeOnboarding(page) {
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
  await page.waitForTimeout(1500)
}

/**
 * Play a whole lesson, and play it WELL.
 *
 * The celebration shot is the summary, and the first version of this cycled through the
 * options — which produced a listing image reading "+0 XP, 0 % accuracy" under a headline
 * saying "Flawless." A store screenshot advertising a failed lesson is worse than no
 * screenshot, and one that contradicts its own headline is worse again.
 *
 * It does not fake the numbers. It learns them: the correct option announces itself
 * through `lesson:answer.correct` — "{answer}, correct answer" — the moment a question is
 * answered, because the correct/wrong state has to reach a screen reader somehow. So the
 * first pass answers anything and records question → correct answer from the label the
 * app itself exposes; the second pass replays the lesson and picks them.
 *
 * Everything in the resulting frame is real. The app composed the lesson, graded it and
 * awarded the XP; this only knew the answers, which is what a person photographing their
 * own app would also do.
 *
 * Unseen questions in the second pass fall back to a guess, so a non-deterministic
 * composer degrades to a lower score rather than to a crash.
 */
async function playLesson(page, route, knownAnswers) {
  for (let question = 0; question < 40; question++) {
    const options = await page.getByTestId('answer-option').all()
    if (options.length === 0) break

    const labels = await Promise.all(options.map((option) => option.getAttribute('aria-label')))
    const prompt = await page.evaluate(() => document.body.innerText.slice(0, 400))
    const known = knownAnswers.get(prompt)
    const index = known === undefined ? 0 : Math.max(0, labels.findIndex((l) => (l ?? '').startsWith(known)))

    await options[index].click()
    await page.waitForTimeout(220)

    // Whatever was chosen, the app has now labelled the right one. Record it.
    const revealed = await Promise.all(
      (await page.getByTestId('answer-option').all()).map((option) => option.getAttribute('aria-label')),
    )
    const correct = revealed.find((label) => (label ?? '').includes('correct answer'))
    if (correct !== undefined) knownAnswers.set(prompt, correct.replace(/, correct answer$/, ''))

    const next = page.getByText(/^(Continue|Finish)$/).first()
    if ((await next.count()) === 0) break
    await next.click()
    await page.waitForTimeout(260)
  }
}

async function compose(page, screenshot, size, headline) {
  return page.evaluate(
    async ({ shot, W, H, headline, top, bottom, light, gold }) => {
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')

      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, top)
      sky.addColorStop(1, bottom)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // The headline occupies the top sixth, wrapped rather than truncated: a store
      // headline that ends in an ellipsis is worse than a smaller one.
      const pad = Math.round(W * 0.08)
      let fontSize = Math.round(W * 0.072)
      const fit = () => {
        ctx.font = `${fontSize}px WQStore`
        const words = headline.split(' ')
        const lines = []
        let line = ''
        for (const word of words) {
          const attempt = line === '' ? word : `${line} ${word}`
          if (ctx.measureText(attempt).width > W - pad * 2 && line !== '') {
            lines.push(line)
            line = word
          } else line = attempt
        }
        lines.push(line)
        return lines
      }
      let lines = fit()
      while (lines.length > 2 && fontSize > 24) {
        fontSize -= 2
        lines = fit()
      }

      ctx.font = `${fontSize}px WQStore`
      ctx.fillStyle = light
      ctx.textBaseline = 'top'
      const lineHeight = Math.round(fontSize * 1.2)
      let y = Math.round(H * 0.055)
      for (const line of lines) {
        ctx.fillText(line, (W - ctx.measureText(line).width) / 2, y)
        y += lineHeight
      }

      // A hairline under the headline in the reward gold, so the block reads as designed
      // rather than as text dropped on a gradient.
      const ruleWidth = Math.round(W * 0.12)
      ctx.fillStyle = gold
      ctx.fillRect((W - ruleWidth) / 2, y + Math.round(fontSize * 0.35), ruleWidth, Math.max(3, Math.round(W * 0.004)))

      // The device: the real capture, rounded, bleeding off the bottom edge so the shot
      // reads as a phone in use rather than a picture of a rectangle.
      const img = new Image()
      img.src = shot
      await img.decode()

      const frameTop = y + Math.round(fontSize * 1.6)
      const frameWidth = Math.round(W * 0.78)
      // From the capture's own aspect, so the screen inside the frame is never squashed;
      // it runs off the bottom of the canvas, which is what makes it read as a device in
      // use rather than a rectangle floating in space.
      const frameHeight = Math.round((frameWidth * img.height) / img.width)
      const frameX = Math.round((W - frameWidth) / 2)
      // Half what it was. At 0.09 the corner arc reached far enough into the frame to
      // clip the app's own top-left heading — "Today's Quest" lost its T on the iPad
      // shot. A device corner is a small radius on a large screen; making it look
      // "phone-like" by exaggerating it eats the content it is framing.
      const radius = Math.round(frameWidth * 0.045)

      // A soft bed under the device, drawn as a real shadow rather than a flat slab —
      // the same lesson the primary button's glow taught.
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = Math.round(W * 0.05)
      ctx.shadowOffsetY = Math.round(W * 0.012)
      ctx.fillStyle = bottom
      ctx.beginPath()
      ctx.roundRect(frameX, frameTop, frameWidth, frameHeight, radius)
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(frameX, frameTop, frameWidth, frameHeight, radius)
      ctx.clip()
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, frameX, frameTop, frameWidth, frameHeight)
      ctx.restore()

      // The bezel, as a ring rather than a fill, so it does not eat into the screen.
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.lineWidth = Math.max(2, Math.round(W * 0.003))
      ctx.beginPath()
      ctx.roundRect(frameX, frameTop, frameWidth, frameHeight, radius)
      ctx.stroke()

      // JPEG-quality PNG, and no alpha anywhere: Apple rejects transparency at upload.
      return canvas.toDataURL('image/png')
    },
    {
      shot: `data:image/png;base64,${screenshot.toString('base64')}`,
      W: size.width,
      H: size.height,
      headline,
      top: CANVAS_TOP,
      bottom: CANVAS,
      light: LIGHT,
      gold: GOLD,
    },
  )
}

;(async () => {
  if (!existsSync(join(WEB, 'index.html'))) {
    console.error('\n✗ no exported bundle. Run `pnpm design:shots` first, or `expo export --platform web`.')
    process.exit(1)
  }

  const server = serve()
  await new Promise((resolve) => server.listen(PORT, resolve))
  const browser = await chromium.launch(launchOptions())
  mkdirSync(OUT, { recursive: true })

  // The compositor page: no app, just a canvas and the app's typeface.
  const canvasPage = await browser.newPage({ viewport: { width: 64, height: 64 } })
  await canvasPage.setContent('<!doctype html><meta charset="utf-8">')
  await canvasPage.evaluate(async (fontBase64) => {
    const binary = atob(fontBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const face = new FontFace('WQStore', bytes.buffer)
    await face.load()
    document.fonts.add(face)
    await document.fonts.ready
  }, readFileSync(FONT).toString('base64'))

  console.log('Store screenshots\n')
  const written = []
  const knownAnswersByRun = new Map()

  for (const size of SIZES) {
    // The capture viewport is the DEVICE's own logical size, not a fixed phone shape.
    //
    // This started as a constant 2.05 aspect and the iPad shots came out showing a
    // narrow phone-shaped screen — which is wrong twice over: it looks like a phone
    // photo pasted onto a tablet listing, and at 440 logical points the app renders its
    // PHONE layout, so the one thing an iPad listing has to prove was the one thing it
    // did not show. At 1032 the same screens lay out as two columns, which is what
    // someone deciding whether to install this on an iPad needs to see.
    //
    // Captured at the device scale factor and drawn down, never up.
    const captureWidth = Math.round(size.width / size.scale)
    const captureHeight = Math.round(size.height / size.scale)
    const page = await browser.newPage({
      viewport: { width: captureWidth, height: captureHeight },
      deviceScaleFactor: size.scale,
    })
    await completeOnboarding(page)
    // Carried across both passes, and across both device sizes — the second size starts
    // already knowing the answers.
    const knownAnswers = knownAnswersByRun

    for (const shot of SHOTS) {
      await page.goto(`http://localhost:${PORT}${shot.route}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1400)
      if (shot.play === true) {
        // Twice: once to learn the answers, once to earn the score.
        await playLesson(page, shot.route, knownAnswers)
        await page.goto(`http://localhost:${PORT}${shot.route}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1400)
        await playLesson(page, shot.route, knownAnswers)
      }
      await page.waitForTimeout(600)

      const raw = await page.screenshot()
      const composed = await compose(canvasPage, raw, size, copy(...shot.headline))
      const file = join(OUT, `${size.name}-${shot.name}.png`)
      writeFileSync(file, Buffer.from(composed.split(',')[1], 'base64'))
      written.push([`${size.name}/${shot.name}`, statSync(file).size])
    }
    await page.close()
    console.log(`  ${size.label.padEnd(24)} ${size.width}×${size.height}  ${SHOTS.length} shots`)
  }

  await browser.close()
  server.close()

  const total = written.reduce((sum, [, bytes]) => sum + bytes, 0)
  console.log(
    `\n✓ ${written.length} screenshots · ${(total / 1024 / 1024).toFixed(1)} MB · docs/design/assets/store/screenshots` +
      '\n\n  Apple only. Play\'s requirements are on hosts this session cannot reach, and' +
      '\n  building to a half-remembered spec is the one thing asset-prompts.md §14 warns' +
      '\n  against. See the note at the top of this file.',
  )
})()
