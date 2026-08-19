/**
 * Edge function bundler.
 *
 * The whole point of `submit-lesson` is that it runs the SAME grading code as the
 * client. That means it imports from `packages/engines`, which a deployed Deno
 * function cannot reach — so this script vendors those modules into the deploy
 * payload rather than letting anyone copy-paste them (a copy is exactly the drift
 * the architecture exists to prevent).
 *
 * Two rewrites are needed:
 *   1. `../../../packages/engines/src/x` → `./_engines/x`
 *   2. `./y.js` → `./y.ts`   — TypeScript's NodeNext style, which Deno cannot resolve
 *
 * ## Why the source lives in `_src/` and the function directory is generated
 *
 * The authored entrypoint and the deployable function are NOT the same graph, and for
 * a long time this script produced the second while the Supabase CLI read the first.
 *
 * On disk, `index.ts` imports `packages/engines/src/grading/index.ts`, which imports
 * `AnsweredItem` from `lesson/machine.ts`, which drags in `content/types.js` — a
 * specifier with a `.js` extension pointing at a `.ts` file, which is legal TypeScript
 * and unresolvable to Deno. In the bundle that chain does not exist: `machine.ts` is
 * replaced by a shim, so nothing reaches `content/`. Both facts were true and neither
 * was visible, because the bundle was assembled in memory and the CLI never saw it:
 *
 *   failed to read file: open packages/engines/src/content/types.js:
 *   no such file or directory
 *
 * So `supabase/functions/submit-lesson/` is now GENERATED — it is the bundle, written
 * out — and the hand-written source moved to `supabase/functions/_src/submit-lesson/`.
 * A leading underscore is the CLI's own convention for a directory that is not a
 * function (the same rule that makes `_shared/` work), so the source is not deployed
 * twice. The generated directory is gitignored and rebuilt by `pnpm generate`.
 *
 * That makes `supabase functions deploy` and `supabase start` read the artefact this
 * script actually produces, rather than a similar-looking one that cannot run.
 *
 * Run: pnpm edge:build   (or import buildFunction from a deploy script)
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const enginesSrc = join(here, '..', '..', 'packages', 'engines', 'src')
const packsDir = join(here, '..', '..', 'packages', 'content', 'packs', 'geography')

export type DeployFile = { name: string; content: string }

/**
 * What each function's bundle contains.
 *
 * Per-function rather than one shared list, and deliberately minimal: every module here
 * is parsed on every cold start, and a list that grows by habit is a latency budget spent
 * on code the function does not call. `store-notifications` needs the entitlement state
 * machine and nothing else from the engines; `submit-lesson` needs the grader.
 */
type FunctionSpec = {
  /** Modules to vendor from `packages/engines/src`, by path. */
  readonly engines: readonly string[]
  /** Modules to vendor from `_src/_shared`, by filename. */
  readonly shared: readonly string[]
  /** Anything generated rather than copied. Evaluated at build time. */
  readonly generated?: () => DeployFile[]
}

const FUNCTIONS: Record<string, FunctionSpec> = {
  'submit-lesson': {
    engines: [
      'shared/index.ts',
      'learning/types.ts',
      'learning/fsrs.ts',
      'xp/balance.ts',
      'xp/level.ts',
      'grading/index.ts',
      'time/index.ts',
      'achievements/types.ts',
      'achievements/index.ts',
      // The progress half of the quest engine, and only that half. `quests/index.ts`
      // composes a quest and needs the content types to do it; this function never
      // composes one — it pays for the one the device composed and the first submission
      // of the day pinned. See `quests/progress.ts` for why the file was split.
      'quests/progress.ts',
    ],
    shared: ['submission-time.ts'],
    generated: () => [
      // Shimmed rather than vendored: each is one small binding behind a module that
      // would drag the content engine into every cold start. See the two shims.
      { name: '_engines/lesson/machine.ts', content: ANSWERED_ITEM_SHIM },
      { name: '_engines/progression/index.ts', content: masteryOrderShim() },
      { name: '_content/answers.ts', content: buildAnswerKey() },
      { name: '_content/achievements.ts', content: buildAchievementCatalogue() },
    ],
  },
  'store-notifications': {
    engines: ['entitlements/index.ts', 'entitlements/store.ts'],
    shared: [
      'apple-jws.ts',
      'apple-notification.ts',
      'apple-verify.ts',
      'store-verification.ts',
      'store-notifications.ts',
    ],
  },
}

