#!/usr/bin/env node
/**
 * Build the 3D atlas's geographic assets from verified sources. See ADR 0017.
 *
 * Inputs, all pinned or frozen:
 *   - `world-atlas@2.0.2` countries-10m (Natural Earth 1:10m admin-0, public domain)
 *   - `scripts/data/atlas-places.snapshot.json` (Natural Earth populated places, with a
 *     GeoNames cross-check) — see `fetch-atlas-sources.cjs`
 *   - the Natural Earth II raster in `node_modules/.cache/wq-atlas-src` (texture only)
 *   - the geography content pack (country IDs, regions, capital facts)
 *
 * Outputs:
 *   apps/mobile/assets/atlas/surface.bin        the surface: a 4096×2048 equirectangular JPEG
 *   apps/mobile/assets/atlas/country-ids.bin    country ID raster: a 4096×2048 PNG, NEAREST only
 *
 *   The two images are named .bin on purpose: Android packs a bundled IMAGE as a drawable
 *   resource with no file path, which expo-gl cannot read (it decodes from a file:// path
 *   with stb_image); a .bin is packed raw and expo-asset gives it a real file. stb_image
 *   and the browser both decode by content, not by name.
 *   apps/mobile/assets/atlas/countries.bin      picking + outline rings, quantised 1e-5°
 *   apps/mobile/src/features/atlas/data/atlas.generated.ts   the registry the app imports
 *   docs/design/world-atlas/atlas-manifest.generated.json    sources, checksums, coverage
 *   docs/design/world-atlas/coverage.generated.md             the same, for people
 *
 * ## One cut, used three times
 *
 * Every country is projected once through d3's equirectangular projection with
 * `precision(0)` and scale 180/π, so a projected point IS (lon, −lat) in degrees and an
 * edge stays a straight line in lon/lat — the planar reading Natural Earth's vertices are
 * authored in. d3's antimeridian clip cuts Fiji and Russia at ±180° and closes
 * Antarctica along the pole, so no ring ever wraps. Those same cut rings are rasterised
 * into the ID texture, written to the picking file, and measured for the label anchor —
 * so a highlighted pixel, a tapped country and a label can never disagree about where a
 * border is.
 *
 * ## Coverage is reported, never patched
 *
 * A Natural Earth feature that is not a pack country (Western Sahara, Kosovo, Greenland,
 * Antarctica…) is drawn as land with its own raster ID and is not selectable. A pack
 * country with no geometry fails the build. A capital that does not match, or that the
 * cross-check disputes, gets no pin and is listed — nothing is placed at 0,0 and nothing
 * is assigned to a guessed country.
 *
 * Run: pnpm build:atlas            (needs `node scripts/fetch-atlas-sources.cjs` once)
 *      pnpm build:atlas --no-texture   skips the Python/Pillow texture step
 */

const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join, relative } = require('node:path')

const ROOT = join(__dirname, '..')
const PACKS = join(ROOT, 'packages', 'content', 'packs', 'geography')
const OUT_ASSETS = join(ROOT, 'apps', 'mobile', 'assets', 'atlas')
const OUT_TS = join(ROOT, 'apps', 'mobile', 'src', 'features', 'atlas', 'data', 'atlas.generated.ts')
const OUT_DOCS = join(ROOT, 'docs', 'design', 'world-atlas')
const SNAPSHOT = join(__dirname, 'data', 'atlas-places.snapshot.json')
const CACHE = join(ROOT, 'node_modules', '.cache', 'wq-atlas-src')

/** 4096 is the largest texture every WebGL-capable phone is guaranteed to accept. */
const RASTER_W = 4096
const RASTER_H = 2048
/** 1e-5° ≈ 1.1 m. Vatican City is ~0.004° across, so anything coarser loses it. */
const QUANT = 1e5
/** A capital the two sources place further apart than this gets no pin until reviewed. */
const CROSSCHECK_KM = 25
/** Distance from its country's outline a coastal capital may sit at 1:10m. */
const COAST_TOLERANCE_KM = 5
/** Below this many ID pixels a country is drawn with a ring marker as well as its fill. */
const SMALL_TARGET_PX = 64

const args = new Set(process.argv.slice(2))
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d

const { merge } = require('topojson-client')
const d3 = require('d3-geo')
const iso = require('i18n-iso-countries')
const { PNG } = require('pngjs')
const topology = require('world-atlas/countries-10m.json')

const pack = JSON.parse(readFileSync(join(PACKS, 'entities.countries.v1.json'), 'utf8'))
const capitalFacts = JSON.parse(readFileSync(join(PACKS, 'facts.capitals.v1.json'), 'utf8')).items
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))

