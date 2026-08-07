/**
 * Achievements.
 *
 * The definitions are content and the evaluation is a pure engine; this screen only
 * has to make a list of ~300 rows legible. Three decisions do that work:
 *
 * 1. **Nothing is hidden.** A locked achievement shows its name, what it asks for,
 *    and how far off it is. A grid of grey question marks is a list of things you
 *    cannot aim at — and the whole reason to show achievements is that they suggest
 *    what to do next.
 * 2. **Progress is towards the NEXT tier**, never from zero. A user with 3 of 5 flags
 *    is 60% of the way to bronze, and a bar that restarts after every tier makes a
 *    long climb look like no progress at all.
 * 3. **Earned first.** The list is what you have done, then what is close, then the
 *    rest. Sorting alphabetically buries the two rows a user actually wants to see.
 */

import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  Card,
  ProgressBar,
  colors,
  palette,
  radius,
  space,
  staggerStyle,
  text,
  useStagger,
} from '@worldquest/design'
import {
  TIERS,
  tierProgress,
  type AchievementDef,
  type AchievementProgress,
  type Tier,
} from '@worldquest/engines'
import { tContent, useT, type TranslationKey } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { AchievementMedal } from './AchievementMedal.js'
import { ScreenHeader } from '../../components/ScreenHeader.js'

const TIER_LABEL: Record<Tier, TranslationKey> = {
  bronze: 'achievements:tier.bronze',
  silver: 'achievements:tier.silver',
  gold: 'achievements:tier.gold',
  platinum: 'achievements:tier.platinum',
  legendary: 'achievements:tier.legendary',
}

/**
 * The tier colours from docs/systems/achievements.md §2.
 *
 * Bronze, silver and platinum are metal colours with no semantic meaning beyond
 * "this tier" — they are the one place a raw palette reference is right, because
 * there is nothing to name them after. Gold reuses the reward token, since a gold
 * tier and an XP reward are the same idea.
 */
const TIER_COLOR: Record<Tier, string> = {
  bronze: palette.bronze['500'],
  silver: palette.silver['500'],
  gold: colors.reward.xp,
  platinum: palette.platinum['500'],
  legendary: palette.purple['500'],
}

export type AchievementRow = {
  readonly def: AchievementDef
  readonly progress: AchievementProgress
}

export type AchievementsScreenProps = {
  readonly rows: readonly AchievementRow[]
  /** H13. Optional so the screenshot renderer can mount this without a router. */
  readonly onStartLesson?: (() => void) | undefined
  /**
   * Optional for the same reason as `onStartLesson`, but a route MUST pass it.
   *
   * This screen had no back control at all — `pnpm a11y:tree` reported zero
   * interactive nodes on `/achievements`, so a screen-reader or keyboard user could
   * reach it and not leave.
   */
  readonly onBack?: (() => void) | undefined
}

/**
 * Copy keys are derived from the id by convention: `ach.flags.collector` becomes
 * `achievements:flags.collector.name`. A definition therefore cannot reference a
 * typo'd key — there is no key to typo. `tContent` because the id comes from a pack
 * and is validated by `pnpm content:validate` rather than by the compiler.
 */
const nameKey = (id: string): string => `achievements:${id.slice('ach.'.length)}.name`
const descKey = (id: string): string => `achievements:${id.slice('ach.'.length)}.desc`

export function AchievementsScreen({ rows, onStartLesson, onBack }: AchievementsScreenProps) {
  const t = useT()

  const unlocked = rows.filter((row) => row.progress.tier !== null).length

  if (rows.length === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {/* Atlas offering an open hand — "reassuring, patient, not pitying", which is
            the line this screen has to walk: nothing unlocked yet is the state every
            user starts in, and it must not read as a scoreboard of zero. */}
        <Art name="atlas/encouraging" size={140} />
        <Text style={styles.title} role="heading">
          {t('achievements:empty.title')}
        </Text>
        <Text style={styles.body}>{t('achievements:empty.body')}</Text>
        {/* An empty state names the next step that actually fixes it, and here that
            step is a lesson. Copy that says "one lesson away" with no way to start
            one is a signpost pointing at a wall. */}
        {onStartLesson !== undefined && (
          <Button label={t('achievements:empty.action')} onPress={onStartLesson} />
        )}
      </View>
    )
  }

  // Earned, then closest, then the rest. Alphabetical would bury the two rows the
  // user actually came here for.
  const sorted = [...rows].sort((a, b) => {
    const tierA = a.progress.tier === null ? -1 : TIERS.indexOf(a.progress.tier)
    const tierB = b.progress.tier === null ? -1 : TIERS.indexOf(b.progress.tier)
    if (tierA !== tierB) return tierB - tierA

    const progA = tierProgress(a.def, a.progress)
    const progB = tierProgress(b.def, b.progress)
    if (progA.fraction !== progB.fraction) return progB.fraction - progA.fraction

    // Fractions tie constantly, and the case where they tie hardest is the one every
    // user sees first: on a fresh account EVERY row is 0 %, so this comparator did
    // nothing and the list came out in whatever order the pack happened to list them.
    // That is the same defect as the lesson composer taking pack-import order as
    // "easiest first" — a file's ordering quietly deciding what a user is shown.
    //
    // Broken by what is actually nearest in absolute terms: 3 countries is a closer
    // target than 7 flags even though both sit at zero. The screen's whole job is to
    // suggest what to do next, and "next" has to mean something on day one.
    return remainingToNextTier(a) - remainingToNextTier(b)
  })

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {onBack !== undefined && (
        <ScreenHeader title={t('achievements:title')} onBack={onBack} />
      )}
      <View style={styles.header}>
        {/* The title moves into the header row when there is one, so it is not said
            twice. Without a router — the screenshot renderer — it stays here rather
            than vanishing. */}
        {onBack === undefined && (
          <Text style={styles.title} role="heading">
            {t('achievements:title')}
          </Text>
        )}
        <Text style={styles.body}>
          {t('achievements:progress', { unlocked, total: rows.length })}
        </Text>
      </View>

      {sorted.map((row, index) => (
        <AchievementCard key={row.def.id} row={row} index={index} />
      ))}
    </ScrollView>
  )
}

