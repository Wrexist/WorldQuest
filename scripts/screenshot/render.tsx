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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AnswerOption,
  Button,
  Card,
  ProgressBar,
  Skeleton,
  StatChip,
  colors,
  radius,
  space,
  typography,
} from '@worldquest/design'
import {
  buildIndex,
  composeLesson,
  seededRng,
  type Entity,
  type Fact,
  type Template,
} from '@worldquest/engines'
import { HomeScreen } from '../../apps/mobile/src/features/home/HomeScreen.js'

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

/** A phone-sized frame, so screenshots are comparable to the mockup. */
function Phone({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  return (
    // testID becomes data-testid under react-native-web, so each frame can be
    // cropped individually rather than only as part of the overview.
    <View style={s.phoneWrap} testID={`phone-${id}`}>
      <Text style={s.phoneLabel}>{label}</Text>
      <View style={s.phone}>{children}</View>
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
    : `Which country's flag is ${question.promptParams['description']}?`

  return (
    <View style={s.screen}>
      <View style={s.lessonHeader}>
        <ProgressBar current={2} total={6} showCount={false} style={s.flex} />
        <Text style={s.counter}>2 / 6</Text>
        <StatChip kind="hearts" value={answered && chosenId ? 4 : 5} accessibilityLabel="hearts" />
      </View>

      <Text style={s.prompt}>{prompt}</Text>

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

      <View style={s.phones}>
        <Phone label="Home · first launch" id="home-first">
          <HomeScreen
            progress={{ xpTotal: 0, coins: 0, streak: 0, factsMastered: 0, factsTotal: 10 }}
            loading={false}
            isOffline={false}
            onStartLesson={() => {}}
          />
        </Phone>

        <Phone label="Home · returning user" id="home-returning">
          <HomeScreen
            progress={{ xpTotal: 4820, coins: 430, streak: 12, factsMastered: 7, factsTotal: 10 }}
            loading={false}
            isOffline={false}
            onStartLesson={() => {}}
          />
        </Phone>

        <Phone label="Home · loading (skeleton)" id="home-loading">
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

        <Phone label="Lesson · screen-reader-safe flag question" id="lesson-flag">
          <LessonView question={flagQuestion} answered={false} />
        </Phone>

        <Phone label="Home · offline" id="home-offline">
          <HomeScreen
            progress={{ xpTotal: 4820, coins: 430, streak: 12, factsMastered: 7, factsTotal: 10 }}
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
  h1: {
    fontSize: 30, fontWeight: '800', color: colors.text.primary,
    fontFamily: typography.fontFamily.display,
  },
  h2: { fontSize: 20, fontWeight: '700', color: colors.text.primary, marginTop: space[5] },
  lede: { fontSize: 15, color: colors.text.secondary, maxWidth: 720 },
  phones: { flexDirection: 'row', flexWrap: 'wrap', gap: space[5] },
  phoneWrap: { gap: space[2] },
  phoneLabel: {
    fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
    color: colors.text.tertiary, fontWeight: '700',
  },
  phone: {
    width: 300, height: 640, borderRadius: 26, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border.subtle, backgroundColor: colors.bg.canvas,
  },
  screen: { flex: 1, backgroundColor: colors.bg.canvas, padding: space[4], gap: space[4] },
  lessonHeader: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  flex: { flex: 1 },
  counter: {
    fontSize: 13, fontWeight: '700', color: colors.status.progress,
    fontVariant: ['tabular-nums'],
  },
  prompt: {
    fontSize: typography.scale.h2.size, lineHeight: typography.scale.h2.lineHeight,
    fontWeight: '700', color: colors.text.primary, textAlign: 'center',
    fontFamily: typography.fontFamily.display, marginTop: space[3],
  },
  options: { gap: space[2], marginTop: 'auto' },
  feedback: { gap: space[2] },
  feedbackOk: {
    fontSize: typography.scale.h2.size, fontWeight: '700', color: colors.feedback.correct,
  },
  feedbackTitle: { fontSize: 17, fontWeight: '600', color: colors.text.primary },
  feedbackBody: {
    fontSize: 15, lineHeight: 22, color: colors.text.secondary,
  },
  row: { flexDirection: 'row', gap: space[2] },
  footer: { paddingBottom: space[2] },
  bench: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4] },
  cell: {
    width: 280, gap: space[3], padding: space[4],
    backgroundColor: colors.bg.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border.subtle,
  },
  cellLabel: {
    fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
    color: colors.text.tertiary, fontWeight: '700',
  },
})

AppRegistry.registerComponent('WorldQuest', () => Gallery)

const { element, getStyleElement } = (
  AppRegistry as unknown as {
    getApplication: (n: string) => { element: unknown; getStyleElement: () => unknown }
  }
).getApplication('WorldQuest')

process.stdout.write(
  `<!doctype html><html><head><meta charset="utf-8">` +
    `<title>WorldQuest</title>` +
    `${renderToStaticMarkup(getStyleElement() as never)}` +
    // Inter and Baloo 2 are not installed in a build container, so the tokens'
    // font families would silently fall back to a SERIF face and make these
    // screenshots misrepresent the design. Substitute the nearest available sans
    // and say so on the page — type is the one thing this cannot verify.
    `<style>
       html,body,#root{margin:0;background:#00050F}
       *{font-family:"DejaVu Sans","Liberation Sans",FreeSans,Arial,sans-serif !important}
     </style>` +
    `</head><body><div id="root">${renderToStaticMarkup(element as never)}</div></body></html>`,
)
