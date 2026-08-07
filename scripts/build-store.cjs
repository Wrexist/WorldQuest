/**
 * Derive the store listing art that can be derived.
 *
 * `asset-prompts.md` §14 lists five things a store submission needs. Three of them are
 * fixed sizes stated by the platforms and composed from assets this repo already owns,
 * so they are built here rather than briefed to an illustrator:
 *
 *   · `store/play-feature-graphic.png` — 1024×500, no alpha. Mandatory on Play.
 *   · `store/play-icon.png` — 512×512, no alpha.
 *   · `store/ios-icon.png` — 1024×1024, no alpha. Apple flattens alpha to black.
 *   · `store/wordmark-light.png` and `store/wordmark-gold.png` — the mark set in the
 *     app's own face, for the places live text cannot go.
 *
 * The other two — phone and tablet screenshots — are **not** built here, and that is a
 * decision rather than an omission. §14 marks their pixel dimensions `TODO(verify)`
 * because Apple changes the required device sizes most years, and the note beside it is
 * exact: a guessed pixel dimension is a rejected submission. Everything else on this page
 * refuses to invent a fact; a screenshot canvas size is a fact. When the current
 * requirements are checked, the composite step belongs here, and the real rendered
 * screens it should use are already produced by `pnpm design:shots`.
 *
 * ## Why Chromium again, and why the wordmark is set rather than drawn
 *
 * Same reason as `build-art.cjs`: it is already here and already rasterises the flags,
 * the maps and the icons. It also has the app's actual typeface — `@expo-google-fonts`
 * ships the TTFs, so the wordmark here is Nunito Black at the same weight `SplashScreen`
 * renders live, loaded from the same file the app loads. Setting it beats drawing it for
 * the reason §1b gives: an image model garbles letterforms, and a wordmark with a subtly
 * malformed Q is a brand you cannot use and cannot fix.
 *
 * This does NOT produce the outlined SVG §1b asks for. Converting type to outlines needs
 * a font-parsing library this repo does not have and should not gain to set one logo, and
 * the optical kerning pass §1b specifies is a hand job. What this produces is the raster
 * form, at 4× the size it is ever placed at, which is what the feature graphic needs.
 *
 * Run: `pnpm build:store`. Only when the icon, the wordmark or the palette changes.
 */

const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { token } = require('./tokens.cjs')
const { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const APP = join(ROOT, 'apps', 'mobile', 'assets')
const OUT = join(ROOT, 'docs', 'design', 'assets', 'store')
const FONT = join(
  ROOT,
  'node_modules',
  '.pnpm',
  '@expo-google-fonts+nunito@0.4.2',
  'node_modules',
  '@expo-google-fonts',
  'nunito',
  '900Black',
  'Nunito_900Black.ttf',
)

/**
 * Read from the tokens, never copied.
 *
 * These are baked into PNGs that go to a store listing, where a colour that has drifted
 * from the app is a listing that looks like a different product.
 */
const CANVAS = token('color.bg.canvas')
const CANVAS_TOP = token('color.bg.canvasGradient.0')
const GOLD = token('color.reward.xp')
const LIGHT = token('color.text.primary')

/** The product name, read from the locale file so it cannot drift from the splash. */
const WORDMARK = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'i18n', 'locales', 'en', 'splash.json'), 'utf8'),
)['splash:wordmark']

/**
 * The strapline under the mark on the feature graphic.
 *
 * The onboarding headline, not a new marketing line. A store listing that promises
 * something the first screen does not is the same lie as a screenshot of a screen the app
 * does not have — and this repo does not invent copy any more than it invents facts.
 */
const STRAPLINE = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'i18n', 'locales', 'en', 'onboarding.json'), 'utf8'),
)['onboarding:slide.1.title']

const write = (path, dataUrl) => {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'))
  return statSync(path).size
}