// ── geometry ─────────────────────────────────────────────────────────────────

/** Cut, projected rings in degrees: [[lon, lat], …] per ring, all rings of one feature. */
function cutRings(geojson) {
  const projection = d3
    .geoEquirectangular()
    .scale(180 / Math.PI)
    .translate([0, 0])
    .precision(0)
  const rings = []
  let ring = null
  let inPolygon = false
  const sink = {
    point(x, y) {
      if (ring) ring.push([x, -y])
    },
    lineStart() {
      ring = []
    },
    lineEnd() {
      if (inPolygon && ring && ring.length >= 3) rings.push(ring)
      ring = null
    },
    polygonStart() {
      inPolygon = true
    },
    polygonEnd() {
      inPolygon = false
    },
    sphere() {},
  }
  d3.geoStream(geojson, projection.stream(sink))
  return rings
}

/** Douglas–Peucker on one ring. Never drops a ring: an island simplified away is a lie. */
function simplify(ring, tolerance) {
  if (ring.length <= 8) return ring
  const keep = new Uint8Array(ring.length)
  keep[0] = 1
  keep[ring.length - 1] = 1
  const stack = [[0, ring.length - 1]]
  const t2 = tolerance * tolerance
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = ring[a]
    const [bx, by] = ring[b]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let worst = -1
    let worstD = t2
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i]
      let d
      if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
      }
      if (d > worstD) {
        worst = i
        worstD = d
      }
    }
    if (worst > 0) {
      keep[worst] = 1
      stack.push([a, worst], [worst, b])
    }
  }
  const out = ring.filter((_, i) => keep[i])
  return out.length >= 4 ? out : ring
}

function ringArea(ring) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  }
  return a / 2
}

function pointInRings(rings, lon, lat) {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

function distanceToRingsKm(rings, lon, lat) {
  let best = Infinity
  const k = Math.cos((lat * Math.PI) / 180)
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = (ring[j][0] - lon) * k
      const ay = ring[j][1] - lat
      const bx = (ring[i][0] - lon) * k
      const by = ring[i][1] - lat
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy || 1e-12
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
    }
  }
  return best * 111.32
}

/**
 * Pole of inaccessibility (the polylabel algorithm, Agafonkin 2016), in a local frame
 * whose longitude is scaled by cos(lat) so "far from every edge" means far in kilometres.
 * A centroid can fall in the sea (Croatia, Chile); this point is inside by construction.
 */
function polylabel(rings, precision = 0.01) {
  const outer = rings[0]
  const lat0 = outer.reduce((s, p) => s + p[1], 0) / outer.length
  const k = Math.cos((lat0 * Math.PI) / 180) || 1
  const local = rings.map((r) => r.map(([x, y]) => [x * k, y]))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of local[0]) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const signed = (x, y) => {
    let inside = false
    let min = Infinity
    for (const ring of local) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i]
        const [bx, by] = ring[j]
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside
        const dx = bx - ax
        const dy = by - ay
        const len2 = dx * dx + dy * dy || 1e-12
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2))
        min = Math.min(min, (ax + t * dx - x) ** 2 + (ay + t * dy - y) ** 2)
      }
    }
    return (inside ? 1 : -1) * Math.sqrt(min)
  }
  const cell = (x, y, h) => {
    const d = signed(x, y)
    return { x, y, h, d, max: d + h * Math.SQRT2 }
  }
  const size = Math.min(maxX - minX, maxY - minY)
  if (size === 0) return [outer[0][1], outer[0][0]]
  let h = size / 2
  const queue = []
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) queue.push(cell(x + h, y + h, h))
  // Area centroid as the first guess, as the reference implementation does.
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0)
  while (queue.length) {
    queue.sort((a, b) => a.max - b.max)
    const c = queue.pop()
    if (c.d > best.d) best = c
    if (c.max - best.d <= precision) continue
    h = c.h / 2
    queue.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h))
  }
  return [round(best.y), round(best.x / k)]
}

/** Same rule as build-maps.cjs: frame on the main cluster, never delete the rest. */
function mainMass(geojson) {
  const polygons =
    geojson.type === 'MultiPolygon'
      ? geojson.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
      : [geojson]
  if (polygons.length === 1) return { type: 'GeometryCollection', geometries: polygons }
  const ranked = polygons.map((p) => ({ p, area: d3.geoArea(p) })).sort((a, b) => b.area - a.area)
  const kept = [ranked[0].p]
  let box = d3.geoBounds(ranked[0].p)
  const span = (b) => [(b[1][0] - b[0][0] + 360) % 360, Math.abs(b[1][1] - b[0][1])]
  for (const { p } of ranked.slice(1)) {
    const merged = d3.geoBounds({ type: 'GeometryCollection', geometries: [...kept, p] })
    const [w0, h0] = span(box)
    const [w1, h1] = span(merged)
    if (w1 > (w0 + 2) * 1.5 || h1 > (h0 + 2) * 1.5) continue
    kept.push(p)
    box = merged
  }
  return { type: 'GeometryCollection', geometries: kept }
}

