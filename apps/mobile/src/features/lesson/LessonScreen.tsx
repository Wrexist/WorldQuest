/**
 * The lesson screen — mockup screens 5 and 6.
 *
 * Phase 1 is deliberately ugly: real logic, real data, minimal polish. Design lands
 * in weeks 3–6 (docs/plan/build-order.md). What is NOT deferred is anything that is
 * expensive to retrofit — every string is a key, every colour is a token, every
 * control is labelled, and the five states are all present.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  AnswerOption,
  Button,
  Card,
  ProgressBar,
  Skeleton,
  colors,
  radius,
  space,
  text,
} from '@worldquest/design'
import { deriveRating, lessonLength } from '@worldquest/engines'
import type { ContentIndex, GradeResult, LessonState, Question } from '@worldquest/engines'
import { Flag } from '../../components/Flag.js'
import { CountryMap } from '../../components/CountryMap.js'
import { useLesson } from './hooks/useLesson.js'
import { LessonSummary, type PractisedCountry } from './LessonSummary.js'
import { SPEED_SECONDS } from './modes.js'
import { OutOfHearts } from './OutOfHearts.js'
import { Paused } from './Paused.js'
import { recordPace, useItemPace } from './usePace.js'
import { hapticCelebrate, hapticCorrect, hapticWrong } from '../../lib/haptics.js'
import { soundCorrect, soundLevelUp, soundWrong } from '../../lib/sound.js'
import { recordLessonForAchievements } from '../achievements/progress.js'
import { todaysQuest } from '../quests/useDailyQuest.js'
import { recordQuestEvent } from '../quests/questProgress.js'
import { useContent } from '../../lib/content.js'
import { currentLocale, tContent, useT } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { recordLessonCompleted } from '../profile/useWeekActivity.js'
import { enqueueLesson } from '../../lib/sync.js'
import { Icon } from '../../components/Icon.js'
import { Stat } from '../../components/Stat.js'

type ScreenState = 'loading' | 'error' | 'empty' | 'ready'

/**
 * How wide the flag in an image question is drawn.
 *
 * 200pt, and the asset is rasterised at exactly 3x of it (`scripts/build-flags.cjs`)
 * so it is never upscaled. Big enough that the question is a fair one — telling Mexico
 * from Italy is a question about the coat of arms, and at tile size that is a smudge —
 * and small enough that the four answers below it stay on screen at 320pt.
 */
const FLAG_PROMPT_WIDTH = 200

/**
 * The locator map beside a question.
 *
 * The same 200pt as the flag prompt, because it is now the same kind of object: the
 * map is framed on the country rather than on its continent, so it carries real
 * information at a glance instead of being a decorative smudge that had to be kept
 * small to avoid wasting space. Four answers still fit below it at 320pt.
 */
const LOCATOR_WIDTH = 200

/**
 * A map question's map — the prompt itself rather than context beside one.
 *
 * 240 rather than the locator's 200: this is the only thing on screen carrying the
 * question, and the country is drawn at 46 % of the frame, so the shape a user has to
 * recognise is smaller than the picture. Four answers still fit below it at 320pt.
 */
const MAP_PROMPT_WIDTH = 240

/**
 * What the lesson tells whoever mounted it on the way out.
 *
 * The route decides where the user goes next, and after the taster that decision
 * depends on what just happened — the paywall's first page is about the countries
 * this lesson covered. Passing the count out beats the route re-deriving it from
 * content it does not have.
 */
export type LessonExit = {
  /** Entity ids, in the order they were practised. Stable codes, safe in a URL. */
  readonly practised: readonly string[]
}

