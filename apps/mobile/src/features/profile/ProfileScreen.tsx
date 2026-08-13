/**
 * Profile — mockup screen 13.
 *
 * The screen that answers "what have I actually done?". Every number on it is real:
 * XP, coins and streaks come from the server (authoritative), and the per-continent
 * bars come from the progression engine over the user's local memory.
 *
 * The mockup shows `12,850 / 15,000 XP` on this screen. Those numbers do not
 * correspond to any coherent curve, so this uses the real one (`50·n^1.9`) and shows
 * the actual distance to the next level — recorded in mockup-fidelity.md.
 *
 * Presentational: data comes in, actions go out. The illustrated avatar is not
 * commissioned yet, so `Avatar` falls back to initials — which is not a placeholder,
 * it is the accessible default the component was built around.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Avatar,
  Button,
  Card,
  colors,
  palette,
  ProgressBar,
  radius,
  Skeleton,
  space,
  squircle,
  Tally,
  text,
} from '@worldquest/design'
import { levelProgress, type Tier, type WorldProgress } from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { REGIONS, type RegionCode } from '../explore/ExploreScreen.js'
import { Art } from '../../components/Art.js'
import { avatarArt } from '../settings/AvatarPicker.js'
import { INSIGNIA_SIZE, insigniaFor } from '../../lib/insignia.js'
import { Icon } from '../../components/Icon.js'
import { TopBar } from '../../components/TopBar.js'
import { AchievementMedal } from '../achievements/AchievementMedal.js'
import type { IconName } from '../../lib/icons.generated.js'

/**
 * The portrait, and the badges beside it.
 *
 * 96 rather than the 72 it was: this is the only picture on the screen and the one thing
 * a user is looking at when they open their own profile. `BADGE` is sized so four medals
 * plus their gaps clear 320 with room — five would not, which is why `RECENT_BADGES` is
 * four rather than "as many as fit".
 */
const PORTRAIT = 96
const BADGE = 60
const RECENT_BADGES = 4

const REGION_NAME: Record<RegionCode, TranslationKey> = {
  EU: 'explore:region.EU',
  AS: 'explore:region.AS',
  AF: 'explore:region.AF',
  NA: 'explore:region.NA',
  SA: 'explore:region.SA',
  OC: 'explore:region.OC',
  AN: 'explore:region.AN',
}

export type ProfileStats = {
  readonly xpTotal: number
  readonly coins: number
  readonly streak: number
  readonly longestStreak: number
  readonly factsMastered: number
}

/**
 * Lessons completed per day, oldest first, always seven entries.
 *
 * Seven fixed slots rather than "days with activity": a week with two active days
 * should read as two bars among five empty ones, not as a full-looking chart of two.
 */
export type WeekActivity = readonly { readonly day: string; readonly count: number }[]

export type ProfileScreenProps = {
  readonly stats: ProfileStats | null
  /** Absent while it is still loading; an all-zero week is a real, renderable answer. */
  readonly week?: WeekActivity | undefined
  readonly world: WorldProgress | null
  readonly loading: boolean
  /** Absent once the user has an account — the prompt disappears with the reason. */
  readonly onCreateAccount?: (() => void) | undefined
  /**
   * The title actually being worn — a bought one, or the level's own.
   *
   * Resolved by the route through `equippedTitleKey`, so this screen never has to
   * know that a stale local row can name something no longer owned. Absent means
   * nothing is equipped and the level title stands, which is also the answer for
   * every user who has never opened the shop.
   */
  readonly wornTitleKey?: string | undefined
  /**
   * Starts a lesson from the empty state.
   *
   * The empty state told the user to finish a lesson and gave them no way to start
   * one — a screen that names its own exit and does not open it. Optional for the same
   * reason as the two above: absent hides the control rather than rendering a dead one.
   */
  readonly onStartLesson?: (() => void) | undefined
  /** The chosen avatar id, or null/absent for initials. */
  readonly avatar?: string | null | undefined
  /**
   * The badges to show under "Recent", newest first.
   *
   * Earned ones only, and the screen renders at most `RECENT_BADGES` of them. Twelve
   * locked medallions belong on the achievements screen, which draws every one of them
   * and can say what each is for; a row on Profile is a trophy shelf, and a shelf of
   * things you have not won is not a shelf.
   */
  readonly badges?: readonly ProfileBadge[] | undefined
  /** Opens the achievements screen from the badge row's heading. */
  readonly onOpenAchievements?: (() => void) | undefined
  /** Opens Settings — the gear, now that More is not a tab. */
  readonly onOpenSettings?: (() => void) | undefined
  /** Renames the explorer. Absent renders the identity without a pencil. */
  readonly onRename?: (() => void) | undefined
}

