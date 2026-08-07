/**
 * Move a delivery of raw art into the master tree, under the names the code expects.
 *
 * ## Why this exists
 *
 * Art has arrived three times as a folder of files named by whatever produced them —
 * `images/continents/Europe.png`, `images/achivements/gold-warmgold.png`,
 * `images/avatars/ChatGPT Image Aug 5, 2026, 08_09_52 PM.png` — and each time the mapping
 * onto `docs/design/assets/**` was done by hand. That mapping is not clerical work. It
 * encodes decisions the code depends on:
 *
 *   · continents are **ISO region codes**, because `ExploreScreen` keys art by `RegionCode`
 *     and a file called `Europe.png` can never be reached;
 *   · levels are the **title ladder** in `progression.md`, lower-cased, because
 *     `insigniaFor` derives `levels/${rank}` from the title key;
 *   · achievement glyphs are the **category segment** of an achievement id;
 *   · tiers are the five in `achievements.md` §2, without the colour word the generator
 *     appended.
 *
 * Done by hand, that knowledge lives in one person's head and in a commit message. A
 * delivery named slightly differently gets filed slightly differently, and the failure is
 * silent: the art lands, the build ships it, and no screen can reach it. That has already
 * happened twice — `levels/pioneer` and the league badges both shipped as bytes nothing
 * imported.
 *
 * ## It refuses rather than guesses
 *
 * Anything this cannot map is REPORTED, not filed somewhere plausible. A wrong mapping is
 * worse than an unmapped file: the file sitting in `images/` is obvious, and the file
 * quietly renamed to a rank that does not exist is not.
 *
 * Run: `pnpm import:art [source-dir]` — defaults to `images/`. Then `pnpm build:art`.
 */

const { readdirSync, statSync, copyFileSync, mkdirSync, existsSync, readFileSync } = require('node:fs')
const { join, dirname, basename, extname } = require('node:path')
const { NOT_SHIPPED } = require('./art-manifest.cjs')

const ROOT = join(__dirname, '..')
const MASTERS = join(ROOT, 'docs', 'design', 'assets')
const SOURCE = process.argv[2] ?? join(ROOT, 'images')

/**
 * Continent name → the region code the app keys art by.
 *
 * `ExploreScreen.CONTINENT_ART` is `Record<RegionCode, ArtName>`, so a continent filed
 * under its English name is a file nothing can import.
 */
const REGIONS = {
  africa: 'AF',
  antarctica: 'AN',
  asia: 'AS',
  europe: 'EU',
  'north america': 'NA',
  oceania: 'OC',
  'south america': 'SA',
}

/** The five in `docs/systems/achievements.md` §2. The generator appends a colour; we do not. */
const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'legendary']

/**
 * Tier files that arrive named by their COLOUR rather than their tier.
 *
 * The delivery is `bronze-amber`, `silver-paleblue`, `gold-warmgold`, `platinum-white`
 * — and `iridescentviolet-aurora`, which is the legendary tier named only by the metal
 * `asset-prompts.md` §11 specifies for it. Four of the five happen to lead with the tier
 * and the fifth does not, which is exactly the kind of near-miss that gets filed by hand
 * correctly once and wrongly the second time.
 */
const TIER_BY_COLOUR = { iridescentviolet: 'legendary', violet: 'legendary', aurora: 'legendary' }

/**
 * The eleven ranks, from `docs/systems/progression.md` §1.
 *
 * Listed rather than accepted blindly, because this is exactly where the last delivery
 * went wrong: it contained a "Pioneer", which is not a rank, and no "Atlas", which is.
 * A file naming a rank that does not exist is refused here instead of shipping as
 * unreachable bytes.
 */
const RANKS = [
  'wanderer', 'scout', 'navigator', 'cartographer', 'pathfinder', 'voyager',
  'circumnavigator', 'trailblazer', 'globetrotter', 'worldkeeper', 'atlas',
]

const LEAGUES = ['bronze', 'silver', 'gold', 'sapphire', 'ruby', 'diamond', 'legend']

/** Directory in the delivery → how to name what is inside it. */
const stem = (file) => basename(file, extname(file)).trim()

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

/**
 * Where one delivered file belongs, or `null` with the reason.
 *
 * `folder` is the delivery's own folder name, lower-cased — including `achivements`,
 * which is misspelled in the delivery and is matched as delivered rather than corrected,
 * because the file on disk is the fact.
 */
