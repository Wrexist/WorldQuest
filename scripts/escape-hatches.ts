/**
 * The escape hatches: `any`, `@ts-expect-error`, `@ts-ignore`, `eslint-disable`.
 *
 * ## Why this exists
 *
 * `PROJECT.md §12` has banned all four since week one, and until now nothing checked.
 * The Definition of Done status file carried a ✅ against "No `any`, no
 * `@ts-expect-error`" that was true — verified by hand, at some point, by someone.
 *
 * That is precisely the shape the five-states box had before `five-states.ts`: a real
 * rule, honestly believed, resting on nobody having broken it yet. The value of the
 * status file is that its claims are backed, so the claims that are only asserted are
 * the ones worth converting. This converts one.
 *
 * It costs a second to run and it means the ✅ stays true on a day when nobody is
 * paying attention, which is the only day it matters.
 *
 * ## Why each is banned
 *
 * They are not style. Each one switches off a guarantee for a **region**, not a line:
 *
 * - **`any`** disables checking on every value that flows out of it. It is contagious
 *   in a way `unknown` is not — `unknown` forces the narrowing that `any` skips.
 * - **`@ts-expect-error` / `@ts-ignore`** switch off the *whole* next line, including
 *   the parts that were fine. The error you meant to silence gets silenced along with
 *   the one you introduce next year.
 * - **`eslint-disable`** does the same for lint rules.
 *
 * The fix is almost always the same and it is almost always better: type the thing.
 * `packages/design/src/react-native-web.d.ts` is the worked example — `dataSet` is a
 * real react-native-web prop that `@types/react-native` does not declare, and the
 * choice was a cast to `any`, a `@ts-expect-error`, or eleven lines of module
 * augmentation. The augmentation turns one untyped prop into a typed one and leaves
 * everything else as strict as it was. The other two would have unchecked an entire
 * element.
 *
 * ## The thing this script gets right on purpose
 *
 * **It does not match its own documentation.** This repo has shipped that bug three
 * times — a no-shame check that failed on the copy "Nothing is lost", a buzzer ban
 * that matched the paragraph forbidding buzzers, and an export-button assertion that
 * passed because the explanatory text contained the word "exporting".
 *
 * The file quoted above discusses `any` and `@ts-expect-error` by name, in prose, in
 * order to explain why it uses neither. A naive grep flags it — and flagging the one
 * file that most carefully avoided the hatches would discredit the check on its first
 * run.
 *
 * So there are two scans, because the two bans live in different places:
 *
 * - **`any` is code**, so it is matched against source with comments stripped, and
 *   only in type position (`: any`, `as any`, `<any>`, `any[]`). A variable called
 *   `company` is not a violation.
 * - **Suppressions are comments**, so stripping comments would erase the very thing
 *   being looked for. They are matched as *directives* instead: anchored to the start
 *   of a comment, which is the only position the compiler honours. A sentence that
 *   mentions `@ts-expect-error` in the middle of a line is prose. `// @ts-expect-error`
 *   is an instruction.
 *
 * Run: pnpm escape-hatches
 */

import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { relative } from 'node:path'

// ── what is allowed, and why ─────────────────────────────────────────────────

/**
 * Suppressions that are deliberate, keyed by `file:directive`.
 *
 * An entry here is a decision someone made with a reason attached, not an oversight.
 * A stale entry fails the build the same as a new violation — the reachability script
 * takes the same line, for the same reason: a note that is no longer true is worse
 * than no note, because the next reader believes it.
 */
const ALLOWED: Record<string, string> = {
  'apps/mobile/src/lib/sound.ts:eslint-disable':
    'Six static `require`s for the sound files. Metro resolves assets at build time, ' +
    'so a computed path bundles nothing and fails at runtime on device only. There is ' +
    'no ESLint in this repo yet; the directive marks the intent for when there is.',
  'apps/mobile/src/lib/reporting.ts:eslint-disable':
    'A lazy `require` of @sentry/react-native, so a build with no DSN never pulls the ' +
    'SDK onto the startup path and the module stays importable in unit tests without ' +
    'the native module present. A static import would load it in every build, ' +
    'including the ones that have deliberately not configured it.',
  'packages/design/src/primitives/Card.tsx:eslint-disable':
    'A lazy `require` of expo-linear-gradient inside a try/catch, so a missing native ' +
    'module resolves to `null` instead of failing at import — which would take down ' +
    'the screenshot harness and the component tests, the two things that exist to ' +
    'catch problems before a device does. A static import cannot be caught.',
  'packages/design/src/primitives/ScreenBackground.tsx:eslint-disable':
    'The same lazy `require` of expo-linear-gradient, for the same reason as Card — and ' +
    'it matters more here, because this one wraps the entire app. A static import that ' +
    'threw would take down every screen rather than one component, and the fallback it ' +
    'guards is the flat canvas colour that shipped before the gradient existed.',
}

// ── the two scans ────────────────────────────────────────────────────────────

