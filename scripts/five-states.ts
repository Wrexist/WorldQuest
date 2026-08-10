/**
 * Every screen must handle five states: content · loading · empty · error · offline.
 *
 * That rule has been in `PROJECT.md` and both CLAUDE.md files since the first week,
 * and the Definition of Done has carried it as 🟡 "built on the screens that have
 * them; not audited screen-by-screen" for just as long. A rule nobody audits is a
 * rule that decays — this is the audit, as a script, so it stays true.
 *
 * ## What it can and cannot see
 *
 * It reads source for the *shape* of each state, not its correctness. A screen with a
 * loading branch that renders the wrong skeleton passes here. What it does catch is
 * the failure that actually happens: a state nobody remembered at all, which is
 * invisible until a user hits it on a bad connection.
 *
 * ## Waivers are the interesting output
 *
 * Several screens genuinely do not have all five, and saying so precisely is more
 * useful than a checkbox. `Paused` cannot be "loading" — it renders over a lesson
 * that has already loaded. Recording that reasoning next to the screen is the point;
 * an unexplained absence is a finding, an explained one is a decision.
 *
 * Run: pnpm five-states  (part of `pnpm verify`)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MOBILE = join(import.meta.dirname, '..', 'apps', 'mobile')
const FEATURES = join(MOBILE, 'src', 'features')
const ROUTES = join(MOBILE, 'app')

/**
 * A screen and the route that mounts it are audited TOGETHER.
 *
 * `apps/mobile/CLAUDE.md` is explicit that routes fetch and screens render — most
 * screens here take their data as props precisely so they stay mountable by a
 * component test with no router and no query client. So a presentational screen has no
 * loading branch by design, and its loading state lives one file up.
 *
 * Auditing the screen alone reported twelve of fourteen as broken when the states were
 * simply in the other half of a deliberate split. The unit that owes the user five
 * states is the route plus its screen.
 */
function routeSources(): { path: string; code: string }[] {
  const out: { path: string; code: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.tsx')) out.push({ path: full, code: readFileSync(full, 'utf8') })
    }
  }
  walk(ROUTES)
  return out
}

const ROUTE_FILES = routeSources()

type State = 'loading' | 'empty' | 'error' | 'offline'

/**
 * How each state shows up in this codebase. Deliberately broad: the question is
 * "did anyone think about this?", and a false pass is cheaper than a false alarm that
 * teaches people to ignore the script.
 */
const SIGNALS: Record<State, RegExp> = {
  loading: /loading|skeleton|isPending/i,
  // `missing.title` alongside `none.title`: `CountryScreen` handles a deep link to a
  // country the shipped packs do not have, which is that screen's empty state under a
  // different name. Found by stripping comments below — it had been passing on the word
  // "empty" inside the comment that explains the branch.
  empty: /empty|length\s*===\s*0|none\.title|missing\.title/i,
  error: /error|onRetry|FailureState|reload/i,
  offline: /offline|useOnline/i,
}

/**
 * What the signals are allowed to look at: code, not prose and not asset names.
 *
 * Both exclusions are for false PASSES, which are the expensive direction here — a
 * screen reported as handling a state it does not handle is worse than no script.
 *
 * · **Comments.** The signals are single words, and the comments in this codebase
 *   explain exactly the states being searched for — often to record why a state is
 *   deliberately absent. A comment saying "there is no offline state here" would
 *   otherwise register as an offline state. This has now bitten three scripts in this
 *   repo (`reachability` on identifier names, this one on the words "empty string"),
 *   so it is worth doing once, properly.
 *
 * · **Art names.** `<Art name="states/offline" />` is an illustration's identifier. It
 *   is a picture of a paper aeroplane; it is not connectivity handling. It appears in
 *   `SettingsScreen`'s sync section, whose offline waiver is still perfectly true.
 */
