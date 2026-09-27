/** Weekly league: assigned handles, genuine XP, explicit enrollment and a useful first-lesson state. No peer profiles, free text or pressure about demotion. */

import { FlatList, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Button,
  Card,
  colors,
  EmptyState,
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
import { WorldMascot } from '../../components/WorldMascot.js'
import { HeaderJewel } from '../../components/HeaderJewel.js'
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
  /**
   * The way out of the empty state.
   *
   * It had none — the only empty state in the app with nothing to press. A user who
   * followed the single link in got "Leagues start on Monday" and a back arrow, which
   * states a fact and offers no way to act on it. Placement is earned by learning, so a
   * lesson is both the honest answer and the useful one.
   */
  readonly onStartLesson?: (() => void) | undefined
  readonly onRetry: () => void
  readonly onJoin?: (() => void) | undefined
  readonly joining?: boolean | undefined
  readonly joinError?: boolean | undefined
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
  onStartLesson,
  onRetry,
  onJoin,
  joining,
  joinError,
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
        <EmptyState
          art={<Art name="states/error-generic" size={ART} />}
          title={t('league:error.title')}
          body={t('league:error.body')}
          action={<Button label={t('common:retry')} onPress={onRetry} fullWidth={false} />}
        />
      ) : offline === true && (rows === null || rows.length === 0) ? (
        /* Offline with nothing cached — there is genuinely nothing to draw, and this is
           the only branch where that is the network's fault rather than the ordinary
           "not placed yet". */
        <EmptyState
          art={<Art name="states/offline" size={ART} />}
          title={t('league:offline.title')}
          body={t('league:offline.body')}
        />
      ) : rows === null || rank === null || rows.length === 0 ? (
        /* Not an error, and the ordinary state for most of this app's life: the server
           places people into cohorts weekly, so until that has happened for you there
           is no league. Said as a "next week" rather than as an absence. */
        <EmptyState
          art={<WorldMascot mood="welcome" style={{ width: ART, height: ART }} />}
          title={t(onJoin ? 'league:join.title' : 'league:empty.title')}
          body={t(joinError ? 'league:join.error' : onJoin ? 'league:join.body' : 'league:empty.body')}
          {...(onJoin !== undefined || onStartLesson !== undefined
            ? {
                action: (
                  <Button
                    label={t(onJoin ? joining ? 'league:join.pending' : 'league:join.action' : 'league:empty.action')}
                    onPress={onJoin ?? onStartLesson!}
                    disabled={joining === true}
                    fullWidth={false}
                  />
                ),
              }
            : {})}
        />
      ) : (
        <Standings rows={rows} rank={rank} hoursLeft={hoursLeft} offline={offline === true} onStartLesson={onStartLesson} />
      )}
    </View>
  )
}