/**
 * `grading` imports AnsweredItem from `lesson/machine`, which drags in the whole
 * state machine and `content/types` for a single type. Types are erased at
 * runtime, so the bundle substitutes a local declaration instead — 11KB of dead
 * weight removed from every cold start.
 *
 * The shape is asserted against the real one in build.test.ts, so this cannot
 * silently drift from the module it stands in for.
 */
const ANSWERED_ITEM_SHIM = `/** Structural stand-in for lesson/machine.ts — see build.ts. */
export type AnsweredItem = {
  readonly itemId: string
  readonly factId: string
  readonly templateId: string
  readonly chosenOptionId: string | null
  readonly wasCorrect: boolean
  readonly elapsedMs: number
  readonly answeredAt: number
}
`

/**
 * `MASTERY_ORDER`, lifted out of `progression/index.ts` verbatim.
 *
 * `grading` imports exactly one binding from that module, and vendoring the module to
 * get it would pull in `content/index.ts` and `content/types.ts` — the content engine
 * the bundle exists to leave behind, and the same reason `lesson/machine.ts` is shimmed.
 *
 * EXTRACTED, not retyped. This is an ordered list whose INDICES are compared to decide
 * whether a user's mastery went up:
 *
 *     MASTERY_ORDER.indexOf(change.to) > MASTERY_ORDER.indexOf(change.from)
 *
 * A hand-copied shim that drifted by one entry would not throw. It would quietly award
 * the wrong thing, on the server, for everyone. Copying the declaration out of the
 * source at build time makes drift impossible rather than merely tested.
 */
function masteryOrderShim(): string {
  const source = readFileSync(join(enginesSrc, 'progression', 'index.ts'), 'utf8')
  const match = /export const MASTERY_ORDER: readonly Mastery\[\] = \[[\s\S]*?\n\]/.exec(source)
  if (match === null) {
    throw new Error(
      'build.ts: MASTERY_ORDER not found in progression/index.ts. `grading` imports it, ' +
        'and the bundle cannot vendor progression itself because that drags in the ' +
        'content engine. If the declaration moved or changed shape, fix this extractor — ' +
        'do not retype the array here.',
    )
  }
  return `/** Extracted verbatim from progression/index.ts by build.ts — do not edit. */
import type { Mastery } from '../learning/types.ts'

${match[0]}
`
}

/**
 * The answer key: fact id → the entity id that is the correct option.
 *
 * Vendored at build time because the server has to decide correctness ITSELF. It used
 * to trust `wasCorrect` off the request body, which meant a modified client could post
 * `wasCorrect: true` for ten fabricated answers and mint XP, coins and mastery. That is
 * the exploit ADR 0006 exists to prevent, and PROJECT.md lists server-authoritative
 * rewards as never waivable.
 *
 * A whole content index is not needed for this. `buildQuestion` always gives the
 * correct option the id of the item's entity, so correctness is one lookup: does the
 * chosen option id equal the entity this fact is about? No RNG replay, no option
 * ordering, no template evaluation.
 *
 * Facts are not in Postgres — they ship in packs — so this is generated rather than
 * queried. It is ~200 entries and regenerates on every `pnpm edge:build`.
 */
