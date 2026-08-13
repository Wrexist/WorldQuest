/**
 * Which engine capabilities can a user actually reach?
 *
 * ## Why this exists
 *
 * Four screens in a row turned out to be *unreachable* rather than unbuilt:
 *
 * - the splash — the native one covered exactly the window ours was for;
 * - the offline banner — `isOffline` was a hardcoded `false`;
 * - out of hearts — the machine set the flag and nothing rendered it;
 * - paused — `PAUSE`/`RESUME` existed and nothing sent them, and there was no close
 *   button at all.
 *
 * Every one was found by accident, one commit at a time, and every one had passing
 * tests around it. Tests prove a function is correct; nothing proved anything ever
 * *calls* it. That gap is this file.
 *
 * ## What it does, and what it deliberately does not
 *
 * It lists every value exported from the engine's USER-FACING modules and asks whether
 * anything under `apps/mobile/{app,src}` mentions it. That is a crude question — a name
 * can be referenced from dead code, and reachability in the real sense is undecidable —
 * so this is a *smoke alarm*, not a proof. It catches the failure mode we actually hit
 * four times: an engine capability nobody wired up.
 *
 * Two things are deliberately out of scope, because a check nobody trusts is a check
 * nobody reads — the first run flagged 66 names and most were noise:
 *
 * - **Types.** A type has no runtime and cannot be reached.
 * - **`shared/` and the FSRS internals.** `clamp`, `shuffle`, `MS_PER_DAY`, the
 *   scheduler's weights and its rating constants are plumbing that other engines
 *   consume. They are not features, and a screen has no business calling most of them.
 *   Their correctness is a unit-test question, which is already answered.
 *
 * ## The allowlist is the point
 *
 * An unreferenced export is not automatically a bug: plenty are server-side, or
 * roadmapped, or consumed only by another engine. So each one is either wired or
 * written down here **with a reason**. That turns "we forgot" into a decision someone
 * made on purpose, and it is the part of this script worth keeping.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const ENGINE_SRC = join(ROOT, 'packages/engines/src')
/**
 * Everything that legitimately calls the engine.
 *
 * The content scripts belong here as much as the app does: `isSelfAnswering`,
 * `isAmbiguous` and `buildQuestion` exist for `pnpm content:validate` and the pack
 * preview, and calling them unreachable because no screen imports them would be
 * wrong. The edge function is Deno and lives outside this tree, which is why grading
 * appears in ALLOWED instead.
 */
const CONSUMERS = [
  join(ROOT, 'apps/mobile/app'),
  join(ROOT, 'apps/mobile/src'),
  join(ROOT, 'packages/content/scripts'),
  /**
   * The edge functions, and this is the entry that changes what the allowlist MEANS.
   *
   * Five entries below said "server-authoritative" — `applyActivity`, `grantFreeze`,
   * `markBroken`, `heartsNow` and one for a function that does not exist — about code no
   * server imported.
   * The reason was unfalsifiable, because the only tree that could confirm or deny it was
   * not scanned. So "the server does this" and "nobody built this" produced an identical
   * green run, which is precisely the distinction this file exists to draw.
   *
   * With `_src` scanned, a claim about the server is checkable: wire it and the entry goes
   * stale and fails; leave it unwired and it stays honestly on the list. `applyActivity`
   * moved from the allowlist to `reachable` the day `record_lesson` called it, which is
   * the behaviour the header describes and did not have.
   */
  join(ROOT, 'supabase/functions/_src'),
]

/**
 * Exports with no client caller and a good reason to have none.
 *
 * Adding a name here is a claim someone has to defend in review. Deleting a name from
 * here without wiring the export is how this check quietly stops working.
 */