/** Resize the shipped icon to a store size, opaque. Apple rejects alpha at upload. */
async function icon(page, bytes, size) {
  return page.evaluate(
    async ({ dataUrl, size, canvasColor }) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = canvasColor
      ctx.fillRect(0, 0, size, size)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, size, size)
      return canvas.toDataURL('image/png')
    },
    { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, size, canvasColor: CANVAS },
  )
}

/**
 * The wordmark, set in the app's own face and trimmed to its own ink.
 *
 * Trimmed because a wordmark with baked padding is a wordmark nobody can align: the
 * lockup ratio in §1c is measured from cap height, and cap height is only knowable if
 * the file starts where the letters start.
 */
async function wordmark(page, colour, height) {
  return page.evaluate(
    async ({ text, colour, height }) => {
      // Generous, then trimmed. Ascenders and the glow both overflow a naive box.
      const pad = height
      const probe = document.createElement('canvas')
      probe.width = 4000
      probe.height = height * 3
      const ctx = probe.getContext('2d')
      ctx.font = `${height}px WQWordmark`
      const width = Math.ceil(ctx.measureText(text).width) + pad * 2

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height * 3
      const c = canvas.getContext('2d')
      c.font = `${height}px WQWordmark`
      c.fillStyle = colour
      c.textBaseline = 'middle'
      c.fillText(text, pad, canvas.height / 2)

      const pixels = c.getImageData(0, 0, canvas.width, canvas.height).data
      let x0 = canvas.width
      let y0 = canvas.height
      let x1 = -1
      let y1 = -1
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
        }
      }

      const out = document.createElement('canvas')
      out.width = x1 - x0 + 1
      out.height = y1 - y0 + 1
      out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
      return out.toDataURL('image/png')
    },
    { text: WORDMARK, colour, height },
  )
}

/**
 * Play's feature graphic: 1024×500, opaque, and cropped hard in some placements.
 *
 * §14's constraint is the one that decides the layout — "nothing in the outer 10 %,
 * Play crops it in some placements" — so the mark, the wordmark and the strapline all sit
 * inside a 819×400 safe box, centred.
 */
async function featureGraphic(page, iconBytes, markSize) {
  return page.evaluate(
    async ({ dataUrl, text, strapline, top, bottom, light, gold, markSize }) => {
      const W = 1024
      const H = 500
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')

      // The app's own canvas gradient, top to bottom, exactly as `ScreenBackground` draws it.
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, top)
      sky.addColorStop(1, bottom)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      const img = new Image()
      img.src = dataUrl
      await img.decode()

      // Mark above wordmark — the vertical lockup, per §1c.
      const gap = markSize * 0.16
      const wordSize = markSize * 0.42
      const strapSize = markSize * 0.17

      ctx.font = `${wordSize}px WQWordmark`
      const wordWidth = ctx.measureText(text).width
      ctx.font = `${strapSize}px WQWordmark`
      const strapWidth = ctx.measureText(strapline).width

      const blockHeight = markSize + gap + wordSize + gap * 0.8 + strapSize
      let y = (H - blockHeight) / 2

      // Rounded, because the source is the STORE icon and a store icon is opaque and
      // square by requirement. Pasted straight onto the gradient it reads as a
      // screenshot of a file rather than as the app's mark: a hard navy square with a
      // visible seam. Every platform draws it rounded on the device, so the feature
      // graphic draws it rounded too. 22 % is the iOS corner radius.
      ctx.save()
      const markX = (W - markSize) / 2
      const radius = markSize * 0.22
      ctx.beginPath()
      ctx.roundRect(markX, y, markSize, markSize, radius)
      ctx.clip()
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, markX, y, markSize, markSize)
      ctx.restore()
      y += markSize + gap

      ctx.font = `${wordSize}px WQWordmark`
      ctx.fillStyle = light
      ctx.textBaseline = 'top'
      ctx.fillText(text, (W - wordWidth) / 2, y)
      y += wordSize + gap * 0.8

      ctx.font = `${strapSize}px WQWordmark`
      ctx.fillStyle = gold
      ctx.fillText(strapline, (W - strapWidth) / 2, y)

      return {
        png: canvas.toDataURL('image/png'),
        // Reported so the safe-area rule is checked rather than trusted.
        widest: Math.max(markSize, wordWidth, strapWidth),
        tall: blockHeight,
      }
    },
    {
      dataUrl: `data:image/png;base64,${iconBytes.toString('base64')}`,
      text: WORDMARK,
      strapline: STRAPLINE,
      top: CANVAS_TOP,
      bottom: CANVAS,
      light: LIGHT,
      gold: GOLD,
      markSize,
    },
  )
}

