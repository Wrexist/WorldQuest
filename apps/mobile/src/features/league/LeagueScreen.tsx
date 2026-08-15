/**
 * The weekly league — thirty people, one number each.
 *
 * ## Why it took this long
 *
 * The engine and the migration have been finished and unreachable since they were
 * written. `scripts/reachability.ts` records why: no Docker in the environment they were
 * authored in, so the migration never met a real Postgres, `pnpm db:types` could not
 * regenerate from it, and `supabase test db` could not prove the RLS policies. Shipping
 * an unproven row policy on a leaderboard that children must never appear in was the one
 * guess not worth making. CI has now run all 35 of those tests green against this schema,
 * so the client half is built on evidence.
 *
 * ## The kindness rules, which are most of this file
 *
 * `docs/systems/social-and-leagues.md` §4 lists them and they are not decoration — they
 * are the difference between a leaderboard a ten-year-old can look at and one that
 * teaches them they are behind:
 *
 * · **Never how far behind you are.** The screen shows the distance to promotion and has
 *   no way to express the distance to relegation. `xpToPromotion` in the engine answers
 *   one direction only, by construction.
 * · **Inactive members are removed, not sorted to the bottom.** Somebody who had a hard
 *   week does not become the thing thirty people are beating. Done in `standings()`.
 * · **Demotion is announced quietly, once.** There is no red, no alarm, and no push.
 * · **No user-authored text.** The handle is assigned — `Swift Glacier 42`, from two
 *   curated word lists — so there is nothing to moderate and nothing to report. A
 *   `CHECK` on the column means a future code path that tried to write a display name
 *   fails at the database rather than on this screen.
 *
 * ## What is deliberately absent
 *
 * No avatars, no profiles, no tapping a row. A leaderboard row goes nowhere, because
 * every destination it could have is a person, and this product does not have a place
 * where one user looks at another. The row is a handle and a number.
 */

import { FlatList, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  Card,
  colors,
  layout,
  radius,
  Skeleton,
  space,
  squircle,
  text,
} from '@worldquest/design'
import {
  PROMOTED,
  xpToPromotion,
  type LeagueRank,
  type Standing,
} from '@worldquest/engines'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { Art } from '../../components/Art.js'
import { Icon } from '../../components/Icon.js'
import { useT } from '../../lib/i18n.js'
import type { TranslationKey } from '@worldquest/i18n'

export type LeagueScreenProps = {
  readonly rows: readonly Standing[] | null
  readonly rank: LeagueRank | null
  readonly status: 'loading' | 'ready' | 'error'
  /** Hours until the week ends. Absent hides the line rather than showing a guess. */
  readonly hoursLeft?: number | undefined
  /**
   * No connection.
   *
   * Handled as a BADGE over cached standings rather than as a wall, wherever there are
   * cached standings to show. A leaderboard from an hour ago is still most of the
   * answer — you are still twelfth, the people above you are still the same people —
   * and hiding it would be the app withholding what it already knows. What it must not
   * do is present those numbers as current, so it says which they are.
   *
   * With nothing cached there is nothing to badge, and the screen says so plainly.
   */
  readonly offline?: boolean | undefined
  readonly onBack: () => void
  readonly onRetry: () => void
}

/** The hero on the empty and error states. */
const ART = 140

export function LeagueScreen({
  rows,
  rank,
  status,
  hoursLeft,
  offline,
  onBack,
  onRetry,
}: LeagueScreenProps) {
  const t = useT()

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('league:title')} onBack={onBack} />

      {status === 'loading' ? (
        <View style={styles.content} aria-label={t('common:loading')}>
          {/* Rows, not a spinner — the shape of what is coming, which is what makes a
              wait feel short. `apps/mobile/CLAUDE.md`: never a spinner on primary
              content. */}
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={56} borderRadius={radius.md} />
          ))}
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <Art name="states/error-generic" size={ART} />
          <Text style={styles.emptyTitle} role="heading">
            {t('league:error.title')}
          </Text>
          <Text style={styles.emptyBody}>{t('league:error.body')}</Text>
          <Button label={t('common:retry')} onPress={onRetry} fullWidth={false} />
        </View>
      ) : offline === true && (rows === null || rows.length === 0) ? (
        /* Offline with nothing cached — there is genuinely nothing to draw, and this is
           the only branch where that is the network's fault rather than the ordinary
           "not placed yet". */
        <View style={styles.centered}>
          <Art name="states/offline" size={ART} />
          <Text style={styles.emptyTitle} role="heading">
            {t('league:offline.title')}
          </Text>
          <Text style={styles.emptyBody}>{t('league:offline.body')}</Text>
        </View>
      ) : rows === null || rank === null || rows.length === 0 ? (
        /* Not an error, and the ordinary state for most of this app's life: the server
           places people into cohorts weekly, so until that has happened for you there
           is no league. Said as a "next week" rather than as an absence. */
        <View style={styles.centered}>
          <Art name="rewards/globe" size={ART} />
          <Text style={styles.emptyTitle} role="heading">
            {t('league:empty.title')}
          </Text>
          <Text style={styles.emptyBody}>{t('league:empty.body')}</Text>
        </View>
      ) : (
        <Standings rows={rows} rank={rank} hoursLeft={hoursLeft} offline={offline === true} />
      )}
    </View>
  )
}

