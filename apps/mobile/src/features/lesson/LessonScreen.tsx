/**
 * The lesson screen — mockup screens 5 and 6.
 *
 * Phase 1 is deliberately ugly: real logic, real data, minimal polish. Design lands
 * in weeks 3–6 (docs/plan/build-order.md). What is NOT deferred is anything that is
 * expensive to retrofit — every string is a key, every colour is a token, every
 * control is labelled, and the five states are all present.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
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
import type { GradeResult, LessonState, Question } from '@worldquest/engines'
import { useLesson } from './hooks/useLesson.js'
import { useContent } from '../../lib/content.js'
import { t } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { enqueueLesson } from '../../lib/sync.js'

type ScreenState = 'loading' | 'error' | 'empty' | 'ready'

export function LessonScreen({ onExit }: { onExit: () => void }) {
  const { index, memory, status, reload, isOffline } = useContent()
  const [screen, setScreen] = useState<ScreenState>('loading')

  const questions = useMemo<readonly Question[]>(() => {
    if (status !== 'ready' || !index) return []
    return index.compose({ count: 10 })
  }, [status, index])

  const handleComplete = useCallback((state: LessonState, optimistic: GradeResult) => {
    // Enqueue, never await. A lesson finishing must not depend on the network —
    // the queue replays it whenever connectivity returns.
    enqueueLesson({
      lessonId: state.lessonId,
      kind: 'lesson',
      startedAt: state.startedAt ?? Date.now(),
      answers: state.answers,
    })
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
  }, [isOffline])

  const lesson = useLesson({ questions, memory, onComplete: handleComplete })

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
    return <SummaryState result={lesson.optimistic} isOffline={isOffline} onExit={onExit} />
  }

  const question = lesson.question
  if (!question) return <LoadingState />

  const answered = lesson.state.phase === 'answered'
  const lastAnswer = lesson.state.answers[lesson.state.answers.length - 1]

  return (
    <View style={styles.screen}>
      {isOffline && <OfflineBanner />}

      <View style={styles.header}>
        <ProgressBar
          current={lesson.progress.current}
          total={lesson.progress.total}
          label={t('lesson:progress.label')}
          style={styles.flex}
        />
        <StatChip
          kind="hearts"
          value={lesson.state.hearts}
          accessibilityLabel={t('lesson:hearts.remaining', { count: lesson.state.hearts })}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.prompt} accessibilityRole="header">
          {t(question.promptKey, question.promptParams)}
        </Text>

        <View style={styles.options}>
          {question.options.map((option) => (
            <AnswerOption
              key={option.id}
              label={option.label}
              state={optionState(option.isCorrect, option.id, answered, lastAnswer?.chosenOptionId)}
              onPress={() => lesson.answer(option.id)}
              accessibilityLabel={t('lesson:answer.label', { country: option.label })}
            />
          ))}
        </View>

        {answered && (
          <Card level={2} style={styles.feedback}>
            {lastAnswer?.wasCorrect ? (
              <>
                <Text style={styles.feedbackTitleOk}>{t('lesson:feedback.correct.title')}</Text>
                <View style={styles.rewards}>
                  <StatChip kind="xp" value="+10" accessibilityLabel={t('lesson:reward.xp', { amount: 10 })} />
                  <StatChip kind="coin" value="+5" accessibilityLabel={t('lesson:reward.coins', { amount: 5 })} />
                </View>
              </>
            ) : (
              // Never "Wrong!". State the truth, name the right answer, move on.
              <>
                <Text style={styles.feedbackTitle}>
                  {t('lesson:feedback.wrong.title', { chosen: chosenLabel(question, lastAnswer?.chosenOptionId) })}
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
          <Button label={t('common:continue')} onPress={lesson.advance} />
        </View>
      )}
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
  return (
    <View style={styles.screen} accessibilityLabel={t('common:loading')}>
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

function ErrorState({ onRetry }: { onRetry: () => void }) {
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
  return (
    <View style={[styles.screen, styles.centered]}>
      <Text style={styles.prompt}>{t('lesson:empty.title')}</Text>
      <Text style={styles.feedbackBody}>{t('lesson:empty.body')}</Text>
    </View>
  )
}

function OfflineBanner() {
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
    </View>
  )
}

function SummaryState({
  result,
  isOffline,
  onExit,
}: {
  result: GradeResult | null
  isOffline: boolean
  onExit: () => void
}) {
  return (
    <View style={[styles.screen, styles.centered]}>
      {isOffline && <OfflineBanner />}
      <Text style={styles.prompt}>{t('lesson:summary.title')}</Text>
      {result && (
        <View style={styles.rewards}>
          <StatChip
            kind="xp"
            value={`+${result.xpAwarded}`}
            accessibilityLabel={t('lesson:reward.xp', { amount: result.xpAwarded })}
          />
          <StatChip
            kind="coin"
            value={`+${result.coinsAwarded}`}
            accessibilityLabel={t('lesson:reward.coins', { amount: result.coinsAwarded })}
          />
        </View>
      )}
      <Button label={t('common:continue')} onPress={onExit} style={styles.retry} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas, padding: space[4], gap: space[4] },
  centered: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  body: { gap: space[5], paddingBottom: space[6] },
  prompt: {
    fontFamily: typography.fontFamily.display,
    fontSize: typography.scale.h2.size,
    lineHeight: typography.scale.h2.lineHeight,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  options: { gap: space[2] },
  feedback: { gap: space[2] },
  feedbackTitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.scale.h3.size,
    fontWeight: '600',
    color: colors.text.primary,
  },
  feedbackTitleOk: {
    fontFamily: typography.fontFamily.display,
    fontSize: typography.scale.h2.size,
    fontWeight: '700',
    color: colors.feedback.correct,
  },
  feedbackBody: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.scale.body.size,
    lineHeight: typography.scale.body.lineHeight,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  rewards: { flexDirection: 'row', gap: space[2], justifyContent: 'center' },
  footer: { paddingBottom: space[4] },
  retry: { marginTop: space[4] },
  offline: {
    backgroundColor: colors.bg.surfaceRaised,
    padding: space[3],
    borderRadius: radius.md,
  },
  offlineText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.scale.caption.size,
    color: colors.text.secondary,
    textAlign: 'center',
  },
})
