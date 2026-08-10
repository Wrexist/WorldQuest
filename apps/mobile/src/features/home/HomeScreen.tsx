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
  colors,
  ProgressBar,
  radius,
  Skeleton,
  space,
  squircle,
  StreakBadge,
  Tally,
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

/**
 * The globe on Home's world card.
 *
 * Smaller than Explore's 72: that card is the whole point of the Explore tab and this
 * one is the third block down a scrolling home screen, so it gets a mark rather than a
 * hero.
 */
const WORLD_GLOBE = 56

export type HomeScreenProps = {
  readonly progress: HomeProgress | null
  readonly loading: boolean
  readonly isOffline: boolean
  readonly onStartLesson: () => void
  /** Optional so the screenshot renderer and component tests mount without a router. */
  readonly onOpenStreak?: (() => void) | undefined
  /**
   * Today's quest, as tasks done out of tasks set.
   *
   * This replaced a `goal` of lessons-done against a target derived from the user's
   * measured pace. Two problems with that, and the second is the reason this card
   * exists: the target MOVED when the pace estimate moved, so finishing work could
   * lengthen the bar; and it counted a different quantity from the thing the card is
   * about. One card, one number.
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
   * unfinished one — which is the whole thing the quest card was rebuilt to stop.
   * Someone who asked for twenty wants the offer.
   *
   * A boolean rather than the goal itself: this screen has no business knowing what a
   * daily goal is, and passing minutes would invite it to render them.
   */
  readonly offerMore?: boolean | undefined
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
  quest,
  offerMore = false,
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
          {/* The economy, in the header, from the first screen.
   
              Measured off the reference: two chips, right-aligned, each about 2 % of the
              screen's height, above the hero card. Ours had a bell and nothing else —
              the coin balance was real and on this screen the whole time, in a `Stat`
              inside the LEVEL card, below the fold and gated on `!isNewUser`. So the
              currency the entire product turns on was invisible to precisely the user
              who has never seen it.
   
              Coins show at zero and the streak does not, and that is not an
              inconsistency. A wallet reading 0 is a fact about a balance; a streak
              reading 0 is a verdict on the person holding it. The test one row down
              says so in the case that matters: "0 day streak" is a worse first
              impression than none. */}
          {progress && (
            <Stat
              kind="coin"
              value={progress.coins}
              accessibilityLabel={t('home:stats.coins', { amount: progress.coins })}
            />
          )}
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
          <View style={styles.bell} accessible aria-label={t('home:inbox.label')}>
            <Icon name="bell" size={20} color={colors.text.secondary} />
          </View>
        </View>

        {/* Two-tier greeting: light salutation, bold role. Matches the mockup and
            keeps the header to two lines instead of three. */}
        {/* The streak used to sit here, beside the greeting. It has moved up into the
            row above so that the two economy chips are one group in one place, which is
            what the reference does and what makes them findable — a streak on the
            second row and a coin balance three cards down are two facts a user has to
            hunt for separately. */}
        <View style={styles.greetingRow}>
          <View style={styles.greetingText}>
            <Text style={styles.salutation}>{t(greetingKey(new Date().getHours()))}</Text>
            <Text style={styles.explorer} role="heading">
              {t('home:greeting.role')}
            </Text>
          </View>
        </View>

        {/* Today's quest — the one primary action, and now the one SESSION.
   
            This card used to name whichever task came next ("Find it on the map") above a
            bar counting lessons, and its button started a generic lesson that advanced the
            quest only by coincidence. The card is the quest now: it says how much of the
            quest is left, and its button plays the quest's own facts. See
            `docs/product/daily-quest-research.md`. */}
        <Card level={2} style={styles.questCard}>
          <View style={styles.questBody}>
            <View style={styles.questText}>
              <Text style={styles.cardLabel}>{t('home:quest.today')}</Text>
              <Text style={styles.questTitle}>
                {/* Three moments, three lines. A first launch is genuinely different
                    from a Tuesday and is the one the whole funnel turns on, so it keeps
                    the warmer copy — "Five things, about ten minutes" is the right thing
                    to say to somebody who already knows what the quest is, and the wrong
                    first sentence in the product. */}
                {quest?.complete === true
                  ? t('home:quest.done')
                  : isNewUser
                    ? t('home:quest.empty')
                    : t('home:quest.play')}
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


          {/* The bar measures the SENTENCE ABOVE IT, and nothing else.
   
              It used to draw `questDone / questTotal` — the daily quest's five tasks —
              directly under "0 of 5 lessons today", which is a different quantity. With
              the bar hidden for new users nobody saw the two together; showing it
              revealed them stacked and disagreeing, one reading "0 of 5 lessons" and
              the one below it "Progress 0 / 10". Two counts, six pixels apart, about
              different things.
   
              So the bar is the goal's, `showCount` is off because the sentence is
              already the count, and quest-task progress stays on the Quests tab, which
              draws all five tasks and can say which is which.
   
              Shown at zero, which it was not: `!isNewUser` hid it from exactly the user
              it scaffolds for. Someone on their first launch got a sentence and a
              button; someone who had already worked out how the app fits together got
              the diagram. An empty bar says "there is a shape to fill". */}
          {/* The bar measures the QUEST, and the sentence above it measures the quest,
              so the bar carries no label of its own.
   
              It used to measure "lessons today" against a target derived from the user's
              pace — a second quantity on a card about a quest, and one that moved when
              the pace estimate moved. One card, one number: five tasks, this many done.
   
              Shown at zero deliberately. An empty bar says "there is a shape to fill",
              and the user it scaffolds for is exactly the one on their first launch. */}
          {quest !== undefined && (
            <ProgressBar
              current={quest.done}
              total={Math.max(1, quest.total)}
              tone="reward"
              // The sentence IS the label, not a `Text` above the bar. `label` renders
              // visibly and doubles as the accessible name, so writing it in both places
              // would put the same words on screen twice six pixels apart — which is
              // exactly what the goal line used to do here.
              showCount={false}
              label={
                quest.complete
                  ? t('home:quest.doneBody')
                  : t('quests:progress', { done: quest.done, total: quest.total })
              }
            />
          )}

          {/* One button, and after the quest is done it stops being primary.
   
              Finishing the quest is the day's ritual, so the screen has to say plainly
              that the obligation is discharged — a primary green button still shouting
              CONTINUE at somebody who has finished would make the finish meaningless.
              What is left is an offer, in the secondary style, for the people who want
              more. */}
          {quest?.complete !== true ? (
            <Button label={t('common:continue')} onPress={onStartLesson} />
          ) : offerMore ? (
            <Button
              label={t('home:quest.more')}
              variant="secondary"
              onPress={onStartLesson}
            />
          ) : null}
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
            {/* The same globe Explore's world card carries. Two screens showing the same
                two numbers under the same heading looked like two different features
                because one had a picture and the other did not. Decorative — the heading
                and both counts already say what it is. */}
            <Art name="rewards/globe" size={WORLD_GLOBE} />
            {/* Everything else stays a COLUMN. The card is a row now, so without this
                wrapper the heading, the bar and the link would each become a column of
                their own beside the globe. */}
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

            {/* Due first: it is the only time-sensitive number on this screen, and it
                was previously reachable only two taps into Explore. Silent at zero —
                "0 reviews waiting" is a row that exists to say nothing, and a daily
                nudge that fires on an empty inbox is how an app trains people to
                ignore it. */}
            {world.factsDue > 0 && (
              <Tally style={styles.worldDue} numberStyle={styles.worldDueNumber}>
                {t('home:world.due', { count: world.factsDue })}
              </Tally>
            )}

            {/* A row, not a button in a box.
   
                Measured off the reference: its equivalent is a full-width row carrying
                an icon, a label and a chevron — the icon says which world, the chevron
                says "there is more through here". Ours was a small outlined `Button`
                floating in the card's own padding, which reads as an optional extra
                rather than as the way into the section it is sitting inside.
   
                The pattern is Profile's shop row, imported by shape rather than by
                code: a `Card` that is itself pressable, icon, label, spacer, chevron.
                Reusing it beats inventing a second row that looks almost the same,
                which is how two conventions start. */}
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
            {/* XP only. Coins moved to the header, where a balance belongs; XP stays
                here because it is what the bar above it is measuring. */}
            <View style={styles.chips}>
              <Stat
                kind="xp"
                value={progress.xpTotal}
                accessibilityLabel={t('home:stats.xp', { amount: progress.xpTotal })}
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

  topRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  spacer: { flex: 1 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    ...squircle,
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

  challengeCard: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  challengeText: { flex: 1, gap: space[1] },
  // Tabular, because it ticks: proportional digits make the whole card twitch.
  countdown: { ...text('numeric'), color: colors.text.primary },

  twoUp: { flexDirection: 'row', gap: space[3] },
  tile: { flex: 1, gap: space[1] },
  leagueTier: { ...text('h3', { weight: '700' }), color: colors.reward.xp },

  // A row now, so the globe sits beside the counts rather than above them.
  worldCard: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  worldBody: { flex: 1, gap: space[3] },
  worldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  // The words plain, the digits emphasised — the whole line was bold-secondary, which
  // is a caption shouting rather than a count reading as one.
  worldCountries: { ...text('caption'), color: colors.text.secondary },
  worldCountriesNumber: {
    ...text('caption', { weight: '700', numeric: true }),
    color: colors.text.primary,
  },
  // Gold on the whole line, deliberately: this is the only time-sensitive number on
  // Home and the colour is what makes it findable. So here the digits take WEIGHT
  // rather than a different colour — recolouring them would spend the one signal the
  // line exists for.
  worldDue: { ...text('caption'), color: colors.reward.xp },
  worldDueNumber: { ...text('caption', { weight: '800', numeric: true }), color: colors.reward.xp },
  levelCard: { gap: space[3] },
  chips: { flexDirection: 'row', gap: space[2] },
  worldRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  worldRowLabel: { ...text('body', { weight: '700' }), color: colors.text.primary },

  cardLabel: { ...text('caption'), color: colors.text.secondary },
  cardTitle: { ...text('h3'), color: colors.text.primary },

  offline: {
    backgroundColor: colors.bg.surfaceRaised,
    padding: space[3],
    borderRadius: radius.md,
    ...squircle,
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
