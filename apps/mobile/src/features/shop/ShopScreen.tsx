/**
 * The Shop — where coins finally go.
 *
 * Coins have been earned from every lesson, quest, achievement and streak milestone
 * since the economy shipped, and were spendable on exactly three utility items: a
 * heart refill, a streak freeze, a streak repair. Product Bible principle 10 says a
 * currency with no sink stops meaning anything, and the balance targets say a hoard
 * means nothing is worth buying.
 *
 * ## What it sells, and what it honestly cannot
 *
 * Titles, and only titles. `BALANCE.prices` names six cosmetic categories; four of
 * them (avatar items, pets, map skins, celebrations) need illustration that does not
 * exist, and one (themes) needs runtime theming this app does not have. Selling any of
 * those would take real coins for a blank square.
 *
 * So the "More to come" section is a heading and a sentence, NOT a row of greyed-out
 * items with prices on them. A disabled price tag is a promise with a number attached,
 * and the number is the part people remember.
 *
 * ## Rules on this screen
 *
 * - **Nothing here is an advantage.** Said in the first sentence, not buried in a
 *   policy — a ten-year-old should be able to read why the shop cannot help them win.
 * - **No coin sales.** When they cannot afford something the screen states the gap
 *   once, as a fact, and stops. There is no "get more coins" button because this app
 *   does not sell coins, and there never will be one.
 * - **The free option is not the lesser one.** The level title sits at the top of the
 *   list with the bought ones, described as earned rather than as a placeholder.
 *
 * Spec: docs/systems/xp-economy.md · ADR 0011
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, Card, colors, radius, space, text } from '@worldquest/design'
import { coinsShort, purchase, type ShopItem } from '@worldquest/engines'
import { Icon } from '../../components/Icon.js'
import { Stat } from '../../components/Stat.js'
import { FailureState } from '../../components/FailureState.js'
import { useT, type TranslationKey } from '../../lib/i18n.js'

export type ShopScreenProps = {
  /** From the pack. Empty means the catalogue could not be read. */
  readonly catalogue: readonly ShopItem[]
  readonly coins: number
  readonly owned: ReadonlySet<string>
  /** null = wearing the level title, which is always available. */
  readonly equippedId: string | null
  /** The title their level earned them, for the always-present first row. */
  readonly levelTitleKey: string
  readonly loading: boolean
  readonly isOffline: boolean
  readonly error?: boolean
  readonly onRetry?: (() => void) | undefined
  readonly onBuy: (item: ShopItem) => void
  /** `null` takes the bought title off and returns to the level one. */
  readonly onEquip: (id: string | null) => void
}

export function ShopScreen({
  catalogue,
  coins,
  owned,
  equippedId,
  levelTitleKey,
  loading,
  isOffline,
  error = false,
  onRetry,
  onBuy,
  onEquip,
}: ShopScreenProps) {
  const t = useT()

  if (error) {
    return (
      <FailureState
        titleKey="errors:crash.title"
        bodyKey="errors:crash.body"
        ctaKey="errors:crash.cta"
        onPress={onRetry ?? (() => {})}
      />
    )
  }

  const titles = catalogue.filter((i) => i.kind === 'title')

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.h1} role="heading" aria-level={1}>
          {t('shop:title')}
        </Text>
        <Stat kind="coin" value={coins} accessibilityLabel={t('shop:balance', { count: coins })} />
      </View>

      {/* The rule the whole screen obeys, in the first sentence a child reads. */}
      <Text style={styles.intro}>{t('shop:intro')}</Text>

      {isOffline && (
        // Not an error. A purchase is a server decision (ADR 0006) so it waits; owned
        // items are local and keep working, and saying so is the whole message.
        <View style={styles.offline} role="status">
          <Icon name="offline" size={18} color={colors.text.secondary} />
          <Text style={styles.offlineText}>{t('shop:offline.body')}</Text>
        </View>
      )}

      <Text style={styles.section} role="heading" aria-level={2}>
        {t('shop:section.titles')}
      </Text>

      {loading ? (
        <SkeletonRows />
      ) : titles.length === 0 ? (
        <Card level={1} style={styles.empty}>
          <Text style={styles.emptyTitle} role="heading" aria-level={3}>
            {t('shop:empty.title')}
          </Text>
          {/* Answers the actual fear first: the coins are still there. */}
          <Text style={styles.emptyBody}>{t('shop:empty.body')}</Text>
        </Card>
      ) : (
        <>
          {/* Always first, and described as earned rather than as a fallback. */}
          <TitleRow
            name={t(levelTitleKey as TranslationKey)}
            help={t('shop:levelTitle.help')}
            owned
            equipped={equippedId === null}
            onEquip={() => onEquip(null)}
          />
          {titles.map((item) => {
            const isOwned = owned.has(item.id)
            const outcome = purchase(item, { coins }, owned)
            const short = coinsShort(item, { coins })
            return (
              <TitleRow
                key={item.id}
                name={t(item.nameKey as TranslationKey)}
                owned={isOwned}
                equipped={equippedId === item.id}
                price={t('shop:price', { count: item.price })}
                // A fact, once. No offer to buy coins — this app does not sell them.
                short={short > 0 && !isOwned ? t('shop:short', { count: short }) : undefined}
                canBuy={outcome.ok && !isOffline}
                onBuy={() => onBuy(item)}
                onEquip={() => onEquip(item.id)}
              />
            )
          })}
        </>
      )}

      <Text style={styles.section} role="heading" aria-level={2}>
        {t('shop:section.soon')}
      </Text>
      {/* A sentence, not a row of greyed-out items with prices on them. A disabled
          price tag is a promise with a number attached, and the number is the part
          people remember. */}
      <Text style={styles.soon}>{t('shop:soon.body')}</Text>

      <View style={styles.tail} />
    </ScrollView>
  )
}