export function LessonScreen({
  onExit,
  mode = 'normal',
  coins = 0,
  isTaster = false,
}: {
  onExit: (summary: LessonExit) => void
  /** `speed` runs the same items against a clock. Scoring is unchanged. */
  mode?: 'normal' | 'speed'
  /**
   * The user's coin balance, for the out-of-hearts fork.
   *
   * A prop rather than a `useProgress()` call inside: that is server state behind
   * TanStack Query, and fetching it here would make the whole lesson runner
   * unmountable without a QueryClientProvider — for a number one rare branch reads.
   * Routes fetch, screens delegate (apps/mobile/CLAUDE.md).
   */
  coins?: number
  /**
   * True only for the one lesson handed over from onboarding.
   *
   * Finishing it is the single biggest predictor of a user coming back, so it gets
   * its own event. Inferring it later from "the first `lesson_completed` we ever saw"
   * would be wrong for every reinstall, and activation numbers that quietly count
   * reinstalls are worse than no activation numbers.
   */
  isTaster?: boolean
}) {
  const t = useT()
  const { index, memory, status, reload, isOffline } = useContent()
  const [screen, setScreen] = useState<ScreenState>('loading')

  // Sized from the user's own pace, not a hardcoded ten. `lessonLength` aims at a
  // two-minute lesson so that "five minutes a day" is a real promise rather than a
  // number in Settings — see features/lesson/usePace.ts for why this was inert.
  const itemMs = useItemPace()
  const questions = useMemo<readonly Question[]>(() => {
    if (status !== 'ready' || !index) return []
    return index.compose({ count: lessonLength(itemMs) })
  }, [status, index, itemMs])

  const handleComplete = useCallback((state: LessonState, optimistic: GradeResult) => {
    // Enqueue, never await. A lesson finishing must not depend on the network —
    // the queue replays it whenever connectivity returns.
    enqueueLesson({
      lessonId: state.lessonId,
      kind: 'lesson',
      startedAt: state.startedAt ?? Date.now(),
      answers: state.answers,
    })
    // Local, immediate, and independent of the queue. The weekly chart on Profile
    // must be right the moment the lesson ends — waiting for the server round trip
    // would show an empty week to anyone who finishes a lesson offline.
    recordLessonCompleted()
    hapticCelebrate()
    soundLevelUp()
    // The user's pace, from the answers just given. Sizes every later lesson.
    recordPace(state.answers)

    // Achievements, evaluated on device. Optimistic like the XP above — the server
    // is still the authority on the coins an unlock pays out (ADR 0006). Without
    // this the achievements screen could never show a single unlock.
    const durationMs = Date.now() - (state.startedAt ?? Date.now())
    for (const unlock of recordLessonForAchievements({
      accuracy: optimistic.accuracy,
      durationMs,
      at: Date.now(),
    })) {
      // `days_to_unlock` is not sent. We would have to know when the user started,
      // and nothing records that — a number derived from "first lesson we happen to
      // have logged locally" would read as install-to-unlock and be wrong for every
      // reinstall. Better absent than confidently wrong.
      track('achievement_unlocked', { achievement_id: unlock.achievementId, tier: unlock.tier })
    }

    // Today's quest, advanced. Regenerated rather than held: it is deterministic per
    // (user, day), and a second copy of the seed logic would mean the screen showed
    // one quest while the lesson ticked another.
    if (index !== null) {
      const quest = todaysQuest(index.index, memory)
      const done = recordQuestEvent(quest, {
        type: 'lesson_completed',
        accuracy: optimistic.accuracy,
        durationMs,
      })
      if (done.length > 0) track('quest_completed', { quest_id: quest.date })
      for (const answer of state.answers) {
        if (answer.chosenOptionId === null) continue
        recordQuestEvent(quest, {
          type: 'fact_answered',
          factId: answer.factId,
          correct: answer.wasCorrect,
        })
      }
    }

    track('lesson_completed', {
      lesson_id: state.lessonId,
      kind: 'lesson',
      items: optimistic.items,
      correct: optimistic.correct,
      accuracy: optimistic.accuracy,
      duration_ms: Date.now() - (state.startedAt ?? Date.now()),
      hearts_lost: 5 - state.hearts,
      xp_awarded: optimistic.xpAwarded,
      was_offline: isOffline,
    })

    // Fired ALONGSIDE `lesson_completed`, never instead of it. The taster is a real
    // lesson and belongs in the lesson numbers too; this is an extra fact about it,
    // not a different kind of thing.
    if (isTaster) {
      track('taster_lesson_completed', {
        accuracy: optimistic.accuracy,
        duration_ms: Date.now() - (state.startedAt ?? Date.now()),
      })
    }
  }, [isOffline, index, memory, isTaster])

  const timeLimitMs = mode === 'speed' ? SPEED_SECONDS * 1000 : null
  const lesson = useLesson({ questions, memory, timeLimitMs, onComplete: handleComplete })

  /**
   * Watch this number. If it is high the mechanic is too punishing — which is the
   * whole reason the balance table caps hearts per lesson rather than per day.
   *
   * Keyed on the flag rather than fired from the answer handler so it cannot double-
   * fire on a re-render, and `outOfHearts` only ever goes false again via REVIVE.
   */
  useEffect(() => {
    if (!lesson.state.outOfHearts) return
    track('hearts_depleted', { at_item: lesson.state.index })
  }, [lesson.state.outOfHearts, lesson.state.index])

  useEffect(() => {
    if (status === 'loading') return setScreen('loading')
    if (status === 'error') return setScreen('error')
    if (questions.length === 0) return setScreen('empty')
    setScreen('ready')
    if (lesson.state.phase === 'idle') {
      lesson.start(makeLessonId())
      track('lesson_started', {
        lesson_id: 'pending',
        kind: 'lesson',
        item_count: questions.length,
        source: 'home',
        was_offline: isOffline,
      })
    }
  }, [status, questions, lesson, isOffline])

  if (screen === 'loading') return <LoadingState />
  if (screen === 'error') return <ErrorState onRetry={reload} />
  if (screen === 'empty') return <EmptyState />

  if (lesson.state.phase === 'summary' || lesson.state.phase === 'abandoned') {
    const practised = practisedCountries(index?.index, lesson.state.answers)
    return (
      <LessonSummary
        result={lesson.optimistic}
        practised={practised}
        // The two phases arrive here for very different reasons and the screen says so.
        // Running out of hearts is NOT one of them — the machine sends that to
        // `summary`, because the lesson ended rather than the user leaving it.
        wasAbandoned={lesson.state.phase === 'abandoned'}
        isOffline={isOffline}
        onExit={() => onExit({ practised: practised.map((c) => c.id) })}
      />
    )
  }

  // Replaces the runner rather than covering it: an overlay leaves the question in
  // the accessibility tree, which is a free look at an item about to be scored.
  if (lesson.state.phase === 'paused') {
    return (
      <Paused
        answered={lesson.state.answers.length}
        onResume={lesson.resume}
        onFinish={() => {
          // Where we lose people, and why. "paused" and "out_of_hearts" are very
          // different products problems and a single drop-off number hides both.
          track('lesson_abandoned', {
            lesson_id: lesson.state.lessonId,
            at_item: lesson.state.index,
            of_items: lesson.state.questions.length,
            reason: 'paused',
          })
          lesson.abandon()
        }}
      />
    )
  }

  const question = lesson.question
  if (!question) return <LoadingState />

  const answered = lesson.state.phase === 'answered'
  const lastAnswer = lesson.state.answers[lesson.state.answers.length - 1]

  return (
    <View style={styles.screen}>
      {isOffline && <OfflineBanner />}

      <View style={styles.header}>
        {/* The catalogue lists this control first (§5) and it had never been built,
            so a user who started a lesson could not leave it except by answering ten
            questions — the route disables the back gesture on purpose, so killing the
            app was the only other way out. It pauses rather than quitting, which is
            what makes a mis-tap recoverable. */}
        <Pressable
          role="button"
          aria-label={t('lesson:close')}
          onPress={lesson.pause}
          hitSlop={space[2]}
          style={styles.close}
        >
          <Icon name="close" size={20} color={colors.text.secondary} />
        </Pressable>
        <ProgressBar
          current={lesson.progress.current}
          total={lesson.progress.total}
          label={t('lesson:progress.label')}
          style={styles.flex}
        />
        <Stat
          kind="hearts"
          value={lesson.state.hearts}
          accessibilityLabel={t('lesson:hearts.remaining', { count: lesson.state.hearts })}
        />
        {mode === 'speed' && (
          <Countdown
            key={lesson.state.index}
            seconds={SPEED_SECONDS}
            running={lesson.state.phase === 'presenting'}
          />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.prompt} role="heading">
          {/* The prompt key and its params come from the question template in the
              content pack, so they are validated by `pnpm content:validate` rather
              than by the compiler. */}
          {tContent(question.promptKey, question.promptParams)}
        </Text>

        {/* The picture the prompt is asking about — "Which country's flag is this?".
            Present only for image-modality templates, which the composer only selects
            when `PRESENTABLE` says this app can draw one (src/lib/content.ts).

            Labelled, unlike every other flag in the app. Elsewhere a flag illustrates
            something the surrounding text already says; here it IS the question, and
            an unannounced image would leave a reader with four country names and no
            question. It should not arise — a reader user gets the described sibling
            template instead — but "should not arise" is not a reason to ship an
            unlabelled image, and the label is what makes that true rather than
            assumed. */}
        {question.promptAsset !== undefined && (
          <View style={styles.promptArt} testID="prompt-art">
            <Flag
              path={question.promptAsset}
              width={FLAG_PROMPT_WIDTH}
              label={tContent(question.promptKey, question.promptParams)}
            />
          </View>
        )}

        {/* Where in the world you are, beside the question.
            Context, never the subject: `locator` is absent whenever the answer IS the
            country, so this can never hand over "which country is this?". That rule
            lives in the composer (packages/engines/src/content/index.ts) rather than
            here, because every screen would otherwise have to remember it.

            Decorative to a screen reader. The prompt already names the country in
            words — "What is the capital of Japan?" — so a reader announcing the map
            would repeat it, and a reader user is not being shown anything a sighted
            user is not also told. */}
        {question.locator !== undefined && (
          <View
            style={styles.promptArt}
            testID={question.modality === 'map' ? 'prompt-map' : 'prompt-locator'}
          >
            <CountryMap
              path={question.locator.path}
              contextPath={question.locator.contextPath}
              // A map question's map is the prompt, so it gets the same width as the
              // flag prompt does — big enough that telling Norway from Sweden is a
              // question about the coastline rather than about eyesight.
              width={question.modality === 'map' ? MAP_PROMPT_WIDTH : LOCATOR_WIDTH}
              // Labelled ONLY when it is the question. Beside a capital-city question
              // the prompt already names the country in words, so a reader announcing
              // the map would repeat it. Here nothing else says what is on screen —
              // though a reader user should never reach this branch at all, because
              // `screenReaderOnly` swaps in tpl.location-of.mc4 before composing.
              {...(question.modality === 'map'
                ? { label: tContent(question.promptKey, question.promptParams) }
                : {})}
            />
          </View>
        )}

        <View style={styles.options}>
          {question.options.map((option) => {
            const state = optionState(
              option.isCorrect,
              option.id,
              answered,
              lastAnswer?.chosenOptionId,
            )
            return (
            <AnswerOption
              key={option.id}
              label={option.label}
              state={state}
              // The non-colour half of the signal, as artwork rather than a character.
              // The wrong-answer mark used to be `→`, which points the same way in an
              // RTL layout as in an LTR one — an arrow that means "the right answer is
              // over there" and gets it backwards for half the world's readers.
              mark={
                state === 'correct' ? (
                  <Icon name="check" size={20} color={colors.feedback.correct} />
                ) : state === 'wrong' ? (
                  <Icon name="forward" size={20} color={colors.text.secondary} />
                ) : undefined
              }
              onPress={() => {
                // Fired from the option's own correctness rather than from the
                // state after dispatch: the reducer has not run yet at this point,
                // and reading `lastAnswer` here would buzz for the PREVIOUS question.
                // Sound and haptic together, both from the option's own correctness
                // rather than from the state after dispatch — the reducer has not run
                // yet, so reading `lastAnswer` here would fire for the PREVIOUS
                // question. Both are no-ops when their toggle is off.
                if (option.isCorrect) {
                  hapticCorrect()
                  soundCorrect()
                } else {
                  hapticWrong()
                  soundWrong()
                }

                // The richest event we have, and the one that sets lesson length
                // honestly: accuracy by POSITION is a measurement, not a guess.
                // Timed from `shownAt` for the same reason the countdown is —
                // the deadline belongs to when the question appeared.
                const elapsedMs = Date.now() - (lesson.state.shownAt ?? Date.now())
                track('question_answered', {
                  lesson_id: lesson.state.lessonId,
                  template_id: question.item.templateId,
                  fact_id: question.item.factId,
                  correct: option.isCorrect,
                  elapsed_ms: elapsedMs,
                  rating: deriveRating(option.isCorrect, elapsedMs, itemMs),
                  position: lesson.state.index,
                })

                lesson.answer(option.id)
              }}
              aria-label={t('lesson:answer.label', { answer: option.label })}
              // So tests can select answers POSITIVELY. The helper used to take every
              // button that was not labelled "Continue", which silently swallowed the
              // close button the moment one existed and made two tests click pause
              // while believing they were answering.
              testID="answer-option"
            />
            )
          })}
        </View>

        {answered && (
          <Card level={2} style={styles.feedback}>
            {lastAnswer?.wasCorrect ? (
              <>
                <Text style={styles.feedbackTitleOk}>{t('lesson:feedback.correct.title')}</Text>
                <View style={styles.rewards}>
                  <Stat kind="xp" value="+10" accessibilityLabel={t('lesson:reward.xp', { amount: 10 })} />
                  <Stat kind="coin" value="+5" accessibilityLabel={t('lesson:reward.coins', { amount: 5 })} />
                </View>
              </>
            ) : (
              // Never "Wrong!". State the truth, name the right answer, move on.
              <>
                <Text style={styles.feedbackTitle}>
                  {/* A timeout has no chosen option. "That's undefined." is what the
                      normal branch would render, and the clock running out is not the
                      user choosing wrongly — it deserves its own neutral sentence. */}
                  {lastAnswer?.chosenOptionId == null
                    ? t('lesson:speed.timeUp')
                    : t('lesson:feedback.wrong.title', {
                        chosen: chosenLabel(question, lastAnswer.chosenOptionId),
                      })}
                </Text>
                <Text style={styles.feedbackBody}>
                  {question.hint
                    ? t('lesson:feedback.wrong.body', {
                        correct: question.options.find((o) => o.isCorrect)?.label ?? '',
                        hint: question.hint,
                      })
                    : t('lesson:feedback.wrong.bodyPlain', {
                        correct: question.options.find((o) => o.isCorrect)?.label ?? '',
                      })}
                </Text>
              </>
            )}
          </Card>
        )}
      </ScrollView>

      {answered && (
        <View style={styles.footer}>
          {/* Out of hearts is a fork, not a wall. The engine has held the flag since
              the machine was written and nothing rendered it — so the lesson simply
              carried on at zero hearts, which made the whole mechanic decorative. */}
          {lesson.state.outOfHearts ? (
            <OutOfHearts
              coins={coins}
              onRevive={lesson.revive}
              onFinish={() => {
                track('lesson_abandoned', {
                  lesson_id: lesson.state.lessonId,
                  at_item: lesson.state.index,
                  of_items: lesson.state.questions.length,
                  reason: 'out_of_hearts',
                })
                lesson.abandon()
              }}
            />
          ) : (
            <Button label={t('common:continue')} onPress={lesson.advance} />
          )}
        </View>
      )}

    </View>
  )
}

/**
 * The clock, as a bar that empties.
 *
 * A bar rather than a number counting down: digits ticking demand attention that
 * belongs on the question, and a bar is read peripherally. It is keyed on the question
 * index by the caller, so each question gets a fresh one rather than an animation
 * resuming mid-flight.
 *
 * The accessible label is the seconds remaining, available on demand — never
 * announced every second, which would make the mode unusable with a screen reader.
 */
function Countdown({ seconds, running }: { seconds: number; running: boolean }) {
  const t = useT()
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(tick)
  }, [running])

  return (
    <View
      accessible
      accessibilityLabel={t('lesson:speed.remaining', { seconds: left })}
      style={styles.clockTrack}
    >
      <View style={[styles.clockFill, { width: `${(left / seconds) * 100}%` }]} />
    </View>
  )
}