/** Centre and angular radius (degrees) of a shape, for camera framing. */
function frameOf(shape) {
  const [lon, lat] = d3.geoCentroid(shape)
  let radius = 0
  d3.geoStream(shape, {
    point(x, y) {
      radius = Math.max(radius, d3.geoDistance([lon, lat], [x, y]))
    },
    lineStart() {},
    lineEnd() {},
    polygonStart() {},
    polygonEnd() {},
    sphere() {},
  })
  return { lat: round(lat, 3), lon: round(lon, 3), radius: round((radius * 180) / Math.PI, 3) }
}

/**
 * Undo an inside-out polygon.
 *
 * d3 reads ring winding on the sphere: a ring wound the wrong way encloses everything
 * EXCEPT the shape. `topojson.merge` on the 1:10m Maldives (dozens of atolls a few
 * hundred metres across) returns exactly that — 37.7 sr, three times the planet — and the
 * first build painted the Maldives over every country that sorted before it. No country
 * is bigger than a hemisphere, so any polygon above 2π sr is reversed rather than drawn.
 */
function rewound(shape) {
  const fix = (rings) => {
    const area = d3.geoArea({ type: 'Polygon', coordinates: rings })
    return area > 2 * Math.PI ? rings.map((r) => [...r].reverse()) : rings
  }
  if (shape.type === 'Polygon') return { ...shape, coordinates: fix(shape.coordinates) }
  if (shape.type === 'MultiPolygon') return { ...shape, coordinates: shape.coordinates.map(fix) }
  return shape
}

// ── features ─────────────────────────────────────────────────────────────────

const groups = new Map()
for (const g of topology.objects.countries.geometries) {
  const key = g.id === undefined ? `name:${g.properties.name}` : `iso:${g.id}`
  groups.set(key, [...(groups.get(key) ?? []), g])
}

const packIds = pack.items.map((i) => i.id).sort()
const failures = []
const features = []
const claimed = new Set()

for (const code of packIds) {
  const numeric = iso.alpha2ToNumeric(code)
  const group = numeric === undefined ? undefined : groups.get(`iso:${numeric}`)
  if (group === undefined) {
    failures.push(`${code}: Natural Earth 1:10m has no feature under ISO ${numeric ?? '(none)'}`)
    continue
  }
  claimed.add(`iso:${numeric}`)
  const entity = pack.items.find((i) => i.id === code)
  // Small countries: the same Natural Earth outline, unquantised (see SMALL_EXTENT_DEG in
  // fetch-atlas-sources.cjs). world-atlas's quantisation reduced Vatican City to a sliver.
  const precise = snapshot.smallShapes?.[code]
  features.push({
    key: code,
    countryId: code,
    region: entity.region,
    sourceNames: group.map((g) => g.properties.name),
    shape: precise ? rewound({ type: 'MultiPolygon', coordinates: precise.coordinates }) : rewound(merge(topology, group)),
    precise: precise !== undefined,
  })
}

const unassigned = [...groups.keys()]
  .filter((k) => !claimed.has(k))
  .sort()
  .map((k) => ({ key: k, names: groups.get(k).map((g) => g.properties.name), shape: rewound(merge(topology, groups.get(k))) }))
for (const u of unassigned) {
  features.push({ key: u.key, countryId: null, region: null, sourceNames: u.names, shape: u.shape })
}

if (failures.length > 0) {
  console.error(`✗ pack countries without geometry:\n  ${failures.join('\n  ')}\n\n  Do not approximate an outline.`)
  process.exit(1)
}
if (features.length > 65000) throw new Error('raster IDs are two bytes')
const inverted = features.filter((f) => !(d3.geoArea(f.shape) < 2 * Math.PI))
if (inverted.length > 0) {
  console.error(`✗ still inside-out after rewinding: ${inverted.map((f) => f.key).join(', ')}`)
  process.exit(1)
}