/**
 * The achievement catalogue, projected to what the EVALUATOR reads — and nothing else.
 *
 * ## Why the server needs it at all
 *
 * `BALANCE.xp.achievementByTier` and `coins.achievementByTier` were referenced nowhere
 * but the balance table: an achievement unlocked, the client celebrated it, and no XP
 * and no coins ever moved. `achievements.md §5` specifies exactly this — "server-side,
 * in the same edge function that grades a lesson" — because achievements award currency
 * and a client that could unlock them could mint it.
 *
 * The alternative was a `claim_achievement` endpoint, which is quicker and is the one
 * thing that must not be built: it hands the client the decision the whole section
 * exists to take away.
 *
 * ## Why a projection rather than the pack
 *
 * The pack is 18 KB and most of it is for a screen — copy keys, categories, `hidden`,
 * `showProgress`, `ceiling`, and a `$comment` on nearly every entry. The evaluator reads
 * an id, a rule and a list of thresholds. Shipping the rest would put a screen's data in
 * a function that draws nothing, on a cold-start path the budget in build.test.ts exists
 * to defend.
 *
 * Projected rather than hand-copied, for the reason `masteryOrderShim` gives: a
 * hand-maintained second catalogue would not throw when it drifted, it would quietly
 * award the wrong thing, on the server, for everyone.
 *
 * ## And the region map
 *
 * `ach.explorer.continents` is a set over the six regions, and its event was
 * `region_started` — fired by OPENING A CONTINENT PAGE, which the server cannot see and
 * which six taps could complete. The server emits it for a region the user actually
 * answered something correctly in, which is both what the copy says ("start learning on
 * every continent") and a thing that cannot be farmed by navigating.
 */
function buildAchievementCatalogue(): string {
  const packPath = join(
    here,
    '..',
    '..',
    'packages',
    'content',
    'packs',
    'achievements',
    'core.v1.json',
  )
  const pack = JSON.parse(readFileSync(packPath, 'utf8')) as {
    items?: { id: string; rule: unknown; tiers?: { tier: string; threshold: number }[] }[]
  }

  const items = (pack.items ?? []).map((item) => ({
    id: item.id,
    rule: item.rule,
    tiers: (item.tiers ?? []).map((t) => ({ tier: t.tier, threshold: t.threshold })),
  }))

  if (items.length === 0) {
    throw new Error(
      'build.ts: the achievement pack projected to nothing. The function pays tier rewards ' +
        'from this, so an empty catalogue is silently zero achievements rather than a failure.',
    )
  }

  const entities = JSON.parse(
    readFileSync(join(packsDir, 'entities.countries.v1.json'), 'utf8'),
  ) as { items?: { id: string; region?: string }[] }

  const regionByEntity: Record<string, string> = {}
  for (const entity of entities.items ?? []) {
    if (typeof entity.id === 'string' && typeof entity.region === 'string') {
      regionByEntity[entity.id] = entity.region
    }
  }

  return `/**
 * Generated by supabase/functions/build.ts — do not edit.
 *
 * The achievement catalogue, projected to the fields the evaluator reads. See
 * buildAchievementCatalogue().
 *
 * On one line, unlike answers.ts. Fifteen of these rules are set-completion over member
 * lists of up to 54 country codes, and pretty-printing gives each code its own line — the
 * indentation was a third of the file. Nobody reads this by hand; the pack it comes from
 * is the readable copy.
 */
import type { AchievementDef } from '../_engines/achievements/types.ts'

export const ACHIEVEMENTS = ${JSON.stringify(items)} as unknown as readonly AchievementDef[]

/**
 * Generated by supabase/functions/build.ts — do not edit.
 *
 * entity id → its region code, for the one achievement that counts continents.
 */
export const REGION_BY_ENTITY: Record<string, string> = ${JSON.stringify(regionByEntity)}
`
}