function optionState(
  isCorrect: boolean,
  optionId: string,
  answered: boolean,
  chosenId: string | null | undefined,
) {
  if (!answered) return 'idle' as const
  if (isCorrect) return 'correct' as const
  if (optionId === chosenId) return 'wrong' as const
  return 'disabled' as const
}

const chosenLabel = (q: Question, id: string | null | undefined): string =>
  q.options.find((o) => o.id === id)?.label ?? ''

const makeLessonId = (): string =>
  // Client-generated; doubles as the server's idempotency key.
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

// ── the five states ─────────────────────────────────────────────────────────

/** Skeleton, never a spinner, on primary content — no layout shift on arrival. */
function LoadingState() {
  const t = useT()

  return (
    <View style={styles.screen} aria-label={t('common:loading')}>
      <View style={styles.header}>
        <Skeleton width="70%" height={8} />
      </View>
      <View style={styles.body}>
        <Skeleton width="80%" height={28} />
        <View style={styles.options}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={56} borderRadius={radius.md} />
          ))}
        </View>
      </View>
    </View>
  )
}

/**
 * The countries behind the answers just given, in the order they were asked.
 *
 * Lives in the screen rather than in `LessonSummary` because it needs the content
 * index, and the summary is presentational — it is handed things to draw. The index
 * is optional so the summary still renders if content failed to load; a lesson that
 * somehow finished without it should end with fewer flags, not a crash.
 *
 * Deduplicated by entity: a lesson can ask two facts about Sweden, and two identical
 * flags in the row looks like a bug rather than like emphasis.
 */
