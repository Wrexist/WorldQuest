/**
 * Renders the REAL app components to HTML so they can be screenshotted.
 *
 * This is not a mockup. It imports the same primitives the app imports, feeds them
 * questions from the real content engine over the real packs, and lays them out at
 * phone size. What it cannot reproduce is anything genuinely native — shadow
 * rendering, the system font stack, haptics, and motion. Those need a device.
 *
 * Run: pnpm screenshot
 */

import { AppRegistry, ScrollView, StyleSheet, Text, View } from 'react-native'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import {
  AnswerOption,
  Button,
  Card,
  ProgressBar,
  Skeleton,
  StatChip,
  TabBar,
  FONT_FAMILIES,
  colors,
  radius,
  space,
  text,
} from '@worldquest/design'
import nav from '../../packages/i18n/locales/en/nav.json'
import {
  buildIndex,
  composeLesson,
  emptyProgress,
  generateDailyQuest,
  gradeLesson,
  seededRng,
  worldProgress,
  type Entity,
  type Fact,
  type Template,
} from '@worldquest/engines'
import { Flag } from '../../apps/mobile/src/components/Flag.js'
import { HomeScreen } from '../../apps/mobile/src/features/home/HomeScreen.js'
import { AchievementsScreen } from '../../apps/mobile/src/features/achievements/AchievementsScreen.js'
import { CATALOGUE } from '../../apps/mobile/src/features/achievements/useAchievements.js'
import { CountryScreen } from '../../apps/mobile/src/features/explore/CountryScreen.js'
import { LessonSummary } from '../../apps/mobile/src/features/lesson/LessonSummary.js'
import { ExploreScreen } from '../../apps/mobile/src/features/explore/ExploreScreen.js'
import { ProfileScreen } from '../../apps/mobile/src/features/profile/ProfileScreen.js'
import { QuestScreen } from '../../apps/mobile/src/features/quests/QuestScreen.js'
import { SettingsScreen } from '../../apps/mobile/src/features/settings/SettingsScreen.js'
import { DEFAULTS as SETTINGS_DEFAULTS } from '../../apps/mobile/src/features/settings/usePreferences.js'

// ── real content, loaded from the real packs ────────────────────────────────
const packs = join(process.cwd(), 'packages', 'content', 'packs', 'geography')
const read = <T,>(f: string): T[] =>
  (JSON.parse(readFileSync(join(packs, f), 'utf8')) as { items: T[] }).items

const index = buildIndex({
  entities: read<Entity>('entities.countries.v1.json'),
  facts: [...read<Fact>('facts.capitals.v1.json'), ...read<Fact>('facts.flags.v1.json')],
  templates: read<Template>('templates.v1.json'),
})

const questions = composeLesson({
  index,
  memory: [],
  now: Date.parse('2026-07-31T19:00:00Z'),
  rng: seededRng(7),
  locale: 'en',
  count: 6,
})

const capitalQuestion =
  questions.find((q) => q.item.templateId === 'tpl.capital.mc4') ?? questions[0]!
const flagQuestion =
  questions.find((q) => q.item.templateId === 'tpl.flag-describe.mc4') ?? questions[1]!
/**
 * The PICTURE flag question — the mockup's lesson screen.
 *
 * It was unreachable for the life of the project: `PRESENTABLE` excluded `image`
 * because no flag file existed, so this frame could not be drawn and the gallery
 * showed only the described sibling beside it. Both belong here — they are what a
 * sighted and a screen-reader user each get for the same fact.
 */
const flagImageQuestion = questions.find((q) => q.item.templateId === 'tpl.flag-to-country.mc4')

/**
 * Two graded lessons for the summary frames — GRADED, not hand-written.
 *
 * Every other number in this file is a display value with no arithmetic behind it, so
 * a literal is honest. These are not: XP and coins come out of the balance table
 * through `gradeLesson`, and typing "+62 XP" here would put a figure on a screenshot
 * that the economy cannot actually produce. Running the real grader means the picture
 * is a claim we can defend, and it moves when the balance moves.
 */
