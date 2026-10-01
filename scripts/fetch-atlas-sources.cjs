#!/usr/bin/env node
/**
 * Fetch the raw material for the 3D atlas and freeze the parts the build reads.
 *
 * Two kinds of input, handled differently:
 *
 * 1. **The Earth surface raster** — Natural Earth II, shaded relief with water, 1:50m
 *    (public domain). 88 MB zipped, so it is downloaded into `node_modules/.cache` and
 *    never committed; `pnpm build:atlas` downscales it into the shipped JPEG and records
 *    the archive's SHA-256 in the manifest, so the committed texture names its exact input.
 *    No borders, names or labels are baked into it — the atlas draws those live.
 *
 * 2. **Capital coordinates** — Natural Earth 1:10m populated places (public domain) as
 *    the source, and GeoNames `cities15000` (CC BY 4.0) as an INDEPENDENT cross-check that
 *    is never shipped. A capital pin is a fact drawn rather than written; one source proves
 *    provenance, only a second proves the value. Both are reduced to the rows the build
 *    needs and frozen in `scripts/data/atlas-places.snapshot.json`, so a build is
 *    reproducible offline and a coordinate changes only when somebody re-runs this and
 *    reads the diff.
 *
 * Nothing here decides which place is a country's capital. That match — by the content
 * pack's own capital fact, never by a guess — lives in `build-atlas.cjs`.
 *
 * Run: node scripts/fetch-atlas-sources.cjs
 */

const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const CACHE = join(ROOT, 'node_modules', '.cache', 'wq-atlas-src')
const SNAPSHOT = join(__dirname, 'data', 'atlas-places.snapshot.json')
const PACKS = join(ROOT, 'packages', 'content', 'packs', 'geography')

const SOURCES = {
  surface: {
    url: 'https://naciscdn.org/naturalearth/50m/raster/NE2_50M_SR_W.zip',
    file: 'NE2_50M_SR_W.zip',
  },
  places: {
    url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places_simple.zip',
    file: 'ne_10m_populated_places_simple.zip',
  },
  crosscheck: {
    url: 'https://download.geonames.org/export/dump/cities15000.zip',
    file: 'cities15000.zip',
  },
  admin0: {
    url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip',
    file: 'ne_10m_admin_0_countries.zip',
  },
}

/**
 * Countries whose whole extent is under this many degrees get their outline from the
 * original Natural Earth shapefile rather than from world-atlas.
 *
 * world-atlas quantises the planet to 10⁵ steps — about 0.0036° — which is invisible for
 * France and fatal for Vatican City (≈0.004° across): it arrived as a three-point sliver
 * with no area, so it could be neither highlighted nor tapped. Same source, same
 * licence, just unquantised, and only where quantisation destroys the shape.
 */
const SMALL_EXTENT_DEG = 3

/** Polygon records (type 5) from a .shp: rings of [lon, lat], exterior clockwise. */
function readShp(path) {
  const buf = readFileSync(path)
  const shapes = []
  let at = 100
  while (at < buf.length) {
    const length = buf.readInt32BE(at + 4) * 2
    const type = buf.readInt32LE(at + 8)
    if (type === 5) {
      const numParts = buf.readInt32LE(at + 8 + 36)
      const numPoints = buf.readInt32LE(at + 8 + 40)
      const partsAt = at + 8 + 44
      const pointsAt = partsAt + numParts * 4
      const parts = []
      for (let i = 0; i < numParts; i++) parts.push(buf.readInt32LE(partsAt + i * 4))
      parts.push(numPoints)
      const rings = []
      for (let i = 0; i < numParts; i++) {
        const ring = []
        for (let k = parts[i]; k < parts[i + 1]; k++) {
          ring.push([buf.readDoubleLE(pointsAt + k * 16), buf.readDoubleLE(pointsAt + k * 16 + 8)])
        }
        rings.push(ring)
      }
      shapes.push(rings)
    } else shapes.push(null)
    at += 8 + length
  }
  return shapes
}

