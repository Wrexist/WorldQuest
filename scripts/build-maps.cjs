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
 * The mockup's thumbnail is not a country floating in a void. It is **the region, with
 * the country lit up inside it** — which is also the only version that teaches
 * anything. A silhouette of Chad on its own tells you the shape of Chad; Africa with
 * Chad glowing tells you where Chad is, which is the question the app is asking.
 *
 * So each country gets two files that share one projection frame:
 *
 *   geo/regions/<REGION>.png     the region's land, drawn once   (6 files)
 *   geo/countries/<CODE>.png     that country, in the region frame (65 files)
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
 * `d3-geo`'s Mercator, fitted per region so every country in a region shares a frame.
 * Mercator because it is locally shape-correct, which is what makes an outline
 * recognisable, and because it is the projection every map a child has ever seen uses.
 * It inflates high latitudes badly — Greenland in the North America frame is the usual
 * victim — which is a known and conventional distortion rather than a wrong border.
 *
 * Run: pnpm build:maps
 */

const { chromium } = require('playwright')
const { readFileSync, writeFileSync, mkdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const OUT_REGIONS = join(process.cwd(), 'apps', 'mobile', 'assets', 'geo', 'regions')
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

/** 8% inset so a coastline never touches the edge — the delivery spec's safe area. */
const PADDING = 48

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
function writeIndex(regions, codes) {
  const regionImports = regions
    .map((r) => `import region_${r} from '../../assets/geo/regions/${r}.png'`)
    .join('\n')
  const countryImports = codes
    .map((c) => `import country_${c} from '../../assets/geo/countries/${c}.png'`)
    .join('\n')
  const regionEntries = regions.map((r) => `  'geo/regions/${r}.png': region_${r},`).join('\n')
  const countryEntries = codes
    .map((c) => `  'geo/countries/${c}.png': country_${c},`)
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
 * Both layers are single-colour alpha masks: tint them with a design token rather than
 * treating them as artwork with a colour of their own.
 */

${regionImports}
${countryImports}

import type { AssetModule } from './flags.generated.js'

/** Content-pack asset path → the bundled image. */
export const MAP_BY_PATH: Readonly<Record<string, AssetModule>> = {
${regionEntries}
${countryEntries}
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
    const span = (b) => [Math.abs(b[1][0] - b[0][0]), Math.abs(b[1][1] - b[0][1])]

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
    .filter((i) => i.assets?.map?.path !== `geo/countries/${i.id}.png`)
    .map((i) => `${i.id} → ${i.assets?.map?.path ?? '(no assets.map)'}`)
  if (mismatched.length > 0) {
    console.error(
      `✗ the pack names geometry files this script does not write:\n    ${mismatched.join('\n    ')}\n\n` +
        '  Expected "geo/countries/<ID>.png" for each. Fix the pack, not this script.',
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

  rmSync(OUT_REGIONS, { recursive: true, force: true })
  rmSync(OUT_COUNTRIES, { recursive: true, force: true })
  mkdirSync(OUT_REGIONS, { recursive: true })
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

  let bytes = 0
  const codes = []

  for (const region of regions) {
    const members = entries.filter((e) => e.region === region)

    // The base layer is the WHOLE continent, not just the countries this pack teaches.
    //
    // The first version drew only our members and Africa came out moth-eaten — sixteen
    // disconnected blobs that read as a rendering bug. It is also the wrong lesson: a
    // highlight means "here, in Africa", and that needs an Africa to be inside. The
    // continent per country comes from `countries-list`, which agrees with this pack's
    // own `region` field on all 65 — two independent sources concurring, which is the
    // only reason to trust either.
    const continentGeometries = topology.objects.countries.geometries.filter((g) => {
      const alpha2 = iso.numericToAlpha2(String(g.id))
      return alpha2 !== undefined && isoTable[alpha2]?.continent === region
    })

    // One projection per region, so the country layer and the region layer share a
    // frame and overlay exactly. Fitting each country to its own frame instead would
    // put the highlight nowhere near where the country actually is, which is the whole
    // point of the picture.
    //
    // Framed on the COUNTRIES THIS APP TEACHES, not on the whole continent.
    //
    // Framing on the continent put Siberia in the European frame — `countries-list`
    // files Russia under EU — and squeezed the nineteen countries we actually teach
    // into a third of the picture. Fixing that by deciding where Europe ends is not
    // ours to do: contested boundaries follow a documented policy and are never
    // resolved unilaterally (packages/content/CLAUDE.md § sensitive content). Framing
    // on our own members sidesteps the question rather than answering it — it asserts
    // nothing about continent membership, it just points the camera at the subject.
    //
    // The continent is still DRAWN in full behind it and runs off the edges, which is
    // what a map should do: a window onto somewhere bigger, not a continent floating
    // in a box.
    //
    // Main mass is taken per country, never from a merged shape. Merged first, the
    // 98 % threshold is spent on a continent's worth of islands at once and enough of
    // them survive to blow the frame open again — the Canaries and the Azores kept
    // Europe a smudge in the corner through two attempts. Per country, Spain drops the
    // Canaries and Portugal drops the Azores before either reaches the fit.
    const frame = {
      type: 'GeometryCollection',
      geometries: members.map((m) => mainMass(m.shape)),
    }
    // Rotated to the region's own central meridian before fitting.
    //
    // Not a refinement — without it Oceania is a WRONG MAP. Its frame runs from 113°E
    // east to −128°, crossing the antimeridian, and an unrotated Mercator puts the two
    // halves of that at opposite edges of the image: Fiji spans 177°E to −178°, so it
    // was drawn as two slivers 500px apart with the Pacific between them. The
    // thumbnail read as "almost empty", which is how it nearly shipped — an empty-
    // looking map invites you to blame the data, and the data was fine.
    //
    // `geoCentroid` computes the centre on the sphere, so it gets this right for a set
    // that wraps. Every other region rotates by a few degrees and looks identical.
    const projection = geoMercator()
      .rotate([-geoCentroid(frame)[0], 0])
      .fitExtent(
        [
          [PADDING, PADDING],
          [WIDTH - PADDING, HEIGHT - PADDING],
        ],
        frame,
      )
    const path = geoPath(projection)

    // `merge` dissolves the shared borders, so the continent reads as one landmass
    // rather than as a jigsaw with every internal edge drawn.
    const regionPng = await shoot(path(merge(topology, continentGeometries)))
    writeFileSync(join(OUT_REGIONS, `${region}.png`), regionPng)
    bytes += regionPng.length

    for (const member of members) {
      const png = await shoot(path(member.shape))
      writeFileSync(join(OUT_COUNTRIES, `${member.code}.png`), png)
      bytes += png.length
      codes.push(member.code)
    }

    // How big each highlight actually comes out, checked rather than assumed.
    //
    // A country whose highlight lands outside the frame is a blank map and fails the
    // build. One that lands inside but tiny is not a bug — Fiji really is a speck in a
    // map of Oceania, and shrinking Oceania until Fiji is comfortable would be lying
    // about where Fiji is — but it IS a number somebody should see rather than
    // discover on a device, so the smallest few are printed every run.
    const sizes = members.map((m) => {
      const [[west, south], [east, north]] = geoBounds(mainMass(m.shape))
      const a = projection([west, north])
      const b = projection([east, south])
      if (a === null || b === null) return { code: m.code, px: 0, outside: true }
      const px = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
      const outside = [a, b].some(([x, y]) => x < 0 || x > WIDTH || y < 0 || y > HEIGHT)
      return { code: m.code, px, outside }
    })

    const clipped = sizes.filter((s) => s.outside)
    if (clipped.length > 0) {
      console.error(
        `\n✗ ${region}: ${clipped.map((c) => c.code).join(', ')} fall outside the frame.\n` +
          '  Their own map would be blank. Widen the fit rather than shipping it.',
      )
      process.exit(1)
    }

    const smallest = [...sizes].sort((a, b) => a.px - b.px).slice(0, 3)
    console.log(
      `  ${region}  ${String(members.length).padStart(2)} taught` +
        `  ${String(continentGeometries.length).padStart(3)} drawn` +
        `   smallest: ${smallest.map((s) => `${s.code} ${Math.round(s.px)}px`).join(', ')}`,
    )
  }

  await browser.close()

  codes.sort()
  writeIndex(regions, codes)

  console.log(
    `\n✓ ${regions.length} regions + ${codes.length} countries` +
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
