/**
 * The accessibility checks that can be made mechanical.
 *
 * ## Why this exists
 *
 * `.claude/skills/worldquest-a11y` opens by telling you to run four commands. Three of
 * them — `lint:a11y`, `test:a11y`, `test:scale` — had never been written. A procedure
 * whose first step is four commands whose only real member is `design:contrast` trains
 * whoever follows it to skip the step, and the manual pass after it is the part nobody
 * can automate away.
 *
 * This is `lint:a11y`, doing the subset of the skill's "common failures" table that a
 * static check can honestly do.
 *
 * ## Why it covers `apps/mobile` and not only `packages/design`
 *
 * `packages/design/src/tokens.test.ts` already guards the primitives — eight files.
 * Every screen in the app was uncovered, which is exactly how an RTL bug sat in the
 * collection tile: the same rule was enforced three directories away and nowhere near
 * the code that broke it.
 *
 * ## What it cannot do
 *
 * Focus order, screen-reader task completion, 200 % layout, colour-blind legibility.
 * Those are the manual pass, and this file is not a substitute for it — it is the part
 * that should never have needed a human in the first place.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

const ROOTS = [
  join(ROOT, 'apps/mobile/app'),
  join(ROOT, 'apps/mobile/src'),
  join(ROOT, 'packages/design/src'),
]

type Finding = { readonly file: string; readonly rule: string; readonly detail: string }

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : []
  })

/**
 * Comments out, before anything is matched.
 *
 * Every rule below is a regex over raw source, and prose is source. `// the rule is
 * right: an iOS-only shadow…` matched the RTL rule's `right\s*:` and failed the gate on
 * a sentence — with no style property anywhere near it.
 *
 * That is worse than a wasted minute. A gate that fires on prose teaches people to
 * reword the comment, and rewording is indistinguishable from fixing; the next real
 * `right:` gets edited away just as easily. `scripts/five-states.ts` learned the same
 * lesson and grew the same function.
 */
const stripProse = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

const findings: Finding[] = []
const report = (file: string, rule: string, detail: string) =>
  findings.push({ file: file.slice(ROOT.length), rule, detail })

for (const dir of ROOTS) {
  for (const file of walk(dir)) {
    const code = stripProse(readFileSync(file, 'utf8'))

    /**
     * Physical edges do not mirror.
     *
     * In Arabic or Hebrew the whole layout flips and a `right: 4` stays pinned to the
     * physical right — so a badge lands on the wrong corner and a correctness glyph
     * detaches from the text it belongs to. `start`/`end` follow the reading
     * direction, which is the only thing that survives translation.
     *
     * `absoluteFillObject` is spread, not written, so it never matches.
     */
    for (const match of code.matchAll(
      /(?:^|[{,;\s])(left|right|marginLeft|marginRight|paddingLeft|paddingRight|borderLeftWidth|borderRightWidth)\s*:/gm,
    )) {
      report(file, 'rtl', `${match[1]} — use the logical property (start/end) instead`)
    }

    for (const match of code.matchAll(/textAlign:\s*'(left|right)'/g)) {
      report(file, 'rtl', `textAlign: '${match[1]}' — use 'start' or 'end'`)
    }

    /**
     * react-native-web SILENTLY DROPS `accessibilityState`.
     *
     * RN 0.71+ takes both spellings and maps ARIA to the native API, but the web build
     * emits nothing at all for the `accessibility*` forms — so a switch renders with no
     * state and no test can catch it, because the attribute is not in the tree to
     * assert on. This cost a round of failing tests once already.
     */
    if (/accessibilityState=/.test(code)) {
      report(file, 'aria', 'accessibilityState — react-native-web drops it; use aria-checked/selected/disabled')
    }
    if (/accessibilityRole=/.test(code)) {
      report(file, 'aria', 'accessibilityRole — use role=')
    }

    /**
     * A touch handler on a View is reachable by finger and by nothing else.
     *
     * No mouse click, no keyboard, and no screen-reader activation — VoiceOver
     * dispatches an accessibility action rather than a touch sequence. The tab bar
     * shipped this way: the app's primary navigation, inert on web and unreachable
     * with a screen reader on every platform, and it worked perfectly when poked.
     */
    for (const handler of ['onTouchEnd', 'onTouchStart']) {
      if (code.includes(`${handler}={`)) {
        report(file, 'touch', `${handler} — use a Pressable with onPress`)
      }
    }

    /**
     * Every Pressable needs an accessible name.
     *
     * Checked per-file rather than per-element, which is coarse: a file with three
     * Pressables and one label passes. It still catches the case that actually
     * happens — a new icon-only control added with no label at all.
     */
    if (/<Pressable/.test(code) && !/aria-label|accessibilityLabel/.test(code)) {
      report(file, 'label', 'has a Pressable and no accessible name anywhere in the file')
    }
  }
}

console.log('Accessibility lint\n')

if (findings.length === 0) {
  console.log(`  ✓ ${ROOTS.length} trees checked: RTL, ARIA spelling, touch handlers, labels`)
  console.log('\n  Not covered here, and not optional: focus order, screen-reader task')
  console.log('  completion, 200 % text, colour-blind legibility. See the a11y skill.')
  process.exit(0)
}

const byRule = new Map<string, Finding[]>()
for (const finding of findings) {
  byRule.set(finding.rule, [...(byRule.get(finding.rule) ?? []), finding])
}

for (const [rule, list] of byRule) {
  console.log(`  ${rule}`)
  for (const { file, detail } of list) console.log(`    ✗ ${file}\n        ${detail}`)
  console.log()
}

console.error(`✗ ${findings.length} accessibility problem(s)`)
process.exit(1)