features.forEach((f, i) => {
  f.rasterId = i + 1
  const raw = cutRings(f.shape)
  let w = Infinity
  let e = -Infinity
  let s = Infinity
  let n = -Infinity
  for (const r of raw)
    for (const [x, y] of r) {
      w = Math.min(w, x)
      e = Math.max(e, x)
      s = Math.min(s, y)
      n = Math.max(n, y)
    }
  const extent = Math.max(e - w, n - s)
  const tolerance = Math.min(0.02, Math.max(0.0005, extent / 300))
  f.rawRings = raw
  f.rings = raw.map((r) => simplify(r, tolerance))
  f.bbox = [round(w), round(s), round(e), round(n)]
})

// ── ID raster ────────────────────────────────────────────────────────────────

const ids = new Uint16Array(RASTER_W * RASTER_H)
const dx = 360 / RASTER_W
const dy = 180 / RASTER_H
// Largest first, so an enclave Natural Earth did not cut out of its surroundings
// (Vatican City in Italy) is painted last and owns its texels — the same "smallest
// containing shape wins" rule `countryAt` uses for taps.
const bboxArea = (f) => (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
for (const f of [...features].sort((a, b) => bboxArea(b) - bboxArea(a) || a.rasterId - b.rasterId)) {
  const rows = new Map()
  for (const ring of f.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j]
      const [x2, y2] = ring[i]
      if (y1 === y2) continue
      // Rows whose CENTRE latitude lies in [min, max).
      const top = Math.max(y1, y2)
      const bottom = Math.min(y1, y2)
      const r0 = Math.max(0, Math.ceil((90 - top) / dy - 0.5))
      const r1 = Math.min(RASTER_H - 1, Math.floor((90 - bottom) / dy - 0.5))
      for (let r = r0; r <= r1; r++) {
        const lat = 90 - (r + 0.5) * dy
        if (!(lat >= bottom && lat < top)) continue
        const x = x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)
        const list = rows.get(r)
        if (list) list.push(x)
        else rows.set(r, [x])
      }
    }
  }
  let pixels = 0
  for (const [r, xs] of rows) {
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] + 180) / dx - 0.5))
      const c1 = Math.min(RASTER_W - 1, Math.floor((xs[k + 1] + 180) / dx - 0.5))
      for (let c = c0; c <= c1; c++) {
        ids[r * RASTER_W + c] = f.rasterId
        pixels++
      }
    }
  }
  f.pixels = pixels
}

// Label anchors on the largest cut polygon (outer ring + the holes inside it).
for (const f of features) {
  const outers = f.rings
    .map((r) => ({ r, a: ringArea(r) }))
    .sort((a, b) => Math.abs(b.a) - Math.abs(a.a))
  const outer = outers[0].r
  const holes = f.rings.filter((r) => r !== outer && pointInRings([outer], r[0][0], r[0][1]))
  f.anchor = polylabel([outer, ...holes])
}

// A country smaller than one texel still gets the texel under its anchor, so a fill and a
// border exist to highlight. The ring marker (`small`) is what makes it findable.
for (const f of features) {
  if (f.pixels > 0) continue
  const [lat, lon] = f.anchor
  const c = Math.min(RASTER_W - 1, Math.floor((lon + 180) / dx))
  const r = Math.min(RASTER_H - 1, Math.floor((90 - lat) / dy))
  ids[r * RASTER_W + c] = f.rasterId
  f.pixels = 1
  f.anchorPixelOnly = true
}

// Recount after overlaps settle: the last writer wins a shared texel.
const counts = new Map()
for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
for (const f of features) f.pixels = counts.get(f.rasterId) ?? 0
const vanished = features.filter((f) => f.countryId && f.pixels === 0)
if (vanished.length > 0) {
  console.error(`✗ countries with no raster texel: ${vanished.map((f) => f.countryId).join(', ')}`)
  process.exit(1)
}

mkdirSync(OUT_ASSETS, { recursive: true })
const png = new PNG({ width: RASTER_W, height: RASTER_H, colorType: 2, inputHasAlpha: false })
const rgb = Buffer.alloc(RASTER_W * RASTER_H * 3)
for (let i = 0; i < ids.length; i++) {
  rgb[i * 3] = ids[i] & 0xff
  rgb[i * 3 + 1] = ids[i] >> 8
  rgb[i * 3 + 2] = 0
}
png.data = rgb
const rasterBytes = PNG.sync.write(png, { colorType: 2, inputHasAlpha: false, deflateLevel: 9 })
writeFileSync(join(OUT_ASSETS, 'country-ids.bin'), rasterBytes)

// ── picking + outline rings ──────────────────────────────────────────────────