/** One earned badge: which achievement, and the highest tier reached. */
export type ProfileBadge = {
  readonly id: string
  readonly tier: Tier
}

export function ProfileScreen({
  stats,
  week,
  world,
  loading,
  onCreateAccount,
  wornTitleKey,
  onStartLesson,
  avatar,
  badges,
  onOpenAchievements,
  onOpenSettings,
  onRename,
}: ProfileScreenProps) {
  const t = useT()
  // Falls back to initials when nothing is chosen, and also when a stored id names an
  // avatar this build does not ship — a set that shrinks must not leave a blank circle.
  const portrait = avatarArt(avatar ?? null)

  if (loading) return <ProfileSkeleton />

  if (stats === null || stats.xpTotal === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Avatar
          size={72}
          accessibilityLabel={t('profile:anonymous')}
          initials="EX"
          {...(portrait !== null ? { image: <Art name={portrait} size={72} /> } : {})}
        />
        {/* The blank explorer's journal, briefed for this screen as "ready to be
            filled, not sad" — which is the same distinction `profile:empty.body`
            draws in words. */}
        <Art name="states/empty-profile" size={140} />
        <Text style={styles.title} role="heading">
          {t('profile:empty.title')}
        </Text>
        <Text style={styles.subtitle}>{t('profile:empty.body')}</Text>
        {/* The empty state named the way out and did not open it. An empty state that
            tells you what to do next and then makes you find it yourself is a dead
            end — the one place a new user is most likely to be looking for a way in. */}
        {onStartLesson !== undefined && (
          <Button
            label={t('profile:empty.cta')}
            onPress={onStartLesson}
            fullWidth={false}
            style={styles.emptyCta}
          />
        )}
      </View>
    )
  }

  // One call, in the engine, tested there. The curve is exponential, so "progress to
  // the next level" is the position INSIDE the band — computing it in a component is
  // how a bar ends up disagreeing with the number printed beside it.
  const progress = levelProgress(stats.xpTotal)
  // From the EARNED rank, never the worn one: a bought title is a different hat, and
  // showing a rank insignia beside it would claim a level the user has not reached.
  const insignia = insigniaFor(progress.titleKey)

  const earned = (badges ?? []).slice(0, RECENT_BADGES)

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TopBar
        initials="EX"
        {...(portrait !== null ? { avatar: <Art name={portrait} size={40} /> } : {})}
        coins={stats.coins}
        {...(onOpenSettings !== undefined ? { onSettings: onOpenSettings } : {})}
      />

      {/* Portrait, name, worn title — one block, centred.
   
          It was an avatar with the name beside it and the title three lines down inside
          the level card, so the two halves of an identity sat in different components.
          Stacked, the title reads as what it is: something you are called, under the
          face you chose. */}
      <View style={styles.identity}>
        <View style={styles.portrait}>
          <Avatar
            size={PORTRAIT}
            ringed={false}
            accessibilityLabel={t('profile:anonymous')}
            initials="EX"
            {...(portrait !== null ? { image: <Art name={portrait} size={PORTRAIT} /> } : {})}
          />
        </View>
        <View style={styles.nameRow}>
          <Text style={styles.name} role="heading">
            {t('profile:anonymous')}
          </Text>
          {/* A real 44pt target around a 16pt pencil, and absent rather than dead when
              there is nothing to rename into. */}
          {onRename !== undefined && (
            <Pressable
              onPress={onRename}
              role="button"
              aria-label={t('profile:rename')}
              hitSlop={12}
              style={styles.pencil}
            >
              <Icon name="edit" size={16} color={colors.text.tertiary} />
            </Pressable>
          )}
        </View>
        <Text style={styles.wornTitle}>
          {t((wornTitleKey ?? levelProgress(stats.xpTotal).titleKey) as TranslationKey)}
        </Text>
      </View>

      {/* Level on the left, the XP fraction on the right, the bar under both.
   
          The insignia and the title used to live in here too, which made one card carry
          the level number three separate times. The title has moved up to the identity
          block where it belongs, and what is left is the one thing a level card is for:
          how far through this level you are, in the same units on the bar and beside it.
   
          The fraction is `earnedInLevel / levelSpan` — the position INSIDE the band, not
          the lifetime total against the next threshold. Those two differ by every point
          earned before this level and the second one is what makes a bar disagree with
          the number printed next to it. */}
      <Card style={styles.levelCard}>
        <View style={styles.levelRow}>
          {/* The rank's own insignia, when it has one. Six of the ten ranks are drawn
              (`asset-prompts.md` §12) and a bought shop title is not a rank at all, so
              this renders nothing rather than guessing. Decorative — the level is beside
              it in words. */}
          {insignia !== null && <Art name={insignia} size={INSIGNIA_SIZE} />}
          <Text style={styles.levelNumber}>{t('profile:level', { level: progress.level })}</Text>
          <View style={styles.spacer} />
          <Text style={styles.levelXp}>
            {t('profile:level.xp', {
              earned: progress.earnedInLevel,
              span: Math.max(1, progress.levelSpan),
            })}
          </Text>
        </View>
        <ProgressBar
          current={progress.earnedInLevel}
          total={Math.max(1, progress.levelSpan)}
          showCount={false}
          tone="reward"
          // Named but not captioned. The row directly above already reads "Level 12" and
          // "41 / 187 XP", so a third line saying "146 XP to level 2" is the same fact a
          // third time in a card four lines tall — which is the exact defect this file
          // records for the level NUMBER one section down. The sentence survives as the
          // bar's name and value, where it is the only thing a reader gets.
          accessibilityLabel={
            progress.remaining === null
              ? t('profile:level.max')
              : t('profile:level.next', {
                  remaining: progress.remaining,
                  level: progress.level + 1,
                })
          }
          valueText={t('profile:level.xp', {
            earned: progress.earnedInLevel,
            span: Math.max(1, progress.levelSpan),
          })}
        />
      </Card>

      {week !== undefined && <WeeklyActivity week={week} />}

      {/* Three numbers, not six.
   
          It was a six-tile grid holding XP, coins, streak, longest streak, facts and
          countries — and two of those six now have a better home: the coin balance is in
          the bar at the top of every tab, and lifetime XP is the fraction on the level
          card directly above. Printing them again here was the same defect this file
          already records for the level number, one section down.
   
          What is left is what a record is actually for: how much you know, how much of
          the world that covers, and whether you came back. Longest streak keeps its place
          as the caption under the live one rather than as a seventh tile — same unit, and
          only one of the two is burning. */}
      <View style={styles.statRow}>
        <Stat
          icon="star"
          tint={colors.status.progress}
          label={t('profile:stats.mastered')}
          value={String(stats.factsMastered)}
        />
        <Stat
          icon="globe"
          tint={colors.action.primary}
          label={t('profile:stats.countries')}
          value={String(world?.entitiesComplete ?? 0)}
        />
        <Stat
          icon="streak"
          tint={colors.status.streak}
          label={t('profile:stats.streak')}
          value={String(stats.streak)}
          caption={t('profile:stats.longest.short', { days: stats.longestStreak })}
        />
      </View>

      {/* The trophy shelf.
   
          Earned only, newest first — see `badges`. The heading is the way in to the full
          set, which is where a locked achievement can be shown next to what it is for. */}
      {earned.length > 0 && (
        <Section
          title={t('profile:badges.title')}
          {...(onOpenAchievements !== undefined ? { onPress: onOpenAchievements } : {})}
        >
          <View style={styles.badgeRow}>
            {earned.map((badge) => (
              <AchievementMedal
                key={badge.id}
                achievementId={badge.id}
                tier={badge.tier}
                size={BADGE}
              />
            ))}
          </View>
        </Section>
      )}

      {world !== null && (
        <Section title={t('profile:world.title')}>
          <Card style={styles.worldCard}>
            {/* The digits carry the emphasis, like every other count in the app. This
                one summarises the seven bars under it and was drawn as a flat caption —
                the same thing Explore's tiles did before `Tally`. */}
            <Tally style={styles.subtitle} numberStyle={styles.subtitleNumber}>
              {t('profile:world.summary', {
                learned: world.factsLearned,
                total: world.factsTotal,
              })}
            </Tally>
            {REGIONS.map((region) => {
              const progress = world.regions.find((r) => r.region === region)
              // Continents with no content yet are omitted here rather than dimmed:
              // Explore is the map of what exists, Profile is the record of what the
              // user has done, and an empty bar is not a record of anything.
              if (progress === undefined || progress.factsTotal === 0) return null
              return (
                <View key={region} style={styles.regionRow}>
                  <View style={[styles.swatch, { backgroundColor: palette.continent[region] }]} />
                  <View style={styles.regionBar}>
                    <ProgressBar
                      current={progress.factsLearned}
                      total={Math.max(1, progress.factsTotal)}
                      label={t(REGION_NAME[region])}
                    />
                  </View>
                </View>
              )
            })}
          </Card>
        </Section>
      )}

      {onCreateAccount !== undefined && (
        <Card style={styles.accountCard}>
          <Text style={styles.cardTitle}>{t('profile:account.title')}</Text>
          {/* States what an account is FOR. "Sign up to continue" is the version that
              treats the user's progress as leverage; this one treats it as theirs. */}
          <Text style={styles.subtitle}>{t('profile:account.body')}</Text>
          <Button label={t('profile:account.cta')} onPress={onCreateAccount} />
        </Card>
      )}
    </ScrollView>
  )
}

