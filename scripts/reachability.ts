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
]

/**
 * Exports with no client caller and a good reason to have none.
 *
 * Adding a name here is a claim someone has to defend in review. Deleting a name from
 * here without wiring the export is how this check quietly stops working.
 */
const ALLOWED: Record<string, string> = {
  // ── the server decides; the client's copy is only ever a prediction (ADR 0006)
  xpForAnswer: 'server-authoritative reward maths',
  xpForLesson: 'server-authoritative reward maths',
  coinsForLesson: 'server-authoritative reward maths',
  applyStreakBonus: 'server-authoritative reward maths',
  applyActivity: 'streaks are server-authoritative — "a client that can write them is a client that can be edited"',
  startOfLocalDay: 'used by applyActivity, server-side',
  grantFreeze: 'a purchase; the server owns the balance',
  markBroken: 'the server decides a streak is broken, never the client',
  heartsNow: 'hearts reset per lesson on the client; regeneration is a server clock',

  // ── roadmapped, and deliberately not built during v1.0
  leagueFor: 'Leagues are v2.0 (roadmap.md). The Home tile stays a tile.',
  promotionZone: 'Leagues are v2.0',
  relegationZone: 'Leagues are v2.0',

  // ── consumed by another engine rather than by a screen
  evaluate: 'the single-definition form; the client calls evaluateAll',
  backfill: 'for a pack that adds an achievement to users who already earned it — needs server-side history',
  SLOTS: 'the type is what callers use; the screen keys its titles by Slot',
  SPEED_ROUND_MS: 'the whole-lesson goal for the speed_round quest slot, read inside advanceTask — NOT the same thing as SPEED_SECONDS, which is per question',
  hasExpired: 'the quest is regenerated per (user, day) by seed, so a stale one cannot be shown',
  candidatePool: 'used inside composeLesson',
  pickItemForFact: 'used inside composeLesson — including the screen-reader-only sibling pick',
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
  clockFrom: 'test and server seam',
  simulateEconomy: 'a `pnpm balance-check` tool, not a runtime path',
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
  isMilestone: 'no streak milestone is ever celebrated',
  regionProgress: 'the region screen computes its own totals instead',
  backoffMs: 'the sync adapter retries with no delay at all — it never backs off',
  retryParked: 'parked mutations are never surfaced, so nothing can retry them',
  hasUnsyncedProgress: 'meant to warn before sign-out; there is no sign-out yet',
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

if (unreachable.length > 0 || staleAllowances.length > 0) {
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
