/**
 * Home — mockup screen 3.
 *
 * Laid out to match the mockup: avatar and notification bell, a two-tier greeting
 * with the streak stacked to its right, the quest card with art bleeding to the
 * edge, the daily challenge, and a Friends/League pair.
 *
 * The tab bar is NOT here — `app/(tabs)/_layout.tsx` owns it. A screen that draws its
 * own chrome cannot be reused inside a navigator without drawing it twice.
 *
 * Three deliberate deviations from the mockup, each recorded in
 * docs/design/mockup-fidelity.md — none of them is an oversight.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Avatar,
  Button,
  Card,
  ProgressBar,
  Skeleton,
  StreakBadge,
  colors,
  radius,
  space,
  text,
} from '@worldquest/design'
import { levelForXp, xpForLevel } from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { Icon } from '../../components/Icon.js'
import { Stat } from '../../components/Stat.js'

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
  readonly questTitle?: string
  readonly questDone?: number
  readonly questTotal?: number
  readonly challengeIn?: string
  readonly friendsOnline?: number
  readonly leagueTier?: string
  readonly leaguePercentile?: string
}

/**
 * How big Atlas is drawn on the quest card.
 *
 * MEASURED off the reference: the mascot fills the card's right third and its full
 * height. 132 against a card that is ~326 wide inside its padding at 390 puts him at
 * about 40 % — a shade more than the donor, because ours is a cutout standing on a flat
 * card while theirs is a figure in a painted landscape that fills the rest of the space.
 *
 * It replaces a 92pt `ArtSlot`: a tinted placeholder frame from before the art existed,
 * still being drawn around the real thing.
 */
const QUEST_ART = 132