const packFeatures = features.filter((f) => f.countryId)
const chunks = []
const header = Buffer.alloc(8)
header.write('WQA1', 0, 'ascii')
header.writeUInt32LE(packFeatures.length, 4)
chunks.push(header)
let points = 0
for (const f of packFeatures) {
  const head = Buffer.alloc(8)
  head.writeUInt16LE(f.rasterId, 0)
  head.write(f.countryId, 2, 'ascii')
  head.writeUInt32LE(f.rings.length, 4)
  chunks.push(head)
  for (const ring of f.rings) {
    const body = Buffer.alloc(4 + ring.length * 8)
    body.writeUInt32LE(ring.length, 0)
    ring.forEach(([x, y], i) => {
      body.writeInt32LE(Math.round(x * QUANT), 4 + i * 8)
      body.writeInt32LE(Math.round(y * QUANT), 8 + i * 8)
    })
    points += ring.length
    chunks.push(body)
  }
}
const geometryBytes = Buffer.concat(chunks)
writeFileSync(join(OUT_ASSETS, 'countries.bin'), geometryBytes)

// ── surface texture ──────────────────────────────────────────────────────────

const textureOut = join(OUT_ASSETS, 'surface.bin')
if (!args.has('--no-texture')) {
  const tif = join(CACHE, 'surface', 'NE2_50M_SR_W', 'NE2_50M_SR_W.tif')
  if (!existsSync(tif)) {
    console.error('✗ Natural Earth II raster missing. Run: node scripts/fetch-atlas-sources.cjs')
    process.exit(1)
  }
  // Lanczos down to 4096×2048, JPEG q82, no metadata. Pillow because the source is a TIFF
  // and nothing in the Node toolchain here decodes one.
  execFileSync(
    process.env.PYTHON ?? 'python',
    [
      '-c',
      [
        'import sys',
        'from PIL import Image',
        'Image.MAX_IMAGE_PIXELS = None',
        'im = Image.open(sys.argv[1]).convert("RGB").resize((int(sys.argv[3]), int(sys.argv[4])), Image.LANCZOS)',
        'im.save(sys.argv[2], "JPEG", quality=82, optimize=True, progressive=False)',
      ].join('\n'),
      tif,
      textureOut,
      String(RASTER_W),
      String(RASTER_H),
    ],
    { stdio: 'inherit' },
  )
}
if (!existsSync(textureOut)) {
  console.error('✗ apps/mobile/assets/atlas/surface.bin does not exist; run without --no-texture once.')
  process.exit(1)
}
const textureBytes = readFileSync(textureOut)

// ── capitals ─────────────────────────────────────────────────────────────────

const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const km = (a, b) => (d3.geoDistance([a.lon, a.lat], [b.lon, b.lat]) * 6371.0088)

/**
 * Where Natural Earth names the same place differently from the pack.
 *
 * Each entry is a NAMING difference with its reason, never a relocation: the GeoNames
 * cross-check below still has to find the pack's own name within CROSSCHECK_KM of the
 * Natural Earth point, so an alias cannot move a pin anywhere a second source disagrees
 * with. Same rule as `content:crosscheck`: every difference says why.
 */
const NE_NAME_FOR_FACT = {
  'geo.AD.capital': { name: 'Andorra', reason: 'Natural Earth uses the short form of Andorra la Vella' },
  'geo.DK.capital': { name: 'København', reason: 'Natural Earth uses the Danish endonym of Copenhagen' },
  'geo.GD.capital': { name: "Saint George's", reason: "the pack abbreviates Saint to St." },
  'geo.KI.capital': { name: 'Tarawa', reason: 'Natural Earth labels the atoll; South Tarawa is its capital district' },
  'geo.LU.capital': { name: 'Luxembourg', reason: 'Natural Earth omits "City"' },
  'geo.PW.capital': {
    name: 'Melekeok',
    reason: 'Natural Earth names Melekeok State, where the capital Ngerulmud is; GeoNames places Ngerulmud ~1.5 km away',
  },
}

