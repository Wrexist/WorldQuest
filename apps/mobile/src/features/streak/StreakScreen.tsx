/**
 * The streak, and the two things that protect it.
 *
 * ## Why this is not a "Shop"
 *
 * Freezes and repairs are the only coin sinks that exist yet — the cosmetics that form
 * the real sink (avatar items, pets, map skins, themes) still need assets nobody has
 * drawn. A two-row store would be a shop in name only.
 *
 * This used to say the two of them existed "without artwork", and that stopped being
 * true when `rewards/streak-freeze` was delivered. The freeze card draws it now.
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

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { Button, Card, Tally, colors, space, text } from '@worldquest/design'
import {
  FREEZE_PRICE,
  MAX_FREEZES,
  REPAIR_PRICE,
  isMilestone,
  nextMilestone,
  type RepairAvailability,
} from '@worldquest/engines'
import { useT } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { Stat } from '../../components/Stat.js'

/**
 * The freeze on its own card.
 *
 * 64 rather than the 140 an empty state uses: this is an object inside a card that also
 * has a title, a count, a paragraph and a button, not the subject of the screen. The
 * flame above it is 72 and stays the larger of the two, because the streak is what the
 * screen is about and the freeze is what protects it.
 */
const FREEZE_ART = 64

/**
 * Where this streak sits relative to the milestones that actually pay out.
 *
 * `isMilestone` has existed in the engine since streaks were built, and `xp-economy.md`
 * funds days 7, 30, 100 and 365 at +50/+200/+500/+1000 XP — but no screen ever mentioned
 * any of it, so the reward arrived with no explanation and the goal that earns it was
 * invisible. `scripts/reachability.ts` has carried it as a tracked gap ("no streak
 * milestone is ever celebrated") rather than letting it look intentional.
 *
 * The list of days itself stays behind `isMilestone` and `nextMilestone`; this screen
 * asks those two questions and never reads the array, so which days count remains the
 * engine's business and the balance table's.
 *
 * Three states, and the order matters:
 *
 * 1. **On a milestone today** — say so, and nothing else. Pointing at the next target on
 *    the day someone reaches this one is the difference between "you did it" and "keep
 *    going", and it should be the first of those exactly once.
 * 2. **Working towards one** — the count remaining. A number, not a bar: a progress bar
 *    from 100 to 365 is a sliver that moves imperceptibly for months, which reads as no
 *    progress rather than as slow progress.
 * 3. **Past the last one, or broken** — nothing. There is no fifth milestone in the
 *    balance table, and inventing one would promise a reward no ledger honours. Silence
 *    beats a target nobody is paid for.
 *
 * Never a countdown, never a warning, never "don't lose it" — the same rule the repair
 * window follows. This is a thing to look forward to, not a thing to be afraid of.
 */
function MilestoneLine({ current, broken }: { current: number; broken: boolean }) {
  const t = useT()
  if (broken || current <= 0) return null

  if (isMilestone(current)) {
    return <Text style={styles.milestone}>{t('streak:milestone.reached', { count: current })}</Text>
  }

  const next = nextMilestone(current)
  if (next === null) return null

  return <Text style={styles.milestone}>{t('streak:milestone.next', { count: next - current })}</Text>
}

export type StreakScreenProps = {
  readonly current: number
  readonly longest: number
  readonly freezesHeld: number
  readonly coins: number
  /** Straight from `repairAvailability` — the reason is what decides the copy. */
  readonly repairOffer: RepairAvailability
  /** The length a repair would restore. Not `current`, which has already reset to 1. */
  readonly restoreTo: number
  /** Epoch ms, injected so the screen never reads a clock. */
  readonly now: number
  readonly onBuyFreeze?: (() => void) | undefined
  /**
   * A freeze purchase is in flight.
   *
   * `purchase_freeze` carries no idempotency key — unlike a lesson, whose id IS the key —
   * so two taps before the first answer arrives are two independent purchases. At 400
   * coins each, a user with 800 was charged twice for one intended freeze. The request
   * cannot be made idempotent without inventing a client-supplied id for a thing that has
   * no natural one, so the button refuses the second tap instead.
   */
  readonly buyingFreeze?: boolean | undefined
  /**
   * Why the last purchase did not happen, if it did not.
   *
   * The server answers a refusal with a STATUS rather than an error — "you already hold
   * two" is an answer, not a failure — and the route was dropping all of them on the
   * floor, so a refused purchase looked exactly like a successful one that had not
   * refreshed yet. A key rather than a resolved string, because copy is a key.
   */
  readonly freezeNotice?: 'at_cap' | 'insufficient_funds' | 'failed' | null | undefined
  readonly onRepair?: (() => void) | undefined
  /**
   * A repair is in flight. Same reasoning as `buyingFreeze`.
   *
   * `repair_streak` has no idempotency key either — a broken streak is not a thing with
   * an id the client can mint — so the button refuses the second tap rather than charging
   * 1,200 coins for one intended repair.
   */
  readonly repairing?: boolean | undefined
  /**
   * Why the last repair did not happen, if it did not.
   *
   * `cooldown` and `expired` are not here: those are decided before the tap and rendered
   * as the card's own copy. These are the two the server can only answer afterwards.
   */
  readonly repairNotice?: 'insufficient_funds' | 'failed' | null | undefined
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
  /**
   * Renders the back control. Optional so component tests and the screenshot
   * renderer can mount this without a router; a route must always pass it.
   *
   * This screen had no way back at all — the root Stack sets `headerShown: false`
   * and nothing replaced it, so `pnpm a11y:tree` found a route a keyboard or screen
   * reader could enter and not leave.
   */
  readonly onBack?: (() => void) | undefined

}