const stripProse = (code: string): string =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\bname=(["'])[a-z-]+\/[a-z-]+\1/gi, ' ')

/**
 * Screens that legitimately lack a state, each with the reason.
 *
 * Adding a name here is a design decision and should read like one. "It does not need
 * it" is not a reason; "it renders over something already loaded" is.
 */
const WAIVED: Record<string, Partial<Record<State, string>>> = {
  'lesson/Paused': {
    loading: 'renders over a lesson that has already loaded',
    empty: 'a paused lesson always has a question behind it',
    error: 'no fetch of its own — the runner owns failure',
    offline: 'pausing works identically offline; saying so would be noise',
  },
  'lesson/OutOfHearts': {
    loading: 'a fork shown mid-lesson, after everything is loaded',
    empty: 'reached only when hearts hit zero, which is never an empty state',
    error: 'the purchase path reports its own failure',
  },
  'splash/SplashScreen': {
    empty: 'it IS the loading state; there is nothing to be empty of',
    offline: 'boot does not touch the network — content ships in the binary',
  },
  'welcome/WelcomeBackScreen': {
    empty: 'shown only when there is prior activity to welcome back to',
    loading: 'reads local storage synchronously; there is no wait to show',
    error: 'nothing is fetched — it reports what is already on the device',
    offline: 'everything it shows is local; it is correct with no connection at all',
  },
  'onboarding/OnboardingScreen': {
    // NEW in the iOS pass, and worth saying why it appeared rather than just adding it.
    //
    // This screen used to satisfy `empty` by accident. The age gate was a two-step chip
    // grid, so before a decade was picked the year area had nothing to show and rendered
    // `onboarding:age.pickDecade` — a hint that read to this script as an empty state,
    // and genuinely was one. Replacing the grid with a wheel deleted the condition along
    // with the string: the wheel is generated from the current year and always has 101
    // rows, the first of which is the explicit "Choose a year" row it opens on.
    //
    // So there is no longer a list here that can arrive empty. Nothing on any of the
    // four steps is fetched, counted or filtered — the slides, the years and the three
    // goals are all constants in the binary.
    empty:
      'nothing here is a collection that can arrive empty — the slides and the goals are ' +
      'constants and the year wheel is generated from the current year, so its 101 rows ' +
      'exist before the step does',
    loading: 'nothing is fetched — every step is local until the taster lesson starts',
    error:
      'the same reason as loading: the slides are static and the copy ships in the ' +
      'binary, so there is no request here that can fail. The taster lesson it hands ' +
      'off to has its own error state',
    offline: 'works fully offline by design; the taster needs no server',
  },
  'settings/SettingsScreen': {
    empty: 'a fixed list of settings cannot be empty',
    loading: 'preferences are read synchronously from device storage',
    offline:
      'every setting writes locally and takes effect immediately; the sync row already ' +
      'reports what is queued, and a second banner saying the same thing is noise',
  },
  'streak/StreakScreen': {
    empty: 'zero days is a real content state with its own copy, not an empty state',
    // The `loading` waiver is gone too, and for a reason worth separating from the one
    // below. It said "streak comes from the progress cache, which renders a zero state
    // rather than a wait", which was true and was about this screen's DATA. The freeze
    // button is not data: the purchase is deliberately not optimistic, so pressing it
    // starts a real round trip, and `loading` on the Button is what tells a screen
    // reader that. A screen can owe a wait for an action while owing none for its
    // content.
    //
    // The `error` waiver is gone, and the reason it was ever defensible is the reason it
    // stopped being: it said the server-backed controls "disable themselves and say why".
    // Disabling covers a purchase that cannot be ATTEMPTED. It said nothing about one
    // that was attempted and refused — every `FreezePurchase` status other than
    // `purchased` was dropped, so "you already hold two" and "bought" looked identical.
    // The screen now says which, and that is an error state, so it is no longer waived.
  },
  'quests/QuestScreen': {
    offline:
      'quests are generated on device and progress is counted locally; the only thing ' +
      'needing a server is the reward, which the summary already reports as pending',
  },
}

const screens: { name: string; code: string; mountedBy: number }[] = []
for (const dir of readdirSync(FEATURES, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  for (const file of readdirSync(join(FEATURES, dir.name))) {
    if (!file.endsWith('Screen.tsx') || file.endsWith('.test.tsx')) continue
    const component = file.replace('.tsx', '')
    const own = readFileSync(join(FEATURES, dir.name, file), 'utf8')
    // Every route that mounts this screen, so the split does not read as a gap.
    const mounts = ROUTE_FILES.filter((r) => new RegExp(`\\b${component}\\b`).test(r.code))
    screens.push({
      name: `${dir.name}/${component}`,
      code: stripProse([own, ...mounts.map((m) => m.code)].join('\n')),
      mountedBy: mounts.length,
    })
  }
}

console.log('Five states\n')

let missing = 0
let waived = 0
const stale: string[] = []

for (const screen of screens) {
  const gaps: string[] = []
  const notes: string[] = []

  for (const [state, signal] of Object.entries(SIGNALS) as [State, RegExp][]) {
    const present = signal.test(screen.code)
    const excuse = WAIVED[screen.name]?.[state]

    if (present && excuse !== undefined) {
      // The waiver has been overtaken by the code. Left as a loud note rather than a
      // failure: someone did the work, and the only thing wrong is the paperwork.
      stale.push(`${screen.name} · ${state} — waived as "${excuse}", but the code has it now`)
      continue
    }
    if (present) continue
    if (excuse !== undefined) {
      notes.push(`${state} — ${excuse}`)
      waived++
      continue
    }
    gaps.push(state)
  }

  missing += gaps.length
  const mark = gaps.length === 0 ? '✓' : '✗'
  const via = screen.mountedBy === 0 ? '  (no route mounts this)' : ''
  console.log(
    `  ${mark} ${screen.name}${via}${gaps.length > 0 ? `  — missing: ${gaps.join(', ')}` : ''}`,
  )
  for (const note of notes) console.log(`      · ${note}`)
}

console.log(`\n  ${screens.length} screens · ${waived} waived state(s) with a recorded reason`)

if (stale.length > 0) {
  console.log('\n  Stale waivers — the code now handles these; delete the waiver:')
  for (const line of stale) console.log(`    · ${line}`)
}

if (missing > 0) {
  console.error(
    `\n✗ ${missing} unhandled state(s). Build it, or waive it in scripts/five-states.ts ` +
      `with a reason that says why the state cannot occur — not that it is unimportant.\n`,
  )
  process.exit(1)
}
if (stale.length > 0) {
  console.error('\n✗ stale waiver(s) above — a waiver that is no longer true is a lie in a script\n')
  process.exit(1)
}
console.log('\n✓ every screen handles all five states, or says why it cannot\n')
