/**
 * Rasterise the region and country maps this pack needs, from Natural Earth.
 *
 * ## Why this exists, and why it was never "blocked on an illustrator"
 *
 * `docs/design/mockup-fidelity.md` filed map thumbnails under "needs assets — blocked
 * on a decision", in the same table row group as the mascot. That was wrong, and it is
 * the THIRD time this project has made the same filing error: sound sat there until
 * somebody noticed a correct-answer chime is a sine wave, flags sat there until
 * somebody noticed a national flag is a public-domain drawing, and geometry has been
 * sitting there while two other documents said plainly where to get it.
 *
 * `docs/design/asset-prompts.md`, under **⛔ Never generate these**:
 *
 * > **Country / continent geometry** — Generated maps have invented coastlines and
 * > wrong borders. That is both a wrong fact and a political problem.
 * > → **Natural Earth** (public domain), simplified per zoom.
 *
 * And ADR 0008 accepted that source months ago. "Never draw this" is not "we cannot
 * have this"; it is the opposite, and it names the supplier in the same sentence.
 *
 * So nothing here draws a coastline. Every vertex comes from Natural Earth via
 * `world-atlas`, and the ISO numeric → alpha-2 mapping comes from `i18n-iso-countries`
 * rather than from anybody's memory — a country matched to the wrong outline is a
 * wrong fact drawn rather than written, and a border invented is worse than that.
 *
 * ## What it produces, and why two layers
 *
 * The mockup's thumbnail is not a country floating in a void, and it is not a continent
 * with a speck on it either. It is **the country, big enough to recognise, with its
 * neighbours around it**. A silhouette of Chad alone tells you the shape of Chad; Chad
 * with Libya, Sudan and Niger around it tells you where Chad is, which is the question
 * the app is asking.
 *
 * So each country gets two files that share ITS OWN projection frame:
 *
 *   geo/countries/<CODE>.png     the country, filling ~46% of the frame
 *   geo/context/<CODE>.png       the land around it, same frame
 *
 * The first version framed each CONTINENT and shared that frame across its members.
 * Every file was correct and the result was useless: Japan came out a 30px sliver in a
 * 600px Asia. That is how an atlas index works, and it is not how anybody learns where
 * a country is. Per-country framing costs 130 files instead of 71 and is the whole
 * difference between a picture you read and a picture you skip.
 *
 * Stacked, they line up exactly. Kept apart, each is a single-colour alpha mask, so
 * `Image`'s `tintColor` paints them from design tokens at runtime — which is as close
 * to ADR 0008's "fills are design tokens" as a raster can get, and it means a
 * high-contrast or seasonal theme recolours the map without regenerating anything.
 *
 * ## Why PNG rather than shipping the SVG
 *
 * Same reason as the flags: rendering SVG in React Native needs `react-native-svg`, a
 * native module, in an app that has never been opened on a phone and whose bundle
 * budget has 0.25 MB of headroom. ADR 0008 chose `react-native-svg` for the
 * INTERACTIVE map — the tappable globe and "tap the country" questions, which need
 * hit-testing and per-zoom detail. A thumbnail needs neither. This does not replace
 * that decision or contradict it; it ships the static half now, off the same source
 * data, so the interactive half can land later against a pipeline that already exists.
 *
 * ## Projection
 *
 * `d3-geo`'s Mercator, fitted per COUNTRY and rotated to that country's own central
 * meridian. Mercator because it is locally shape-correct, which is what makes an
 * outline recognisable, and because it is the projection every map a child has ever
 * seen uses. The rotation is not a refinement: without it, a country spanning the
 * antimeridian is drawn as two slivers at opposite edges of the image, which is what
 * happened to Fiji twice — once through the projection and once through a bounding-box
 * width computed by subtraction.
 *
 * Run: pnpm build:maps
 */

