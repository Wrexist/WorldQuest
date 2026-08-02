/**
 * The streak, and the two things that protect it.
 *
 * ## Why this is not a "Shop"
 *
 * Freezes and repairs are the only coin sinks that exist without artwork — the
 * cosmetics that form the real sink (avatar items, pets, map skins, themes) all need
 * assets nobody has drawn yet. A two-row store would be a shop in name only.
 *
 * They also belong here on the merits. "Buy a freeze" is a decision a user makes while
 * looking at the streak it protects, not while browsing a catalogue. Context is the
 * whole reason the purchase makes sense.
 *
 * ## The rules this screen must not break
 *
 * Coins are earned from lessons and cannot be bought with money — the screen says so,
 * and that sentence has to stay true. Per `docs/systems/xp-economy.md`, coins buy
 * delight, never advantage: nothing here sells content, lessons, difficulty skips or
 * XP, and nothing sold here makes one child better off than another at learning.
 *
 * And there is no pressure. The repair window is stated in hours, not counted down in
 * seconds. A break is reported as "It happens", never as a loss to panic about. If a
 * user cannot afford something, the screen states the gap and stops — no store link,
 * no offer, no second ask.
 *
 * Purely presentational. Every decision comes in already made by the engine.
 */

import { StyleSheet, Text, View } from 'react-native'
import { Button, Card, StatChip, colors, space, text } from '@worldquest/design'
import {
  FREEZE_PRICE,
  MAX_FREEZES,
  REPAIR_PRICE,
  type RepairAvailability,
} from '@worldquest/engines'
import { useT } from '../../lib/i18n.js'

export type StreakScreenProps = {
  readonly current: number
  readonly longest: number
  readonly freezesHeld: number
  readonly coins: number
  /** Straight from `repairAvailability` — the reason is what decides the copy. */
  readonly repair: RepairAvailability
  /** The length a repair would restore. Not `current`, which has already reset to 1. */
  readonly restoreTo: number
  /** Epoch ms, injected so the screen never reads a clock. */
  readonly now: number
  readonly onBuyFreeze?: (() => void) | undefined
  readonly onRepair?: (() => void) | undefined
  /**
   * H7, scoped to the two actions that genuinely need a server.
   *
   * Freezes and repairs are spends against a server-authoritative balance (ADR 0006).
   * The client may not decide them, so offline they cannot be honoured — and letting
   * the button appear to work would either lie to the user or take their coins twice
   * when the queue replays.
   *
   * It disables these two controls and nothing else. A full-screen "no internet" would
   * be a lie about this app: content ships in the binary, the queue replays on
   * reconnect, and a lesson works exactly as well in a tunnel.
   */
  readonly offline?: boolean
}