/** Signed planar area: negative is clockwise, which a shapefile uses for exteriors. */
const ringArea = (ring) => {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  return a / 2
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

async function download({ url, file }) {
  const target = join(CACHE, file)
  if (existsSync(target)) return target
  console.log(`  ↓ ${url}`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)
  writeFileSync(target, Buffer.from(await response.arrayBuffer()))
  return target
}

/** `unzip` where Git Bash or a Unix has it; Windows' bundled bsdtar reads zip too. */
function extract(zip, into) {
  mkdirSync(into, { recursive: true })
  try {
    execFileSync('unzip', ['-o', '-q', zip, '-d', into])
  } catch {
    execFileSync('tar', ['-xf', zip, '-C', into])
  }
}

function findFile(dir, suffix) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const hit = findFile(full, suffix)
      if (hit) return hit
    } else if (entry.name.endsWith(suffix)) return full
  }
  return undefined
}

/** A dBase III table, which is all a shapefile's attributes are. UTF-8 per its `.cpg`. */
function readDbf(path) {
  const buf = readFileSync(path)
  const count = buf.readUInt32LE(4)
  const headerLength = buf.readUInt16LE(8)
  const recordLength = buf.readUInt16LE(10)
  const fields = []
  for (let at = 32; buf[at] !== 0x0d; at += 32) {
    fields.push({
      name: buf.toString('latin1', at, at + 11).replace(/\0.*$/, ''),
      length: buf[at + 16],
    })
  }
  const rows = []
  for (let i = 0; i < count; i++) {
    let at = headerLength + i * recordLength + 1
    const row = {}
    for (const field of fields) {
      // Padded with spaces in one Natural Earth table and with NULs in another.
      row[field.name] = buf.toString('utf8', at, at + field.length).replace(/\0/g, '').trim()
      at += field.length
    }
    rows.push(row)
  }
  return rows
}

const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