const ALLOWED: Record<string, string> = {
  // ── the server decides; the client's copy is only ever a prediction (ADR 0006)
  //
  // This block held four more entries — `xpForAnswer`, `xpForLesson`, `coinsForLesson`
  // and `applyStreakBonus` — all reading "server-authoritative reward maths", for four
  // functions that have never existed. Three more under Leagues said the same about
  // `leagueFor`, `promotionZone` and `relegationZone`. Seven of the thirty-five entries
  // on this list, a fifth of it, were decisions about code nobody had written; the ghost
  // check below the loop is what found them and what stops them coming back.


  // ── roadmapped, and deliberately not built during v1.0

  markBroken:
    'superseded, not unbuilt. A break is the ABSENCE of activity, so it is recorded by ' +
    '`expire_streaks()` on an hourly pg_cron schedule — nothing in a request-driven ' +
    'system ever runs on an absence, which is why this sat unwired for so long. The ' +
    'engine keeps the pure version for `repairAvailability` to reason against.',
  grantFreeze:
    'superseded, not unbuilt. The freeze IS purchasable — `purchase_freeze` — and the cap ' +
    'is enforced in SQL for the same reason the price is: a client that chooses its own ' +
    'cap holds nine freezes. streak-recovery.test.ts reads the migration and asserts the ' +
    'two copies of MAX_FREEZES agree.',

  /**
   * ── leagues: built, tested, and deliberately not wired ──────────────────────
   *
   * The whole module is unreachable on purpose, and this is the one place that says so
   * out loud rather than leaving it to look like an oversight.
   *
   * The engine is done and tested. The migration that backs it is written. What is
   * missing is the half that cannot be produced in an environment with no Docker: a
   * local Postgres to run the migration against, `pnpm db:types` to regenerate
   * `database.types.ts` from it, and `supabase test db` to prove the RLS policies do
   * what they claim.
   *
   * A leaderboard is not a feature where "the policies look right" is good enough. RLS
   * that has never been executed is RLS that has never been tested, and the failure
   * mode is every child's cohort being readable by everyone. So the client half waits
   * for a stack to test against, and the screen waits with it — a league screen with no
   * league behind it is the "Not open yet" tile that was just deleted from Home.
   *
   * To finish: `pnpm db:start && pnpm db:reset && pnpm db:types && supabase test db`,
   * then the read, the screen, and delete these lines.
   */
  LEAGUE_TIERS: 'leagues — engine and migration landed, client half blocked on a local Postgres; see the note above',
  DIVISIONS: 'leagues — see LEAGUE_TIERS',
  BRONZE_III: 'leagues — see LEAGUE_TIERS',
  COHORT_SIZE: 'leagues — see LEAGUE_TIERS',
  PROMOTED: 'leagues — see LEAGUE_TIERS',
  RELEGATED: 'leagues — see LEAGUE_TIERS',
  rankIndex: 'leagues — see LEAGUE_TIERS',
  rankFromIndex: 'leagues — see LEAGUE_TIERS',
  promote: 'leagues — see LEAGUE_TIERS',
  relegate: 'leagues — see LEAGUE_TIERS',
  outcomeFor: 'leagues — see LEAGUE_TIERS',
  podiumCoins: 'leagues — see LEAGUE_TIERS',
  weekStart: 'leagues — see LEAGUE_TIERS',
  weekEnd: 'leagues — see LEAGUE_TIERS',
  weekId: 'leagues — see LEAGUE_TIERS',
  standings: 'leagues — see LEAGUE_TIERS',
  xpToPromotion: 'leagues — see LEAGUE_TIERS',
  handleFor: 'leagues — see LEAGUE_TIERS',
  HANDLE_SPACE: 'leagues — see LEAGUE_TIERS',

  // ── consumed by another engine rather than by a screen
  evaluate: 'the single-definition form; the client calls evaluateAll',
  xpForLevel:
    'the curve itself; every screen asks levelProgress instead, which returns the band and the position inside it together — Home drew its own bar from these two and printed a level the card below it printed again',
  levelForXp:
    'the inverse of xpForLevel, and the same answer: levelProgress is the one call, so a bar can never disagree with the number beside it',
  backfill: 'for a pack that adds an achievement to users who already earned it — needs server-side history',
  SLOTS: 'the type is what callers use; the screen keys its titles by Slot',
  SPEED_ROUND_MS: 'the whole-lesson goal for the speed_round quest slot, read inside advanceTask — NOT the same thing as SPEED_SECONDS, which is per question',
  hasExpired: 'the quest is regenerated per (user, day) by seed, so a stale one cannot be shown',
  itemsForFact: 'used inside composeLesson — every presentation of a fact, including the screen-reader-safe siblings, so a template that cannot be asked costs the lesson nothing',
  applySoftCap: 'used inside gradeLesson, which the server runs',
  selectItems: 'used inside composeLesson',
  MIN_LESSON_ITEMS: 'bounds enforced inside lessonLength',
  MAX_LESSON_ITEMS: 'bounds enforced inside lessonLength',
  TITLES: 'read by levelProgress, which the Profile screen calls',
  titleKeyForLevel: 'read by levelProgress',
  MAX_LEVEL: 'read by levelProgress',
  MASTERY_ORDER: 'used inside masteryOf',
  LEARNED: 'used inside isLearned/entityProgress',
  isLearned: 'used inside entityProgress, which the collection calls',
  REPAIR_WINDOW_HOURS: 'used inside repairAvailability, which the streak screen calls',
  REPAIR_COOLDOWN_DAYS: 'used inside repairAvailability',
  STREAK_MILESTONES: 'used inside isMilestone',
}

/**
 * Real gaps. Capability that exists, that a user should be able to reach, and cannot.
 *
 * Kept SEPARATE from `ALLOWED` on purpose. Folding these in would make the check pass
 * and the gap invisible, which is precisely the "guard that proves nothing" this repo
 * has already had to fix once. These are reported loudly on every run and do not fail
 * the build, because they are a tracked backlog rather than a regression.
 *
 * Each one is a row in docs/plan/ui-completion.md. Emptying this list is the work.
 */
