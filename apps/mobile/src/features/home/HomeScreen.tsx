import { createThemeStyles } from '@worldquest/design'
/**
 * Home — mockup screen 3, rebuilt around the course path.
 *
 * Top to bottom: the bar (avatar, coins, bell), the greeting, three facts about today,
 * then the first-week course as a path — unit banners and steps in a zig-zag, the step
 * you are on lit and labelled Start — and below it the daily quest, the streak's news,
 * the reminder ask and your world.
 *
 * ## One green primary, and it is the path's
 *
 * The launch brief is explicit: one course, and "Continue today's lesson" as the one
 * green primary recommendation, with everything else secondary. Home used to have one
 * green button too — the quest card's Continue — and the course sequence was the
 * replacement the brief assigned to L08/U05. The quest card stays, as a secondary card
 * with a blue button below the path; its count also stays in the fact row at the top,
 * one tap from the Quests tab. Putting it ABOVE the path would push the one primary
 * action below the fold on a 320 pt phone, and putting it INSIDE the path would split
 * the trail — the same two reasons the streak card below it gives for where it sits.
 *
 * The tab bar is NOT here — `app/(tabs)/_layout.tsx` owns it. A screen that draws its
 * own chrome cannot be reused inside a navigator without drawing it twice.
 *
 * Deviations from the mockup are recorded in docs/design/mockup-fidelity.md.
 */

