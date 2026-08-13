/**
 * Rasterise the UI icon set, from Lucide.
 *
 * ## The fourth false blocker
 *
 * Icons sat in the "needs an illustrator" bucket with the mascot and the trophy for
 * the whole project, and the tab bar shipped `⌂ ◎ ◈ ☺ ⋯` as literal text characters
 * in the meantime. `docs/design/asset-prompts.md` has named the answer since it was
 * written:
 *
 * > **UI icons** (tab bar, chevrons, close) — Generated icons drift in weight and
 * > optical size, and none of them mirror correctly for RTL. → **Lucide** (ISC) or
 * > **Phosphor** (MIT).
 *
 * That is the same mistake as sound (a chime is a sine wave), flags (a public-domain
 * SVG somebody already drew correctly) and geometry (Natural Earth). Four in a row,
 * each one a filing error rather than a missing asset.
 *
 * ## Why text glyphs had to go
 *
 * They are not a stand-in that merely looks rough. Each one is a real problem:
 *
 * - **They are a different typeface on every device.** `☺` is a system font fallback,
 *   so the tab bar's weight and optical size change between an iPhone, a Pixel and a
 *   browser. Nothing else in the app does that.
 * - **Some are colour emoji.** `🔥 🌍 🗺 🏆` ignore `color` entirely and render in the
 *   platform's own house style — Apple's glossy flame beside our flat cards.
 * - **A screen reader may read them.** `☺` announces as "white smiling face" in some
 *   configurations, in the middle of a tab label.
 * - **None of them mirror for RTL**, and two of them point somewhere (`→`, `›`).
 *
 * ## Why PNG rather than react-native-svg
 *
 * The same reasoning as `build-flags.cjs`, and it has only got stronger: a second
 * native module in an app that has never been opened on a phone. Lucide draws with
 * `currentColor`, so rendering white-on-transparent gives an alpha MASK — one file
 * per icon, recoloured at runtime with `tintColor`, exactly as `CountryMap` already
 * does. One PNG serves the active tab, the inactive tab, and every other colour the
 * theme has.
 *
 * Chromium is already in this image for `pnpm e2e`, so the rasteriser was free.
 *
 * ## Size
 *
 * 192×192, which is 4× the 48pt largest use (the empty-state art slot) and 8× the
 * 24pt common one. Stroke icons are almost pure alpha, so they compress to well under
 * a kilobyte each — the whole set is smaller than one flag.
 *
 * These are ASSET files. Metro puts a registry number in the bundle and ships the PNGs
 * beside it, so they cost download size rather than the Hermes parse that
 * `pnpm bundle:native` budgets.
 *
 * Run: pnpm build:icons
 */

const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } = require('node:fs')
const { join, dirname } = require('node:path')
const { createRequire } = require('node:module')

const OUT = join(process.cwd(), 'apps', 'mobile', 'assets', 'icons')
const INDEX = join(process.cwd(), 'apps', 'mobile', 'src', 'lib', 'icons.generated.ts')

/** 4× the 48pt art slot, 8× the 24pt common case. Never upscaled. */
const SIZE = 192

/**
 * The set, and what each one replaces.
 *
 * Keyed by OUR name rather than Lucide's, because these names appear in screen code
 * and a rename upstream must not become a rename in twenty components. The comment is
 * the glyph it replaces, so the mapping is auditable.
 */
const ICONS = {
  // ── tab bar ──────────────────────────────────────────────────────────────
  home: 'house', //          ⌂
  explore: 'compass', //     ◎
  quests: 'target', //       ◈
  profile: 'circle-user', // ☺
  more: 'ellipsis', //       ⋯

  // ── navigation and chrome ────────────────────────────────────────────────
  back: 'arrow-left', //     ←
  forward: 'arrow-right', // →
  chevron: 'chevron-right', // ›
  close: 'x', //             ✕
  check: 'check', //         ✓

  // ── the economy, which is where the emoji were ───────────────────────────
  streak: 'flame', //        🔥
  xp: 'zap', //              ✦
  coins: 'coins', //         ●
  gem: 'gem', //             ◆
  heart: 'heart', //         ♥
  trophy: 'trophy', //       🏆

  // ── content and collections ──────────────────────────────────────────────
  globe: 'globe', //         🌍
  map: 'map', //             🗺
  pin: 'map-pin', //         where a place IS — the continent cards' "countries to meet"
  flag: 'flag', //           ⚑
  star: 'star', //           ★ ☆ — one shape; filled state is a tint, not a glyph
  lock: 'lock', //           locked achievements and collection tiles
  medal: 'medal', //         achievements
  bell: 'bell', //           the inbox on Home

  // ── states ───────────────────────────────────────────────────────────────
  offline: 'cloud-off', //   the offline banner
  failure: 'unplug', //      ⌖ on FailureState
  shop: 'shopping-bag', //   the coin sink, when it lands

  // ── what a fact IS ───────────────────────────────────────────────────────
  //
  // The country page listed its facts as a column of bare words. The redesign gives
  // each attribute a glyph, which is what lets the eye find "capital" in a list
  // without reading it — and the same glyphs name a quest and a shop title, so the
  // three screens agree about what a flag or a capital LOOKS like.
  capital: 'landmark', //    the capital city
  currency: 'banknote', //   the currency
  language: 'languages', //  the spoken language
  callingCode: 'phone', //   the dialling code — the attribute that had no label at all
  continent: 'earth', //     which continent a country is in

  // ── the redesign's chrome ────────────────────────────────────────────────
  settings: 'settings', //   the gear on Profile, now that More is not a tab
  edit: 'pencil', //         rename yourself, on Profile
  clock: 'clock', //         "new quests in 23h 15m"
  moon: 'moon', //           Night Owl
  sunrise: 'sunrise', //     Early Bird
  sparkle: 'sparkles', //    the daily quiz, and anything that is a treat
  book: 'book-open', //      "learn N countries"
  repeat: 'repeat', //       "practise N times"
}

