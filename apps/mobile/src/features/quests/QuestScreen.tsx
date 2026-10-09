import { createThemeStyles } from '@worldquest/design'
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

import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import {
  Button,
  Card,
  ClaySurface,
  clayShadow,
  layout,
  motion,
  radius,
  Skeleton,
  space,
  squircle,
  Tally,
  text,
  useCelebration,
} from '@worldquest/design'
import {
  TASK_XP,
  type DailyQuest,
  type PerformGoal,
  type QuestTask,
} from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { SPEED_SECONDS } from '../lesson/modes.js'
import { AtlasCompanion } from '../../components/AtlasCompanion.js'
import { SceneEntrance } from '../../components/SceneEntrance.js'
import { CloudBackdrop } from '../../components/CloudBackdrop.js'
import { QuestMilestones } from '../../components/QuestMilestones.js'
import { ProgressSparkles } from '../../components/ProgressSparkles.js'
import { Icon } from '../../components/Icon.js'
import { SLOT_ICON, taskTitle } from './slots.js'
import { TopBar } from '../../components/TopBar.js'
import { ScrollEdges, useScrollEdges } from '../../components/ScrollEdges.js'
import { StickyFooter } from '../../components/StickyFooter.js'
import { WorldMascot } from '../../components/WorldMascot.js'
import type { DayCountdown } from './useDayCountdown.js'
import { QuestTreasureCard } from './QuestTreasureCard.js'

const ACTIVITY_BODY = {
  new: 'quests:activity.new.body',
  review: 'quests:activity.review.body',
  practice: 'quests:activity.practice.body',
} as const satisfies Record<NonNullable<QuestTask['activity']>, TranslationKey>

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
  /** The streak, for the flame chip in the top bar, and where tapping it goes. */
  readonly streak?: number | undefined
  readonly onOpenStreak?: (() => void) | undefined
  /**
   * Optional so the screenshot renderer and component tests mount without a router,
   * like every other callback here.
   */
  readonly onStartSpeedRound?: (() => void) | undefined
}

export function QuestScreen({
  quest,
  loading,
  onStart,
  onStartSpeedRound,
  coins,
  resetsIn,
  onOpenAchievements,
  streak,
  onOpenStreak,
}: QuestScreenProps) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  // Soft top and bottom edges, lighter while the page moves (`ScrollEdges`).
  const edges = useScrollEdges()
  const { width, fontScale } = useWindowDimensions()
  const largeText = fontScale >= 1.5 && width < layout.maxContentWidth

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
        <AtlasCompanion mood="thinking" message={t('quests:empty.body')} />
        <Button label={t('common:start')} onPress={onStart} style={styles.cta} />
      </View>
    )
  }

  const hasProgress = quest.tasks.some((task) => task.progress > 0)
  const guide = quest.complete ? 'quests:guide.complete' : hasProgress ? 'quests:guide.progress' : 'quests:guide.ready'

  return (
    <View style={styles.screen}>
    <View style={styles.screen}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} {...edges.handlers}>
      <TopBar
        initials="EX"
        {...(coins !== undefined ? { coins } : {})}
        {...(onOpenStreak !== undefined && streak !== undefined ? { onStreak: onOpenStreak, streak } : {})}
      />
      <View>
      <CloudBackdrop style={styles.headerClouds} />
      <View style={[styles.header, largeText && styles.headerStacked]}>
        <View style={[styles.headingText, largeText && styles.intrinsic]}>
          <Text style={styles.title} role="heading">
            {t('quests:title')}
          </Text>
          <Text style={styles.guide}>{t(guide)}</Text>
        </View>
        <WorldMascot mood={quest.complete ? 'celebrate' : hasProgress ? 'encouraging' : 'welcome'}
          onBoopLabel={t('common:atlas.boop')} style={[styles.guideMascot, width < layout.baseWidth && styles.guideSmall]} />
      </View>
      </View>

      {/* Daily and Achievements, as two halves of one control.

          Achievements were a route with no entrance except a row buried on Profile, and
          they are the same KIND of thing as a quest — something with a target you are
          working towards — so the reference files them as the second tab of this screen
          rather than as a separate destination. Rendered as a segmented control and not
          two buttons: a segment says "these are the two views of this screen", where two
          buttons would say "here are two places to go". */}
      {onOpenAchievements !== undefined && (
        <View style={[styles.segment, largeText && styles.headerStacked]} role="tablist">
          <ClaySurface radius={radius.full} />
          <View style={[styles.segmentItem, largeText && styles.intrinsic, styles.segmentOn]} role="tab" aria-selected>
            <ClaySurface tone="sky" radius={radius.full} />
            <Text style={styles.segmentTextOn}>{t('quests:tab.daily')}</Text>
          </View>
          <Pressable
            onPress={onOpenAchievements}
            role="tab"
            aria-selected={false}
            style={[styles.segmentItem, largeText && styles.intrinsic]}
          >
            <Text style={styles.segmentText}>{t('quests:tab.achievements')}</Text>
          </Pressable>
        </View>
      )}

      <QuestTreasureCard quest={quest} />

      <View style={styles.list} testID="quest-tasks">
        {quest.tasks.map((task, i) => (
          <SceneEntrance key={task.slot} delay={Math.min(i, motion.stagger.maxItems) * motion.stagger.stepMs}>
            <TaskRow task={task} step={i + 1} />
          </SceneEntrance>
        ))}
      </View>

      {/* One primary action. A quest screen whose only affordance is reading is a
          screen the user leaves. */}

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
      <ScrollEdges moving={edges.moving} />
    </View>
      {!quest.complete && <StickyFooter>
        <Button variant="discovery" label={t('quests:adventure.continue')} onPress={onStart} fullWidth />
      </StickyFooter>}
    </View>
  )
}