import { useCallback, useRef } from 'react'
import { Pressable, useWindowDimensions, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import {
  Button,
  Card,
  ProgressBar,
  radius,
  Skeleton,
  space,
  squircle,
  Tally,
  text,
  useReducedMotion,
} from '@worldquest/design'
import { BALANCE } from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { Icon } from '../../components/Icon.js'
import type { IconName } from '../../lib/icons.generated.js'
import { Stat } from '../../components/Stat.js'
import { DailyAdventure, type DailyAdventureProps } from './DailyAdventure.js'
import { TopBar } from '../../components/TopBar.js'
import { StreakNoticeCard, type StreakNoticeCardProps } from '../streak/StreakNoticeCard.js'
import { CoursePath, type CoursePathProps } from '../course/components/CoursePath.js'
import { CoursePathSkeleton } from '../course/components/CoursePathSkeleton.js'

export type HomeProgress = {
  readonly xpTotal: number
  readonly coins: number
  readonly streak: number
  /**
   * `factsMastered` and `factsTotal` used to live here and were read by nothing. The
   * route filled the second one with a hardcoded `10` beside a comment saying the packs
   * were five countries deep; they are 65. A wrong constant feeding a field no
   * component renders is worse than an absent one, because the next person to reach for
   * it wires it up and ships the 10. Coverage now comes from `world`, which is computed
   * by the engine from the content index.
   */
  readonly questDone?: number
  readonly questTotal?: number
  readonly challengeIn?: string
  readonly friendsOnline?: number
  /**
   * `leagueTier` and `leaguePercentile` used to sit here as free-form strings that
   * nothing ever rendered. The league is real now and arrives as `league` below,
   * already resolved — a tier the i18n catalogue can name and two numbers, rather than
   * two sentences somebody would have had to assemble at the call site.
   */
}

/**
 * The globe on Home's world card.
 *
 * Smaller than Explore's 72: that card is the whole point of the Explore tab and this
 * one sits below the path and the quest on a scrolling home screen, so it gets a mark
 * rather than a hero.
 */
const WORLD_GLOBE = 56

export type HomeScreenProps = {
  readonly dailyAdventure?: DailyAdventureProps | undefined
  readonly progress: HomeProgress | null
  readonly loading: boolean
  readonly isOffline: boolean
  /**
   * The first-week course as a path, and what each of its buttons does.
   *
   * THE primary action on Home. Absent only where there is no route behind the screen —
   * a component test, the screenshot renderer — and then the section is simply not drawn.
   * An unreadable course arrives as `path.status === 'error'` and draws its own error card.
   */
  readonly course?: Omit<CoursePathProps, 'onCurrentLayout'> | undefined
  /**
   * Plays today's quest — the quest card's secondary button.
   *
   * This was `onStartLesson` while the quest card held Home's one green button. The path
   * holds it now, and the quest is one secondary card below it; the handler is unchanged
   * (the quest's own facts, through its cover page when that flag is on). Absent draws
   * the card without a button rather than a dead one.
   */
  readonly onPlayQuest?: (() => void) | undefined
  /** Optional so the screenshot renderer and component tests mount without a router. */
  readonly onOpenStreak?: (() => void) | undefined
  /**
   * Today's quest, as tasks done out of tasks set.
   *
   * Tasks rather than facts, because "five things, about ten minutes" is the promise on
   * screen. Absent while the content index is still building, which is the only moment
   * there is no quest to describe.
   */
  readonly quest?:
    | { readonly done: number; readonly total: number; readonly complete: boolean }
    | undefined
  /**
   * Whether to offer another lesson once the quest is finished.
   *
   * The user's own daily goal, reduced to a yes/no before it reaches this screen. Someone
   * who asked for five minutes a day and finished the quest has done what they set out to
   * do, and putting "Practise anyway" in front of them turns a completed day into an
   * unfinished one. Someone who asked for twenty wants the offer. It is the one job the
   * daily-goal setting has on Home — a setting nothing reads is a bug this app has
   * shipped before — so it stays even though the path is always there.
   */
  readonly offerMore?: boolean | undefined
  /**
   * How much of the world this user has actually covered.
   *
   * It leads with what is DUE, because in a spaced-repetition app that is the only
   * time-sensitive fact on the screen. When nothing is due it shows the shape of what is
   * left — seeing the gap is the motivation, and hiding it reads as a smaller world.
   */
  readonly world?: HomeWorld | undefined
  /** Opens Explore. Absent renders the card without its control rather than a dead one. */
  readonly onOpenWorld?: (() => void) | undefined
  /**
   * How long today's quest has left, already formatted.
   *
   * A string rather than a timestamp, deliberately: this screen is pure and formatting a
   * duration needs a clock and a locale. Absent means "we cannot say", and absent renders
   * nothing — never an em-dash.
   */
  readonly resetsIn?: string | undefined
  /** The title the user is wearing, for the middle fact chip. */
  readonly titleKey?: TranslationKey | undefined
  readonly onOpenQuests?: (() => void) | undefined
  /**
   * This week's standing, or nothing.
   *
   * Absent whenever there is no league to show — the flag is closed, the user opted
   * out, they are under 13, or the weekly placement has not run for them yet. All four
   * are ordinary, and all four look the same from here: no chip.
   */
  readonly league?:
    | {
        /** Already localised — the screen does not know the tier list. */
        readonly tier: string
        readonly position: number
        readonly total: number
        readonly onPress: () => void
      }
    | undefined
  /**
   * The "Want a nudge?" card, or nothing.
   *
   * Absent is the normal state — this appears twice in the lifetime of an install. The
   * decision is the engine's (`shouldAskForReminder`); passing the resolved answer keeps
   * this screen presentational.
   */
  readonly reminderAsk?:
    | { readonly onAccept: () => void; readonly onDismiss: () => void }
    | undefined
  /**
   * "Lessons with sound?" — once, after the first finished lesson (`useSoundAsk`). Absent
   * the rest of the time, and never alongside the reminder ask.
   */
  readonly soundAsk?:
    | { readonly onAccept: () => void; readonly onDismiss: () => void }
    | undefined
  /**
   * The streak card — a freeze that kept the streak, or a repair still open — or nothing.
   */
  readonly streakNotice?: StreakNoticeCardProps | undefined
}

/** The subset of the engine's `WorldProgress` this screen draws. */
export type HomeWorld = {
  readonly entitiesTotal: number
  readonly entitiesComplete: number
  readonly factsTotal: number
  readonly factsLearned: number
  readonly factsDue: number
}

function greetingKey(hour: number): TranslationKey {
  if (hour < 12) return 'home:greeting.morning'
  if (hour < 18) return 'home:greeting.afternoon'
  return 'home:greeting.evening'
}

export function HomeScreen({
  progress,
  loading,
  isOffline,
  course,
  onPlayQuest,
  onOpenStreak,
  quest,
  offerMore = false,
  world,
  onOpenWorld,
  resetsIn,
  titleKey = 'titles:wanderer',
  onOpenQuests,
  league,
  reminderAsk,
  soundAsk,
  streakNotice,
  dailyAdventure,
}: HomeScreenProps) {
  const { colors, styles } = useThemeValues()
  // Before the early return: hooks cannot be conditional, and the skeleton needs
  // translated copy too.
  const t = useT()
  const bringIntoView = useScrollIntoView()
  const { height, fontScale } = useWindowDimensions()

  if (loading) return <HomeSkeleton />

  return (
    <View style={styles.screen}>
      {/* The top bar is pinned too, as Duolingo's is. Home brings the path's step into
          view on open, and on a 375 or 320 pt phone that scrolled the avatar, the streak
          flame and the coins off the top before the learner had seen them (round-3
          design review). The bar is the one row every tab starts with; it stays put. */}
      <View style={styles.topBar}>
        <TopBar
          initials="EX"
          {...(progress !== null ? { coins: progress.coins } : {})}
          {...(onOpenStreak !== undefined && progress !== null ? { onStreak: onOpenStreak, streak: progress.streak } : {})}
        />
      </View>
      {/* Pinned above the scroll view rather than scrolled with it. The catalogue asks for
          a persistent banner (H6), and once Home brings the path's step into view on a
          short phone, a banner at the top of the content was the first thing scrolled
          away — offline at 320 pt, nothing on screen said so. */}
      {isOffline && (
        <View style={styles.offlineBar}>
          <View style={styles.offline} role="alert">
            <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
          </View>
        </View>
      )}
      <ScrollView
        ref={bringIntoView.scroller}
        contentContainerStyle={styles.content}
        onLayout={bringIntoView.onViewport}
        onScroll={bringIntoView.onScroll}
        scrollEventThrottle={16}
      >
        {/* Two-tier greeting: light salutation, bold role.
            Atlas used to wave from beside it. He stands in the current unit's banner now,
            a few points lower — one mascot per screen, beside the part of the path you
            are on — and the greeting is two lines of words again, which is what lets the
            path's first step reach the fold on a 320 pt phone. */}
        {course === undefined && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: space[2] }}>
          <Text style={styles.salutation}>{t(greetingKey(new Date().getHours()))}</Text>
          <Text style={styles.explorer} role="heading">
            {t('home:greeting.role')}
          </Text>
        </View>}

        {/* Three facts about today, in a row, above everything you can act on — the
            answer to "where am I?" before the screen asks anything of you. The quest's
            count lives here too, so it stays at the top of Home now that its card sits
            below the path.

            The middle one is the earned TITLE, and the league sits beside it rather than
            replacing it: they are different rewards. The league chip appears only when
            there IS one. */}
        {dailyAdventure !== undefined ? <DailyAdventure {...dailyAdventure} compact={height < 700 || fontScale > 1.3} /> : <View style={styles.factRow}>
          {/* Not at zero. The coin chip shows 0 quite happily: a wallet reading 0 is a
              fact about a balance, and a streak reading 0 is a verdict on the person
              holding it. */}

          {progress !== null && progress.streak > 0 && (
            <Fact
              icon="streak"
              tint={colors.status.streak}
              label={t('home:streak.label')}
              value={t('home:facts.streak', { count: progress.streak })}
            />
          )}
          <Fact
            icon="medal"
            tint={colors.reward.coin}
            label={t('home:facts.rank')}
            value={t(titleKey)}
          />
          {/* Absent, never an em-dash: `quest` is undefined only while the content index
              is still building. */}
          {quest !== undefined && (
            <Fact
              icon="quests"
              tint={colors.action.primary}
              label={t('nav:quests')}
              value={t('home:facts.quests', { done: quest.done, total: quest.total })}
              {...(onOpenQuests !== undefined ? { onPress: onOpenQuests } : {})}
            />
          )}
          {league !== undefined && (
            <Fact
              icon="trophy"
              tint={colors.status.premium}
              label={league.tier}
              value={t('league:home.position', {
                position: league.position,
                total: league.total,
              })}
              onPress={league.onPress}
            />
          )}
        </View>}

        {/* The course path — the one primary action, and the reason Home exists.
            Measured so the step you are on can be scrolled into view: see
            `useScrollIntoView`. */}
        {course !== undefined && (
          <View onLayout={bringIntoView.onPathLayout}>
            <CoursePath {...course} condensed onCurrentLayout={bringIntoView.onCurrentLayout} />
          </View>
        )}

        {/* Today's quest — secondary now, and still the day's five challenges.
            The card used to be Home's primary action with Atlas as its scene; the path
            took both. What is left is the quest as the brief frames it: optional, one
            blue button, the same count and rewards. Blue because green on this screen
            means the step you are on. */}
        {quest !== undefined && (
          <Card level={1} style={styles.questCard} testID="home-quest">
            <View style={styles.questHead}>
              <Icon name="quests" size={20} color={colors.reward.xp} />
              <Text style={styles.questLabel} role="heading">
                {t('home:quest.today')}
              </Text>
              <View style={styles.spacer} />
              {/* How long today has left, when the route knows. Absent when there is no
                  time to state, never an em-dash. */}
              {resetsIn !== undefined && (
                <View style={styles.countdown}>
                  <Icon name="clock" size={12} color={colors.text.secondary} />
                  <Text style={styles.countdownText}>{resetsIn}</Text>
                </View>
              )}
            </View>
            <Text style={styles.questTitle}>
              {quest.complete ? t('home:quest.done') : t('home:quest.play')}
            </Text>
            {/* The bar measures the quest and the sentence under the title measures the
                quest, so the bar's label is that sentence and nothing else. Shown at zero:
                an empty bar says "there is a shape to fill". */}
            <ProgressBar
              current={quest.done}
              total={Math.max(1, quest.total)}
              tone="reward"
              showCount={false}
              label={
                quest.complete
                  ? t('home:quest.doneBody')
                  : t('quests:progress', { done: quest.done, total: quest.total })
              }
              valueText={
                quest.complete
                  ? t('home:quest.doneBody')
                  : t('quests:progress', { done: quest.done, total: quest.total })
              }
            />
            {/* What finishing it pays, from the balance table and nowhere else. Hidden once
                the quest is done: a reward you have collected is a receipt, not an
                incentive. */}
            {!quest.complete && (
              <View style={styles.rewards}>
                <Stat
                  kind="xp"
                  value={`+${BALANCE.xp.dailyQuest}`}
                  accessibilityLabel={t('home:quest.reward.xp', { amount: BALANCE.xp.dailyQuest })}
                />
                <Stat
                  kind="coin"
                  value={`+${BALANCE.coins.dailyQuest}`}
                  accessibilityLabel={t('home:quest.reward.coins', {
                    amount: BALANCE.coins.dailyQuest,
                  })}
                />
              </View>
            )}
            {/* One secondary button, and after the quest is done only for somebody whose
                own goal is not met yet (`offerMore`). */}
            {onPlayQuest !== undefined &&
              (!quest.complete ? (
                <Button
                  label={t('quests:intro.start')}
                  variant="secondary"
                  size="md"
                  onPress={onPlayQuest}
                  testID="home-quest-start"
                />
              ) : offerMore ? (
                <Button
                  label={t('home:quest.more')}
                  variant="secondary"
                  size="md"
                  onPress={onPlayQuest}
                />
              ) : null)}
          </Card>
        )}

        {/* The streak's news, when there is any: a freeze that did its job yesterday, or a
            broken streak that can still come back. Below the path, not above it — a card
            above would push the step you are on below the fold on a 320pt phone for as
            long as the news lasted, and news about the streak is not urgent (rule 7). */}
        {streakNotice !== undefined && <StreakNoticeCard {...streakNotice} />}

        {/* "Want a nudge?" — the in-context permission ask. After the third finished
            lesson, on the screen a lesson ends on, and NEVER on first launch:
            `notifications.md` §1. */}
        {reminderAsk !== undefined && (
          <Card level={2} style={styles.reminderCard}>
            <Text style={styles.reminderTitle} role="heading">
              {t('home:reminder.title')}
            </Text>
            <Text style={styles.reminderBody}>{t('home:reminder.body')}</Text>
            <View style={styles.reminderActions}>
              <Button
                label={t('home:reminder.yes')}
                onPress={reminderAsk.onAccept}
                fullWidth={false}
              />
              {/* "Not now", not "No thanks": the one retry is ninety days away and the
                  user has not refused anything yet. */}
              <Button
                label={t('home:reminder.later')}
                variant="secondary"
                onPress={reminderAsk.onDismiss}
                fullWidth={false}
              />
            </View>
          </Card>
        )}

        {/* Sound is off by default (`lib/sound.ts`); this is the one offer to turn it on.
            Same card as the reminder ask, and never shown with it. */}
        {soundAsk !== undefined && reminderAsk === undefined && (
          <Card level={2} style={styles.reminderCard} testID="home-sound-ask">
            <Text style={styles.reminderTitle} role="heading">
              {t('home:sound.title')}
            </Text>
            <Text style={styles.reminderBody}>{t('home:sound.body')}</Text>
            <View style={styles.reminderActions}>
              <Button label={t('home:sound.yes')} onPress={soundAsk.onAccept} fullWidth={false} />
              <Button
                label={t('home:sound.later')}
                variant="secondary"
                onPress={soundAsk.onDismiss}
                fullWidth={false}
              />
            </View>
          </Card>
        )}

        {/* Your world — real, local, and works offline, because mastery lives on the
            device. */}
        {world !== undefined && world.factsTotal > 0 && (
          <Card style={styles.worldCard} accessibilityLabel={t('home:world.label')}>
            {/* The same globe Explore's world card carries. Decorative — the heading and
                both counts already say what it is. */}
            <Art name="rewards/globe" size={WORLD_GLOBE} />
            <View style={styles.worldBody}>
              <View style={styles.worldHead}>
                <Text style={styles.cardTitle}>{t('home:world.title')}</Text>
                <Tally style={styles.worldCountries} numberStyle={styles.worldCountriesNumber}>
                  {t('home:world.countries', {
                    complete: world.entitiesComplete,
                    total: world.entitiesTotal,
                  })}
                </Tally>
              </View>

              <ProgressBar
                current={world.factsLearned}
                total={world.factsTotal}
                showCount={false}
                // Gold when something is waiting, so "come back to this" reads the same
                // here as it does on the continent cards.
                tone={world.factsDue > 0 ? 'reward' : 'progress'}
                label={t('home:world.facts', {
                  learned: world.factsLearned,
                  total: world.factsTotal,
                })}
                valueText={t('home:world.facts', {
                  learned: world.factsLearned,
                  total: world.factsTotal,
                })}
              />

              {/* Due first: the only time-sensitive number on this screen. Silent at
                  zero — "0 reviews waiting" is a row that exists to say nothing. */}
              {world.factsDue > 0 && (
                <Tally style={styles.worldDue} numberStyle={styles.worldDueNumber}>
                  {t('home:world.due', { count: world.factsDue })}
                </Tally>
              )}

              {/* A row, not a button in a box: icon, label, chevron — the way into the
                  section it sits inside. */}
              {onOpenWorld !== undefined && (
                <Card
                  level={1}
                  onPress={onOpenWorld}
                  role="button"
                  accessibilityLabel={t('home:world.open')}
                  style={styles.worldRow}
                >
                  <Icon name="globe" size={20} color={colors.status.progress} />
                  <Text style={styles.worldRowLabel}>{t('home:world.open')}</Text>
                  <View style={styles.spacer} />
                  <Icon name="chevron" size={18} color={colors.text.tertiary} />
                </Card>
              )}
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  )
}

/**
 * Brings the path's current step into view when it is below the fold — the donor's path
 * opens at the step you are on, and U01 asks for start to be visible on the smallest
 * supported phone at larger text sizes without covering anything.
 *
 * Only when the step is actually out of view, and only once per step: a returning user
 * three units in lands on their step, a new user whose first step is already on screen
 * is not moved at all, and somebody who has scrolled away to read their world card is
 * not yanked back on every re-layout. Instant under Reduce Motion — the screen still
 * arrives where the step is, it just does not travel there.
 */
function useScrollIntoView() {
  const reduced = useReducedMotion()
  const scroller = useRef<ScrollView>(null)
  const viewport = useRef(0)
  const offset = useRef(0)
  const pathTop = useRef<number | null>(null)
  const target = useRef<{ y: number; height: number; unitY?: number } | null>(null)
  const shown = useRef<string | null>(null)

  const settle = useCallback(() => {
    const top = pathTop.current
    const at = target.current
    if (top === null || at === null || viewport.current === 0) return
    const y = top + at.y
    // Once per step AND viewport: the offline banner is pinned above the scroll view, so
    // going offline shrinks the viewport from the top and can push a step that was in
    // view below the fold — that is a new question, not a repeat of the old one.
    const key = `${y}:${at.height}:${viewport.current}`
    if (shown.current === key) return
    shown.current = key
    const bottom = y + at.height
    const visible = y >= offset.current && bottom <= offset.current + viewport.current
    if (visible) return
    // The least movement that shows the whole step — so as much as fits of what is above
    // it (its unit's banner, usually) stays on screen for context — and never so far that
    // the step's own top leaves. On a 320 × 568 phone that is the banner and the step
    // together; jumping the step to the top edge had scrolled the banner away.
    const reveal = bottom + space[5] - viewport.current
    // When the whole banner fits with the step, land on the banner's edge. The least
    // movement alone stopped mid-card and left a gold strip of the daily goal under the
    // top bar (audit 2026-10-06) — a screen that looks mis-scrolled, not arrived.
    const banner = at.unitY === undefined ? undefined : top + at.unitY - space[3]
    const stop = banner !== undefined && reveal <= banner && banner <= y ? banner : Math.min(reveal, y - space[3])
    scroller.current?.scrollTo({ y: Math.max(0, stop), animated: !reduced })
  }, [reduced])

  return {
    scroller,
    onViewport: useCallback(
      (event: LayoutChangeEvent) => {
        viewport.current = event.nativeEvent.layout.height
        settle()
      },
      [settle],
    ),
    onScroll: useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
      offset.current = event.nativeEvent.contentOffset.y
    }, []),
    onPathLayout: useCallback(
      (event: LayoutChangeEvent) => {
        pathTop.current = event.nativeEvent.layout.y
        settle()
      },
      [settle],
    ),
    onCurrentLayout: useCallback(
      (y: number, height: number, unitY?: number) => {
        target.current = unitY === undefined ? { y, height } : { y, height, unitY }
        settle()
      },
      [settle],
    ),
  }
}