const answeredAt = Date.parse('2026-07-31T19:02:00Z')
const answersFrom = (correct: readonly boolean[]) =>
  questions.slice(0, correct.length).map((q, i) => ({
    itemId: q.item.id,
    factId: q.item.factId,
    templateId: q.item.templateId,
    chosenOptionId: q.options.find((o) => o.isCorrect === correct[i])?.id ?? null,
    wasCorrect: correct[i]!,
    // Above MIN_CREDIBLE_ANSWER_MS and above the speed-bonus threshold, so the frames
    // show an ordinary lesson rather than a best case nobody will match.
    elapsedMs: 5_200,
    answeredAt: answeredAt + i * 5_200,
  }))

const graded = (correct: readonly boolean[]) =>
  gradeLesson({
    lessonId: 'shot',
    answers: answersFrom(correct),
    memory: new Map(),
    now: answeredAt,
  })

const PERFECT_LESSON = graded([true, true, true, true, true, true])
/** Left after three questions, one of them wrong — the shape of a real early exit. */
const SHORT_LESSON = graded([true, false, true])

/** The countries those lessons touched — real entities, so the flags are the right ones. */
const practisedFrom = (count: number) => {
  const seen = new Set<string>()
  return questions.slice(0, count).flatMap((q) => {
    const entity = index.entities.get(q.item.entityId)
    if (entity === undefined || seen.has(entity.id)) return []
    seen.add(entity.id)
    return [{
      id: entity.id,
      flagPath: entity.assets?.['flag']?.path,
      name: entity.names?.['en'] ?? entity.id,
    }]
  })
}

/** Exactly the state the mockup depicts, so the two can be compared directly. */
const MOCKUP_STATE = {
  xpTotal: 4820,
  coins: 430,
  streak: 12,
  factsMastered: 7,
  factsTotal: 10,
  questTitle: 'Europe II',
  questDone: 7,
  questTotal: 10,
  challengeIn: '14:22:18',
  friendsOnline: 12,
  leagueTier: 'Gold I',
  leaguePercentile: 'Top 15%',
}

/**
 * A partly-learned world for the Profile frame.
 *
 * The stat card and the continent bars come from different sources in the real app
 * (server vs local memory), so the harness must feed them CONSISTENT data — a
 * screenshot showing "7 mastered" above "0 of 10 learned" would depict a bug and
 * invite someone to build against it.
 */
const PROFILE_WORLD = worldProgress(
  index,
  new Map(
    [...index.facts.keys()].slice(0, 6).map((factId) => [
      factId,
      {
        factId,
        stability: 400,
        difficulty: 5,
        reps: 8,
        lapses: 0,
        lastReviewAt: Date.parse('2026-07-30T19:00:00Z'),
        dueAt: Date.parse('2026-10-01T19:00:00Z'),
        suspended: false,
      },
    ]),
  ),
  Date.parse('2026-07-31T19:00:00Z'),
)

/**
 * The tab bar the navigator draws around every tabbed screen. Screens no longer own
 * their own chrome (app/(tabs)/_layout.tsx does), so the harness has to supply it —
 * otherwise these screenshots would show a Home screen that ends 60px short of the
 * one users see.
 */
const TABS = [
  { key: 'index', glyph: '⌂', label: nav['nav:home'] },
  { key: 'explore', glyph: '◎', label: nav['nav:explore'] },
  { key: 'quests', glyph: '◈', label: nav['nav:quests'] },
  { key: 'profile', glyph: '☺', label: nav['nav:profile'] },
  { key: 'more', glyph: '⋯', label: nav['nav:more'] },
]

/** A phone-sized frame, so screenshots are comparable to the mockup. */
function Phone({
  label,
  id,
  tab,
  children,
}: {
  label: string
  id: string
  /** Active tab key, when this frame is a tabbed screen rather than a full-screen one. */
  tab?: string
  children: React.ReactNode
}) {
  return (
    // testID becomes data-testid under react-native-web, so each frame can be
    // cropped individually rather than only as part of the overview.
    <View style={s.phoneWrap} testID={`phone-${id}`}>
      <Text style={s.phoneLabel}>{label}</Text>
      <View style={s.phone}>
        <View style={s.flex}>{children}</View>
        {tab !== undefined && <TabBar items={TABS} activeKey={tab} onSelect={() => {}} />}
      </View>
    </View>
  )
}