;(async () => {
  if (!existsSync(FONT)) {
    console.error(
      `\n✗ the wordmark face is not installed:\n    ${FONT}\n\n` +
        '  `pnpm install` at the repo root. This sets the mark in the app\'s own typeface\n' +
        '  rather than an approximation of it, which is the whole point of §1b.',
    )
    process.exit(1)
  }

  const source = join(APP, 'icon.png')
  if (!existsSync(source)) {
    console.error(`\n✗ ${source} is missing. Run \`pnpm build:art\` first.`)
    process.exit(1)
  }

  const browser = await chromium.launch(launchOptions())
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } })
  await page.setContent('<!doctype html><meta charset="utf-8">')

  // The real TTF, loaded into the page, so the letterforms are the app's own.
  await page.evaluate(async (fontBase64) => {
    const binary = atob(fontBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const face = new FontFace('WQWordmark', bytes.buffer)
    await face.load()
    document.fonts.add(face)
    await document.fonts.ready
  }, readFileSync(FONT).toString('base64'))

  const iconBytes = readFileSync(source)

  console.log('Store listing art\n')

  const wrote = []
  wrote.push(['store/ios-icon.png', write(join(OUT, 'ios-icon.png'), await icon(page, iconBytes, 1024)), '1024×1024'])
  wrote.push(['store/play-icon.png', write(join(OUT, 'play-icon.png'), await icon(page, iconBytes, 512)), '512×512'])

  // 4× the largest place it is ever set, so it is never upscaled.
  wrote.push(['store/wordmark-light.png', write(join(OUT, 'wordmark-light.png'), await wordmark(page, LIGHT, 512)), 'set in Nunito Black'])
  wrote.push(['store/wordmark-gold.png', write(join(OUT, 'wordmark-gold.png'), await wordmark(page, GOLD, 512)), 'set in Nunito Black'])

  const MARK = 190
  const feature = await featureGraphic(page, iconBytes, MARK)
  wrote.push(['store/play-feature-graphic.png', write(join(OUT, 'play-feature-graphic.png'), feature.png), '1024×500'])

  for (const [name, bytes, note] of wrote) {
    console.log(`  ${name.padEnd(34)} ${note.padEnd(20)} ${(bytes / 1024).toFixed(0).padStart(5)} KB`)
  }

  await browser.close()

  // Play crops the outer 10 % in some placements, so this is checked rather than eyeballed.
  const SAFE_W = 1024 * 0.8
  const SAFE_H = 500 * 0.8
  if (feature.widest > SAFE_W || feature.tall > SAFE_H) {
    console.error(
      `\n✗ the feature graphic runs into the crop zone: ${feature.widest.toFixed(0)}×${feature.tall.toFixed(0)}` +
        ` against a ${SAFE_W}×${SAFE_H} safe box.\n\n  Lower MARK until it fits. Play crops the outer 10 % in some` +
        ' placements, so\n  anything outside that box is content that may simply not be there.',
    )
    process.exit(1)
  }

  console.log(
    `\n✓ ${wrote.length} store assets · safe area ${feature.widest.toFixed(0)}×${feature.tall.toFixed(0)} of ${SAFE_W}×${SAFE_H}` +
      '\n\n  Screenshots are NOT built here — asset-prompts.md §14 marks their required pixel' +
      '\n  sizes TODO(verify), and a guessed canvas size is a rejected submission.',
  )
})()