const require_ = createRequire(join(process.cwd(), 'index.js'))

function lucideDir() {
  try {
    return join(dirname(require_.resolve('lucide-static/package.json')), 'icons')
  } catch {
    console.error(
      '✗ lucide-static is not installed.\n' +
        '  pnpm add -D -w lucide-static\n\n' +
        '  A DEV dependency on purpose: the SVGs are rasterised here at build time and\n' +
        '  the PNGs are committed. Nothing ships the package itself.',
    )
    process.exit(1)
  }
}

/**
 * The registry the app imports.
 *
 * Metro resolves assets at BUILD time, so the import specifiers must be literals — a
 * computed `require(\`../../assets/icons/${name}.png\`)` bundles nothing and fails at
 * runtime, on device, where nobody is looking. Same trap as `src/lib/sound.ts` and the
 * flag registry. The script that writes the PNGs writes their index too, so the two
 * cannot drift.
 *
 * `IconName` is exported as a union so a typo in a screen is a compile error rather
 * than a blank square.
 */
function writeIndex(names) {
  const imports = names.map((n) => `import ${ident(n)} from '../../assets/icons/${n}.png'`).join('\n')
  const entries = names.map((n) => `  '${n}': ${ident(n)},`).join('\n')
  const union = names.map((n) => `  | '${n}'`).join('\n')

  writeFileSync(
    INDEX,
    `/**
 * GENERATED by \`pnpm build:icons\` — do not edit.
 *
 * Icon artwork rasterised from Lucide ${lucideVersion()} (ISC). See
 * scripts/build-icons.cjs for why these are PNG alpha masks rather than SVG.
 *
 * Every file is white-on-transparent, so it is a MASK: the colour comes from
 * \`tintColor\` at the call site and one file serves every state the theme has.
 */

${imports}

/** Metro hands back a numeric handle; Vite hands back a URL string. Both are real. */
export type IconAsset = number | string

export type IconName =
${union}

export const ICON_BY_NAME: Readonly<Record<IconName, IconAsset>> = {
${entries}
}
`,
  )
}

/** `chevron-right` is not an identifier. */
const ident = (name) => name.replace(/-(.)/g, (_, c) => c.toUpperCase())

const lucideVersion = () =>
  JSON.parse(readFileSync(join(dirname(require_.resolve('lucide-static/package.json')), 'package.json'), 'utf8'))
    .version

/**
 * White stroke on transparent, at SIZE.
 *
 * Lucide draws with `stroke="currentColor"`, so setting `color` on the wrapper is
 * enough — no string surgery on the SVG, which is what would silently break when
 * upstream changes an attribute order.
 */
const page = (svg) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  #i { width: ${SIZE}px; height: ${SIZE}px; color: #fff; display: block; }
  #i svg { width: 100%; height: 100%; display: block; }
</style></head>
<body><div id="i">${svg}</div></body></html>`

;(async () => {
  const src = lucideDir()
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch(launchOptions())
  const tab = await browser.newPage({
    viewport: { width: SIZE, height: SIZE },
    deviceScaleFactor: 1,
  })

  console.log(`Icons → ${SIZE}×${SIZE} PNG alpha masks, from Lucide ${lucideVersion()}\n`)

  const missing = []
  let bytes = 0

  for (const [name, lucide] of Object.entries(ICONS)) {
    const svgPath = join(src, `${lucide}.svg`)
    if (!existsSync(svgPath)) {
      // Loudly, and without substituting something that looks plausible. Lucide renames
      // icons between majors, and a silent fallback would ship the wrong picture.
      missing.push(`${name} → ${lucide}.svg`)
      continue
    }

    await tab.setContent(page(readFileSync(svgPath, 'utf8')))
    const file = join(OUT, `${name}.png`)
    await tab.locator('#i').screenshot({ path: file, omitBackground: true })
    bytes += statSync(file).size
    console.log(`  ${name.padEnd(10)} ${lucide}`)
  }

  await browser.close()

  if (missing.length > 0) {
    console.error(
      `\n✗ Lucide does not have:\n    ${missing.join('\n    ')}\n\n` +
        '  Icons get renamed between majors. Find the new name in node_modules/lucide-static/icons\n' +
        '  and fix ICONS above — do NOT substitute a different picture that happens to exist.',
    )
    process.exit(1)
  }

  const names = Object.keys(ICONS)
  writeIndex(names)

  console.log(`\n  ${names.length} icons · ${(bytes / 1024).toFixed(0)} KB total`)
  console.log(`✓ wrote ${names.length} PNGs and src/lib/icons.generated.ts`)
})()