const KNOWN_GAPS: Record<string, string> = {

  // Moved here from ALLOWED once the server tree became scannable. All three were
  // allowlisted with reasons that read as decisions — "a purchase; the server owns the
  // balance", "the server decides a streak is broken", "server-authoritative reward
  // maths" — and were descriptions of code nobody had written. That is exactly the
  // "we forgot" wearing "we decided not to" that this file's footer warns about, and
  // it survived because the only tree that could disprove it was not being read.
}

// ── collect engine exports ───────────────────────────────────────────────────

/**
 * Plumbing rather than product. See the header.
 *
 * A path listed here is excluded wholesale, which is a blunt instrument — but a
 * per-name allowlist for forty utility functions would be a file nobody maintains.
 */
const PLUMBING = [
  'engines/src/shared/',
  'engines/src/learning/fsrs.ts',
  'engines/src/learning/types.ts',
]

const isPlumbing = (file: string): boolean => PLUMBING.some((part) => file.includes(part))

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    if (!full.endsWith('.ts') || full.endsWith('.test.ts')) return []
    return isPlumbing(full) ? [] : [full]
  })

/** `export function foo`, `export const foo`, `export async function foo`. */
const VALUE_EXPORT = /^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/gm

const exported = new Map<string, string>()
for (const file of walk(ENGINE_SRC)) {
  const code = readFileSync(file, 'utf8')
  for (const match of code.matchAll(VALUE_EXPORT)) {
    // Internal by convention. Not part of the surface a screen could reach for.
    if (match[1]!.startsWith('__')) continue
    exported.set(match[1]!, file.slice(ROOT.length))
  }
}

// ── collect what the app mentions ────────────────────────────────────────────

const consumerCode = CONSUMERS.flatMap(walkAny).map((f) => readFileSync(f, 'utf8')).join('\n')

function walkAny(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walkAny(full)
    return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : []
  })
}

const mentioned = (name: string): boolean =>
  new RegExp(`\\b${name}\\b`).test(consumerCode)

// ── report ───────────────────────────────────────────────────────────────────

const unreachable: Array<{ name: string; file: string }> = []
const staleAllowances: string[] = []
const gaps: string[] = []

/**
 * An allowlist entry for a symbol nobody exports.
 *
 * `applyStreakBonus: 'server-authoritative reward maths'` sat in ALLOWED, and there is no
 * such function anywhere in the engine. Both loops below iterate `exported`, so a name
 * that is not exported is never compared against anything — the entry was unreachable by
 * the very check it lived in, and would have stayed there for ever.
 *
 * Ghosts are worse than stale reasons. A stale reason is a sentence that stopped being
 * true; a ghost is evidence that the list was written from memory rather than from the
 * code, which is a reason to distrust the entries that ARE real.
 */
const ghosts = [...Object.keys(ALLOWED), ...Object.keys(KNOWN_GAPS)].filter(
  (name) => !exported.has(name),
)

for (const [name, file] of exported) {
  if (mentioned(name)) {
    // Wired AND listed means the note is out of date — a stale reason is worse than
    // no reason, because the next reader believes it.
    if (name in ALLOWED || name in KNOWN_GAPS) staleAllowances.push(name)
    continue
  }
  if (name in ALLOWED) continue
  if (name in KNOWN_GAPS) {
    gaps.push(name)
    continue
  }
  unreachable.push({ name, file })
}

if (ghosts.length > 0) {
  console.error('\n  ! allowlisted names that nothing exports:')
  for (const name of ghosts) console.error(`      · ${name}`)
  console.error('    Delete them. An entry for a symbol that does not exist was never')
  console.error('    checked against anything, and it makes the real entries less')
  console.error('    believable.\n')
}

console.log('Engine reachability\n')
console.log(`  exported values   ${exported.size}`)
console.log(`  reachable         ${exported.size - unreachable.length - Object.keys(ALLOWED).length}`)
console.log(`  allowed unwired   ${Object.keys(ALLOWED).length}`)
console.log(`  known gaps        ${gaps.length}`)
console.log()

if (gaps.length > 0) {
  console.log('  Tracked gaps — capability a user should be able to reach and cannot:')
  for (const name of gaps) console.log(`    · ${name} — ${KNOWN_GAPS[name]}`)
  console.log()
}

for (const name of staleAllowances) {
  console.log(`  ! ${name} is wired up but still allowlisted — remove its entry`)
}

for (const { name, file } of unreachable) {
  console.log(`  ✗ ${name}  (${file})`)
}

if (unreachable.length > 0 || staleAllowances.length > 0 || ghosts.length > 0) {
  console.error(
    `\n✗ ${unreachable.length} engine export(s) no screen can reach, ` +
      `${staleAllowances.length} stale allowance(s).\n` +
      `  Wire it up, or add it to ALLOWED in scripts/reachability.ts with the reason.\n` +
      `  "We forgot" and "we decided not to" look identical in a diff — this is where\n` +
      `  they stop looking identical.`,
  )
  process.exit(1)
}

console.log(
  gaps.length > 0
    ? `✓ no NEW unreachable exports (${gaps.length} tracked gaps above — emptying that list is the work)`
    : '✓ every engine capability has a client caller, or a recorded reason',
)