/**
 * One fact about today: a glyph, a number, and what the number is.
 *
 * Deliberately NOT `Stat`/`StatChip`: those are wallet chips, and these are a stacked
 * label-and-value tile carrying a mixed bag of units. Pressable only when it goes
 * somewhere, and one accessibility element either way so a reader hears "Day streak,
 * 7 days" rather than three fragments.
 */
function Fact({
  icon,
  tint,
  label,
  value,
  onPress,
}: {
  readonly icon: IconName
  readonly tint: string
  readonly label: string
  readonly value: string
  readonly onPress?: (() => void) | undefined
}) {
  const { styles } = useThemeValues()
  const body = (
    <>
      <Icon name={icon} size={18} color={tint} />
      <View style={styles.factWords}>
        <Text style={styles.factValue}>{value}</Text>
        <Text style={styles.factLabel}>{label}</Text>
      </View>
    </>
  )

  if (onPress === undefined) {
    return (
      <View accessible aria-label={`${label}, ${value}`} style={styles.fact}>
        {body}
      </View>
    )
  }
  return (
    <Pressable onPress={onPress} role="button" aria-label={`${label}, ${value}`} style={styles.fact}>
      {body}
    </Pressable>
  )
}

/**
 * The same blocks as the screen, where they will land: the bar, two lines of greeting,
 * the fact row, then the path's banner, callout and steps — so nothing moves when the
 * data arrives.
 */