export type HomeScreenProps = {
  readonly progress: HomeProgress | null
  readonly loading: boolean
  readonly isOffline: boolean
  readonly onStartLesson: () => void
  /** Optional so the screenshot renderer and component tests mount without a router. */
  readonly onOpenStreak?: (() => void) | undefined
  /**
   * Today's daily goal, as lessons done and lessons targeted.
   *
   * The goal was asked for during onboarding, stored, and shown in Settings — and
   * read by nothing. `lessonsPerDay()` existed in the engine and was never called,
   * so picking 5 minutes or 20 minutes changed precisely nothing. This is where the
   * user finally sees the answer to the question they were asked.
   */
  readonly goal?: { readonly done: number; readonly target: number } | undefined
  /**
   * How much of the world this user has actually covered.
   *
   * Home had one real thing on it — the quest card — and for a new user everything
   * below it was a stub or empty, so the bottom 40 % of the screen was void. This is
   * the section that fills it with something true, and it is deliberately the same
   * `worldProgress` call Explore makes rather than a second count assembled here.
   *
   * It leads with what is DUE, because in a spaced-repetition app that is the only
   * time-sensitive fact on the screen and it was previously visible nowhere except
   * two taps into Explore. When nothing is due it shows the shape of what is left —
   * the same argument the collection screen already makes for showing uncollected
   * tiles: seeing the gap is the motivation, and hiding it reads as a smaller world.
   */
  readonly world?: HomeWorld | undefined
  /** Opens Explore. Absent renders the card without its control rather than a dead one. */
  readonly onOpenWorld?: (() => void) | undefined
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
  onStartLesson,
  onOpenStreak,
  goal,
  world,
  onOpenWorld,
}: HomeScreenProps) {
  // Before the early return: hooks cannot be conditional, and the skeleton needs
  // translated copy too.
  const t = useT()

  if (loading) return <HomeSkeleton />

  const level = progress ? levelForXp(progress.xpTotal) : 1
  const levelFloor = xpForLevel(level)
  const levelCeiling = xpForLevel(level + 1)
  const isNewUser = !progress || progress.xpTotal === 0

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {isOffline && (
          <View style={styles.offline} role="alert">
            <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
          </View>
        )}

        <View style={styles.topRow}>
          <Avatar initials="EX" accessibilityLabel={t('home:avatar.label')} />
          <View style={styles.spacer} />
          <View style={styles.bell} accessible aria-label={t('home:inbox.label')}>
            <Icon name="bell" size={20} color={colors.text.secondary} />
          </View>
        </View>

        {/* Two-tier greeting: light salutation, bold role. Matches the mockup and
            keeps the header to two lines instead of three. */}
        <View style={styles.greetingRow}>
          <View style={styles.greetingText}>
            <Text style={styles.salutation}>{t(greetingKey(new Date().getHours()))}</Text>
            <Text style={styles.explorer} role="heading">
              {t('home:greeting.role')}
            </Text>
          </View>
          {/* The badge is now the way in to freezes and repair. A streak the user can
              see but cannot protect is a number; making it tappable is what turns it
              into something they can act on. */}
          {progress && progress.streak > 0 && (
            <StreakBadge
              days={progress.streak}
              label={t('home:streak.label')}
              icon={<Icon name="streak" size={20} color={colors.status.streak} />}
              accessibilityLabel={t('home:streak.days', { count: progress.streak })}
              // The badge is the way in to freezes and repair. A streak you can see
              // but cannot protect is a number, not a feature.
              {...(onOpenStreak !== undefined ? { onPress: onOpenStreak } : {})}
            />
          )}
        </View>

        {/* Today's Quest — the one primary action. */}
        <Card level={2} style={styles.questCard}>
          <View style={styles.questBody}>
            <View style={styles.questText}>
              <Text style={styles.cardLabel}>{t('home:quest.today')}</Text>
              <Text style={styles.questTitle}>
                {progress?.questTitle ?? t('home:quest.empty')}
              </Text>
            </View>
            {/* Atlas as a SCENE, not a thumbnail.
   
                Measured off the reference: the mascot fills the card's right third and
                its art runs to the card's own right edge, which the card clips. Ours sat
                in a 92pt tinted `ArtSlot` — a placeholder frame from before the art
                existed, still being drawn around the real thing, so the most-opened card
                in the product read as a panel with a sticker on it.
   
                In the ROW, not behind the card. Absolute-and-bottom-anchored was tried
                first, copying the lesson sheet where the mascot leans out from behind the
                Continue button — and here that put him underneath it with only his hat
                showing. The same mechanic in a different frame is a different mechanic:
                on the sheet the button is furniture he leans past, on this card the
                button is below him and the thing he bleeds past is the card's own edge.
   
                Decorative — the card already says what the quest is. */}
            <View style={styles.questArt} pointerEvents="none">
              <Art name="atlas/thinking" size={QUEST_ART} />
            </View>
          </View>

          {!isNewUser && (
            <ProgressBar
              current={progress?.questDone ?? 0}
              total={progress?.questTotal ?? 10}
              tone="reward"
              label={t('home:quest.progress')}
            />
          )}

          {/* The daily goal, in the unit the user actually experiences: lessons, not
              minutes. Reached rather than exceeded — passing the goal is not a reason
              to stop, so the copy congratulates and the bar simply fills. */}
          {goal !== undefined && (
            <Text style={styles.goalLine}>
              {goal.done >= goal.target
                ? t('home:goal.met', { count: goal.done })
                : t('home:goal.progress', { done: goal.done, target: goal.target })}
            </Text>
          )}

          <Button label={t('common:continue')} onPress={onStartLesson} />
        </Card>

        {/* The Daily Challenge card is deliberately not here — see
            docs/design/mockup-fidelity.md. Nothing produces `challengeIn`, so it
            rendered "New challenge in —" for every user on every day, and an em-dash
            where a countdown belongs reads as broken rather than as pending.

            This is the same defect the quests audit found one card over: the shell was
            built, ticked as done, and never checked for a producer. "A daily quest that
            cannot be completed is worse than none — it is a promise on the home screen
            the app quietly breaks every day." The challenge had not even got as far as
            being uncompletable; it never arrived at all. */}

        {/* Your world — the section that was missing rather than broken.

            Home's lower half was empty for every new user: one real card, two stubs,
            and then nothing. This is real, local, and works offline, because mastery
            lives on the device. */}
        {world !== undefined && world.factsTotal > 0 && (
          <Card style={styles.worldCard} accessibilityLabel={t('home:world.label')}>
            <View style={styles.worldHead}>
              <Text style={styles.cardTitle}>{t('home:world.title')}</Text>
              <Text style={styles.worldCountries}>
                {t('home:world.countries', {
                  complete: world.entitiesComplete,
                  total: world.entitiesTotal,
                })}
              </Text>
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

            {/* Due first: it is the only time-sensitive number on this screen, and it
                was previously reachable only two taps into Explore. Silent at zero —
                "0 reviews waiting" is a row that exists to say nothing, and a daily
                nudge that fires on an empty inbox is how an app trains people to
                ignore it. */}
            {world.factsDue > 0 && (
              <Text style={styles.worldDue}>
                {t('home:world.due', { count: world.factsDue })}
              </Text>
            )}

            {onOpenWorld !== undefined && (
              <Button
                label={t('home:world.open')}
                onPress={onOpenWorld}
                variant="tertiary"
                size="sm"
              />
            )}
          </Card>
        )}

        {/* Friends / League pair, LAST rather than first.

            Both are unbuilt — Friends is v1.5, Leagues v2.0 — and they were sitting
            directly under the primary action, above the only section on this screen
            with real numbers in it. A new user read two tiles about features that do
            not exist before reaching the one that describes their actual progress.
            Order is the cheapest hierarchy there is: what is true goes first. */}
        <View style={styles.twoUp}>
          <Card style={styles.tile} accessibilityLabel={t('home:friends.label')}>
            <Text style={styles.cardTitle}>{t('home:friends.title')}</Text>
            <Text style={styles.cardLabel}>
              {t('home:friends.online', { count: progress?.friendsOnline ?? 0 })}
            </Text>
          </Card>
          <Card style={styles.tile} accessibilityLabel={t('home:league.label')}>
            <Text style={styles.cardTitle}>{t('home:league.title')}</Text>
            {/* Leagues are v2.0 and the tile stays, per the roadmap — but it stayed as
                an em-dash, which is not an empty state, it is a missing value. A tile
                that says plainly it is not open yet is honest; a dash is a rendering
                bug the user has to interpret. No date and no teaser: a promise with a
                month attached is a promise to break. */}
            {progress?.leagueTier === undefined ? (
              <Text style={styles.cardLabel}>{t('home:league.closed')}</Text>
            ) : (
              <>
                <Text style={styles.leagueTier}>{progress.leagueTier}</Text>
                <Text style={styles.cardLabel}>{progress.leaguePercentile ?? ''}</Text>
              </>
            )}
          </Card>
        </View>

        {/* Level bar, which the mockup carries on Profile rather than Home. */}
        {progress && !isNewUser && (
          <Card style={styles.levelCard} accessibilityLabel={t('home:stats.label')}>
            <ProgressBar
              current={progress.xpTotal - levelFloor}
              total={Math.max(1, levelCeiling - levelFloor)}
              label={t('home:level', { level })}
            />
            <View style={styles.chips}>
              <Stat
                kind="xp"
                value={progress.xpTotal}
                accessibilityLabel={t('home:stats.xp', { amount: progress.xpTotal })}
              />
              <Stat
                kind="coin"
                value={progress.coins}
                accessibilityLabel={t('home:stats.coins', { amount: progress.coins })}
              />
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  )
}

function HomeSkeleton() {
  const t = useT()

  return (
    <View style={styles.screen} aria-label={t('common:loading')}>
      <View style={styles.content}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <Skeleton width="55%" height={26} />
        <Skeleton height={190} borderRadius={radius.lg} />
        <Skeleton height={92} borderRadius={radius.lg} />
        <View style={styles.twoUp}>
          <Skeleton height={80} borderRadius={radius.lg} style={styles.flex} />
          <Skeleton height={80} borderRadius={radius.lg} style={styles.flex} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[3], paddingBottom: space[5] },
  flex: { flex: 1 },

  topRow: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellGlyph: { fontSize: 15, color: colors.text.secondary },

  greetingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space[3] },
  greetingText: { flex: 1 },
  salutation: { ...text('body'), color: colors.text.secondary },
  explorer: { ...text('h1'), color: colors.text.primary },

  // `overflow: hidden` so the mascot stops at the card's rounded corner. That clip is
  // the mechanic, not a tidy-up: art that ends before the edge is a picture placed in a
  // box, and art the box cuts is a scene the box is a window onto.
  questCard: { gap: space[3], overflow: 'hidden' },
  // Bleeds off the card's end edge and a little below its own row, so he overlaps the
  // gap toward the progress bar rather than sitting in a reserved rectangle. Negative
  // margins rather than absolute positioning: he still claims width in the row, which is
  // what keeps the title clear of him at every text size.
  // `End`, not `Right`: the whole card mirrors in RTL and the mascot belongs to whichever
  // side the text is not on.
  questArt: { marginEnd: -space[4], marginBottom: -space[3] },
  questBody: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  questText: { flex: 1, gap: space[1] },
  questTitle: { ...text('h2'), color: colors.text.primary },
  goalLine: { ...text('caption'), color: colors.text.secondary },

  challengeCard: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  challengeText: { flex: 1, gap: space[1] },
  // Tabular, because it ticks: proportional digits make the whole card twitch.
  countdown: { ...text('numeric'), color: colors.text.primary },

  twoUp: { flexDirection: 'row', gap: space[3] },
  tile: { flex: 1, gap: space[1] },
  leagueTier: { ...text('h3', { weight: '700' }), color: colors.reward.xp },

  worldCard: { gap: space[3] },
  worldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  worldCountries: { ...text('caption', { weight: '700', numeric: true }), color: colors.text.secondary },
  worldDue: { ...text('caption', { weight: '700' }), color: colors.reward.xp },
  levelCard: { gap: space[3] },
  chips: { flexDirection: 'row', gap: space[2] },

  cardLabel: { ...text('caption'), color: colors.text.secondary },
  cardTitle: { ...text('h3'), color: colors.text.primary },

  offline: {
    backgroundColor: colors.bg.surfaceRaised,
    padding: space[3],
    borderRadius: radius.md,
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