function Standings({
  rows,
  rank,
  hoursLeft,
  offline,
  onStartLesson,
}: {
  readonly rows: readonly Standing[]
  readonly rank: LeagueRank
  readonly hoursLeft: number | undefined
  readonly offline: boolean
  readonly onStartLesson: (() => void) | undefined
}) {
  const t = useT()
  const toPromotion = xpToPromotion(rows)
  const you = rows.find((r) => r.isYou === true)
  const tier = colors.league[rank.tier]

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.handle}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <LinearGradient colors={[tier.start, tier.end]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.leagueHero, { borderColor: tier.edge }]}>
            <View style={styles.heroCopy}>
              <Text style={[styles.tier, { color: tier.ink }]} role="heading">
                {t(`league:tier.${rank.tier}` as TranslationKey)}
              </Text>
              <View style={[styles.divisionBadge, { backgroundColor: tier.highlight, borderColor: tier.edge }]}>
                <Icon name="star" size={space[4]} color={tier.ink} />
                <Text style={[styles.division, { color: tier.ink }]}>{t('league:division', { division: rank.division })}</Text>
              </View>
              {hoursLeft !== undefined && <Text style={[styles.heroTime, { color: tier.ink }]}>{t('league:endsIn', { hours: hoursLeft })}</Text>}
            </View>
            <View style={[styles.medallion, { backgroundColor: tier.highlight, borderColor: tier.edge }]}>
              <WorldMascot mood="encouraging" style={styles.companion} />
            </View>
          </LinearGradient>

          {/* Only ever the distance UP. There is no prop, no string and no branch on
              this screen that could express the distance to relegation — §4's first
              kindness rule, enforced by there being nothing to enforce it with. */}
          {you !== undefined && toPromotion > 0 && (
            <Text style={styles.toPromotion}>
              {t('league:toPromotion', { xp: toPromotion })}
            </Text>
          )}
          {you !== undefined && you.weeklyXp > 0 && toPromotion === 0 && (
            <Text style={styles.inZone}>{t('league:inZone')}</Text>
          )}

          {/* The promotion line, stated once as a fact about the week rather than
              repeated beside every row. */}
          <View style={[styles.promotionLegend,{backgroundColor:tier.highlight}]}>
            <Icon name="forward" size={space[4]} color={tier.ink}/>
            <Text style={[styles.rule,{color:tier.ink}]}>{t('league:promoteRule', { count: PROMOTED })}</Text>
          </View>

          {/* A badge, not a wall — see the `offline` prop. Says which numbers these are
              rather than hiding them or passing them off as current. */}
          {offline && <Text style={styles.stale}>{t('league:offline.badge')}</Text>}
        </View>
      }
      renderItem={({ item }) => <Row row={item} tier={rank.tier} />}
      ListFooterComponent={you?.weeklyXp === 0 && onStartLesson ? (
        <LinearGradient colors={[colors.leagueAdventure.start, colors.leagueAdventure.end]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.firstLesson}>
          <View style={styles.adventureArt}>
            <View style={styles.globeArt}><HeaderJewel name="globe" size={space[9] + space[5]} /></View>
            <View style={styles.starTrail} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Icon name="star" size={space[5]} color={colors.leagueAdventure.ink} />
              <View style={styles.trailDot} />
              <Icon name="flag" size={space[6]} color={colors.leagueAdventure.ink} />
            </View>
          </View>
          <Text style={styles.firstTitle}>{t('league:first.title')}</Text>
          <Text style={styles.firstBody}>{t('league:first.body')}</Text>
          <Button variant="adventure" label={t('league:empty.action')} onPress={onStartLesson} />
        </LinearGradient>
      ) : null}
      // Thirty rows fit without virtualisation tuning, and the whole list is the point:
      // a leaderboard you have to page through is a leaderboard you cannot place
      // yourself in.
      initialNumToRender={30}
    />
  )
}