function practisedCountries(
  index: ContentIndex | undefined,
  answers: readonly LessonState['answers'][number][],
): readonly PractisedCountry[] {
  if (index === undefined) return []
  const locale = currentLocale()
  const seen = new Set<string>()
  const out: PractisedCountry[] = []

  for (const answer of answers) {
    const entityId = index.facts.get(answer.factId)?.entity
    if (entityId === undefined || seen.has(entityId)) continue
    const entity = index.entities.get(entityId)
    if (entity === undefined) continue
    seen.add(entityId)
    out.push({
      id: entity.id,
      flagPath: entity.assets?.['flag']?.path,
      // A country name is a fact from the pack, never a translated string. English is
      // the fallback, and never a machine translation.
      name: entity.names?.[locale] ?? entity.names?.['en'] ?? entity.id,
    })
  }

  return out
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useT()

  return (
    <View style={[styles.screen, styles.centered]}>
      <Text style={styles.prompt}>{t('common:error.generic.title')}</Text>
      <Text style={styles.feedbackBody}>{t('common:error.generic.body')}</Text>
      <Button label={t('common:retry')} onPress={onRetry} style={styles.retry} />
    </View>
  )
}

/** Never a dead end — an empty queue is celebrated, then offers what is next. */
function EmptyState() {
  const t = useT()

  return (
    <View style={[styles.screen, styles.centered]}>
      <Text style={styles.prompt}>{t('lesson:empty.title')}</Text>
      <Text style={styles.feedbackBody}>{t('lesson:empty.body')}</Text>
    </View>
  )
}

function OfflineBanner() {
  const t = useT()

  return (
    <View style={styles.offline} role="alert">
      <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  clockTrack: {
    width: 56,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bg.surfaceRaised,
    overflow: 'hidden',
  },
  clockFill: { height: '100%', backgroundColor: colors.status.streak },
  screen: { flex: 1, backgroundColor: colors.bg.canvas, padding: space[4], gap: space[4] },
  centered: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  body: { gap: space[5], paddingBottom: space[6] },
  prompt: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  promptArt: { alignItems: 'center' },
  options: { gap: space[2] },
  feedback: { gap: space[2] },
  feedbackTitle: { ...text('h3'), color: colors.text.primary },
  feedbackTitleOk: { ...text('h2'), color: colors.feedback.correct },
  feedbackBody: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },

  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { ...text('h3'), color: colors.text.secondary },
  rewards: { flexDirection: 'row', gap: space[2], justifyContent: 'center' },
  footer: { paddingBottom: space[4] },
  retry: { marginTop: space[4] },
  offline: {
    backgroundColor: colors.bg.surfaceRaised,
    padding: space[3],
    borderRadius: radius.md,
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
