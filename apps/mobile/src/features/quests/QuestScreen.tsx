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

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  Card,
  colors,
  layout,
  ProgressBar,
  radius,
  Skeleton,
  space,
  squircle,
  Tally,
  text,
} from '@worldquest/design'
import {
  COMPLETION_BONUS,
  TASK_XP,
  questProgress,
  type DailyQuest,
  type PerformGoal,
  type QuestTask,
} from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { SPEED_SECONDS } from '../lesson/modes.js'
import { Art } from '../../components/Art.js'
import { Icon } from '../../components/Icon.js'
import { SLOT_ICON, SLOT_TITLE } from './slots.js'
import { TopBar } from '../../components/TopBar.js'
import type { DayCountdown } from './useDayCountdown.js'

const GOAL_BODY: Record<PerformGoal, TranslationKey> = {
  perfect_lesson: 'quests:goal.perfect_lesson',
  speed_round: 'quests:goal.speed_round',
  streak_keeper: 'quests:goal.streak_keeper',
}

export type QuestScreenProps = {
  readonly quest: DailyQuest | null
  readonly loading: boolean
  readonly onStart: () => void
  /** The wallet, for the bar at the top. Absent draws the bar without it. */
  readonly coins?: number | undefined
  /** Hours and minutes until today's quest is replaced. See `useDayCountdown`. */
  readonly resetsIn?: DayCountdown | undefined
  /** Opens the achievements half of this screen. Absent hides the segmented control. */
  readonly onOpenAchievements?: (() => void) | undefined
  readonly onOpenInbox?: (() => void) | undefined
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

export function QuestScreen({
  quest,
  loading,
  onStart,
  onStartSpeedRound,
  coins,
  resetsIn,
  onOpenAchievements,
  onOpenInbox,
}: QuestScreenProps) {
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
      <TopBar
        initials="EX"
        {...(coins !== undefined ? { coins } : {})}
        {...(onOpenInbox !== undefined ? { onInbox: onOpenInbox } : {})}
      />
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

      {/* Daily and Achievements, as two halves of one control.
   
          Achievements were a route with no entrance except a row buried on Profile, and
          they are the same KIND of thing as a quest — something with a target you are
          working towards — so the reference files them as the second tab of this screen
          rather than as a separate destination. Rendered as a segmented control and not
          two buttons: a segment says "these are the two views of this screen", where two
          buttons would say "here are two places to go". */}
      {onOpenAchievements !== undefined && (
        <View style={styles.segment} role="tablist">
          <View style={[styles.segmentItem, styles.segmentOn]} role="tab" aria-selected>
            <Text style={styles.segmentTextOn}>{t('quests:tab.daily')}</Text>
          </View>
          <Pressable
            onPress={onOpenAchievements}
            role="tab"
            aria-selected={false}
            style={styles.segmentItem}
          >
            <Text style={styles.segmentText}>{t('quests:tab.achievements')}</Text>
          </Pressable>
        </View>
      )}

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
    
      {/* When today's quest is replaced.
   
          The reference puts it under the list, and it answers the one question a
          half-finished quest raises: how long have I got. Absent rather than an em-dash
          when the route cannot say — the same rule Home's countdown follows. */}
      {resetsIn !== undefined && (
        <View style={styles.reset}>
          <Icon name="clock" size={14} color={colors.text.tertiary} />
          <Text style={styles.resetText}>{t('quests:resets', resetsIn)}</Text>
        </View>
      )}

      {/* The speed round: the same items against a clock, for someone already in a
          practising frame of mind. */}
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
        // A seam, so the test for "a done step draws an icon rather than a `✓`
        // character" can ask the STEP what it drew. It used to count every image inside
        // the task list, which was true when the rows had no other artwork and stopped
        // being true the moment each task got its subject glyph — the same way it had
        // already broken once when the header grew an Atlas.
        testID="quest-step"
      >
        {task.complete ? (
          <Icon name="check" size={16} color={colors.text.onAccent} />
        ) : (
          <Text style={styles.stepText}>{String(step)}</Text>
        )}
      </View>

      <View style={styles.taskText}>
        {/* Icon then title, `space[1]` apart — the icon↔label rung, and the same pair
            Explore draws with its pin. Decorative: the row's `aria-label` already says
            "Know the flag, 2 of 4", and a reader announcing "flag" in front of it is
            the noun twice. */}
        <View style={styles.taskHead}>
          {/* Anchored to the FIRST line, not to the middle of the block. At 320 "Find it
              on the map" wraps to two lines, and a centred icon then sat in the gap
              between them pointing at nothing. `bodyStrong` has a 24 line height and the
              glyph is 16, so half the difference — `space[1]`, on the scale — drops it
              onto the first line's optical centre and it stays there however many lines
              the title takes. */}
          <View style={styles.taskHeadIcon}>
            <Icon
              name={SLOT_ICON[task.slot]}
              size={16}
              color={task.complete ? colors.text.tertiary : colors.action.primary}
            />
          </View>
          <Text style={[styles.taskTitle, task.complete && styles.taskTitleDone]}>{title}</Text>
        </View>
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
        <Tally
          style={task.progress > 0 || task.complete ? styles.taskCount : styles.taskCountNone}
          numberStyle={styles.taskCountNumber}
        >
          {task.complete
            ? t('quests:task.done')
            : t('quests:task.count', { progress: task.progress, target: task.target })}
        </Tally>
        {/* The bolt is the same one the tab bar and the lesson summary use for XP, at
            the reward tint the figure beside it already carries. A gold number on its own
            was the only unlabelled quantity on the screen. */}
        <View style={styles.taskXpRow}>
          <Icon name="xp" size={12} color={colors.reward.xp} />
          <Text style={styles.taskXp}>{t('quests:reward.task', { xp: TASK_XP })}</Text>
        </View>
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

  // One control, two halves. A hairline tray with a raised pill in it, which is the
  // iOS segmented shape and the one the goal step's inset group already establishes.
  segment: {
    flexDirection: 'row',
    padding: space[1],
    borderRadius: radius.full,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // 44, not 40. `pnpm design:shots` measures every control on every route and these
    // two were the only things in the app under the line — a segment is a real target
    // and 40 was chosen to look like the tray around it rather than to be pressed.
    minHeight: layout.minTouchTarget,
    borderRadius: radius.full,
  },
  segmentOn: { backgroundColor: colors.bg.surfaceRaised },
  segmentText: { ...text('bodyStrong'), color: colors.text.secondary },
  segmentTextOn: { ...text('bodyStrong'), color: colors.text.primary },
  reset: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  resetText: { ...text('caption', { numeric: true }), color: colors.text.tertiary },
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
    ...squircle,
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
  // `flex: 1` on the title so a long slot name wraps inside the row rather than pushing
  // the icon off it.
  taskHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space[1] },
  taskHeadIcon: { paddingTop: space[1] },
  taskTitle: { ...text('bodyStrong'), color: colors.text.primary, flex: 1 },
  taskTitleDone: { color: colors.text.secondary },
  taskBody: { ...text('caption'), color: colors.text.secondary },
  taskMeta: { alignItems: 'flex-end', gap: space[1] },
  // The WORDS, now that `Tally` splits the line. "done" keeps the state colour and the
  // digits get the weight — same division as every other count in the app.
  taskCount: { ...text('caption'), color: colors.status.progress },
  taskCountNone: { ...text('caption'), color: colors.text.secondary },
  taskCountNumber: { ...text('caption', { weight: '700', numeric: true }) },
  taskXpRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  taskXp: { ...text('caption'), color: colors.reward.xp },
})