function Row({ row, tier }: { readonly row: Standing; readonly tier: LeagueRank['tier'] }) {
  const t = useT()
  const promoting = row.outcome === 'promoted'
  const theme=colors.league[tier]

  return (
    <Card
      level={row.isYou === true ? 2 : 1}
      style={[styles.row, row.isYou === true && { backgroundColor:theme.highlight,borderColor:theme.edge,borderBottomWidth:space[1] }]}
      // One element to a screen reader, saying the three things that matter in the
      // order a person would: where they are, who it is, and what they scored.
      accessibilityLabel={t('league:row.label', {
        position: row.position,
        handle: row.isYou === true ? t('league:you') : row.handle,
        xp: row.weeklyXp,
      })}
    >
      <View style={[styles.rankBadge,{backgroundColor:theme.start,borderColor:theme.edge}]}>
        <Text style={[styles.position,{color:theme.ink}]}>{row.position}</Text>
      </View>
      {row.isYou && <HeaderJewel name="globe" size={space[8]} />}
      <Text style={[styles.handle, row.isYou === true && styles.handleYou]} numberOfLines={1}>
        {row.isYou === true ? t('league:you') : row.handle}
      </Text>
      <View style={styles.spacer} />
      {/* An arrow on the rows that would go up, and NOTHING on the rows that would go
          down. The asymmetry is the point: this screen has no way to draw a demotion. */}
      {promoting && <Icon name="forward" size={14} color={colors.status.progress} />}
      <View style={[styles.xpChip,{backgroundColor:theme.start}]}>
        <Icon name="xp" size={space[4]} color={theme.ink}/>
        <Text style={[styles.xp,{color:theme.ink}]}>{t('league:xp', { xp: row.weeklyXp })}</Text>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  /**
   * No `backgroundColor`.
   *
   * It painted `bg.canvas` flat over the root gradient — which `ScreenBackground`'s own
   * header calls out as the thing that made the token unreachable, "since a flat fill on
   * top of a gradient is just a flat fill". This screen and the account form were the
   * two stragglers, and it is why they read as flat black beside Home's atmosphere.
   *
   * It also broke the measurement. At 768 that fill is 600 × 1024 — full height, three
   * quarters of the width — so the design harness counted it as content reaching the
   * bottom and reported one of the emptiest screens in the app as completely full.
   */
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[2] },
  /** Upper third rather than dead centre — same reasoning as ProfileScreen's `centered`. */
  header: { gap: space[1], marginBottom: space[2] },
  leagueHero: { borderBottomWidth: space[1], borderRadius: radius['2xl'], padding: space[4], flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  divisionBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[1], paddingHorizontal: space[2], paddingVertical: space[1], borderRadius: radius.md, borderWidth: 1, marginTop: space[2] },
  medallion: { borderRadius: radius.full, borderWidth: space[1] },
  heroCopy: { flexGrow: 1, flexBasis: ART },
  companion: { width: space[9] + space[6], height: space[9] + space[6] },
  tier: { ...text('h1'), color: colors.chrome.text },
  division: { ...text('body'), color: colors.chrome.muted },
  heroTime: { ...text('caption'), color: colors.chrome.muted, marginTop: space[2] },
  firstLesson: { marginTop: space[4], padding: space[5], gap: space[3], borderRadius: radius['2xl'], borderBottomWidth: space[1], borderColor: colors.leagueAdventure.button },
  adventureArt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  globeArt: { padding: space[1] },
  starTrail: { flexDirection: 'row', alignItems: 'center', gap: space[3], transform: [{ rotate: '-12deg' }] },
  trailDot: { width: space[2], height: space[2], borderRadius: radius.full, backgroundColor: colors.leagueAdventure.ink },
  firstTitle: { ...text('h2'), color: colors.leagueAdventure.ink },
  firstBody: { ...text('body'), color: colors.leagueAdventure.ink },
  toPromotion: { ...text('bodyStrong'), color: colors.status.progress, marginTop: space[2] },
  inZone: { ...text('bodyStrong'), color: colors.status.progress, marginTop: space[2] },
  timeLeft: { ...text('caption'), color: colors.text.secondary },
  rule: { ...text('caption'), color: colors.text.tertiary, marginTop: space[1] },
  stale: { ...text('caption'), color: colors.text.secondary, marginTop: space[1] },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    flexWrap: 'wrap',
    paddingHorizontal: space[3],
    minHeight: layout.minTouchTarget,
    borderRadius: radius.md,
    ...squircle,
  },
  rankBadge: { minWidth:space[7],minHeight:space[7],padding:space[1],alignItems:'center',justifyContent:'center',borderRadius:radius.md,borderWidth:1 },
  promotionLegend: { alignSelf:'flex-start',flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:space[2],padding:space[2],borderRadius:radius.full,marginTop:space[2] },
  xpChip: { flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:space[1],padding:space[2],borderRadius:radius.full },
  position: {
    ...text('bodyStrong'),
    color: colors.text.tertiary,
    // Fixed width, so a two-digit position does not shove every handle sideways at row
    // ten. No `textAlign`: `right` is what this wants visually and is wrong in an RTL
    // locale, where the column sits on the other side and would be pushed away from the
    // handle it belongs to — `pnpm lint:a11y` catches it. React Native's own types do
    // not accept the logical `end`, so the width does the work on its own and the digits
    // sit at the reading edge in both directions.
  },
  positionUp: { color: colors.status.progress },
  handle: { ...text('body'), color: colors.text.secondary, flexShrink: 1 },
  handleYou: { ...text('bodyStrong'), color: colors.text.primary },
  xp: { ...text('bodyStrong'), color: colors.text.primary },
  spacer: { flex: 1 },

})
