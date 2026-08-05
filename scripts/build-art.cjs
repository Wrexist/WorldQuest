/**
 * Derive the shipped artwork from the delivered masters.
 *
 * The masters landed in `docs/design/assets/**` as raw generation output, and raw
 * generation output is not a shippable asset. Measured on arrival:
 *
 *   · every illustration is 1536×1024 — a 3:2 landscape frame, where the delivery spec
 *     asks for 1024×1024, and where the SLOTS that render them are square;
 *   · `app/icon.png` is 1536×1024 **with an alpha channel**. Both halves are
 *     disqualifying on their own: App Store Connect rejects an icon that is not square,
 *     and it rejects one with transparency at upload rather than at review;
 *   · they run 1.3–2.8 MB each, against a delivery budget of ≤120 KB per shipped asset.
 *     Twenty-two of them is ~50 MB — an order of magnitude over the whole app's current
 *     2.90 MB of bundled assets.
 *
 * So the masters stay as masters, and this writes what the app actually ships. Same
 * shape as `build-flags.cjs` and `build-maps.cjs`: a script owns the transform, the
 * output is derived and reproducible, and the index that imports it is generated too so
 * the two cannot drift.
 *
 * ## Chromium, again
 *
 * There is no ImageMagick, no sharp and no PIL in this repo, and adding one to resize
 * twenty-two images would be a new native dependency in the install path for every
 * contributor. Chromium is already here — it rasterises the flags, the maps and the
 * icons, and CI already installs it. A canvas resize is the same tool doing the same
 * class of work.
 *
 * ## Why the illustrations are WebP and the app icons are not
 *
 * These are photographic-density illustrations with gradients, glows and starfields.
 * PNG is lossless and stores exactly that kind of image badly. Measured, not assumed:
 * the nineteen masters total 42 MB as delivered PNGs and 2.0 MB as the WebP this
 * writes — `atlas/resting` goes 2.0 MB → 41 KB, and the worst of them,
 * `celebration/burst`, still goes 2.7 MB → 149 KB.
 *
 * The four app-level icons stay PNG because the platforms require it — Expo's
 * `icon`/`splash` are handed to native packagers that expect PNG, and a WebP icon fails
 * the build rather than looking worse.
 *
 * Run: `pnpm build:art`. Only when the masters change.
 */

const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } = require('node:fs')
const { join, dirname } = require('node:path')

const ROOT = join(__dirname, '..')
const MASTERS = join(ROOT, 'docs', 'design', 'assets')
const APP = join(ROOT, 'apps', 'mobile', 'assets')
const ART = join(APP, 'art')
const INDEX = join(ROOT, 'apps', 'mobile', 'src', 'lib', 'art.generated.ts')

/** `colors.bg.canvas`. Everything composites onto this, so gaps are filled with it. */
const CANVAS = '#0B1730'

/**
 * Per-asset budget for a shipped illustration.
 *
 * `asset-prompts.md` says ≤120 KB per @3x asset after compression. 768px is the @3x of
 * a 256pt slot, which is the largest any of these is drawn at.
 */
const ILLUSTRATION = { budget: 120 * 1024, format: 'image/webp' }

/**
 * Assets allowed past the budget, each with the reason and its own ceiling.
 *
 * Same shape as the contrast waivers and the escape-hatch allowlist: an exception is
 * allowed to exist, has to be named, and a stale one fails exactly like a violation.
 *
 * All three are the same picture problem — dense high-frequency detail over a starfield,
 * which is precisely what a lossy codec cannot discard. They bottom out around 150 KB at
 * 640px, and the rung below that visibly blotches the gold particles. Holding resolution
 * and spending 90 KB in total is the better trade against a 2.90 MB asset payload; the
 * alternative is three soft illustrations in the two places a new user looks first.
 */
const ALLOWANCE = {
  'atlas/welcome': { max: 170 * 1024, why: 'gold particle field over stars; the taster slide' },
  'onboarding/explore': { max: 140 * 1024, why: 'starfield behind a full-frame planet' },
  'celebration/burst': { max: 160 * 1024, why: 'confetti — noise in every pixel by design' },
}

/**
 * What to try, in order, until one fits the budget.
 *
 * A ladder rather than one setting, because these nineteen images are not one kind of
 * picture. `atlas/resting` is a figure on a plain ground and lands at 41 KB untouched;
 * `celebration/burst` is confetti over a starfield — noise in every pixel, which is
 * exactly what a lossy codec cannot throw away — and needs three rungs down. Picking a
 * single quality low enough for the worst would spend that cost on all nineteen.
 *
 * Size first, then quality: 768 is the @3x of the largest slot any of these is drawn in
 * (200pt onboarding), so dropping to 640 is dropping real resolution, and a quality step
 * is cheaper than a resolution step until roughly q0.6 where WebP starts to blotch.
 */