const places = []
const placeIssues = []
const byCountry = new Map(packFeatures.map((f) => [f.countryId, f]))
for (const fact of [...capitalFacts].sort((a, b) => a.id.localeCompare(b.id))) {
  if (fact.sensitivity !== undefined) {
    placeIssues.push({ factId: fact.id, reason: `excluded: sensitivity "${fact.sensitivity}" — no pin until reviewed` })
    continue
  }
  const alias = NE_NAME_FOR_FACT[fact.id]
  const names = new Set([...Object.values(fact.value.names), ...(alias ? [alias.name] : [])].map(fold))
  const candidates = snapshot.naturalEarth.filter(
    (r) => r.iso === fact.entity && [r.name, r.nameAscii, r.nameAlt].filter(Boolean).map(fold).some((n) => names.has(n)),
  )
  candidates.sort((a, b) => Number(b.featureClass.startsWith('Admin-0 capital')) - Number(a.featureClass.startsWith('Admin-0 capital')))
  const ne = candidates[0]
  if (ne === undefined) {
    placeIssues.push({ factId: fact.id, reason: `no Natural Earth place named ${[...names].join(' / ')} in ${fact.entity}` })
    continue
  }
  const gn = snapshot.geonames
    .filter((r) => r.iso === fact.entity && r.matches.length > 0)
    .sort((a, b) => Number(b.featureCode === 'PPLC') - Number(a.featureCode === 'PPLC') || km(a, ne) - km(b, ne))[0]
  if (gn === undefined) {
    placeIssues.push({ factId: fact.id, reason: 'no independent GeoNames record to cross-check against' })
    continue
  }
  const crosscheckKm = km(gn, ne)
  if (crosscheckKm > CROSSCHECK_KM) {
    placeIssues.push({
      factId: fact.id,
      reason: `sources disagree by ${crosscheckKm.toFixed(1)} km (NE ${ne.lat},${ne.lon} vs GeoNames ${gn.lat},${gn.lon})`,
    })
    continue
  }
  const country = byCountry.get(fact.entity)
  const inside = pointInRings(country.rawRings, ne.lon, ne.lat)
  const coastKm = inside ? 0 : distanceToRingsKm(country.rawRings, ne.lon, ne.lat)
  if (!inside && coastKm > COAST_TOLERANCE_KM) {
    placeIssues.push({ factId: fact.id, reason: `point lies ${coastKm.toFixed(1)} km outside ${fact.entity}'s outline` })
    continue
  }
  places.push({
    id: `place.ne.${ne.neId}`,
    countryId: fact.entity,
    factId: fact.id,
    role: 'capital',
    quizzable: fact.quizzable !== false,
    lat: round(ne.lat, 5),
    lon: round(ne.lon, 5),
    source: `Natural Earth ${snapshot.sources.places.version} populated places (ne_id ${ne.neId})`,
    crosscheck: `GeoNames ${gn.geonameId} (${gn.featureCode}), ${crosscheckKm.toFixed(1)} km`,
    ...(alias ? { naming: alias.reason } : {}),
    verifiedAt: snapshot.fetchedAt,
  })
}
const factsWithEntity = new Set(capitalFacts.map((f) => f.entity))
for (const code of packIds) {
  if (!factsWithEntity.has(code)) placeIssues.push({ factId: `(${code})`, reason: 'no capital fact in the pack' })
}

// ── frames ───────────────────────────────────────────────────────────────────

for (const f of packFeatures) {
  f.frame = frameOf(mainMass(f.shape))
  f.extent = frameOf(f.shape).radius
  f.parts = f.shape.type === 'MultiPolygon' ? f.shape.coordinates.length : 1
}
const regionFrames = {}
for (const region of [...new Set(packFeatures.map((f) => f.region))].sort()) {
  const members = packFeatures.filter((f) => f.region === region)
  const v = members.reduce(
    (acc, f) => {
      const la = (f.frame.lat * Math.PI) / 180
      const lo = (f.frame.lon * Math.PI) / 180
      return [acc[0] + Math.cos(la) * Math.sin(lo), acc[1] + Math.sin(la), acc[2] + Math.cos(la) * Math.cos(lo)]
    },
    [0, 0, 0],
  )
  const lat = (Math.atan2(v[1], Math.hypot(v[0], v[2])) * 180) / Math.PI
  const lon = (Math.atan2(v[0], v[2]) * 180) / Math.PI
  // The 90th percentile of member distance: one outlier (Russia's Siberian centroid) must
  // not turn "Europe" into "the northern hemisphere".
  const dists = members.map((f) => (d3.geoDistance([lon, lat], [f.frame.lon, f.frame.lat]) * 180) / Math.PI + f.frame.radius * 0.5)
  dists.sort((a, b) => a - b)
  regionFrames[region] = { lat: round(lat, 3), lon: round(lon, 3), radius: round(dists[Math.floor((dists.length - 1) * 0.9)], 3) }
}

// ── registry module ──────────────────────────────────────────────────────────

const countryEntries = packFeatures.map((f) => ({
  id: f.countryId,
  rasterId: f.rasterId,
  region: f.region,
  anchor: f.anchor,
  frame: f.frame,
  extent: f.extent,
  bbox: f.bbox,
  parts: f.parts,
  pixels: f.pixels,
  small: f.pixels < SMALL_TARGET_PX,
}))