/** The lesson screen's presentational layer, driven by a real generated question. */
function LessonView({
  question,
  answered,
  chosenId,
}: {
  question: typeof capitalQuestion
  answered: boolean
  chosenId?: string
}) {
  const correct = question.options.find((o) => o.isCorrect)!
  const prompt = question.promptKey.includes('capital_of')
    ? `What is the capital of ${question.promptParams['entityName']}?`
    : question.promptKey.includes('which_flag')
      ? `Which country's flag is this?`
      : `Which country's flag is ${question.promptParams['description']}?`

  return (
    <View style={s.screen}>
      <View style={s.lessonHeader}>
        <ProgressBar current={2} total={6} showCount={false} style={s.flex} />
        <Text style={s.counter}>2 / 6</Text>
        <StatChip kind="hearts" value={answered && chosenId ? 4 : 5} accessibilityLabel="hearts" />
      </View>

      <Text style={s.prompt}>{prompt}</Text>

      {/* The real `Flag` component and the real asset, unlike the rest of this
          reconstruction — there is nothing stateful about an image, so there is no
          reason to fake one. */}
      {question.promptAsset !== undefined && (
        <View style={s.promptArt}>
          <Flag path={question.promptAsset} width={200} label={prompt} />
        </View>
      )}

      <View style={s.options}>
        {question.options.map((o) => (
          <AnswerOption
            key={o.id}
            label={o.label}
            state={
              !answered
                ? 'idle'
                : o.isCorrect
                  ? 'correct'
                  : o.id === chosenId
                    ? 'wrong'
                    : 'disabled'
            }
            onPress={() => {}}
          />
        ))}
      </View>

      {answered && (
        <Card level={2} style={s.feedback}>
          {chosenId === undefined ? (
            <>
              <Text style={s.feedbackOk}>Perfect!</Text>
              <View style={s.row}>
                <StatChip kind="xp" value="+10" accessibilityLabel="10 XP" />
                <StatChip kind="coin" value="+5" accessibilityLabel="5 coins" />
              </View>
            </>
          ) : (
            <>
              <Text style={s.feedbackTitle}>
                That&apos;s {question.options.find((o) => o.id === chosenId)?.label}.
              </Text>
              <Text style={s.feedbackBody}>
                {question.hint
                  ? `${correct.label} is ${question.hint}.`
                  : `The answer is ${correct.label}.`}
              </Text>
            </>
          )}
        </Card>
      )}

      <View style={s.footer}>
        {answered && <Button label="Continue" onPress={() => {}} />}
      </View>
    </View>
  )
}

