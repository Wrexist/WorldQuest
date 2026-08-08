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
import { Art } from '../../components/Art.js'
import { Icon } from '../../components/Icon.js'

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

/**
 * Atlas beside the Quests heading.
 *
 * The same 84 as Explore's, and the same reasoning: he stands next to a title rather
 * than being the subject, and a mascot that out-weighs the heading it decorates has
 * stopped decorating it. Matching the number matters more than choosing it — the five
 * tabs should feel like five rooms in one building, and a header that is 84 on one and
 * 96 on the next is how that stops being true.
 */
const HEADER_ART = 84

export function QuestScreen({ quest, loading, onStart, onStartSpeedRound }: QuestScreenProps) {
  const t = useT()

  if (loading) return <QuestSkeleton />

  // Not an error — a quest is composed from the user's state, and on a very first
  // launch there is no state yet. Saying so beats an empty list or a spinner that
  // never resolves.
  if (quest === null) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {/* Atlas thinking — "curious, not confused", per the brief. This is a first
            launch with no state to build a quest from, which is a beginning rather
            than a failure, and the art is the difference between the two. */}
        <Art name="atlas/thinking" size={140} />
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
        <View style={styles.headerText}>
          <Text style={styles.title} role="heading">
            {t('quests:title')}
          </Text>
          <Text style={styles.subtitle}>{t('quests:subtitle')}</Text>
        </View>
        {/* The same Atlas, at the same size, in the same place as Explore's — imported
            nothing, but deliberately identical, because a tab bar's five destinations
            should feel like five rooms in one building.

            This was the flattest screen in the app and one tap from the richest: five
            numbered panels with two colours of figure down the right rail, on the tab
            whose whole job is to make today's work look worth doing. `thinking` and not
            `celebrate` — nothing has been achieved yet; the quest is the question.

            Decorative, like every other Atlas: the heading beside it already says what
            the screen is. */}
        <Art name="atlas/thinking" size={HEADER_ART} />
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

      <View style={styles.list} testID="quest-tasks">
        {quest.tasks.map((task, i) => (
          <TaskRow key={task.slot} task={task} step={i + 1} />
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

function TaskRow({ task, step }: { task: QuestTask; step: number }) {
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
      {/* The step number, per mockup screen 4.
          Without it the five rows read as five unrelated meters; with it they read
          as one quest with five steps, which is what they are. The done state
          becomes a filled tick rather than only a full bar — a bar at 100 % and a
          bar at 95 % look alike at a glance, and a tick does not.
          `aria-hidden` because the row already announces its title and its state;
          a reader saying "3" before every task is noise. */}
      <View
        style={[styles.step, task.complete && styles.stepDone]}
        aria-hidden
      >
        {task.complete ? (
          <Icon name="check" size={16} color={colors.text.onAccent} />
        ) : (
          <Text style={styles.stepText}>{String(step)}</Text>
        )}
      </View>

      <View style={styles.taskText}>
        <Text style={[styles.taskTitle, task.complete && styles.taskTitleDone]}>{title}</Text>
        {task.goal !== undefined && (
          <Text style={styles.taskBody}>{t(GOAL_BODY[task.goal])}</Text>
        )}
        <ProgressBar current={task.progress} total={task.target} showCount={false} />
      </View>

      <View style={styles.taskMeta}>
        {/* Green only once something has happened. This was `status.progress` on every
            row, so a fresh quest showed five "0 / 4"s in success green — the same lie
            the lesson summary told with a 35 % accuracy and the streak screen told with
            "0 of 2 held". A standalone caption in the success colour is a claim; here it
            claimed five times over that nothing was something. */}
        <Text style={task.progress > 0 || task.complete ? styles.taskCount : styles.taskCountNone}>
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
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[3] },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[3] },

  header: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  headerText: { flex: 1, gap: space[1] },
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
  // 28pt, not 44: this is decoration inside an already-accessible row, not a
  // control. Growing it to a tap target would promise a tap that does nothing.
  step: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.surfaceRaised,
    borderWidth: 2,
    borderColor: colors.border.strong,
  },
  stepDone: {
    backgroundColor: colors.feedback.correct,
    borderColor: colors.feedback.correct,
  },
  stepText: { ...text('caption', { weight: '800', numeric: true }), color: colors.text.secondary },
  // On the filled green circle, not on the surface — this pair is the one the
  // contrast checker cares about.
  stepTextDone: { color: colors.text.onAccent },
  taskText: { flex: 1, gap: space[2] },
  taskTitle: { ...text('bodyStrong'), color: colors.text.primary },
  taskTitleDone: { color: colors.text.secondary },
  taskBody: { ...text('caption'), color: colors.text.secondary },
  taskMeta: { alignItems: 'flex-end', gap: space[1] },
  taskCount: { ...text('caption', { weight: '700', numeric: true }), color: colors.status.progress },
  taskCountNone: {
    ...text('caption', { weight: '700', numeric: true }),
    color: colors.text.secondary,
  },
  taskXp: { ...text('caption'), color: colors.reward.xp },
})