const sources = {
  geometry: 'Natural Earth 1:10m admin-0 via world-atlas@2.0.2 (countries-10m.json)',
  surface: `Natural Earth II shaded relief + water 1:50m (sha256 ${snapshot.sources.surface.sha256.slice(0, 16)}…)`,
  places: `Natural Earth ${snapshot.sources.places.version} populated places; cross-checked against GeoNames cities15000`,
  license: 'Public domain (Natural Earth). GeoNames (CC BY 4.0) used for verification only.',
}
const checksums = {
  'country-ids.bin': sha256(rasterBytes),
  'countries.bin': sha256(geometryBytes),
  'surface.bin': sha256(textureBytes),
}

mkdirSync(join(OUT_TS, '..'), { recursive: true })
// Compact on purpose: this module is in the Hermes bundle, which has ~0.1 MB of headroom
// (scripts/bundle-native.cjs). Rows are tuples, decoded once at import; provenance —
// source, cross-check distance, naming reasons — lives in the manifest beside the
// coverage report, where people read it, not in every user's cold start.
const fixed = (n, d) => Number(n.toFixed(d))
// One string per table, parsed once at import. A string is the cheapest literal Hermes
// stores; an array of arrays compiles to instructions. Precision is what each use needs:
// frames to ~1 km; anchors and places to ~10 m, since Vatican City is 400 m across.
const countryTable = countryEntries
  .map((c) =>
    [c.id, c.rasterId, c.region, fixed(c.anchor[0], 4), fixed(c.anchor[1], 4), fixed(c.frame.lat, 2), fixed(c.frame.lon, 2), fixed(c.frame.radius, 2), fixed(c.extent, 1), c.pixels].join(','),
  )
  .join(';')
// The fact ID is written only when it is not the pack's usual `geo.<country>.capital`.
const placeTable = places
  .map((p) => [p.id.replace('place.ne.', ''), p.countryId, fixed(p.lat, 4), fixed(p.lon, 4), p.quizzable ? 1 : 0, p.factId === `geo.${p.countryId}.capital` ? '' : p.factId].join(','))
  .join(';')
writeFileSync(
  OUT_TS,
  `/**
 * GENERATED by \`pnpm build:atlas\` — do not edit. See scripts/build-atlas.cjs and ADR 0017.
 *
 * Geometry metadata and verified places, keyed by the content pack's stable IDs. Names
 * are NOT here (a country's name is its entity's, a capital's is its fact's), and nor is
 * provenance: every place's source and cross-check is in
 * docs/design/world-atlas/atlas-manifest.generated.json.
 *
 * Packed as two strings because this module is in the Hermes bundle, which has no
 * headroom to spare (scripts/bundle-native.cjs).
 */

import type { AtlasCountry, AtlasPlace, AtlasFrame } from '../geo/types.js'

export const ATLAS_RASTER = { width: ${RASTER_W}, height: ${RASTER_H} } as const

export const ATLAS_CHECKSUMS = ${JSON.stringify(checksums)} as const

/** Below this many raster texels a country also gets a ring marker. */
export const SMALL_TARGET_PX = ${SMALL_TARGET_PX}

/** id,rasterId,region,anchorLat,anchorLon,frameLat,frameLon,frameRadius,extent,pixels */
const COUNTRIES = '${countryTable}'

/** neId,countryId,lat,lon,quizzable,factId (empty = geo.<countryId>.capital) */
const PLACES = '${placeTable}'

export const ATLAS_COUNTRIES: Readonly<Record<string, AtlasCountry>> = Object.fromEntries(
  COUNTRIES.split(';').map((row) => {
    const [id, rasterId, region, aLat, aLon, fLat, fLon, radius, extent, pixels] = row.split(',') as [string, string, string, string, string, string, string, string, string, string]
    const px = Number(pixels)
    const country: AtlasCountry = {
      id,
      rasterId: Number(rasterId),
      region,
      anchor: [Number(aLat), Number(aLon)],
      frame: { lat: Number(fLat), lon: Number(fLon), radius: Number(radius) },
      extent: Number(extent),
      pixels: px,
      small: px < SMALL_TARGET_PX,
    }
    return [id, country]
  }),
)

export const ATLAS_PLACES: Readonly<Record<string, AtlasPlace>> = Object.fromEntries(
  PLACES.split(';').map((row) => {
    const [neId, countryId, lat, lon, quizzable, factId] = row.split(',') as [string, string, string, string, string, string]
    const id = \`place.ne.\${neId}\`
    const place: AtlasPlace = {
      id,
      countryId,
      factId: factId === '' ? \`geo.\${countryId}.capital\` : factId,
      role: 'capital',
      quizzable: quizzable === '1',
      lat: Number(lat),
      lon: Number(lon),
    }
    return [id, place]
  }),
)

/** Raster IDs of Natural Earth features that are land but not a pack country. */
export const ATLAS_UNASSIGNED_RASTER_IDS: readonly number[] = ${JSON.stringify(features.filter((f) => !f.countryId).map((f) => f.rasterId))}

export const ATLAS_REGION_FRAMES: Readonly<Record<string, AtlasFrame>> = ${JSON.stringify(regionFrames)}
`,
)