/**
 * `any` in type position, in code.
 *
 * Anchored to the tokens that can precede a type — `:`, `<`, `as`, `|`, `&`, `,`, `(`
 * — so `many`, `anywhere` and `Company` are not violations. This is deliberately
 * narrower than `\bany\b`: a check that cries wolf is a check that gets skipped.
 */
const ANY_IN_TYPE_POSITION = /(?::\s*any\b|\bas\s+any\b|<\s*any\s*>|\bany\s*\[\]|\|\s*any\b)/

/**
 * A suppression *directive* — anchored to the start of a comment.
 *
 * `// @ts-expect-error` and `/* @ts-expect-error *\/` are honoured by the compiler.
 * A ` * @ts-expect-error` continuation line inside a block comment is not, and neither
 * is the phrase appearing mid-sentence. Matching the directive form rather than the
 * word is what keeps this script from flagging the documentation that explains it.
 */
const DIRECTIVES: ReadonlyArray<readonly [string, RegExp]> = [
  ['@ts-expect-error', /^[ \t]*(?:\/\/|\/\*+)[ \t]*@ts-expect-error\b/m],
  ['@ts-ignore', /^[ \t]*(?:\/\/|\/\*+)[ \t]*@ts-ignore\b/m],
  ['@ts-nocheck', /^[ \t]*(?:\/\/|\/\*+)[ \t]*@ts-nocheck\b/m],
  ['eslint-disable', /^[ \t]*(?:\/\/|\/\*+)[ \t]*eslint-disable\b/m],
]

/** Source with comments removed, so prose about a rule never trips the rule. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// ── walk ─────────────────────────────────────────────────────────────────────

const files = globSync('{packages,apps,supabase}/**/*.{ts,tsx}', {
  exclude: (p) => /node_modules|\/dist\/|\/\.expo\/|\/build\//.test(p),
})

const isTest = (file: string): boolean => /\.(test|spec)\.tsx?$/.test(file)

type Violation = { file: string; line: number; what: string; text: string }

const violations: Violation[] = []
const inTests: Violation[] = []
const used = new Set<string>()

for (const file of files.sort()) {
  const rel = relative(process.cwd(), file)
  const raw = readFileSync(file, 'utf8')

  // `any` — against code only.
  const code = stripComments(raw)
  code.split('\n').forEach((line, i) => {
    if (!ANY_IN_TYPE_POSITION.test(line)) return
    const v = { file: rel, line: i + 1, what: 'any', text: line.trim() }
    ;(isTest(rel) ? inTests : violations).push(v)
  })

  // Suppressions — against the raw text, matched as directives.
  for (const [name, pattern] of DIRECTIVES) {
    raw.split('\n').forEach((line, i) => {
      if (!pattern.test(line)) return
      const key = `${rel}:${name}`
      if (key in ALLOWED) {
        used.add(key)
        return
      }
      const v = { file: rel, line: i + 1, what: name, text: line.trim() }
      ;(isTest(rel) ? inTests : violations).push(v)
    })
  }
}

// ── report ───────────────────────────────────────────────────────────────────

const stale = Object.keys(ALLOWED).filter((key) => !used.has(key))

console.log('Escape hatches\n')
console.log(`  files scanned     ${files.length}`)
console.log(`  allowed           ${Object.keys(ALLOWED).length}`)
console.log(`  in tests          ${inTests.length}`)
console.log()

for (const [key, reason] of Object.entries(ALLOWED)) {
  if (used.has(key)) console.log(`  · ${key}\n      ${reason}`)
}
if (Object.keys(ALLOWED).length > 0) console.log()

// Tests are reported, never failed on. A test that deliberately passes a malformed
// value to prove the guard rejects it has a legitimate reason to reach for `any`, and
// the DoD box has always read "outside tests". Reporting the count keeps it visible
// rather than exempt — if this number starts climbing, that is worth knowing.
if (inTests.length > 0) {
  console.log(`  ${inTests.length} in test files — reported, not failed on:`)
  for (const v of inTests.slice(0, 10)) {
    console.log(`    · ${v.file}:${v.line}  ${v.what}`)
  }
  if (inTests.length > 10) console.log(`    · …and ${inTests.length - 10} more`)
  console.log()
}

for (const key of stale) {
  console.log(`  ! ${key} is allowlisted but no longer present — remove its entry`)
}

for (const v of violations) {
  console.log(`  ✗ ${v.file}:${v.line}  ${v.what}`)
  console.log(`      ${v.text}`)
}

if (violations.length > 0 || stale.length > 0) {
  console.error(
    `\n✗ ${violations.length} escape hatch(es), ${stale.length} stale allowance(s).\n\n` +
      '  Each one switches off checking for a region, not a line. Type the thing\n' +
      '  instead — `unknown` plus a narrow, or a module augmentation like\n' +
      '  packages/design/src/react-native-web.d.ts. If it is genuinely unavoidable,\n' +
      '  add it to ALLOWED in scripts/escape-hatches.ts with the reason.\n',
  )
  process.exit(1)
}

console.log('✓ no `any`, no compiler or lint suppressions outside tests')