/**
 * A titled block, with an optional way into the screen that owns the whole set.
 *
 * The chevron is on the HEADING rather than a "See all" row underneath, because the
 * heading is already the thing naming the destination and a second control saying the
 * same word is a second control to skip past with a screen reader.
 */
function Section({
  title,
  onPress,
  children,
}: {
  title: string
  onPress?: (() => void) | undefined
  children: React.ReactNode
}) {
  return (
    <View style={styles.section}>
      {onPress === undefined ? (
        <Text style={styles.sectionTitle} role="heading">
          {title}
        </Text>
      ) : (
        <Pressable onPress={onPress} role="button" style={styles.sectionHead} hitSlop={8}>
          <Text style={styles.sectionTitle} role="heading">
            {title}
          </Text>
          <Icon name="chevron" size={18} color={colors.text.tertiary} />
        </Pressable>
      )}
      {children}
    </View>
  )
}

/**
 * One number, its name, and a tinted mark saying which one it is.
 *
 * The mark is the Explore grid's trick, and it is here for the same reason: six tiles of
 * identical size, colour and shape are one block of texture until something distinguishes
 * them, and the eye finds a shape long before it reads a 13pt label. Explore uses a
 * coloured swatch because a continent HAS a colour; these have units, so they get the
 * unit's own glyph in the unit's own tint — the bolt the lesson summary pays XP with,
 * the coin the shop takes, the flame the streak screen burns.
 *
 * Decorative, in every case. The tile is already one accessible element announcing
 * "Total XP, 12.9K", and a reader saying "lightning" first is a word with no referent.
 */
