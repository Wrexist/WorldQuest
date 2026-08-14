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

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  Card,
  colors,
  ProgressBar,
  radius,
  Skeleton,
  space,
  squircle,
  Tally,
  text,
} from '@worldquest/design'
import { BALANCE } from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { Icon } from '../../components/Icon.js'
import type { IconName } from '../../lib/icons.generated.js'
import { Stat } from '../../components/Stat.js'
import { TopBar } from '../../components/TopBar.js'

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

/**
 * Atlas beside the greeting.
 *
 * Smaller than the quest card's 132: that card is the primary action and this is a
 * salutation, so he waves from the corner rather than presenting the screen. 84 is the
 * largest that leaves a two-line greeting its own measure at 320.
 */
const GREETING_ART = 84

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
  /**
   * How long today's quest has left, already formatted.
   *
   * A string rather than a timestamp, deliberately: this screen is pure and formatting a
   * duration needs a clock and a locale. Absent means "we cannot say", and absent renders
   * nothing — which is the fix for the em-dash the old `challengeIn` produced.
   */
  readonly resetsIn?: string | undefined
  /** The title the user is wearing, for the middle fact chip. */
  readonly titleKey?: TranslationKey | undefined
  readonly onOpenInbox?: (() => void) | undefined
  readonly onOpenQuests?: (() => void) | undefined
  /**
   * The "Want a nudge?" card, or nothing.
   *
   * Absent is the normal state — this appears twice in the lifetime of an install. The
   * decision is the engine's (`shouldAskForReminder`); passing the resolved answer keeps
   * this screen presentational and keeps the timing rule in the one place it is tested.
   */
  readonly reminderAsk?:
    | { readonly onAccept: () => void; readonly onDismiss: () => void }
    | undefined
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
  resetsIn,
  titleKey = 'titles:wanderer',
  onOpenInbox,
  onOpenQuests,
  reminderAsk,
}: HomeScreenProps) {
  // Before the early return: hooks cannot be conditional, and the skeleton needs
  // translated copy too.
  const t = useT()

  if (loading) return <HomeSkeleton />

  const isNewUser = !progress || progress.xpTotal === 0

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {isOffline && (
          <View style={styles.offline} role="alert">
            <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
          </View>
        )}

        <TopBar
          initials="EX"
          {...(progress !== null ? { coins: progress.coins } : {})}
          onInbox={onOpenInbox ?? (() => {})}
        />

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
          {/* Atlas waving hello, beside his own greeting.
   
              The redesign paints him into a landscape band behind the salutation. There
              is no landscape master (`docs/design/asset-prompts.md` has no entry for one
              and inventing a horizon is the one thing that page forbids), so he stands
              beside the words instead of in front of scenery — the same cutout, the same
              size, one layer short of the reference. Decorative: the greeting is right
              there in words. */}
          <View pointerEvents="none">
            <Art name="atlas/waving-back" size={GREETING_ART} />
          </View>
        </View>

        {/* Three facts about today, in a row, above everything you can act on.
   
            The streak was a badge in the header, the title was two taps into Profile, and
            quest progress was a bar inside the card below. Grouped, they are the answer to
            "where am I?" before the screen asks anything of you — which is what the
            reference puts here and what a header of loose chips could not say.
   
            The middle one is the earned TITLE rather than a league rank. Leagues are v2.0
            (`docs/systems/social-and-leagues.md`) and a rank chip today would be the third
            unbuilt thing on this screen; a title is the same shape of reward, is earned by
            the same ladder, and is real now. */}
        <View style={styles.factRow}>
          {/* Not at zero, which is the one rule this row inherited rather than
              invented. The coin chip beside it shows 0 quite happily: a wallet reading 0
              is a fact about a balance, and a streak reading 0 is a verdict on the person
              holding it. `HomeScreen.test.tsx` has held that line since the streak was a
              badge in the header, and moving it into a tile does not change what zero
              would say to a ten-year-old on their first morning. */}
          {progress !== null && progress.streak > 0 && (
            <Fact
              icon="streak"
              tint={colors.status.streak}
              label={t('home:streak.label')}
              value={t('home:facts.streak', { count: progress.streak })}
              {...(onOpenStreak !== undefined ? { onPress: onOpenStreak } : {})}
            />
          )}
          <Fact
            icon="medal"
            tint={colors.reward.coin}
            label={t('home:facts.rank')}
            value={t(titleKey)}
          />
          {/* Absent, never an em-dash.
   
              `quest` is undefined only while the content index is still building, which
              is the one moment there is no quest to count. A dash where a value belongs
              is a rendering bug the user has to interpret — the same defect that got the
              Daily Challenge card deleted, and `HomeScreen.test.tsx` holds the line. */}
          {quest !== undefined && (
            <Fact
              icon="quests"
              tint={colors.action.primary}
              label={t('nav:quests')}
              value={t('home:facts.quests', { done: quest.done, total: quest.total })}
              {...(onOpenQuests !== undefined ? { onPress: onOpenQuests } : {})}
            />
          )}
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
              <View style={styles.questHead}>
                <Text style={styles.cardLabel}>{t('home:quest.today')}</Text>
                {/* How long today has left, when the route knows.
   
                    A quest that resets is only urgent if you can see the clock, and this
                    card carried a `challengeIn` prop that NOTHING ever passed — so the
                    countdown it was written for rendered "New challenge in —" and was
                    deleted rather than filled. This is the filled version: absent when
                    there is no time to state, never an em-dash. */}
                {resetsIn !== undefined && (
                  <View style={styles.countdown}>
                    <Icon name="clock" size={12} color={colors.text.secondary} />
                    <Text style={styles.countdownText}>{resetsIn}</Text>
                  </View>
                )}
              </View>
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
              // The same sentence again, as the announced VALUE rather than the name.
              // `ProgressBar` cannot import the translator (design depends on nothing),
              // so without this it falls back to an English "3 of 5" — which is what a
              // Swedish user with VoiceOver heard, immediately after hearing the label
              // in Swedish. Passing the label twice reads as one clean announcement
              // because the bar's name and its value are spoken as one phrase.
              valueText={
                quest.complete
                  ? t('home:quest.doneBody')
                  : t('quests:progress', { done: quest.done, total: quest.total })
              }
            />
          )}

          {/* What finishing it pays, from the balance table and nowhere else.
   
              The reference shows three chips — a gem, a coin and an XP figure. Two of
              those three are real: `BALANCE.xp.dailyQuest` and `BALANCE.coins.dailyQuest`
              are the numbers the server actually awards, so they are read rather than
              typed. The gem is not: gems are purchase-only by design
              (`docs/systems/xp-economy.md` §4 — "Never buy hearts, XP, league position,
              or progression"), and a free quest that pays premium currency is a different
              monetisation model, not a different chip. Two chips that are true beat three
              that are not.
   
              Hidden once the quest is done: a reward you have already collected is not an
              incentive, it is a receipt. */}
          {quest?.complete !== true && (
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

        {/* "Want a nudge?" — the in-context permission ask.

            After the third finished lesson, on the screen the user lands on when a
            lesson ends, and NEVER on first launch: `notifications.md` §1, and the single
            biggest lever on opt-in rate there is. Asked twice for the lifetime of the
            install and then never again; `shouldAskForReminder()` in the engine owns
            both halves of that and this card only draws what it decided. */}
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
              {/* "Not now", not "No thanks". The one retry is ninety days away and the
                  user has not refused anything yet — wording it as a refusal would make
                  a dismissal feel like a door closing. */}
              <Button
                label={t('home:reminder.later')}
                variant="secondary"
                onPress={reminderAsk.onDismiss}
                fullWidth={false}
              />
            </View>
          </Card>
        )}

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

        {/* The level bar lived here AND on Profile, which is the mockup's own answer
            to where it belongs: Profile. It is gone rather than duplicated — the three
            facts at the top of this screen are what Home owes a returning user, and a
            second XP bar under them was the same number twice on one scroll. */}

      </ScrollView>
    </View>
  )
}