function TitleRow({
  name,
  help,
  owned,
  equipped,
  price,
  short,
  canBuy = false,
  onBuy,
  onEquip,
}: {
  readonly name: string
  readonly help?: string
  readonly owned: boolean
  readonly equipped: boolean
  readonly price?: string
  readonly short?: string | undefined
  readonly canBuy?: boolean
  readonly onBuy?: () => void
  readonly onEquip: () => void
}) {
  const t = useT()

  return (
    <Card level={equipped ? 2 : 1} style={[styles.row, equipped && styles.rowOn]}>
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{name}</Text>
        {help !== undefined && <Text style={styles.rowHelp}>{help}</Text>}
        {!owned && price !== undefined && <Text style={styles.rowPrice}>{price}</Text>}
        {/* Stated once, and never followed by a way to spend money on coins. */}
        {short !== undefined && <Text style={styles.rowShort}>{short}</Text>}
      </View>

      {/* The action sits centred on its own axis. Without the wrapper the Button
          stretches to the card's height, which on the three-line level-title row
          drew a button twice as tall as every other one. */}
      <View style={styles.action}>
      {equipped ? (
        <View style={styles.badge}>
          <Icon name="check" size={16} color={colors.status.progress} />
          <Text style={styles.badgeText}>{t('shop:equipped')}</Text>
        </View>
      ) : owned ? (
        <Button label={t('shop:wear')} onPress={onEquip} size="sm" variant="secondary" />
      ) : (
        <Button
          label={t('shop:buy')}
          onPress={onBuy ?? (() => {})}
          size="sm"
          disabled={!canBuy}
        />
      )}
      </View>
    </Card>
  )
}

/** Skeleton, never a spinner on primary content — no layout shift on arrival. */
function SkeletonRows() {
  return (
    <View aria-hidden>
      {[0, 1, 2].map((i) => (
        <Card key={i} level={1} style={[styles.row, styles.rowSkeleton]}>
          <View style={styles.skeletonBar} />
        </Card>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[3] },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { ...text('h1'), color: colors.text.primary },
  intro: { ...text('body'), color: colors.text.secondary },

  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    padding: space[3],
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, flex: 1 },

  section: { ...text('overline'), color: colors.text.secondary, marginTop: space[3] },

  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  rowOn: { borderColor: colors.status.progress },
  rowSkeleton: { minHeight: 64 },
  skeletonBar: { height: 16, flex: 1, borderRadius: radius.sm, backgroundColor: colors.bg.surfaceRaised },
  rowText: { flex: 1, gap: space[1] },
  rowName: { ...text('bodyStrong'), color: colors.text.primary },
  rowHelp: { ...text('caption'), color: colors.text.secondary },
  rowPrice: { ...text('caption', { numeric: true }), color: colors.reward.coin },
  rowShort: { ...text('caption', { numeric: true }), color: colors.text.secondary },

  action: { alignSelf: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  badgeText: { ...text('caption'), color: colors.status.progress },

  empty: { gap: space[2] },
  emptyTitle: { ...text('h3'), color: colors.text.primary },
  emptyBody: { ...text('body'), color: colors.text.secondary },

  soon: { ...text('body'), color: colors.text.secondary },
  tail: { height: space[5] },
})