function Gallery() {
  return (
    <ScrollView style={s.page} contentContainerStyle={s.pageContent}>
      <Text style={s.h1}>WorldQuest — real components, real content</Text>
      <Text style={s.lede}>
        Rendered from the app&apos;s own source via react-native-web. Questions come from
        the content engine over the shipped packs — not hand-written.
      </Text>
      <Text style={s.lede}>
        One exception, stated because an unmarked one is a lie: the four lesson frames
        use a reconstruction of the lesson screen&apos;s presentational layer, not
        LessonScreen itself, which owns its own state machine and cannot be frozen
        mid-answer from here. Every other frame imports the real component. That
        reconstruction has drifted once already — it bottom-anchored the answers and
        invented a void the app never had.
      </Text>

      <View style={s.phones}>
        <Phone label="Home · first launch" id="home-first" tab="index">
          <HomeScreen
            progress={{ xpTotal: 0, coins: 0, streak: 0, factsMastered: 0, factsTotal: 10 }}
            loading={false}
            isOffline={false}
            onStartLesson={() => {}}
          />
        </Phone>

        <Phone label="Home · returning user" id="home-returning" tab="index">
          <HomeScreen
            progress={MOCKUP_STATE}
            loading={false}
            isOffline={false}
            onStartLesson={() => {}}
          />
        </Phone>

        <Phone label="Home · loading (skeleton)" id="home-loading" tab="index">
          <HomeScreen progress={null} loading isOffline={false} onStartLesson={() => {}} />
        </Phone>

        <Phone label="Lesson · question" id="lesson-question">
          <LessonView question={capitalQuestion} answered={false} />
        </Phone>

        <Phone label="Lesson · correct" id="lesson-correct">
          <LessonView question={capitalQuestion} answered />
        </Phone>

        <Phone label="Lesson · wrong (not punished)" id="lesson-wrong">
          <LessonView
            question={capitalQuestion}
            answered
            chosenId={capitalQuestion.options.find((o) => !o.isCorrect)!.id}
          />
        </Phone>

        {flagImageQuestion !== undefined && (
          <Phone label="Lesson · flag question" id="lesson-flag-image">
            <LessonView question={flagImageQuestion} answered={false} />
          </Phone>
        )}

        <Phone label="Lesson · screen-reader-safe flag question" id="lesson-flag">
          <LessonView question={flagQuestion} answered={false} />
        </Phone>

        {/* The real component, not a reconstruction — the summary is presentational,
            so unlike the four frames above it can be rendered straight from source. */}
        <Phone label="Lesson · summary (perfect)" id="lesson-summary">
          <LessonSummary
            result={PERFECT_LESSON}
            practised={practisedFrom(6)}
            wasAbandoned={false}
            isOffline={false}
            onExit={() => {}}
          />
        </Phone>

        <Phone label="Lesson · summary (left early)" id="lesson-summary-early">
          <LessonSummary
            result={SHORT_LESSON}
            practised={practisedFrom(3)}
            wasAbandoned
            isOffline={false}
            onExit={() => {}}
          />
        </Phone>

        <Phone label="Achievements" id="achievements">
          <AchievementsScreen
            rows={CATALOGUE.map((def) => ({
              def,
              progress:
                def.id === 'ach.quest.regular'
                  ? { achievementId: def.id, value: 7, tier: 'bronze' as const }
                  : def.id === 'ach.flags.collector'
                    ? { achievementId: def.id, value: 15, tier: 'bronze' as const }
                    : emptyProgress(def.id),
            }))}
          />
        </Phone>

        <Phone label="Country · half learned" id="country">
          <CountryScreen
            name="Sweden"
            region="EU"
            // The real artwork, so this gallery shows what ships rather than the
            // placeholder that stood in for it. See the warning below about the one
            // frame here that is NOT the real component.
            assetPath="flags/SE.png"
            facts={[
              {
                id: 'geo.SE.capital',
                attribute: 'capital',
                value: 'Stockholm',
                mastery: 'unseen',
                due: false,
                source: {
                  name: 'UN Statistics Division, M49 standard',
                  verifiedAt: '2026-07-31',
                },
              },
              {
                id: 'geo.SE.flag',
                attribute: 'flag',
                value: 'a yellow Nordic cross on a blue field',
                mastery: 'mastered',
                due: true,
              },
            ]}
            progress={{
              entityId: 'SE',
              mastery: 'unseen',
              factsTotal: 2,
              factsLearned: 1,
              factsDue: 1,
              factsSeen: 1,
              complete: false,
            }}
            onPractise={() => {}}
          />
        </Phone>

        <Phone label="Quests · today's five" id="quests" tab="quests">
          <QuestScreen
            quest={generateDailyQuest({
              userId: 'demo',
              date: '2026-07-31',
              index,
              memory: new Map(),
              now: Date.parse('2026-07-31T19:00:00Z'),
              rng: seededRng(3),
              recentAccuracy: 0.92,
            })}
            loading={false}
            onStart={() => {}}
          />
        </Phone>

        <Phone label="Explore · continents" id="explore" tab="explore">
          <ExploreScreen
            world={worldProgress(index, new Map(), Date.parse('2026-07-31T19:00:00Z'))}
            loading={false}
            onSelectRegion={() => {}}
          />
        </Phone>

        <Phone label="Profile · returning user" id="profile" tab="profile">
          <ProfileScreen
            stats={{
              xpTotal: 4820,
              coins: 430,
              streak: 12,
              longestStreak: 31,
              factsMastered: PROFILE_WORLD.factsLearned,
            }}
            world={PROFILE_WORLD}
            loading={false}
            onCreateAccount={() => {}}
          />
        </Phone>

        <Phone label="More · settings" id="settings" tab="more">
          <SettingsScreen
            version="0.1.0"
            preferences={SETTINGS_DEFAULTS}
            onChange={() => {}}
            onOpenPrivacyPolicy={() => {}}
            onOpenTerms={() => {}}
          />
        </Phone>

        <Phone label="Home · offline" id="home-offline" tab="index">
          <HomeScreen
            progress={MOCKUP_STATE}
            loading={false}
            isOffline
            onStartLesson={() => {}}
          />
        </Phone>
      </View>

      <Text style={s.h2}>Primitives</Text>
      <View style={s.bench}>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Button</Text>
          <Button label="Continue" onPress={() => {}} />
          <Button label="Start Quest" variant="secondary" onPress={() => {}} />
          <Button label="Maybe later" variant="tertiary" onPress={() => {}} />
          <Button label="Log Out" variant="destructive" onPress={() => {}} />
          <Button label="Disabled" disabled onPress={() => {}} />
        </View>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Answer states</Text>
          <AnswerOption label="Idle" onPress={() => {}} />
          <AnswerOption label="Selected" state="selected" onPress={() => {}} />
          <AnswerOption label="Correct" state="correct" onPress={() => {}} />
          <AnswerOption label="Wrong" state="wrong" onPress={() => {}} />
        </View>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Progress &amp; chips</Text>
          <ProgressBar current={172} total={195} label="Flags" />
          <ProgressBar current={7} total={10} label="Today" />
          <View style={s.row}>
            <StatChip kind="xp" value={12850} accessibilityLabel="xp" />
            <StatChip kind="coin" value={430} accessibilityLabel="coins" />
          </View>
          <View style={s.row}>
            <StatChip kind="streak" value={12} accessibilityLabel="streak" />
            <StatChip kind="hearts" value={5} accessibilityLabel="hearts" />
          </View>
        </View>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Skeleton</Text>
          <Skeleton width="60%" />
          <Skeleton />
          <Skeleton width="80%" />
          <Skeleton height={48} borderRadius={radius.md} />
        </View>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#00050F' },
  pageContent: { padding: space[6], gap: space[5] },
  h1: { ...text('h1'), color: colors.text.primary },
  h2: { ...text('h3'), color: colors.text.primary, marginTop: space[5] },
  lede: { ...text('body'), color: colors.text.secondary, maxWidth: 720 },
  phones: { flexDirection: 'row', flexWrap: 'wrap', gap: space[5] },
  phoneWrap: { gap: space[2] },
  phoneLabel: { ...text('overline'), color: colors.text.tertiary },
  phone: {
    width: 375, height: 812, borderRadius: 30, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border.subtle, backgroundColor: colors.bg.canvas,
  },
  screen: { flex: 1, backgroundColor: colors.bg.canvas, padding: space[4], gap: space[4] },
  lessonHeader: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  flex: { flex: 1 },
  counter: { ...text('caption', { weight: '700', numeric: true }), color: colors.status.progress },
  prompt: { ...text('h2'), color: colors.text.primary, textAlign: 'center', marginTop: space[3] },
  promptArt: { alignItems: 'center' },
  // No `marginTop: 'auto'` here — that is what the real screen does NOT do, and
  // putting it here bottom-anchored the answers and manufactured a half-screen void
  // above them that does not exist in the app. Measured in the shipped bundle at
  // 390×844: heading at y=76, first option at y=160, a 24px gap. The app flows from
  // the top; only the footer is pinned.
  options: { gap: space[2] },
  feedback: { gap: space[2] },
  feedbackOk: { ...text('h2'), color: colors.feedback.correct },
  feedbackTitle: { ...text('h3'), color: colors.text.primary },
  feedbackBody: { ...text('body'), color: colors.text.secondary },
  row: { flexDirection: 'row', gap: space[2] },
  // The real screen puts the footer OUTSIDE its ScrollView, so Continue sits at the
  // bottom of the screen while the question scrolls. This flat column reproduces that
  // with `marginTop: 'auto'` on the footer — the same visual result, same place.
  footer: { paddingBottom: space[2], marginTop: 'auto' },
  bench: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4] },
  cell: {
    width: 280, gap: space[3], padding: space[4],
    backgroundColor: colors.bg.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border.subtle,
  },
  cellLabel: { ...text('overline'), color: colors.text.tertiary },
})