const { chromium } = require('playwright')
const { readFileSync, writeFileSync, mkdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const OUT_CONTEXT = join(process.cwd(), 'apps', 'mobile', 'assets', 'geo', 'context')
const OUT_COUNTRIES = join(process.cwd(), 'apps', 'mobile', 'assets', 'geo', 'countries')
const INDEX = join(process.cwd(), 'apps', 'mobile', 'src', 'lib', 'maps.generated.ts')
const PACK = join(
  process.cwd(),
  'packages',
  'content',
  'packs',
  'geography',
  'entities.countries.v1.json',
)

/**
 * 600×450, matching the flags exactly.
 *
 * Not a coincidence and not laziness: the lesson prompt slot is one slot, and a map
 * and a flag both land in it. Two different native sizes there would mean the layout
 * shifts depending on which template the composer picked.
 */
const WIDTH = 600
const HEIGHT = 450

/**
 * How much of the frame the country itself fills.
 *
 * 0.46 — the country is fitted into the middle 46 %, leaving 27 % of margin on every
 * side for its neighbours. That margin is the whole point: a country alone in a box is
 * a shape, and a shape does not tell you where anything is. Japan needs Korea and the
 * Chinese coast beside it or it is just a squiggle.
 *
 * The first version framed each CONTINENT instead and shared that frame across all its
 * countries. It was correct and useless: Japan came out a 30px sliver in a 600px Asia,
 * which is how a real atlas index works and not how you learn where somewhere is.
 */
const SUBJECT_FRACTION = 0.46

/**
 * 1:50m, not 1:110m.
 *
 * At 110m the small island states in this pack (Fiji, Papua New Guinea) reduce to a
 * couple of dots or vanish, and a country that is not drawn is worse than one drawn
 * coarsely. 50m is 756 KB of source JSON, all of it dev-time.
 */
const RESOLUTION = 'countries-50m.json'

function load(name) {
  try {
    return require(name)
  } catch {
    console.error(
      `✗ ${name} is not installed.\n` +
        '  pnpm add -D -w world-atlas topojson-client d3-geo i18n-iso-countries\n\n' +
        '  All four are DEV dependencies on purpose: the geometry is projected and\n' +
        '  rasterised here at build time and the PNGs are committed. Nothing ships the\n' +
        '  packages themselves, so none of this reaches the bundle budget.',
    )
    process.exit(1)
  }
}

/**
 * The registry the app imports.
 *
 * Literal import specifiers, for the reason `flags.generated.ts` documents: Metro
 * resolves assets at build time, so a computed `require` bundles nothing and fails on
 * device only. Keyed by the content pack's own path so a pack promising a file we do
 * not ship misses the lookup and falls back to the placeholder.
 */
function writeIndex(codes) {
  const countryImports = codes
    .map((c) => `import country_${c} from '../../assets/geo/countries/${c}.png'`)
    .join('\n')
  const contextImports = codes
    .map((c) => `import context_${c} from '../../assets/geo/context/${c}.png'`)
    .join('\n')
  const countryEntries = codes
    .map((c) => `  'geo/countries/${c}.png': country_${c},`)
    .join('\n')
  const contextEntries = codes
    .map((c) => `  'geo/context/${c}.png': context_${c},`)
    .join('\n')

  writeFileSync(
    INDEX,
    `/**
 * GENERATED by \`pnpm build:maps\` — do not edit.
 *
 * Outlines projected from Natural Earth (public domain) via world-atlas. See
 * scripts/build-maps.cjs for the projection, the two-layer scheme, and why these are
 * PNG rather than SVG.
 *
 * Two files per country, sharing that country's own zoom frame: the country itself,
 * and the land around it. Both are single-colour alpha masks — tint them with a design
 * token rather than treating them as artwork with a colour of their own.
 */

${countryImports}
${contextImports}

import type { AssetModule } from './flags.generated.js'

/** Content-pack asset path → the bundled image. */
export const MAP_BY_PATH: Readonly<Record<string, AssetModule>> = {
${countryEntries}
${contextEntries}
}
`,
  )
}

;(async () => {
  const { feature, merge } = load('topojson-client')
  const { geoMercator, geoPath, geoArea, geoBounds, geoCentroid } = load('d3-geo')
  const iso = load('i18n-iso-countries')
  const { countries: isoTable } = load('countries-list')
  const topology = load(`world-atlas/${RESOLUTION}`)

  /**
   * The polygons that make up the bulk of a shape, for FRAMING only.
   *
   * Fitting a viewport to a country's full extent is what made the first version of
   * this unusable: France reaches French Guiana, Portugal the Azores, Spain the
   * Canaries, the Netherlands the Caribbean. Fitted to all of that, "Europe" was a
   * thumbnail-sized smudge in the corner of a frame mostly filled with Atlantic.
   *
   * So the frame is computed from a shape's main cluster and the remainder is allowed
   * to fall outside it. The shapes themselves are ALWAYS drawn whole — this only
   * decides where the camera points. A map of Europe that does not show French Guiana
   * is every map of Europe ever printed; a map of France with Guiana quietly deleted
   * would be a different and much worse thing.
   */
  const mainMass = (geojson) => {
    const polygons =
      geojson.type === 'MultiPolygon'
        ? geojson.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
        : [geojson]
    if (polygons.length === 1) return geojson

    const ranked = polygons
      .map((p) => ({ p, area: geoArea(p) }))
      .sort((a, b) => b.area - a.area)

    // Accepted by EFFECT ON THE FRAME, not by area — which is the second version of
    // this rule and the one that works. "Keep polygons covering 98 % of the area" let
    // French Guiana through (15 % of France), the Dutch Caribbean through, and Svalbard
    // through (19 % of Norway), and those three alone stretched the European frame from
    // 68°W to 40°E and from 2°N to 80°N. Europe came out a smudge in the middle of an
    // ocean, twice, for a reason that has nothing to do with how big anything is.
    //
    // What actually disqualifies a territory here is that including it moves the camera
    // a long way for a small subject. So: take the largest polygon, then add another
    // only if it does not inflate the bounding box by more than half again. Japan's
    // four islands, New Zealand's two and Canada's arctic all pass — they are near
    // their mainland. Guiana, Curaçao and Svalbard do not.
    const kept = [ranked[0].p]
    let box = geoBounds(ranked[0].p)
    // Longitude span, WRAPPED. `geoBounds` reports an antimeridian-crossing shape as
    // west 177°, east −178° — five degrees apart going east, and 355 apart if you
    // subtract them. Naively subtracted, Fiji's bounding box looked like most of the
    // planet, so no island could ever grow it by half again, so every scattered islet
    // was kept and the frame was fitted to all of them: Fiji rendered as three specks
    // in an empty Pacific. This is the same antimeridian bug as the projection's,
    // wearing a different hat, which is why it is spelled out rather than inlined.
    const span = (b) => [((b[1][0] - b[0][0] + 360) % 360), Math.abs(b[1][1] - b[0][1])]

    for (const { p } of ranked.slice(1)) {
      const merged = geoBounds({ type: 'GeometryCollection', geometries: [...kept, p] })
      const [w0, h0] = span(box)
      const [w1, h1] = span(merged)
      // `+2` so a tiny subject is not judged by a ratio against nearly zero.
      if (w1 > (w0 + 2) * 1.5 || h1 > (h0 + 2) * 1.5) continue
      kept.push(p)
      box = merged
    }
    return { type: 'GeometryCollection', geometries: kept }
  }

  const pack = JSON.parse(readFileSync(PACK, 'utf8'))

  // The pack is the contract, exactly as with the flags. If it names a geometry file
  // this script does not write, the app draws a placeholder where a map should be.
  const mismatched = pack.items
    .filter(
      (i) =>
        i.assets?.map?.path !== `geo/countries/${i.id}.png` ||
        i.assets?.mapContext?.path !== `geo/context/${i.id}.png`,
    )
    .map(
      (i) =>
        `${i.id} → ${i.assets?.map?.path ?? '(no assets.map)'}` +
        ` + ${i.assets?.mapContext?.path ?? '(no assets.mapContext)'}`,
    )
  if (mismatched.length > 0) {
    console.error(
      `✗ the pack names geometry files this script does not write:\n    ${mismatched.join('\n    ')}\n\n` +
        '  Expected "geo/countries/<ID>.png" and "geo/context/<ID>.png" for each.\n' +
        '  Fix the pack, not this script.',
    )
    process.exit(1)
  }

  // ── match our countries to their outlines, by ISO number ──────────────────
  //
  // world-atlas identifies a country by ISO 3166-1 NUMERIC; the packs use alpha-2.
  // The bridge is a maintained ISO table, never a hand-written map: 65 numeric codes
  // typed from memory is 65 chances to draw one country and label it another.
  //
  // Grouped, not keyed — and this is the whole reason the guard below exists. An ISO
  // code can appear on MORE THAN ONE geometry: Natural Earth files "Ashmore and
  // Cartier Is.", an uninhabited sandbank in the Timor Sea, under 036, the same code as
  // Australia. Built as `new Map(geometries.map(g => [id, g]))` the last one wins, and
  // the map captioned "Australia" was two specks off the coast of Timor. It looked
  // like an empty thumbnail, which is the most dismissible kind of wrong.
  //
  // Merging the group is also the correct answer rather than a workaround: Ashmore and
  // Cartier really is Australian territory, and a country's map should include it.
  const groupsByNumeric = new Map()
  for (const g of topology.objects.countries.geometries) {
    if (g.id === undefined) continue
    const key = String(g.id)
    groupsByNumeric.set(key, [...(groupsByNumeric.get(key) ?? []), g])
  }

  const unmatched = []
  const entries = []
  for (const item of pack.items) {
    const numeric = iso.alpha2ToNumeric(item.id)
    const group = numeric === undefined ? undefined : groupsByNumeric.get(String(numeric))
    if (group === undefined) {
      unmatched.push(item.id)
      continue
    }
    entries.push({ code: item.id, region: item.region, shape: merge(topology, group) })
  }

  if (unmatched.length > 0) {
    console.error(
      `✗ Natural Earth has no outline for: ${unmatched.join(', ')}\n\n` +
        '  Do NOT approximate one. An invented coastline is a wrong fact and, where it\n' +
        '  is a border, a political claim — see docs/design/asset-prompts.md and\n' +
        '  docs/systems/content-pipeline.md § sensitive content. Find the country under\n' +
        '  a different ISO number, or drop it from the pack.',
    )
    process.exit(1)
  }

  // Every shape must have real area before anything is drawn.
  //
  // The Australia/Ashmore collision produced a geometry whose `geoArea` was NaN and
  // whose bounds were `[[null, null], [null, null]]`, and every downstream step
  // accepted it: the fit ran, the PNG was written, the file was 1 KB of transparent
  // pixels, and the only tell was a "0px" in a size report that could easily have been
  // read as a rounding artefact. A wrong map is the same class of bug as a wrong
  // capital, so it fails here rather than being noticed on a phone.
  const degenerate = entries.filter((e) => {
    const area = geoArea(e.shape)
    return !Number.isFinite(area) || area <= 0
  })
  if (degenerate.length > 0) {
    console.error(
      `✗ degenerate geometry for: ${degenerate.map((d) => d.code).join(', ')}\n\n` +
        '  The outline has no area, so the map would be a blank rectangle. This is what\n' +
        '  an ISO code shared by two Natural Earth features looks like — check whether\n' +
        '  the code matches more than one geometry before assuming the data is broken.',
    )
    process.exit(1)
  }

  const regions = [...new Set(entries.map((e) => e.region))].sort()

  // The per-region layer this script used to emit. Removed rather than left behind:
  // a stale asset directory is dead weight in the download that no test would notice,
  // and `CountryMap.test.tsx` asserts the inverse — that nothing ships unclaimed.
  rmSync(join(process.cwd(), 'apps', 'mobile', 'assets', 'geo', 'regions'), {
    recursive: true,
    force: true,
  })
  rmSync(OUT_CONTEXT, { recursive: true, force: true })
  rmSync(OUT_COUNTRIES, { recursive: true, force: true })
  mkdirSync(OUT_CONTEXT, { recursive: true })
  mkdirSync(OUT_COUNTRIES, { recursive: true })

  const browser = await chromium.launch({
    executablePath: process.env.WQ_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  })

  /** White on transparent. The colour is the caller's business — see `tintColor`. */
  const shoot = async (d) => {
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}` +
        `svg{display:block}</style>` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
        `<path d="${d}" fill="#FFFFFF"/></svg>`,
      { waitUntil: 'load' },
    )
    return page.screenshot({ omitBackground: true })
  }

  console.log(`Maps → ${WIDTH}×${HEIGHT} PNG, from Natural Earth 1:50m\n`)

  /**
   * Every landmass on Earth, dissolved into one shape, drawn once and reused.
   *
   * The context layer is "the land around here", not "this continent" — a neighbour
   * can be across a continent boundary (Egypt's are in both Africa and Asia, Russia's
   * in both Europe and Asia), and a context layer that stopped at a continent edge
   * would show a coastline where a border belongs. Merging is what makes it read as
   * land rather than as a jigsaw with every internal edge drawn.
   */
  const allLand = merge(topology, topology.objects.countries.geometries)

  let bytes = 0
  const codes = []
  const sizes = []

  // Sorted so the output is stable run to run, which makes the size report diffable.
  for (const member of [...entries].sort((a, b) => a.code.localeCompare(b.code))) {
    const subject = mainMass(member.shape)

    /**
     * One projection per COUNTRY, rotated to that country's own meridian.
     *
     * The rotation is not optional. Fiji spans 177°E to −178°, and an unrotated
     * Mercator puts those at opposite edges of the image — it was drawn as two slivers
     * 500px apart, which read as "almost empty" rather than as broken.
     *
     * `fitExtent` into the middle band leaves the margin that carries the neighbours.
     */
    const inset = (1 - SUBJECT_FRACTION) / 2
    const projection = geoMercator()
      .rotate([-geoCentroid(subject)[0], 0])
      .fitExtent(
        [
          [WIDTH * inset, HEIGHT * inset],
          [WIDTH * (1 - inset), HEIGHT * (1 - inset)],
        ],
        subject,
      )
    const path = geoPath(projection)

    const contextPng = await shoot(path(allLand))
    writeFileSync(join(OUT_CONTEXT, `${member.code}.png`), contextPng)
    bytes += contextPng.length

    const countryPng = await shoot(path(member.shape))
    writeFileSync(join(OUT_COUNTRIES, `${member.code}.png`), countryPng)
    bytes += countryPng.length

    codes.push(member.code)

    // How big the subject actually comes out, measured rather than trusted.
    //
    // Fitted to a fixed fraction of the frame, every country SHOULD land at roughly the
    // same size — that is the point of framing per country rather than per continent.
    // So unlike the old per-region report, an outlier here means something is wrong:
    // a shape whose main mass is not what we think it is, or a projection that has
    // folded. Printed every run so a regression is visible rather than discovered.
    const [[west, south], [east, north]] = geoBounds(subject)
    const a = projection([west, north])
    const b = projection([east, south])
    const px =
      a === null || b === null
        ? 0
        : Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
    sizes.push({ code: member.code, px })
  }

  const target = Math.min(WIDTH, HEIGHT) * SUBJECT_FRACTION
  const wrong = sizes.filter((s) => s.px < target * 0.5 || s.px > WIDTH)
  if (wrong.length > 0) {
    console.error(
      `\n✗ these countries did not fit their own frame: ` +
        `${wrong.map((w) => `${w.code} ${Math.round(w.px)}px`).join(', ')}\n\n` +
        `  Every country is fitted to the same fraction of the frame, so they should all\n` +
        `  land near ${Math.round(target)}px. One that does not means its main mass is not\n` +
        '  the shape we think it is — check for an ISO code shared by two geometries.',
    )
    process.exit(1)
  }

  const ordered = [...sizes].sort((a, b) => a.px - b.px)
  console.log(
    `  subject size  target ${Math.round(target)}px` +
      `  ·  smallest ${ordered[0].code} ${Math.round(ordered[0].px)}px` +
      `  ·  largest ${ordered[ordered.length - 1].code} ` +
      `${Math.round(ordered[ordered.length - 1].px)}px`,
  )

  await browser.close()

  codes.sort()
  writeIndex(codes)

  console.log(
    `\n✓ ${codes.length} countries × 2 layers` +
      `  ${(bytes / 1024).toFixed(0)} KB total\n` +
      `  wrote ${INDEX.replace(process.cwd() + '/', '')}\n\n` +
      '  These are ASSET files: Metro ships them beside the bytecode rather than\n' +
      '  inside it, so they cost download size and not Hermes parse time. Confirm with\n' +
      '  `pnpm bundle:native`, which reports the two separately.',
  )
})().catch((error) => {
  console.error('✗', error.message)
  process.exit(1)
})