/**
 * How many more of the thing this row needs, in its own unit.
 *
 * The same arithmetic `AchievementCard` renders as "3 to go", lifted out so the sort
 * and the label cannot disagree about which row is closest — which is the bug that
 * would replace the one this fixed.
 *
 * `Infinity` for a fully-earned achievement, so a maxed row sorts last among ties
 * rather than first: it needs nothing, and "needs nothing" is not "nearly there".
 */
function remainingToNextTier({ def, progress }: AchievementRow): number {
  const { next } = tierProgress(def, progress)
  if (next === null) return Infinity
  const target = def.tiers.find((tier) => tier.tier === next)?.threshold ?? 0
  return Math.max(0, target - progress.value)
}

/** Big enough for the glyph inside the frame to read; small enough for a list row. */
const MEDAL = 56

function AchievementCard({ row, index }: { row: AchievementRow; index: number }) {
  const t = useT()
  const entrance = useStagger(index)
  const { def, progress } = row
  const { next, fraction } = tierProgress(def, progress)

  // The threshold this row is working towards, for the description's `{threshold}`.
  // Falls back to the first tier once everything is earned, so a maxed row reads
  // "Master the flag of 5 countries" rather than "…of 0".
  const target = def.tiers.find((tier) => tier.tier === next)?.threshold ?? def.tiers[0]!.threshold
  const remaining = remainingToNextTier(row)

  return (
    <Animated.View style={staggerStyle(entrance)}>
    <Card
      style={styles.card}
      // A stable handle for tests, alongside the label a person hears. The card was
      // only findable by its user-facing NAME, so renaming "Flag Collector" — copy, in
      // a file translators own — broke a test about progress arithmetic. Ids are
      // permanent here by rule; the name is not.
      testID={`achievement-${def.id}`}
      accessibilityLabel={`${tContent(nameKey(def.id))}, ${
        progress.tier === null ? t('achievements:locked') : t(TIER_LABEL[progress.tier])
      }`}
    >
      <View style={styles.cardHeader}>
        {/* The medal, so the row reads as something collected rather than a setting. */}
        <AchievementMedal achievementId={def.id} tier={progress.tier} size={MEDAL} />
        <View style={styles.cardText}>
          <Text style={styles.name}>{tContent(nameKey(def.id))}</Text>
          {/* Locked rows still say what they ask for. A grey question mark is a
              thing you cannot aim at. */}
          <Text style={styles.body}>
            {tContent(descKey(def.id), { threshold: target })}
          </Text>
        </View>
        <Text
          style={[
            styles.tier,
            { color: progress.tier === null ? colors.text.tertiary : TIER_COLOR[progress.tier] },
          ]}
        >
          {progress.tier === null ? t('achievements:locked') : t(TIER_LABEL[progress.tier])}
        </Text>
      </View>

      {def.showProgress === true && next !== null && (
        <>
          <ProgressBar
            current={Math.round(fraction * 100)}
            total={100}
            showCount={false}
            tone={progress.tier === null ? 'progress' : 'reward'}
          />
          <Text style={styles.remaining}>{t('achievements:next', { remaining })}</Text>
        </>
      )}
    </Card>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[3] },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[3] },

  header: { gap: space[1] },
  title: { ...text('h1'), color: colors.text.primary },
  body: { ...text('caption'), color: colors.text.secondary },

  card: { gap: space[2], borderRadius: radius.lg },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  cardText: { flex: 1, gap: space[1] },
  name: { ...text('bodyStrong'), color: colors.text.primary },
  tier: { ...text('caption', { weight: '700' }) },
  remaining: { ...text('caption'), color: colors.text.tertiary },
})