function TaskRow({ task, step }: { task: QuestTask; step: number }) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  const title = task.activity === 'practice'
    ? t('quests:activity.practice', { round: step }) : t(taskTitle(task))
  const description = task.activity !== undefined
    ? t(ACTIVITY_BODY[task.activity], { count: task.target })
    : task.goal !== undefined ? t(GOAL_BODY[task.goal]) : undefined
  const pop = useCelebration(task.progress)
  const material = task.slot === 'discover' || task.slot === 'recognise' ? 'gold' : 'sky'

  const { width, fontScale } = useWindowDimensions()
  // Give the goal a full line on small phones and at large native text sizes.
  const stacked = width / fontScale < layout.baseWidth
  const art = (<Animated.View style={[styles.taskArt, { transform: [{ scale: pop }] }]}>
      <ClaySurface tone={material} radius={radius.lg} />
      <Icon name={SLOT_ICON[task.slot]} size={30} color={colors.clay[material].ink} />
      <ProgressSparkles earned={task.progress} />
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
          <Icon name="check" size={16} color={colors.text.onStatus} />
        ) : (
          <Text style={styles.stepText}>{String(step)}</Text>
        )}
      </View>
      </Animated.View>)
  const content = (<View style={[styles.taskText, stacked && styles.intrinsic]}>
        <View style={styles.taskHead}>
          <Text style={[styles.taskTitle, task.complete && styles.taskTitleDone]}>{title}</Text>
        </View>
        {description !== undefined && (
          <Text style={styles.taskBody}>{description}</Text>
        )}
        <QuestMilestones current={task.progress} total={task.target} label={title} decorative />
      </View>)
  const meta = (<View style={styles.taskMeta}>
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
          <ClaySurface tone="gold" radius={radius.full} />
          <Icon name="xp" size={12} color={colors.clay.gold.ink} />
          <Text style={styles.taskXp}>{t('quests:reward.task', { xp: TASK_XP })}</Text>
        </View>
      </View>)

  return (
    <View
      // One element per task: a reader announces "Know the flag, 2 of 4" rather than
      // sweeping a title, a body and a counter separately.
      accessible
      aria-label={t(description === undefined ? 'quests:task.label' : 'quests:task.detailLabel', {
        title,
        description: description ?? '',
        progress: task.progress,
        target: task.target,
      })}
      aria-checked={task.complete}
      style={[styles.task, stacked && styles.taskStacked, task.complete && styles.taskDone]}
    >
      {/* The step number, per mockup screen 4.
          Without it the five rows read as five unrelated meters; with it they read
          as one quest with five steps, which is what they are. The done state
          becomes a filled tick rather than only a full bar — a bar at 100 % and a
          bar at 95 % look alike at a glance, and a tick does not.
          `aria-hidden` because the row already announces its title and its state;
          a reader saying "3" before every task is noise. */}
      <ClaySurface radius={radius.xl} />
      {stacked ? <>
        <View style={styles.taskTop}>{art}{meta}</View>
        {content}
      </> : <>{art}{content}{meta}</>}

    </View>
  )
}