export function StreakScreen({
  onBack,
  current,
  longest,
  freezesHeld,
  coins,
  repairOffer,
  restoreTo,
  now,
  onBuyFreeze,
  buyingFreeze = false,
  freezeNotice = null,
  repairing = false,
  repairNotice = null,
  onRepair,
  offline = false,
}: StreakScreenProps) {
  const t = useT()

  const broken = !repairOffer.available
    ? repairOffer.reason !== 'not-broken' && repairOffer.reason !== 'nothing-to-restore'
    : true

  const canAffordFreeze = coins >= FREEZE_PRICE
  const freezesFull = freezesHeld >= MAX_FREEZES

  return (
    /* A ScrollView, because this screen did not have one.

       Measured at 320 before changing it: the content ended at 678 of 700 — twenty-two
       pixels of headroom, and that is WITHOUT the repair card, since a broken streak adds
       a whole card to a screen already flush with the bottom edge. At 200 % text it needs
       1262. There was nothing to scroll: `root` was a `flex: 1` View, so on a device
       everything past the fold is simply gone. It looked fine here only because a browser
       scrolls the document when a page overflows, which is a thing no phone does.

       The header goes INSIDE, as it does on Country, Collection and Achievements. Four
       screens with a back button should put it in the same place. */
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {onBack !== undefined && <ScreenHeader onBack={onBack} />}
      <View style={styles.hero}>
        {/* The streak flame, as the delivered object rather than a 44pt line glyph.
            This is the hero of the screen — the number underneath it is the whole
            subject — and it is drawn large enough for the art to read, which a chip at
            18pt is not. Decorative: the heading below states the streak in words. */}
        <Art name="rewards/streak-flame" size={72} />
        <Text style={styles.count} role="heading" aria-level={1}>
          {t('streak:days', { count: current })}
        </Text>
        {/* Silent at zero. "No days yet" is already the heading and "Finish a lesson
            today to start one" is already the line below, so "Longest: 0 days" was the
            third statement of the same nothing, stacked between the other two.

            Same rule as the welcome screen's STILL YOURS card and Explore's tile
            caption: a line that exists only to report zero is a line that should not be
            there. A personal best only becomes worth naming once there is one. */}
        {longest > 0 && (
          <Tally style={styles.sub} numberStyle={styles.subNumber}>
            {t('streak:longest', { count: longest })}
          </Tally>
        )}
        <Text style={styles.status}>
          {broken
            ? t('streak:broken.body')
            : current > 0
              ? t('streak:intact')
              : t('streak:none')}
        </Text>
        <MilestoneLine current={current} broken={broken} />
      </View>

      <View style={styles.balance}>
        <Stat kind="coin" value={coins} accessibilityLabel={t('streak:coins', { count: coins })} />
        {/* Standing reassurance, and a promise the code has to keep. */}
        <Text style={styles.earned}>{t('streak:earned')}</Text>
      </View>

      {broken && (
        <Card level={2} style={styles.card}>
          <Text style={styles.cardTitle}>{t('streak:broken.title')}</Text>
          <Text style={styles.body}>{t('streak:broken.body')}</Text>
          <RepairAction
            repairOffer={repairOffer}
            restoreTo={restoreTo}
            coins={coins}
            now={now}
            onRepair={onRepair}
            repairing={repairing}
            repairNotice={repairNotice}
            offline={offline}
          />
        </Card>
      )}

      <Card level={2} style={styles.card}>
        {/* The freeze itself. This card is asking for coins, and a purchase with no
            picture of the thing being bought is the weakest frame in the product — the
            user is being asked to trade a real balance for a paragraph.

            Decorative: the title, the count and the body already say what it is and what
            it does, so a screen reader announcing a snowflake adds length, not meaning. */}
        <View style={styles.cardArt}>
          <Art name="rewards/streak-freeze" size={FREEZE_ART} />
        </View>
        <Text style={styles.cardTitle}>{t('streak:freeze.title')}</Text>
        {/* Green only when there is something to be pleased about. `status.progress` on
            "0 of 2 held" is the same lie the lesson summary told with a 35 % accuracy in
            success green: the colour said good while the number said none. */}
        <Text style={freezesHeld > 0 ? styles.held : styles.heldNone}>
          {t('streak:freeze.held', { held: freezesHeld, max: MAX_FREEZES })}
        </Text>
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
              // `loading`, not another clause in `disabled`. The primitive already makes
              // the button inert AND sets `aria-busy`, and it keeps the label mounted so
              // the button does not change width — a purchase is deliberately not
              // optimistic here, so the user waits a real round trip, and a greyed
              // rectangle is the whole of what a screen reader was told about it.
              loading={buyingFreeze}
              onPress={() => onBuyFreeze?.()}
            />
            {freezeNotice !== null && (
              // Stated once, plainly, with no second ask. A refusal the user cannot see
              // is a button that looks broken — and one announced to nobody is the same
              // thing for a screen-reader user, hence `role="alert"`: this Text is
              // inserted after the fact, so without it the refusal is silent.
              <Text style={styles.note} role="alert">
                {freezeNotice === 'at_cap'
                  ? t('streak:freeze.refused.atCap')
                  : freezeNotice === 'insufficient_funds'
                    ? t('streak:freeze.refused.funds')
                    : t('streak:freeze.refused.failed')}
              </Text>
            )}
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
    </ScrollView>
  )
}