AppRegistry.registerComponent('WorldQuest', () => Gallery)

const { element, getStyleElement } = (
  AppRegistry as unknown as {
    getApplication: (n: string) => { element: unknown; getStyleElement: () => unknown }
  }
).getApplication('WorldQuest')

/**
 * Embeds the REAL font files as data URIs.
 *
 * Until now these screenshots substituted DejaVu Sans, because the real faces are
 * not installed in a build container — so every screenshot misrepresented the single
 * most visible part of the design. The fonts ship in node_modules via
 * @expo-google-fonts, so there is no reason to guess: embed them and the page renders
 * in the same faces the phone does.
 *
 * The family names are the token values, so a font the app loads and this does not
 * (or vice versa) shows up as an obviously wrong screenshot rather than as nothing.
 */
function fontFaces(): string {
  // Resolved from the app rather than from here: pnpm does not hoist, so the font
  // packages live under apps/mobile even though this script runs at the repo root.
  // `import.meta.url` is not usable — esbuild bundles this to CommonJS.
  const from = [join(process.cwd(), 'apps', 'mobile')]
  const require_ = createRequire(join(process.cwd(), 'index.js'))
  const resolve = (pkg: string): string =>
    dirname(require_.resolve(`${pkg}/package.json`, { paths: from }))

  const dirs = {
    Nunito: resolve('@expo-google-fonts/nunito'),
  }

  // `FONT_FAMILIES` is derived from every weight named in tokens.json, so the same
  // face appears once per role that uses it — Nunito_700Bold is both a heading and a
  // button. Embedding it per occurrence would inline the same ~200 kB of base64 twice.
  const unique = [...new Set(FONT_FAMILIES)]

  return unique
    .map((family) => {
      // `Nunito_700Bold` → package root, then `700Bold/Nunito_700Bold.ttf`.
      //
      // @expo-google-fonts ships one directory per weight; the files are NOT flat at
      // the package root. This script assumed flat and broke the moment the type
      // system moved to Nunito — silently, in the sense that nobody runs `pnpm
      // screenshot` on every commit, so the checked-in comparison images kept showing
      // the previous typeface while the app had already changed.
      const [prefix, ...rest] = family.split('_')
      const dir = dirs[prefix as keyof typeof dirs]
      const path = join(dir, rest.join('_'), `${family}.ttf`)
      if (!existsSync(path)) {
        throw new Error(
          `Font file not found for "${family}":\n  ${path}\n\n` +
            'The design tokens name a weight that @expo-google-fonts does not ship at ' +
            'that path.\nCheck the weight exists in tokens.json AND in ' +
            'apps/mobile/src/lib/fonts.ts — a screenshot in the wrong face is worse ' +
            'than no screenshot, because it looks finished.',
        )
      }
      const ttf = readFileSync(path).toString('base64')
      // No `font-weight` descriptor on purpose: each file IS its own family here,
      // exactly as React Native treats it. Declaring a weight would let the browser
      // synthesise the others and hide the very mistake this mirrors.
      return `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${ttf}) format("truetype")}`
    })
    .join('')
}

const body = renderToStaticMarkup(element as never)

/**
 * Fail rather than screenshot a broken string.
 *
 * ICU formatting has now silently regressed twice through module-interop differences
 * between Node, esbuild and Metro — each time rendering the raw pattern
 * (`{count, plural, one {# day streak} ...}`) instead of words. The library's default
 * behaviour is to swallow the error, so nothing failed; the only signal was a
 * screenshot nobody had looked at yet. This turns that into an exit code.
 */
const leaked = body.match(/\{[a-zA-Z_]+(?:\s*,\s*(?:plural|select|selectordinal|number|date))?\s*[,}]/)
if (leaked) {
  process.stderr.write(
    `\n✗ an unformatted i18n placeholder reached the markup: ${leaked[0]}\n` +
      `  The ICU formatter is not running. See packages/i18n/src/icu.ts.\n\n`,
  )
  process.exit(1)
}

process.stdout.write(
  `<!doctype html><html><head><meta charset="utf-8">` +
    `<title>WorldQuest</title>` +
    `${renderToStaticMarkup(getStyleElement() as never)}` +
    `<style>${fontFaces()}html,body,#root{margin:0;background:#00050F}</style>` +
    `</head><body><div id="root">${body}</div></body></html>`,
)