function buildAnswerKey(): string {
  const key: Record<string, string> = {}
  /**
   * entity → every quizzable fact it owns.
   *
   * `entity_mastered` is the one achievement event neither side could produce. The client
   * cannot: it means "every quizzable fact of this country is now mastered", which is a
   * question about facts the lesson did not touch. The server could not either, because
   * it had no idea which facts belong to a country — `ANSWER_BY_FACT` runs the other way.
   *
   * This is the same projection, indexed the other direction, and it costs nothing: the
   * loop is already reading every pack. Quizzability is applied HERE rather than in the
   * function, because a fact flagged `review-required` is never asked and would otherwise
   * make its country permanently incomplete — South Africa has three capitals, so nobody
   * would ever "finish" it.
   */
  const factsByEntity: Record<string, string[]> = {}

  for (const file of readdirSync(packsDir)) {
    if (!file.startsWith('facts.') || !file.endsWith('.json')) continue
    const pack = JSON.parse(readFileSync(join(packsDir, file), 'utf8')) as {
      items?: {
        id: string
        entity: string
        quizzable?: boolean
        volatility?: string
        sensitivity?: string
      }[]
    }
    for (const fact of pack.items ?? []) {
      if (typeof fact.id !== 'string' || typeof fact.entity !== 'string') continue
      key[fact.id] = fact.entity

      // A copy of `isQuizzable` from packages/engines, named as one.
      //
      // This script is what VENDORS the engine into the deployable function, so it
      // cannot import the package it is flattening — a build step that resolves through
      // the thing it is producing is a resolution order nobody wants to debug at deploy
      // time. `packages/content/scripts/validate.ts` had a third copy and now calls the
      // real function; this is the last one, and it stays because of what this file is.
      const quizzable =
        fact.quizzable !== false &&
        fact.volatility !== 'fast' &&
        fact.sensitivity !== 'review-required'
      if (quizzable) (factsByEntity[fact.entity] ??= []).push(fact.id)
    }
  }

  for (const ids of Object.values(factsByEntity)) ids.sort()

  return `/**
 * Generated by supabase/functions/build.ts — do not edit.
 *
 * fact id → the entity id that is the correct answer. See buildAnswerKey().
 */
export const ANSWER_BY_FACT: Record<string, string> = ${JSON.stringify(key, null, 2)}

/**
 * Generated by supabase/functions/build.ts — do not edit.
 *
 * entity id → every QUIZZABLE fact it owns, so the server can answer "is this country
 * finished?" A fact nobody can be asked is excluded, or a country with a
 * review-required fact could never be completed by anyone.
 */
export const QUIZZABLE_FACTS_BY_ENTITY: Record<string, string[]> = ${JSON.stringify(factsByEntity, null, 2)}
`
}

/** Deno resolves real paths; TS's `.js` extension convention has to go. */
const rewriteImports = (code: string): string =>
  code.replace(/(from\s+['"])(\.[^'"]*?)\.js(['"])/g, '$1$2.ts$3')

/** Where the hand-written entrypoints live. Not a function directory — see the header. */
const SRC = join(here, '_src')