function RepairAction({
  repairOffer,
  restoreTo,
  coins,
  now,
  onRepair,
  repairing,
  repairNotice,
  offline,
}: {
  readonly repairOffer: RepairAvailability
  readonly restoreTo: number
  readonly coins: number
  readonly now: number
  readonly onRepair: (() => void) | undefined
  readonly repairing: boolean
  readonly repairNotice: 'insufficient_funds' | 'failed' | null
  readonly offline: boolean
}) {
  const t = useT()

  if (!repairOffer.available) {
    // Every rejection names WHICH, because "you can repair again in 12 days" and "the
    // window closed" are different facts and a generic "unavailable" invites tapping.
    if (repairOffer.reason === 'window-expired') {
      return <Text style={styles.note}>{t('streak:repair.expired')}</Text>
    }
    if (repairOffer.reason === 'cooldown') {
      return (
        <Text style={styles.note}>
          {t('streak:repair.cooldown', { days: repairOffer.availableInDays })}
        </Text>
      )
    }
    return null
  }

  const canAfford = coins >= REPAIR_PRICE
  // Whole hours, rounded up, and never seconds. A ticking clock on a purchase is
  // pressure, and pressure aimed at a ten-year-old is the thing we do not do.
  const hoursLeft = Math.max(1, Math.ceil((repairOffer.expiresAt - now) / 3_600_000))

  return (
    <>
      <Text style={styles.note}>{t('streak:repair.expires', { hours: hoursLeft })}</Text>
      <Button
        label={t('streak:repair.buy', { count: restoreTo, price: repairOffer.price })}
        variant="secondary"
        disabled={offline || !canAfford || onRepair === undefined}
        // `loading` rather than a third clause in `disabled`, exactly as the freeze does:
        // it keeps the label mounted so the button does not change width, and it sets
        // `aria-busy`, which is the whole of what a screen reader learns from a control
        // that has gone inert.
        loading={repairing}
        onPress={() => onRepair?.()}
      />
      {repairNotice !== null && (
        // `role="alert"`: inserted after the tap, so without it the refusal is silent for
        // a screen-reader user — who has just been told nothing at all happened.
        <Text style={styles.note} role="alert">
          {repairNotice === 'insufficient_funds'
            ? t('streak:repair.refused.funds')
            : t('streak:repair.refused.failed')}
        </Text>
      )}
      {offline && <Text style={styles.note}>{t('common:offline.action')}</Text>}
      {!offline && !canAfford && (
        <Text style={styles.note}>{t('streak:cantAfford', { short: repairOffer.price - coins })}</Text>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[3] },
  hero: { alignItems: 'center', gap: space[1], paddingVertical: space[5] },
  flame: { ...text('display'), color: colors.status.streak },
  count: { ...text('display', { numeric: true }), color: colors.text.primary },
  sub: { ...text('body'), color: colors.text.secondary },
  subNumber: { ...text('body', { weight: '700', numeric: true }), color: colors.text.primary },
  status: { ...text('body'), color: colors.text.tertiary, textAlign: 'center', marginTop: space[2] },
  // The streak colour, because this line is about the streak's own progress — and
  // `numeric` so "23 days to go" does not reflow as the number shrinks day by day.
  milestone: {
    ...text('caption', { weight: '700', numeric: true }),
    color: colors.status.streak,
    textAlign: 'center',
    marginTop: space[1],
  },
  balance: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  earned: { ...text('caption'), color: colors.text.tertiary, flex: 1 },
  card: { padding: space[4], gap: space[2] },
  cardArt: { alignItems: 'center' },
  cardTitle: { ...text('h3'), color: colors.text.primary },
  held: { ...text('caption', { weight: '700', numeric: true }), color: colors.status.progress },
  heldNone: { ...text('caption', { weight: '700', numeric: true }), color: colors.text.secondary },
  body: { ...text('body'), color: colors.text.secondary },
  note: { ...text('caption'), color: colors.text.tertiary },
})
