/**
 * Every screen must be scrollable, or say why it cannot need to be.
 *
 * ## The bug this exists for
 *
 * `StreakScreen` and `WelcomeBackScreen` were both `<View style={{ flex: 1 }}>` with no
 * scroll container at all. Measured at 320 before the fix: Streak's content ended at 678
 * of 700 — twenty-two pixels of headroom, and that was without the repair card, which a
 * broken streak adds. Welcome-back ended at 668, without its STILL YOURS card, which is
 * the normal case for a screen that exists to reassure a returning user. At 200 % text
 * they need 1262 and 1008.
 *
 * On a device, everything past the fold in a `flex: 1` View is gone: no gesture reaches
 * it, because nothing is scrolling. On Welcome-back that included "Just looking around",
 * the way out, on the screen whose whole argument is that the user is not trapped.
 *
 * ## Why no other check could see it
 *
 * Every visual check in this repo runs in Chromium, and a browser scrolls the DOCUMENT
 * when a page overflows. So the content was reachable in the harness, in the screenshots,
 * and in the 200 % text pass — by a mechanism no phone has. A screenshot cannot show the
 * absence of a scroll view either: the picture of a screen that fits and a screen that
 * has been silently truncated are the same picture.
 *
 * That is the whole argument for reading source here. The rule is about a CAPABILITY, and
 * the only honest place to check for a capability the harness fakes is the code.
 *
 * ## What it can and cannot see
 *
 * It looks for a scrolling container in the screen or in a component it renders, not for
 * whether the scrolling works. A screen with a ScrollView of the wrong height passes. What
 * it catches is the failure that actually happened twice: nobody put one there.
 *
 * It also asks the question once per FILE, not once per branch. `ProfileScreen` scrolls in
 * its content branch and does not in its empty branch, and passes on the strength of the
 * first. That is a real gap and it is left open deliberately: the alternative is parsing
 * which JSX belongs to which early return, which is a lot of machinery for a case where
 * the un-scrolling branch is an illustration, a heading, a line and a button. If an empty
 * state ever grows past that, this script will not be the thing that notices.
 *
 * Run: pnpm scrollable  (part of `pnpm verify`)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MOBILE = join(import.meta.dirname, '..', 'apps', 'mobile')
const FEATURES = join(MOBILE, 'src', 'features')
const COMPONENTS = join(MOBILE, 'src', 'components')

/**
 * Anything that scrolls, including the two list primitives that scroll on their own.
 *
 * `KeyboardAwareScrollView` and the like would go here too. Matched on the JSX tag rather
 * than the import so a component imported and never rendered does not count.
 */
const SCROLLS = /<(ScrollView|FlatList|SectionList|VirtualizedList)\b/

/**
 * Prose, stripped — for the same reason `five-states.ts` strips it.
 *
 * This script's signal is a JSX tag, and the comment right above a converted screen says
 * the words "a ScrollView, because this screen did not have one". A false PASS is the
 * expensive direction: a screen reported as scrollable when it is not is worse than no
 * script at all, because it is what makes someone stop checking.
 */
const stripProse = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

/**
 * Screens that genuinely do not need to scroll, each with the reason.
 *
 * "It fits" is not a reason — it fits in English at 100 % on the device you tried. A
 * reason has to explain why the content CANNOT grow past one screen: a fixed number of
 * short lines, or a layout that is deliberately one viewport and nothing else.
 */
const WAIVED: Record<string, string> = {
  // `lesson/LessonScreen` was waived here on the reasoning that a question runner is
  // sized to exactly one viewport on purpose. The stale-waiver rule below rejected it
  // immediately and was right to: the feedback sheet scrolls, which is precisely where
  // the long content on that screen lands. The waiver described the intent of the layout
  // and the script asks a narrower question — can the user reach the words.
  'splash/SplashScreen':
    'one mark and one line, shown for at most a second while fonts load. There is ' +
    'nothing here that a translation or a font scale can grow past a screen',
}

type Screen = { name: string; code: string }

const screens: Screen[] = []
for (const dir of readdirSync(FEATURES, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  for (const file of readdirSync(join(FEATURES, dir.name))) {
    if (!file.endsWith('Screen.tsx') || file.endsWith('.test.tsx')) continue
    screens.push({
      name: `${dir.name}/${file.replace('.tsx', '')}`,
      code: readFileSync(join(FEATURES, dir.name, file), 'utf8'),
    })
  }
}

/**
 * Shared composites that scroll, so a screen delegating its whole body to one counts.
 *
 * Read once rather than per screen: the question is only ever "does this component
 * scroll", and there are a dozen of them.
 */
const SCROLLING_COMPONENTS = new Set<string>()
const walkComponents = (dir: string): void => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walkComponents(full)
      continue
    }
    if (!entry.endsWith('.tsx') || entry.endsWith('.test.tsx')) continue
    if (SCROLLS.test(stripProse(readFileSync(full, 'utf8')))) {
      SCROLLING_COMPONENTS.add(entry.replace('.tsx', ''))
    }
  }
}
walkComponents(COMPONENTS)