;(async () => {
  mkdirSync(CACHE, { recursive: true })
  console.log('Atlas sources →', CACHE)
  const files = {}
  for (const [key, source] of Object.entries(SOURCES)) files[key] = await download(source)

  extract(files.surface, join(CACHE, 'surface'))
  extract(files.places, join(CACHE, 'places'))
  extract(files.crosscheck, join(CACHE, 'crosscheck'))
  extract(files.admin0, join(CACHE, 'admin0'))

  const entities = JSON.parse(readFileSync(join(PACKS, 'entities.countries.v1.json'), 'utf8')).items
  const capitals = JSON.parse(readFileSync(join(PACKS, 'facts.capitals.v1.json'), 'utf8')).items
  const codes = new Set(entities.map((e) => e.id))

  // Every name the pack uses for a capital, folded, per country. Only these rows are kept:
  // the snapshot is evidence for the pack's facts, not a gazetteer.
  const wanted = new Map()
  for (const fact of capitals) {
    for (const name of Object.values(fact.value.names)) {
      wanted.set(fact.entity, new Set([...(wanted.get(fact.entity) ?? []), fold(name)]))
    }
  }

  const placesDbf = findFile(join(CACHE, 'places'), '.dbf')
  const versionFile = findFile(join(CACHE, 'places'), '.VERSION.txt')
  const neVersion = versionFile ? readFileSync(versionFile, 'utf8').trim() : 'unknown'
  const neRows = readDbf(placesDbf)
    .filter((r) => codes.has(r.iso_a2))
    .filter((r) => {
      const names = wanted.get(r.iso_a2) ?? new Set()
      const candidates = [r.name, r.nameascii, r.namealt, r.namepar, r.ls_name].filter(Boolean).map(fold)
      return r.featurecla.startsWith('Admin-0 capital') || candidates.some((n) => names.has(n))
    })
    .map((r) => ({
      neId: r.ne_id,
      iso: r.iso_a2,
      name: r.name,
      nameAscii: r.nameascii,
      nameAlt: r.namealt,
      featureClass: r.featurecla,
      lat: Number(r.latitude),
      lon: Number(r.longitude),
    }))
    .sort((a, b) => a.iso.localeCompare(b.iso) || a.neId.localeCompare(b.neId))

  // GeoNames: tab-separated, columns per https://download.geonames.org/export/dump/readme.txt
  const geoTxt = readFileSync(findFile(join(CACHE, 'crosscheck'), 'cities15000.txt'), 'utf8')
  const gnRows = []
  for (const line of geoTxt.split('\n')) {
    const c = line.split('\t')
    if (c.length < 15 || !codes.has(c[8])) continue
    const names = wanted.get(c[8]) ?? new Set()
    const all = [c[1], c[2], ...c[3].split(',')].filter(Boolean).map(fold)
    if (c[7] !== 'PPLC' && !all.some((n) => names.has(n))) continue
    gnRows.push({
      geonameId: c[0],
      iso: c[8],
      name: c[1],
      featureCode: c[7],
      // Only the names the pack uses: the full alternate-name list is the bulk of the file.
      matches: [...names].filter((n) => all.includes(n)),
      lat: Number(c[4]),
      lon: Number(c[5]),
    })
  }
  gnRows.sort((a, b) => a.iso.localeCompare(b.iso) || a.geonameId.localeCompare(b.geonameId))

  // Precise outlines for the small countries (see SMALL_EXTENT_DEG).
  const adminRows = readDbf(findFile(join(CACHE, 'admin0'), '.dbf'))
  const adminShapes = readShp(findFile(join(CACHE, 'admin0'), '.shp'))
  const adminVersionFile = findFile(join(CACHE, 'admin0'), '.VERSION.txt')
  // Every feature carrying a pack code, grouped: Natural Earth gives some codes more than
  // one row (Baikonur carries KZ, Clipperton FR, Ashmore and Cartier AU), so a code
  // qualifies only when ALL its rows are small — otherwise a sandbank would replace a
  // continent-sized country.
  const byCode = new Map()
  adminRows.forEach((row, i) => {
    // ISO_A2_EH fills the "-99" Natural Earth gives France and Norway in ISO_A2.
    const code = [row.ISO_A2_EH, row.ISO_A2].find((c) => c !== undefined && codes.has(c))
    const rings = adminShapes[i]
    if (code === undefined || rings === null) return
    byCode.set(code, [...(byCode.get(code) ?? []), { row, rings }])
  })
  const smallShapes = {}
  for (const [code, rows] of [...byCode].sort(([a], [b]) => a.localeCompare(b))) {
    let w = Infinity
    let e = -Infinity
    let so = Infinity
    let n = -Infinity
    for (const { rings } of rows)
      for (const r of rings)
        for (const [x, y] of r) {
          w = Math.min(w, x)
          e = Math.max(e, x)
          so = Math.min(so, y)
          n = Math.max(n, y)
        }
    if (Math.max(e - w, n - so) >= SMALL_EXTENT_DEG) continue
    // Exterior rings (clockwise) open a polygon; the holes after them belong to it.
    const polygons = []
    for (const { rings } of rows) {
      for (const ring of rings) {
        const rounded = ring.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])
        if (ringArea(ring) <= 0 || polygons.length === 0) polygons.push([rounded])
        else polygons[polygons.length - 1].push(rounded)
      }
    }
    smallShapes[code] = { type: 'MultiPolygon', coordinates: polygons, names: rows.map((r) => r.row.NAME) }
  }

  const snapshot = {
    $comment:
      'GENERATED by scripts/fetch-atlas-sources.cjs. Natural Earth rows are the shipped source; ' +
      'GeoNames rows are a cross-check only and are never shipped (CC BY 4.0).',
    fetchedAt: new Date().toISOString().slice(0, 10),
    sources: {
      surface: { url: SOURCES.surface.url, sha256: sha256(files.surface), license: 'Public domain (Natural Earth)' },
      places: {
        url: SOURCES.places.url,
        sha256: sha256(files.places),
        version: neVersion,
        license: 'Public domain (Natural Earth)',
      },
      admin0: {
        url: SOURCES.admin0.url,
        sha256: sha256(files.admin0),
        version: adminVersionFile ? readFileSync(adminVersionFile, 'utf8').trim() : 'unknown',
        license: 'Public domain (Natural Earth)',
        note: `outlines for pack countries under ${SMALL_EXTENT_DEG}° across, unquantised`,
      },
      crosscheck: {
        url: SOURCES.crosscheck.url,
        sha256: sha256(files.crosscheck),
        license: 'CC BY 4.0 (GeoNames) — verification only, not redistributed',
      },
    },
    naturalEarth: neRows,
    geonames: gnRows,
    smallShapes,
  }
  mkdirSync(join(__dirname, 'data'), { recursive: true })
  writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 1) + '\n')
  console.log(
    `✓ ${neRows.length} Natural Earth rows, ${gnRows.length} GeoNames rows, ` +
      `${Object.keys(smallShapes).length} small-country outlines → ${SNAPSHOT}`,
  )
})().catch((error) => {
  console.error('✗', error.message)
  process.exit(1)
})