const LADDER = [
  { size: 768, quality: 0.86 },
  { size: 768, quality: 0.78 },
  { size: 768, quality: 0.7 },
  { size: 768, quality: 0.62 },
  { size: 640, quality: 0.7 },
  { size: 640, quality: 0.62 },
]

/**
 * What ships, and at what size.
 *
 * `fit` is the whole reason this table exists rather than a loop over a directory:
 *
 *   · `cover` centre-crops to fill a square. Safe for these because every master has the
 *     subject centred with padding — that is what the style block asked for and what the
 *     delivered art does.
 *   · `contain` letterboxes onto the canvas colour, for art whose composition is the
 *     point and must not lose its edges.
 */
const APP_ICONS = [
  {
    // Square, opaque, full-bleed. `cover` is not a preference here: a store icon may not
    // be letterboxed and may not carry alpha, and the master is neither square nor
    // opaque.
    from: 'app/icon.png',
    to: 'icon.png',
    size: 1024,
    fit: 'cover',
    opaque: true,
  },
  {
    // Android masks this to a circle, squircle or rounded square depending on the
    // launcher, and it crops hard — the outer ~33% can be cut on any given device. So
    // the subject is inset into the middle 66% and the rest is the canvas colour, which
    // is also what `android.adaptiveIcon.backgroundColor` is set to, so the seam is
    // invisible whatever shape the launcher picks.
    from: 'brand/mark.png',
    to: 'adaptive-icon.png',
    size: 1024,
    fit: 'contain',
    opaque: true,
    inset: 0.66,
  },
  {
    // The browser tab. Small enough that the mark reads better than the icon's wider
    // composition, which collapses to a smudge at 48px.
    from: 'brand/mark.png',
    to: 'favicon.png',
    size: 48,
    fit: 'cover',
    opaque: true,
  },
  {
    // Portrait, kept at its own aspect. The master's upper-centre is deliberately empty
    // — the splash prompt has always said "that space is reserved for the logo, which is
    // composited by the app" — so cropping it square would either cut the planet off the
    // bottom or throw away the space the mark goes in.
    from: 'app/splash.png',
    to: 'splash.png',
    width: 1024,
    height: 1536,
    fit: 'cover',
    opaque: true,
  },
]

/** Illustrations, by the name the app refers to them by. */
const ILLUSTRATIONS = [
  'atlas/welcome',
  'atlas/celebrate',
  'atlas/thinking',
  'atlas/encouraging',
  'atlas/waving-back',
  'atlas/broken-compass',
  'atlas/resting',
  'onboarding/explore',
  'onboarding/learn',
  'onboarding/conquer',
  'states/empty-caught-up',
  'states/empty-no-friends',
  'states/empty-profile',
  'states/empty-collection',
  'states/error-generic',
  'states/offline',
  'states/hearts-empty',
  'celebration/burst',
  'celebration/rays',
]

/**
 * Draw one master into a canvas and read the bytes back.
 *
 * The image is passed in as a data URL rather than a file path because the page has no
 * filesystem, and read back as a data URL because that is the only way out of a canvas.
 * Both are wasteful and both are irrelevant at twenty-two images run occasionally.
 */
async function render(page, sourceBytes, spec) {
  const width = spec.width ?? spec.size
  const height = spec.height ?? spec.size

  return page.evaluate(
    async ({ dataUrl, width, height, fit, opaque, inset, canvasColor, format, quality }) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      if (opaque) {
        ctx.fillStyle = canvasColor
        ctx.fillRect(0, 0, width, height)
      }

      // `cover` fills and crops; `contain` fits and letterboxes. `inset` shrinks the
      // drawn art within the frame without changing the frame.
      const scale =
        fit === 'cover'
          ? Math.max(width / img.width, height / img.height)
          : Math.min(width / img.width, height / img.height) * (inset ?? 1)

      const w = img.width * scale
      const h = img.height * scale
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h)

      return canvas.toDataURL(format, quality)
    },
    {
      dataUrl: `data:image/png;base64,${sourceBytes.toString('base64')}`,
      width,
      height,
      fit: spec.fit,
      opaque: spec.opaque === true,
      inset: spec.inset,
      canvasColor: CANVAS,
      format: spec.format ?? 'image/png',
      quality: spec.quality,
    },
  )
}

const write = (path, dataUrl) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'))
  return statSync(path).size
}

/**
 * The index, generated for the same reason the flags' is.
 *
 * Metro resolves assets at BUILD time, so every import specifier has to be a literal —
 * a computed `require(`../../assets/art/${name}.webp`)` bundles nothing and fails at
 * runtime rather than at build. Nineteen literals is not something to maintain by hand.
 */