// ── manifest + coverage ──────────────────────────────────────────────────────

mkdirSync(OUT_DOCS, { recursive: true })
const manifest = {
  $comment: 'GENERATED by scripts/build-atlas.cjs — deterministic for unchanged inputs.',
  sources: { ...sources, snapshot: snapshot.sources },
  raster: { width: RASTER_W, height: RASTER_H, features: features.length },
  geometry: { countries: packFeatures.length, points, quantisation: `1/${QUANT} degree` },
  checksums,
  bytes: { 'country-ids.bin': rasterBytes.length, 'countries.bin': geometryBytes.length, 'surface.bin': textureBytes.length },
  coverage: {
    packCountries: packIds.length,
    withGeometry: packFeatures.length,
    smallTargets: countryEntries.filter((c) => c.small).map((c) => `${c.id} (${c.pixels}px)`),
    preciseOutlines: features.filter((f) => f.precise).map((f) => f.countryId),
    anchorPixelOnly: features.filter((f) => f.anchorPixelOnly && f.countryId).map((f) => f.countryId),
    capitalPins: places.length,
    places,
    capitalIssues: placeIssues,
    unassignedSourceFeatures: unassigned.map((u) => u.names.join(' + ')),
  },
}
writeFileSync(join(OUT_DOCS, 'atlas-manifest.generated.json'), JSON.stringify(manifest, null, 2) + '\n')

const md = [
  '# World atlas — geographic coverage',
  '',
  '_Generated by `pnpm build:atlas`. Do not edit; fix the inputs and rebuild._',
  '',
  'Geographic coverage (what the globe can draw and pin) is **not** lesson coverage',
  '(what the validated pack teaches). A country can be drawn and never quizzed.',
  '',
  '| | |',
  '|---|---|',
  `| Pack countries | ${packIds.length} |`,
  `| With 1:10m geometry | ${packFeatures.length} |`,
  `| Capital pins (verified, two sources) | ${places.length} |`,
  `| Capital facts without a pin | ${placeIssues.length} |`,
  `| Small targets (ring marker) | ${manifest.coverage.smallTargets.length} |`,
  `| Natural Earth features not assigned to a pack country | ${unassigned.length} |`,
  '',
  '## Capitals without a pin',
  '',
  ...placeIssues.map((p) => `- \`${p.factId}\` — ${p.reason}`),
  '',
  '## Unquantised outlines',
  '',
  'Countries under 3° across take their outline from the original Natural Earth shapefile, because world-atlas quantisation (≈0.0036°) collapses the smallest of them.',
  '',
  manifest.coverage.preciseOutlines.join(', '),
  '',
  '## Small targets',
  '',
  'Fewer than ' + SMALL_TARGET_PX + ' texels at ' + RASTER_W + '×' + RASTER_H + '. Highlighted with a ring marker as well as the fill.',
  '',
  manifest.coverage.smallTargets.join(', '),
  '',
  '## Land not assigned to a pack country',
  '',
  'Drawn as land with Natural Earth’s default boundaries; not selectable, never labelled as a pack country.',
  '',
  manifest.coverage.unassignedSourceFeatures.join(' · '),
  '',
  '## Checksums',
  '',
  ...Object.entries(checksums).map(([k, v]) => `- \`${k}\` ${v}`),
  '',
].join('\n')
writeFileSync(join(OUT_DOCS, 'coverage.generated.md'), md)

console.log(
  `✓ ${packFeatures.length} countries, ${features.length} raster features, ${points} picking points\n` +
    `  country-ids.bin ${(rasterBytes.length / 1024).toFixed(0)} KB · countries.bin ${(geometryBytes.length / 1024).toFixed(0)} KB · surface.bin ${(textureBytes.length / 1024).toFixed(0)} KB\n` +
    `  ${places.length} capital pins, ${placeIssues.length} without · ${manifest.coverage.smallTargets.length} small targets\n` +
    `  wrote ${relative(ROOT, OUT_TS)}`,
)