function Stat({
  label,
  value,
  icon,
  tint,
  caption,
}: {
  label: string
  value: string
  readonly icon: IconName
  readonly tint: string
  /** A second, quieter number about the same thing — the streak's record. */
  readonly caption?: string | undefined
}) {
  return (
    // One element: a reader says "Facts learned, 347" rather than three disconnected
    // nodes, and the caption joins that one phrase rather than trailing after it.
    <View
      accessible
      aria-label={caption === undefined ? `${label}, ${value}` : `${label}, ${value}, ${caption}`}
      style={styles.stat}
    >
      <Icon name={icon} size={20} color={tint} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {caption !== undefined && <Text style={styles.statCaption}>{caption}</Text>}
    </View>
  )
}

function ProfileSkeleton() {
  const t = useT()
  return (
    <View style={styles.screen} aria-label={t('common:loading')}>
      <View style={styles.content}>
        <Skeleton width={72} height={72} borderRadius={36} />
        <Skeleton width="40%" height={28} />
        <Skeleton height={88} borderRadius={radius.lg} />
        <Skeleton height={160} borderRadius={radius.lg} />
      </View>
    </View>
  )
}

/**
 * Seven bars, one per day.
 *
 * Heights are relative to the user's own best day, not to a fixed target. A chart
 * scaled to a goal makes a five-lesson day look like a failure next to a ten-lesson
 * one; scaled to the week, it shows the shape of the week, which is the only thing
 * seven bars can honestly say.
 */