export function buildFunction(name: string): DeployFile[] {
  const spec = FUNCTIONS[name]
  if (spec === undefined) {
    throw new Error(
      `build.ts: no bundle spec for "${name}". Add one to FUNCTIONS — a function whose ` +
        'dependencies are inferred rather than declared is a function that deploys with ' +
        'a module missing and fails to boot.',
    )
  }

  const entrypoint = readFileSync(join(SRC, name, 'index.ts'), 'utf8')

  const files: DeployFile[] = [
    {
      name: 'index.ts',
      content: rewriteImports(
        entrypoint
          .replace(/\.\.\/\.\.\/\.\.\/packages\/engines\/src\//g, './_engines/')
          // `_shared/` is a real directory the CLI understands, but only under
          // `functions/`, and the source lives under `functions/_src/`. The bundle gets
          // its own copy so the deployed function is self-contained rather than
          // depending on a sibling that may or may not have been deployed with it.
          .replace(/\.\.\/_shared\//g, './_shared/'),
      ),
    },
  ]

  for (const module of spec.engines) {
    const source = readFileSync(join(enginesSrc, module), 'utf8')
    files.push({ name: `_engines/${module}`, content: rewriteImports(source) })
  }

  for (const module of spec.shared) {
    const source = readFileSync(join(SRC, '_shared', module), 'utf8')
    files.push({ name: `_shared/${module}`, content: rewriteImports(source) })
  }

  files.push(...(spec.generated?.() ?? []))

  // Deno needs to know these are ES modules with the same strictness we use.
  files.push({
    name: 'deno.json',
    content: JSON.stringify(
      { compilerOptions: { strict: true, lib: ['deno.window', 'esnext'] } },
      null,
      2,
    ),
  })

  return files
}

/**
 * Write the bundle out as the function directory the Supabase CLI reads.
 *
 * The whole bundle, not a subset. For as long as this script only printed, the deploy
 * artefact existed for the duration of one process and was then dropped on the floor,
 * while `supabase functions deploy` and `supabase start` read a directory of authored
 * sources that resembled it and could not run. Both are now the same bytes.
 *
 * Generated rather than committed, for the reason `.gitignore` gives for tokens and
 * keys: every file here is a projection of something else in the repo — the entrypoint,
 * the engine modules, the fact packs — and a committed projection is a copy that can
 * disagree with its source. `pnpm generate` runs this on install, so a fresh clone can
 * start the local stack and deploy without a separate incantation.
 */
export function writeGenerated(name: string): string[] {
  const built = buildFunction(name)
  const problems = verifyBundle(built)
  if (problems.length > 0) {
    throw new Error(`refusing to write an unresolvable bundle:\n  ${problems.join('\n  ')}`)
  }

  const written: string[] = []
  for (const file of built) {
    const target = join(here, name, file.name)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.content)
    written.push(relative(join(here, '..', '..'), target))
  }

  return written
}

/**
 * Assert the bundle is self-contained before anyone deploys it.
 *
 * Checks imports specifically, not raw text — doc comments legitimately mention
 * `packages/engines`, and a substring search would flag those forever.
 *
 * The third check is the one that was missing, and it is the one that matters. The
 * first two ask whether a specifier LOOKS resolvable; neither asks whether the file it
 * names is actually in the bundle. `grading/index.ts` imports `AnsweredItem` from
 * `lesson/machine.ts`, which the bundle replaces with a shim precisely so that nothing
 * reaches `content/types.ts` — and if that shim were ever dropped from the file list,
 * every existing check would still pass while the deployed function failed to boot on
 * a missing module. Resolving each specifier against the set of names actually being
 * shipped is a two-line check that makes "self-contained" mean what it says.
 */
export function verifyBundle(files: DeployFile[]): string[] {
  const problems: string[] = []
  const present = new Set(files.map((f) => f.name))

  for (const file of files) {
    for (const match of file.content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = match[1]!
      if (!spec.startsWith('.')) {
        // A bare specifier is a remote module (`jsr:`, `npm:`, `https:`) that Deno
        // fetches itself. Not ours to resolve.
        if (spec.includes('packages/engines')) {
          problems.push(`${file.name}: escaped the bundle via "${spec}"`)
        }
        continue
      }
      if (!spec.endsWith('.ts')) {
        problems.push(`${file.name}: unresolvable import "${spec}"`)
        continue
      }
      // Resolve relative to the importing file's directory, then normalise back to a
      // bundle-relative name so it can be compared with what is being written.
      const resolved = join(dirname(file.name), spec).replace(/\\/g, '/')
      if (!present.has(resolved)) {
        problems.push(`${file.name}: imports "${spec}", which the bundle does not contain`)
      }
    }
  }
  return problems
}

// `tsx supabase/functions/build.ts submit-lesson store-notifications` — verify each
// bundle and write it out as the function directory the Supabase CLI reads.
for (const name of process.argv.slice(2)) {
  const built = buildFunction(name)
  const problems = verifyBundle(built)
  console.log(`Built "${name}" — ${built.length} files:`)
  for (const f of built) console.log(`  ${f.name.padEnd(32)} ${f.content.length} bytes`)
  if (problems.length) {
    console.error('\n✗ bundle is not self-contained:')
    for (const p of problems) console.error('  ' + p)
    process.exit(1)
  }

  const written = writeGenerated(name)
  console.log(`\n✓ bundle is self-contained — wrote ${written.length} files to`)
  console.log(`  supabase/functions/${name}/\n`)
}