function writeIndex(names) {
  const ident = (n) => n.replace(/[/-]([a-z])/g, (_, c) => c.toUpperCase()).replace(/[/-]/g, '')
  const imports = names.map((n) => `import ${ident(n)} from '../../assets/art/${n}.webp'`)
  const entries = names.map((n) => `  '${n}': ${ident(n)},`)

  writeFileSync(
    INDEX,
    `/**
 * GENERATED by \`pnpm build:art\` — do not edit.
 *
 * Illustrations derived from the masters in docs/design/assets. See scripts/build-art.cjs
 * for why they are WebP, why they are 768px, and why this file exists at all.
 */

${imports.join('\n')}

/** Metro hands back a numeric handle; Vite hands back a URL. Both are real. */
export type ArtModule = number | string

/** Art name → the bundled illustration. */
export const ART_BY_NAME = {
${entries.join('\n')}
} as const satisfies Readonly<Record<string, ArtModule>>

/** Every illustration this build ships. */
export type ArtName = keyof typeof ART_BY_NAME
`,
  )
}

;(async () => {
  const browser = await chromium.launch(launchOptions())
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } })
  await page.setContent('<!doctype html><meta charset="utf-8">')

  console.log('Art → app assets\n')

  const missing = []
  const over = []
  const stale = []
  let bytes = 0

  for (const spec of APP_ICONS) {
    const src = join(MASTERS, spec.from)
    if (!existsSync(src)) {
      missing.push(spec.from)
      continue
    }
    const out = join(APP, spec.to)
    const size = write(out, await render(page, readFileSync(src), spec))
    bytes += size
    const dims = spec.width ? `${spec.width}×${spec.height}` : `${spec.size}×${spec.size}`
    console.log(`  ${spec.to.padEnd(20)} ${dims.padEnd(11)} ${(size / 1024).toFixed(0).padStart(5)} KB`)
  }

  console.log('')
  for (const name of ILLUSTRATIONS) {
    const src = join(MASTERS, `${name}.png`)
    if (!existsSync(src)) {
      missing.push(`${name}.png`)
      continue
    }
    const master = readFileSync(src)
    const out = join(ART, `${name}.webp`)

    // `bytes`, not `size` — the rung's `size` is a pixel dimension, and spreading a byte
    // count over it would have made every line report its own weight as its resolution.
    let chosen = null
    for (const rung of LADDER) {
      const written = write(out, await render(page, master, { ...ILLUSTRATION, ...rung, fit: 'cover' }))
      chosen = { ...rung, bytes: written }
      if (written <= ILLUSTRATION.budget) break
    }

    bytes += chosen.bytes
    const allowed = ALLOWANCE[name]
    const ceiling = allowed ? allowed.max : ILLUSTRATION.budget
    if (chosen.bytes > ceiling) {
      over.push(`${name} — ${(chosen.bytes / 1024).toFixed(0)} KB (ceiling ${(ceiling / 1024).toFixed(0)} KB)`)
    }
    // An allowance that is no longer needed is a lie in a script — the same rule the
    // waiver checks elsewhere in this repo enforce. If the art is redelivered smaller,
    // this says so rather than quietly keeping the exemption alive.
    if (allowed && chosen.bytes <= ILLUSTRATION.budget) {
      stale.push(`${name} — fits in ${(ILLUSTRATION.budget / 1024).toFixed(0)} KB now, at ${(chosen.bytes / 1024).toFixed(0)} KB`)
    }
    // The rung is printed, not just the bytes. "141 KB" says nothing about whether an
    // asset is comfortable or was squeezed to fit, and the one that dropped to 640 is
    // the one to look at first when somebody says the art looks soft.
    console.log(
      `  ${name.padEnd(28)} ${`${chosen.size}px`.padStart(5)} q${chosen.quality.toFixed(2)}` +
        `${(chosen.bytes / 1024).toFixed(0).padStart(6)} KB`,
    )
  }

  await browser.close()

  if (missing.length > 0) {
    console.error(
      `\n✗ ${missing.length} master(s) missing:\n    ${missing.join('\n    ')}\n\n` +
        '  Deliver them to docs/design/assets, or remove them from this script. Never\n' +
        '  substitute a stand-in — a placeholder that looks deliberate is worse than a gap.',
    )
    process.exit(1)
  }

  // The budget is the whole reason this script exists, so it fails rather than warns.
  if (stale.length > 0) {
    console.error(
      `\n✗ ${stale.length} allowance(s) no longer needed — delete them:\n    ${stale.join('\n    ')}`,
    )
    process.exit(1)
  }

  if (over.length > 0) {
    console.error(
      `\n✗ over the ${ILLUSTRATION.budget / 1024} KB per-asset budget:\n    ${over.join('\n    ')}\n\n` +
        '  Lower the quality, lower the size, or raise the budget deliberately — but do\n' +
        '  not let it drift. 2.90 MB of assets is already most of what this app ships.',
    )
    process.exit(1)
  }

  writeIndex(ILLUSTRATIONS)
  console.log(`\n✓ ${APP_ICONS.length} app icons + ${ILLUSTRATIONS.length} illustrations · ${(bytes / 1024 / 1024).toFixed(2)} MB total`)
})()