export function StreakScreen({
  current,
  longest,
  freezesHeld,
  coins,
  repair,
  restoreTo,
  now,
  onBuyFreeze,
  onRepair,
  offline = false,
}: StreakScreenProps) {
  const t = useT()

  const broken = !repair.available
    ? repair.reason !== 'not-broken' && repair.reason !== 'nothing-to-restore'
    : true

  const canAffordFreeze = coins >= FREEZE_PRICE
  const freezesFull = freezesHeld >= MAX_FREEZES

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.flame}>🔥</Text>
        <Text style={styles.count} role="heading" aria-level={1}>
          {t('streak:days', { count: current })}
        </Text>
        <Text style={styles.sub}>{t('streak:longest', { count: longest })}</Text>
        <Text style={styles.status}>
          {broken
            ? t('streak:broken.body')
            : current > 0
              ? t('streak:intact')
              : t('streak:none')}
        </Text>
      </View>

      <View style={styles.balance}>
        <StatChip kind="coin" value={coins} accessibilityLabel={t('streak:coins', { count: coins })} />
        {/* Standing reassurance, and a promise the code has to keep. */}
        <Text style={styles.earned}>{t('streak:earned')}</Text>
      </View>

      {broken && (
        <Card level={2} style={styles.card}>
          <Text style={styles.cardTitle}>{t('streak:broken.title')}</Text>
          <Text style={styles.body}>{t('streak:broken.body')}</Text>
          <RepairAction
            repair={repair}
            restoreTo={restoreTo}
            coins={coins}
            now={now}
            onRepair={onRepair}
            offline={offline}
          />
        </Card>
      )}

      <Card level={2} style={styles.card}>
        <Text style={styles.cardTitle}>{t('streak:freeze.title')}</Text>
        <Text style={styles.held}>{t('streak:freeze.held', { held: freezesHeld, max: MAX_FREEZES })}</Text>
        <Text style={styles.body}>{t('streak:freeze.body')}</Text>

        {freezesFull ? (
          // Never offer something that cannot be received. Selling a third freeze at
          // the cap takes coins for nothing, which is the definition of a dark pattern.
          <Text style={styles.note}>{t('streak:freeze.full')}</Text>
        ) : (
          <>
            <Button
              label={t('streak:freeze.buy', { price: FREEZE_PRICE })}
              variant="secondary"
              disabled={offline || !canAffordFreeze || onBuyFreeze === undefined}
              onPress={() => onBuyFreeze?.()}
            />
            {offline ? (
              // Named before the coin gap: a user who is offline AND short of coins
              // needs to know the connection is why the button is grey, or they will
              // go looking for coins that would not have helped.
              <Text style={styles.note}>{t('common:offline.action')}</Text>
            ) : (
              !canAffordFreeze && (
                // The gap, stated once. No store link, no offer, no second ask.
                <Text style={styles.note}>
                  {t('streak:cantAfford', { short: FREEZE_PRICE - coins })}
                </Text>
              )
            )}
          </>
        )}
      </Card>
    </View>
  )
}

function RepairAction({
  repair,
  restoreTo,
  coins,
  now,
  onRepair,
  offline,
}: {
  readonly repair: RepairAvailability
  readonly restoreTo: number
  readonly coins: number
  readonly now: number
  readonly onRepair: (() => void) | undefined
  readonly offline: boolean
}) {
  const t = useT()

  if (!repair.available) {
    // Every rejection names WHICH, because "you can repair again in 12 days" and "the
    // window closed" are different facts and a generic "unavailable" invites tapping.
    if (repair.reason === 'window-expired') {
      return <Text style={styles.note}>{t('streak:repair.expired')}</Text>
    }
    if (repair.reason === 'cooldown') {
      return (
        <Text style={styles.note}>
          {t('streak:repair.cooldown', { days: repair.availableInDays })}
        </Text>
      )
    }
    return null
  }

  const canAfford = coins >= REPAIR_PRICE
  // Whole hours, rounded up, and never seconds. A ticking clock on a purchase is
  // pressure, and pressure aimed at a ten-year-old is the thing we do not do.
  const hoursLeft = Math.max(1, Math.ceil((repair.expiresAt - now) / 3_600_000))

  return (
    <>
      <Text style={styles.note}>{t('streak:repair.expires', { hours: hoursLeft })}</Text>
      <Button
        label={t('streak:repair.buy', { count: restoreTo, price: repair.price })}
        variant="secondary"
        disabled={offline || !canAfford || onRepair === undefined}
        onPress={() => onRepair?.()}
      />
      {offline && <Text style={styles.note}>{t('common:offline.action')}</Text>}
      {!offline && !canAfford && (
        <Text style={styles.note}>{t('streak:cantAfford', { short: repair.price - coins })}</Text>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.canvas, padding: space[4], gap: space[3] },
  hero: { alignItems: 'center', gap: space[1], paddingVertical: space[5] },
  flame: { ...text('display'), color: colors.status.streak },
  count: { ...text('display', { numeric: true }), color: colors.text.primary },
  sub: { ...text('body'), color: colors.text.secondary },
  status: { ...text('body'), color: colors.text.tertiary, textAlign: 'center', marginTop: space[2] },
  balance: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  earned: { ...text('caption'), color: colors.text.tertiary, flex: 1 },
  card: { padding: space[4], gap: space[2] },
  cardTitle: { ...text('h3'), color: colors.text.primary },
  held: { ...text('caption', { weight: '700', numeric: true }), color: colors.status.progress },
  body: { ...text('body'), color: colors.text.secondary },
  note: { ...text('caption'), color: colors.text.tertiary },
})
