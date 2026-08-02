/**
 * Today's Quest — mockup screen 4.
 *
 * Five tasks, one primary action. The screen's job is to make "about ten minutes"
 * legible at a glance: what is left, and the one button that starts it.
 *
 * What this screen deliberately does NOT do is mention yesterday. There is no
 * "you missed 3 quests this week", no make-up, no streak of quests. The engine has no
 * field for it and this screen has no place for it — that mechanic is what turns a
 * game into an obligation.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  Card,
  ProgressBar,
  Skeleton,
  colors,
  radius,
  space,
  text,
} from '@worldquest/design'
import {
  COMPLETION_BONUS,
  TASK_XP,
  questProgress,
  type DailyQuest,
  type PerformGoal,
  type QuestTask,
  type Slot,
} from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { SPEED_SECONDS } from '../lesson/modes.js'

const SLOT_TITLE: Record<Slot, TranslationKey> = {
  locate: 'quests:slot.locate',
  recognise: 'quests:slot.recognise',
  recall: 'quests:slot.recall',
  discover: 'quests:slot.discover',
  perform: 'quests:slot.perform',
}

const GOAL_BODY: Record<PerformGoal, TranslationKey> = {
  perfect_lesson: 'quests:goal.perfect_lesson',
  speed_round: 'quests:goal.speed_round',
  streak_keeper: 'quests:goal.streak_keeper',
}

export type QuestScreenProps = {
  readonly quest: DailyQuest | null
  readonly loading: boolean
  readonly onStart: () => void
  /**
   * Optional so the screenshot renderer and component tests mount without a router,
   * like every other callback here.
   */
  readonly onStartSpeedRound?: (() => void) | undefined
}

export function QuestScreen({ quest, loading, onStart, onStartSpeedRound }: QuestScreenProps) {
  const t = useT()

  if (loading) return <QuestSkeleton />

  // Not an error — a quest is composed from the user's state, and on a very first
  // launch there is no state yet. Saying so beats an empty list or a spinner that
  // never resolves.
  if (quest === null) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.title} role="heading">
          {t('quests:empty.title')}
        </Text>
        <Text style={styles.subtitle}>{t('quests:empty.body')}</Text>
        <Button label={t('common:start')} onPress={onStart} style={styles.cta} />
      </View>
    )
  }

  const { done, total } = questProgress(quest)

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title} role="heading">
          {t('quests:title')}
        </Text>
        <Text style={styles.subtitle}>{t('quests:subtitle')}</Text>
      </View>

      <Card style={styles.summary}>
        {/* The label already reads "2 of 5 done", so the bar's own counter would
            print the same numbers twice, six pixels apart. */}
        <ProgressBar
          current={done}
          total={total}
          tone="reward"
          showCount={false}
          label={t('quests:progress', { done, total })}
        />
        {quest.complete ? (
          <>
            <Text style={styles.completeTitle}>{t('quests:complete.title')}</Text>
            <Text style={styles.subtitle}>{t('quests:complete.body')}</Text>
          </>
        ) : (
          <Text style={styles.bonus}>{t('quests:reward.bonus', { xp: COMPLETION_BONUS })}</Text>
        )}
      </Card>

      <View style={styles.list}>
        {quest.tasks.map((task) => (
          <TaskRow key={task.slot} task={task} />
        ))}
      </View>

      {/* One primary action. A quest screen whose only affordance is reading is a
          screen the user leaves. */}
      {!quest.complete && <Button label={t('common:continue')} onPress={onStart} />}
    
      {/* The speed round lives here rather than on Home: it is a variation for
          someone already in a practising frame of mind, and putting a second CTA
          beside "Continue" on Home would split the one primary action. */}
      {onStartSpeedRound !== undefined && (
        <Card level={2} style={styles.speed}>
          <Text style={styles.speedTitle}>{t('lesson:speed.title')}</Text>
          <Text style={styles.subtitle}>{t('lesson:speed.body', { seconds: SPEED_SECONDS })}</Text>
          <Button
            variant="secondary"
            label={t('lesson:speed.start')}
            onPress={onStartSpeedRound}
          />
        </Card>
      )}

      </ScrollView>
  )
}

function TaskRow({ task }: { task: QuestTask }) {
  const t = useT()
  const title = t(SLOT_TITLE[task.slot])

  return (
    <View
      // One element per task: a reader announces "Know the flag, 2 of 4" rather than
      // sweeping a title, a body and a counter separately.
      accessible
      aria-label={t('quests:task.label', {
        title,
        progress: task.progress,
        target: task.target,
      })}
      aria-checked={task.complete}
      style={[styles.task, task.complete && styles.taskDone]}
    >
      <View style={styles.taskText}>
        <Text style={[styles.taskTitle, task.complete && styles.taskTitleDone]}>{title}</Text>
        {task.goal !== undefined && (
          <Text style={styles.taskBody}>{t(GOAL_BODY[task.goal])}</Text>
        )}
        <ProgressBar current={task.progress} total={task.target} showCount={false} />
      </View>

      <View style={styles.taskMeta}>
        <Text style={styles.taskCount}>
          {task.complete
            ? t('quests:task.done')
            : t('quests:task.count', { progress: task.progress, target: task.target })}
        </Text>
        <Text style={styles.taskXp}>{t('quests:reward.task', { xp: TASK_XP })}</Text>
      </View>
    </View>
  )
}

function QuestSkeleton() {
  const t = useT()
  return (
    <View style={styles.screen} aria-label={t('common:loading')}>
      <View style={styles.content}>
        <Skeleton width="55%" height={30} />
        <Skeleton height={96} borderRadius={radius.lg} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={78} borderRadius={radius.lg} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  speed: { padding: space[4], gap: space[2], marginTop: space[3] },
  speedTitle: { ...text('h3'), color: colors.text.primary },
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[3] },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[3] },

  header: { gap: space[1] },
  title: { ...text('h1'), color: colors.text.primary },
  subtitle: { ...text('body'), color: colors.text.secondary },
  cta: { marginTop: space[3] },

  summary: { gap: space[2] },
  bonus: { ...text('caption', { weight: '600' }), color: colors.reward.xp },
  completeTitle: { ...text('h3'), color: colors.feedback.correct },

  list: { gap: space[2] },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
    borderRadius: radius.lg,
    backgroundColor: colors.bg.surface,
  },
  // Done tasks recede rather than disappear — the list keeps its shape all day, so
  // the user's sense of "how much is left" does not jump around.
  taskDone: { opacity: 0.6 },
  taskText: { flex: 1, gap: space[2] },
  taskTitle: { ...text('bodyStrong'), color: colors.text.primary },
  taskTitleDone: { color: colors.text.secondary },
  taskBody: { ...text('caption'), color: colors.text.secondary },
  taskMeta: { alignItems: 'flex-end', gap: space[1] },
  taskCount: { ...text('caption', { weight: '700', numeric: true }), color: colors.status.progress },
  taskXp: { ...text('caption'), color: colors.reward.xp },
})