function Standings({
  rows,
  rank,
  hoursLeft,
  offline,
}: {
  readonly rows: readonly Standing[]
  readonly rank: LeagueRank
  readonly hoursLeft: number | undefined
  readonly offline: boolean
}) {
  const t = useT()
  const toPromotion = xpToPromotion(rows)
  const you = rows.find((r) => r.isYou === true)

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.handle}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.tier} role="heading">
            {t(`league:tier.${rank.tier}` as TranslationKey)}
          </Text>
          <Text style={styles.division}>
            {t('league:division', { division: rank.division })}
          </Text>

          {/* Only ever the distance UP. There is no prop, no string and no branch on
              this screen that could express the distance to relegation — §4's first
              kindness rule, enforced by there being nothing to enforce it with. */}
          {you !== undefined && toPromotion > 0 && (
            <Text style={styles.toPromotion}>
              {t('league:toPromotion', { xp: toPromotion })}
            </Text>
          )}
          {you !== undefined && toPromotion === 0 && (
            <Text style={styles.inZone}>{t('league:inZone')}</Text>
          )}

          {hoursLeft !== undefined && (
            <Text style={styles.timeLeft}>{t('league:endsIn', { hours: hoursLeft })}</Text>
          )}

          {/* The promotion line, stated once as a fact about the week rather than
              repeated beside every row. */}
          <Text style={styles.rule}>{t('league:promoteRule', { count: PROMOTED })}</Text>

          {/* A badge, not a wall — see the `offline` prop. Says which numbers these are
              rather than hiding them or passing them off as current. */}
          {offline && <Text style={styles.stale}>{t('league:offline.badge')}</Text>}
        </View>
      }
      renderItem={({ item }) => <Row row={item} />}
      // Thirty rows fit without virtualisation tuning, and the whole list is the point:
      // a leaderboard you have to page through is a leaderboard you cannot place
      // yourself in.
      initialNumToRender={30}
    />
  )
}

function Row({ row }: { readonly row: Standing }) {
  const t = useT()
  const promoting = row.outcome === 'promoted'

  return (
    <Card
      level={row.isYou === true ? 2 : 1}
      style={[styles.row, row.isYou === true && styles.rowYou]}
      // One element to a screen reader, saying the three things that matter in the
      // order a person would: where they are, who it is, and what they scored.
      accessibilityLabel={t('league:row.label', {
        position: row.position,
        handle: row.isYou === true ? t('league:you') : row.handle,
        xp: row.weeklyXp,
      })}
    >
      <Text style={[styles.position, promoting && styles.positionUp]}>{row.position}</Text>
      <Text style={[styles.handle, row.isYou === true && styles.handleYou]} numberOfLines={1}>
        {row.isYou === true ? t('league:you') : row.handle}
      </Text>
      <View style={styles.spacer} />
      {/* An arrow on the rows that would go up, and NOTHING on the rows that would go
          down. The asymmetry is the point: this screen has no way to draw a demotion. */}
      {promoting && <Icon name="forward" size={14} color={colors.status.progress} />}
      <Text style={styles.xp}>{t('league:xp', { xp: row.weeklyXp })}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[2] },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[4] },

  header: { gap: space[1], marginBottom: space[2] },
  tier: { ...text('h1'), color: colors.text.primary },
  division: { ...text('body'), color: colors.text.secondary },
  toPromotion: { ...text('bodyStrong'), color: colors.status.progress, marginTop: space[2] },
  inZone: { ...text('bodyStrong'), color: colors.status.progress, marginTop: space[2] },
  timeLeft: { ...text('caption'), color: colors.text.secondary },
  rule: { ...text('caption'), color: colors.text.tertiary, marginTop: space[1] },
  stale: { ...text('caption'), color: colors.text.secondary, marginTop: space[1] },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[3],
    minHeight: layout.minTouchTarget,
    borderRadius: radius.md,
    ...squircle,
  },
  rowYou: { borderWidth: 1, borderColor: colors.action.secondary },
  position: {
    ...text('bodyStrong'),
    color: colors.text.tertiary,
    // Fixed width, so a two-digit position does not shove every handle sideways at row
    // ten. No `textAlign`: `right` is what this wants visually and is wrong in an RTL
    // locale, where the column sits on the other side and would be pushed away from the
    // handle it belongs to — `pnpm lint:a11y` catches it. React Native's own types do
    // not accept the logical `end`, so the width does the work on its own and the digits
    // sit at the reading edge in both directions.
    minWidth: 24,
  },
  positionUp: { color: colors.status.progress },
  handle: { ...text('body'), color: colors.text.secondary, flexShrink: 1 },
  handleYou: { ...text('bodyStrong'), color: colors.text.primary },
  xp: { ...text('bodyStrong'), color: colors.text.primary },
  spacer: { flex: 1 },

  emptyTitle: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  emptyBody: { ...text('body'), color: colors.text.secondary, textAlign: 'center', maxWidth: 320 },
})