/**
 * One fact about today: a glyph, a number, and what the number is.
 *
 * Three of these in a row is the header the reference puts under the greeting, and the
 * shape is deliberately NOT `Stat`/`StatChip`: those are wallet chips — a tinted pill
 * carrying a balance — and these are a stacked label-and-value tile carrying a mixed bag
 * of units. Reusing the pill would have made a streak, a title and a fraction all read
 * as currencies.
 *
 * Pressable only when it goes somewhere, and one accessibility element either way so a
 * reader hears "Day streak, 7 days" rather than three fragments.
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
  const body = (
    <>
      <Icon name={icon} size={18} color={tint} />
      <Text style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.factLabel} numberOfLines={1}>
        {label}
      </Text>
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
  // Three across, `flex: 1` rather than a percentage — a percentage plus a gap
  // overflows the row by the gap.
  factRow: { flexDirection: 'row', gap: space[2] },
  fact: {
    flex: 1,
    alignItems: 'center',
    gap: space[1],
    paddingVertical: space[3],
    paddingHorizontal: space[2],
    borderRadius: radius.lg,
    ...squircle,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    // A real target even for the two that are pressable, without the tile growing.
    minHeight: 72,
    justifyContent: 'center',
  },
  factValue: { ...text('bodyStrong', { numeric: true }), color: colors.text.primary },
  factLabel: { ...text('caption'), color: colors.text.tertiary },
  questHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  // A quiet pill, not the loud one the reference draws in violet: this app has no
  // violet, and the countdown is context rather than a reward.
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
  rewards: { flexDirection: 'row', gap: space[2], marginTop: space[1] },
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
  reminderCard: { gap: space[2] },
  reminderTitle: { ...text('h3'), color: colors.text.primary },
  reminderBody: { ...text('body'), color: colors.text.secondary },
  reminderActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
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

  twoUp: { flexDirection: 'row', gap: space[3] },
  tile: { flex: 1, gap: space[1] },

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