function QuestSkeleton() {
  const { styles } = useThemeValues()
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



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  speed: { backgroundColor: colors.bg.surface, borderColor: colors.journey.lavender, padding: space[4], gap: space[2], marginTop: space[3] },
  speedTitle: { ...text('h3'), color: colors.text.primary },
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[4], paddingBottom: space[6] },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[3] },

  // One control, two halves. A hairline tray with a raised pill in it, which is the
  // iOS segmented shape and the one the goal step's inset group already establishes.
  segment: {
    flexDirection: 'row',
    padding: space[1],
    borderRadius: radius.full,
    ...clayShadow(colors),
  },
  segmentItem: {
    flexGrow: 1, flexShrink: 1, flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // 44, not 40. `pnpm design:shots` measures every control on every route and these
    // two were the only things in the app under the line — a segment is a real target
    // and 40 was chosen to look like the tray around it rather than to be pressed.
    minHeight: layout.minTouchTarget,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radius.full,
  },
  segmentOn: { borderRadius: radius.full, ...clayShadow(colors) },
  segmentText: { ...text('bodyStrong'), color: colors.text.secondary, maxWidth: '100%', textAlign: 'center' },
  segmentTextOn: { ...text('bodyStrong', { weight: '800' }), color: colors.clay.sky.ink, maxWidth: '100%', textAlign: 'center' },
  reset: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  resetText: { ...text('caption', { numeric: true }), color: colors.text.tertiary },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  headerStacked: { flexDirection: 'column', alignItems: 'stretch' },
  intrinsic: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  headingText: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: space[1] },
  guide: { ...text('caption'), color: colors.text.secondary },
  headerClouds: { start: 'auto', width: '100%', maxWidth: space[9] * 6 },
  guideMascot: { width: space[9] + space[8], height: space[9] + space[8], flexShrink: 0 },
  guideSmall: { width: space[8] * 2, height: space[8] * 2 },
  title: { ...text('h1'), color: colors.text.primary },
  subtitle: { ...text('body'), color: colors.text.secondary },
  cta: { marginTop: space[3] },

  taskArt: { width: space[8]+space[1], height: space[8]+space[3], borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', ...clayShadow(colors) },

  list: { gap: space[2] },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
    borderRadius: radius.xl,
    ...squircle,
    ...clayShadow(colors),
  },
  // Done tasks recede rather than disappear — the list keeps its shape all day, so
  // the user's sense of "how much is left" does not jump around.
  taskDone: { borderWidth: 1, borderColor: colors.feedback.correctEdge },
  // 28pt, not 44: this is decoration inside an already-accessible row, not a
  // control. Growing it to a tap target would promise a tap that does nothing.
  step: {
    position: 'absolute', end: -4, bottom: -5,
    width: 21,
    height: 21,
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
  stepTextDone: { color: colors.text.onStatus },
  taskStacked: { flexDirection: 'column', alignItems: 'stretch' },
  taskTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  taskText: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: space[2] },
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
  taskXpRow: { flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[2], paddingVertical: space[1], borderRadius: radius.full },
  taskXp: { ...text('caption', { weight: '700' }), color: colors.clay.gold.ink },
})
  return { colors, styles }
})