function HomeSkeleton() {
  const { styles } = useThemeValues()
  const t = useT()

  return (
    <View style={styles.screen} aria-label={t('common:loading')}>
      <View style={styles.content}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <Skeleton width="55%" height={26} />
        <View style={styles.factRow}>
          <Skeleton height={72} borderRadius={radius.lg} style={styles.flex} />
          <Skeleton height={72} borderRadius={radius.lg} style={styles.flex} />
        </View>
        <CoursePathSkeleton />
      </View>
    </View>
  )
}



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[4], paddingBottom: space[6] },
  flex: { flex: 1 },

  // Three across, `flex: 1` rather than a percentage — a percentage plus a gap
  // overflows the row by the gap.
  factRow: { flexDirection: 'row', gap: space[2] },
  fact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    borderRadius: radius.lg,
    ...squircle,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    // A real target even for the two that are pressable, without the tile growing.
    minHeight: 56,
    justifyContent: 'center',
  },
  factValue: { ...text('bodyStrong', { numeric: true }), color: colors.text.primary },
  factWords: { flexShrink: 1 },
  factLabel: { ...text('caption'), color: colors.text.tertiary },

  salutation: { ...text('body'), color: colors.text.secondary },
  explorer: { ...text('h1'), color: colors.text.primary },

  questCard: { gap: space[3] },
  // Wraps: at 200 % text on a 320pt phone the countdown does not fit beside the heading,
  // and "23h 23m left" (the longest it gets, just after midnight) was clipped. It drops
  // to its own line instead.
  questHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  questLabel: { ...text('h3'), color: colors.text.primary },
  questTitle: { ...text('body'), color: colors.text.secondary },
  // A quiet pill: the countdown is context rather than a reward.
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radius.full,
    backgroundColor: colors.bg.surfaceRaised,
  },
  countdownText: { ...text('caption', { numeric: true }), color: colors.text.secondary },
  rewards: { flexDirection: 'row', gap: space[2] },
  spacer: { flex: 1 },

  reminderCard: { gap: space[2] },
  reminderTitle: { ...text('h3'), color: colors.text.primary },
  reminderBody: { ...text('body'), color: colors.text.secondary },
  reminderActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },

  // A row, so the globe sits beside the counts rather than above them.
  worldCard: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  worldBody: { flex: 1, gap: space[3] },
  worldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  // The words plain, the digits emphasised.
  worldCountries: { ...text('caption'), color: colors.text.secondary },
  worldCountriesNumber: {
    ...text('caption', { weight: '700', numeric: true }),
    color: colors.text.primary,
  },
  // Gold on the whole line, deliberately: the only time-sensitive number on Home, and the
  // colour is what makes it findable — so the digits take weight rather than colour.
  worldDue: { ...text('caption'), color: colors.reward.xp },
  worldDueNumber: { ...text('caption', { weight: '800', numeric: true }), color: colors.reward.xp },
  worldRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  worldRowLabel: { ...text('body', { weight: '700' }), color: colors.text.primary },

  cardTitle: { ...text('h3'), color: colors.text.primary },

  offlineBar: { paddingHorizontal: space[4], paddingTop: space[4] },
  topBar: { paddingHorizontal: space[4], paddingTop: space[4] },
  offline: {
    backgroundColor: colors.bg.surfaceRaised,
    padding: space[3],
    borderRadius: radius.md,
    ...squircle,
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
  return { colors, styles }
})