/**
 * Rule two: a scroll view's content must not be centred with `justifyContent`.
 *
 * Same subject as rule one — can the user reach the words — and a nastier version of it.
 * A centred content container is correct until the content is taller than the view, at
 * which point the overflow goes to BOTH ends and the leading half lands above scroll
 * position zero, where no gesture reaches it. The content is not below the fold; it is
 * outside the scrollable region entirely.
 *
 * Three screens had it, and the reason to gate rather than fix-and-move-on is what they
 * were: the lesson (at 320×568, iPhone SE and small Android, the prompt plus a map plus
 * four options overflow — option four measured at 535–594 of 568), the lesson summary,
 * and the paywall. The pattern is also the obvious thing to write. It was written twice
 * more during the same session that documented why not to.
 *
 * `<Spacer />` above and below the content is the fix, and it is a primitive in
 * `packages/design` so the reasoning lives in one place.
 *
 * ## Why this is not caught by anything else
 *
 * Chromium extended the scrollable overflow region to include centred leading overflow,
 * so the browser scrolls back to content a phone would strand. Every visual check here
 * runs in Chromium. A reachability assertion was written against a deliberately centred
 * container, watched to pass, and deleted — see `OnboardingScreen`. Source is the only
 * honest place left to check it.
 */
const CENTRED = /justifyContent:\s*'center'/

type Centring = { screen: string; style: string }
const centred: Centring[] = []

for (const screen of screens) {
  const code = stripProse(screen.code)
  // Every style handed to a ScrollView as its content container, by name.
  const names = [...code.matchAll(/contentContainerStyle=\{styles\.(\w+)\}/g)].map((m) => m[1]!)
  for (const name of new Set(names)) {
    // The style's own object literal, from its key to the brace that closes it. Counted
    // rather than regexed to the next `}`, because these objects nest — `shadowOffset`
    // and `transform` both open one, and a lazy match stops at the wrong brace and reads
    // the NEXT style's properties as this one's.
    const at = code.search(new RegExp(`^\\s*${name}:\\s*\\{`, 'm'))
    if (at === -1) continue
    let depth = 0
    let end = at
    for (let i = code.indexOf('{', at); i < code.length; i++) {
      if (code[i] === '{') depth++
      else if (code[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (CENTRED.test(code.slice(at, end + 1))) centred.push({ screen: screen.name, style: name })
  }
}

console.log('Scrollable screens\n')

let missing = 0
let waived = 0
const stale: string[] = []

for (const screen of screens) {
  const code = stripProse(screen.code)
  const direct = SCROLLS.test(code)
  const viaComponent = [...SCROLLING_COMPONENTS].find((name) =>
    new RegExp(`<${name}\\b`).test(code),
  )
  const scrolls = direct || viaComponent !== undefined
  const excuse = WAIVED[screen.name]

  if (scrolls && excuse !== undefined) {
    stale.push(`${screen.name} — waived as "${excuse}", but it scrolls now`)
    continue
  }
  if (scrolls) {
    const how = direct ? '' : `  (via <${viaComponent!}>)`
    console.log(`  ✓ ${screen.name}${how}`)
    continue
  }
  if (excuse !== undefined) {
    waived++
    console.log(`  · ${screen.name}\n      waived — ${excuse}`)
    continue
  }
  missing++
  console.log(`  ✗ ${screen.name}  — nothing here scrolls`)
}

console.log(`\n  ${screens.length} screens · ${waived} waived with a recorded reason`)

if (centred.length > 0) {
  console.log('\n  Scroll content centred with justifyContent:')
  for (const c of centred) console.log(`    ✗ ${c.screen} · styles.${c.style}`)
} else {
  console.log('  no scroll content is centred with justifyContent')
}

if (stale.length > 0) {
  console.log('\n  Stale waivers — delete these:')
  for (const line of stale) console.log(`    · ${line}`)
}

if (missing > 0) {
  console.error(
    `\n✗ ${missing} screen(s) cannot scroll. On a device that means anything past the ` +
      `fold is unreachable — at 200 % text, in a longer language, or on a shorter phone ` +
      `than the one you tried. Wrap it in a ScrollView, or waive it in ` +
      `scripts/scrollable.ts with a reason that says why the content cannot exceed one ` +
      `screen. "It fits" is not that reason.\n`,
  )
  process.exit(1)
}
if (centred.length > 0) {
  console.error(
    `\n✗ ${centred.length} scroll container(s) centre their content with ` +
      `\`justifyContent: 'center'\`. That works until the content is taller than the view, ` +
      `and then the top of it sits above scroll position zero on native, where nothing ` +
      `reaches it. Use <Spacer /> above and below the content instead, and keep ` +
      `\`flexGrow: 1\` on the container — see packages/design/src/primitives/Spacer.tsx.\n`,
  )
  process.exit(1)
}
if (stale.length > 0) {
  console.error('\n✗ stale waiver(s) above — a waiver that is no longer true is a lie in a script\n')
  process.exit(1)
}
console.log('\n✓ every screen scrolls and none of them centre their way out of reach\n')