function WeeklyActivity({ week }: { readonly week: WeekActivity }) {
  const t = useT()
  const peak = Math.max(...week.map((d) => d.count))

  return (
    <Section title={t('profile:week.title')}>
      {peak === 0 ? (
        <Text style={styles.weekEmpty}>{t('profile:week.none')}</Text>
      ) : (
        <View style={styles.week}>
          {week.map((day) => (
            <View
              key={day.day}
              accessible
              accessibilityLabel={t('profile:week.day', { day: day.day, count: day.count })}
              style={styles.weekDay}
            >
              <View style={styles.weekTrack}>
                <View
                  style={[
                    styles.weekBar,
                    // A day with activity always shows something. A 1-lesson day next
                    // to a 12-lesson one would otherwise round to an invisible sliver,
                    // which reads as "you did nothing" — the opposite of the truth.
                    { height: `${day.count === 0 ? 0 : Math.max(12, (day.count / peak) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.weekLabel}>{day.day}</Text>
            </View>
          ))}
        </View>
      )}
    </Section>
  )
}

const styles = StyleSheet.create({
  insignia: { alignSelf: 'flex-start', marginBottom: space[1] },
  levelTitle: { ...text('h3'), color: colors.text.primary, marginBottom: space[2] },
  week: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2], height: 96 },
  weekDay: { flex: 1, alignItems: 'center', gap: space[1] },
  /**
   * The track is DRAWN, not just reserved.
   *
   * It had no background, so a day with no lessons rendered nothing at all — and the
   * rendered week came out as a single green rectangle floating beside six invisible
   * columns. This component's own header says a chart of "days with activity" would
   * "flatter the user by lying about the shape of their week", and without a visible
   * empty column that is exactly what it drew: the seven slots were there in the layout
   * and only one of them was there on screen.
   *
   * `progressTrack` rather than a surface, and that is the point of using it: it is the
   * same unfilled channel `ProgressBar` draws everywhere else in the app, so an empty day
   * here reads as the same "nothing yet" an empty bar does on Explore.
   */
  weekTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    borderRadius: radius.sm,
    ...squircle,
    backgroundColor: colors.status.progressTrack,
    overflow: 'hidden',
  },
  weekBar: { width: '100%', borderRadius: radius.sm, backgroundColor: colors.status.progress, ...squircle },
  weekLabel: { ...text('overline'), color: colors.text.tertiary },
  weekEmpty: { ...text('body'), color: colors.text.secondary },
  emptyCta: { marginTop: space[4] },
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[4] },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[3] },

  name: { ...text('h1'), color: colors.text.primary },
  title: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  subtitle: { ...text('caption'), color: colors.text.secondary },
  subtitleNumber: {
    ...text('caption', { weight: '700', numeric: true }),
    color: colors.text.primary,
  },

  levelCard: { gap: space[2] },

  section: { gap: space[2] },
  sectionTitle: { ...text('overline'), color: colors.text.tertiary },

  // Three across, each taking a third. `flex: 1` on the tiles rather than a percentage
  // width, because a percentage plus a gap overflows the row by the gap — the same trap
  // the lesson's answer grid and onboarding's continent grid each document.
  statRow: { flexDirection: 'row', gap: space[2] },
  badgeRow: { flexDirection: 'row', gap: space[3], alignItems: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  identity: { alignItems: 'center', gap: space[1] },
  // A ring drawn by the layout rather than by `Avatar`, so it can be the accent and thick
  // enough to read at 96 — `ringed` is a hairline sized for the 40pt header avatar.
  portrait: {
    padding: space[1],
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: colors.action.primaryEdge,
    backgroundColor: colors.bg.surface,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: space[2] },
  pencil: { padding: space[1] },
  wornTitle: { ...text('body'), color: colors.text.secondary },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  levelNumber: { ...text('h3'), color: colors.text.primary },
  // Tabular, like every other fraction in the app: two numbers that change independently
  // must not shift each other sideways as they do.
  levelXp: { ...text('caption', { numeric: true }), color: colors.text.secondary },
  statCaption: { ...text('caption'), color: colors.text.tertiary },
  stat: {
    // `flex: 1` and not a percentage: these sit in a row with a `gap`, and a percentage
    // width plus a gap overflows the row by the gap.
    flex: 1,
    alignItems: 'center',
    gap: space[1],
    paddingVertical: space[4],
    paddingHorizontal: space[2],
    borderRadius: radius.lg,
    ...squircle,
    backgroundColor: colors.bg.surface,
  },
  statValue: { ...text('numeric'), color: colors.text.primary },
  statLabel: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },

  worldCard: { gap: space[3] },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  swatch: { width: 6, height: 28, borderRadius: radius.full },
  regionBar: { flex: 1 },

  spacer: { flex: 1 },
  accountCard: { gap: space[3] },
  cardTitle: { ...text('h3'), color: colors.text.primary },
})