function destination(relative, index) {
  const parts = relative.split('/')
  const folder = (parts.length > 1 ? parts[parts.length - 2] : '').toLowerCase()
  const name = stem(relative).toLowerCase()

  if (folder === 'continents') {
    const code = REGIONS[name]
    return code === undefined
      ? { error: `"${name}" is not a continent this app has. Expected one of: ${Object.keys(REGIONS).join(', ')}` }
      : { to: `continents/${code}.png` }
  }

  if (folder === 'achivements' || folder === 'achievements') {
    // `gold-warmgold` → `gold`. The colour word is the generator's note to itself.
    const tier =
      TIERS.find((t) => name.startsWith(t)) ??
      TIER_BY_COLOUR[name.split('-')[0]] ??
      Object.entries(TIER_BY_COLOUR).find(([colour]) => name.includes(colour))?.[1]
    return tier === undefined
      ? { error: `"${name}" is not one of the five tiers (${TIERS.join(', ')}) or a colour naming one` }
      : { to: `achievements/tier-${tier}.png` }
  }

  if (folder === 'category glyph' || folder === 'glyphs') return { to: `achievements/glyph-${name}.png` }
  if (folder === 'avatars') return { to: `avatars/avatar-${String(index + 1).padStart(2, '0')}.png` }
  if (folder === 'rewards') return { to: `rewards/${name}.png` }

  if (folder === 'leagues') {
    return LEAGUES.includes(name)
      ? { to: `leagues/${name}.png` }
      : { error: `"${name}" is not a league tier. Expected one of: ${LEAGUES.join(', ')}` }
  }

  // A rank, whether it arrived in `levels/` or loose at the top of the delivery.
  if (folder === 'levels' || RANKS.includes(name)) {
    if (RANKS.includes(name)) return { to: `levels/${name}.png` }
    // Already a known, deliberately-parked master? Then it is a decision somebody made,
    // not a file nobody has looked at, and it files where it already lives.
    if (NOT_SHIPPED[`levels/${name}`] !== undefined) return { to: `levels/${name}.png`, parked: true }
    return {
          error:
            `"${name}" is not a rank in the title ladder. The eleven are: ${RANKS.join(', ')}.\n` +
            '        Check docs/systems/progression.md §1 before renaming — a title ships in save\n' +
            '        data, so the ladder is the fixed thing and the filename is not.',
    }
  }

  // Loose files whose name already matches a master we ship.
  const loose = ['celebration/burst-wide', 'celebration/burst', 'celebration/rays']
  const match = loose.find((path) => basename(path) === name)
  if (match !== undefined) return { to: `${match}.png` }

  return { error: 'no rule for this folder — add one to scripts/import-art.cjs rather than filing it by hand' }
}

if (!existsSync(SOURCE)) {
  console.error(
    `\n✗ ${SOURCE} does not exist.\n\n` +
      '  Point this at the delivered folder: `pnpm import:art path/to/images`.\n' +
      '  If the art was pushed to another branch, fetch it first — this reads the working\n' +
      '  tree, not a remote.',
  )
  process.exit(1)
}

console.log(`Art intake — ${SOURCE}\n`)

const files = walk(SOURCE).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
if (files.length === 0) {
  console.error(`✗ no images under ${SOURCE}`)
  process.exit(1)
}

// Avatars are numbered by delivery order, so the order has to be stable: sorted by path,
// not by whatever the filesystem hands back.
const avatars = files.filter((f) => dirname(f).toLowerCase().endsWith('avatars')).sort()

const FORCE = process.argv.includes('--force')

const moved = []
const unchanged = []
const differs = []
const parked = []
const refused = []

for (const file of files.sort()) {
  const relative = file.slice(SOURCE.length + 1).split('\\').join('/')
  const index = avatars.indexOf(file)
  const result = destination(relative, index)

  if (result.error !== undefined) {
    refused.push([relative, result.error])
    continue
  }
  if (result.parked === true) parked.push([result.to, NOT_SHIPPED[result.to.replace(/\.png$/, '')]])

  const target = join(MASTERS, result.to)
  if (existsSync(target)) {
    // Byte-identical means already imported — safe to re-run after a partial drop.
    if (readFileSync(target).equals(readFileSync(file))) {
      unchanged.push(result.to)
      continue
    }
    // Different, and NOT overwritten without being asked.
    //
    // This rule was written after this script destroyed something on its first run. Four
    // of the seven continent masters had been repaired in place — the delivery arrived
    // with a zeroed alpha channel over intact RGB, which looks perfect in a viewer and
    // renders as a transparent rectangle in the app — and re-running the import silently
    // put the broken originals back. A master in this tree is not always the delivered
    // file; it is the delivered file plus whatever had to be done to make it usable.
    //
    // A genuine redelivery is still one flag away, and now it is a decision rather than
    // a side effect.
    if (!FORCE) {
      differs.push([relative, result.to])
      continue
    }
  }

  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(file, target)
  moved.push([relative, result.to])
}

for (const [from, to] of moved) console.log(`  + ${to.padEnd(34)} ← ${from}`)
if (unchanged.length > 0) console.log(`\n  ${unchanged.length} already imported, byte-identical — left alone.`)

if (differs.length > 0) {
  console.log(`\n  ${differs.length} differ from the master already in the tree and were NOT replaced:\n`)
  for (const [from, to] of differs) console.log(`    ${to.padEnd(34)} ← ${from}`)
  console.log(
    '\n    A master here is the delivered file plus any repair it needed. Re-run with\n' +
      '    `--force` if this really is a redelivery that should replace it.',
  )
}

if (parked.length > 0) {
  console.log(`\n  ${parked.length} filed but deliberately not shipped:\n`)
  for (const [to, why] of parked) console.log(`    ${to}\n      ${why}\n`)
}

if (refused.length > 0) {
  console.error(`\n✗ ${refused.length} file(s) not imported:\n`)
  for (const [from, why] of refused) console.error(`    ${from}\n      ${why}\n`)
  console.error(
    '  Nothing was guessed. A file filed under a name no screen imports ships as bytes\n' +
      '  nobody can reach, which has happened twice already and is invisible when it does.',
  )
  process.exit(1)
}

console.log(
  `\n✓ ${moved.length} imported, ${unchanged.length} already current, ${differs.length} kept` +
    '\n\n  Next: `pnpm build:art` — it discovers masters from the filesystem, so anything new\n' +
    '  here ships without editing a list.',
)
