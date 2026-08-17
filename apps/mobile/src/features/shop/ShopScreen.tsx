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
import {
  Button,
  Card,
  colors,
  radius,
  space,
  squircle,
  Tally,
  text,
} from '@worldquest/design'
import { coinsShort, purchase, type ShopItem } from '@worldquest/engines'
import { Icon } from '../../components/Icon.js'
import { TopBar } from '../../components/TopBar.js'
import { Art } from '../../components/Art.js'
import type { ArtName } from '../../lib/art.generated.js'
import type { IconName } from '../../lib/icons.generated.js'
import { INSIGNIA_SIZE, insigniaFor } from '../../lib/insignia.js'
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
  /** The bell, so the header matches the other tabs. Optional like every other route hook. */
  readonly onOpenInbox?: (() => void) | undefined
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
  onOpenInbox,
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
      {/* The same chrome the other four tabs wear.
   
          Shop was the only tab without it, so moving between tabs the header appeared and
          disappeared under you — and the tab it vanished on is the one where identity and
          the inbox are least expected to go missing.
   
          Deliberately WITHOUT `coins`. The wallet card below is a better presentation of
          the same number and the note on it argues why; a chip in the header two hundred
          points above it would state the balance twice on the one screen where it is
          already the subject. Consistency here is the avatar and the inbox, not the
          duplication of a figure. */}
      <TopBar initials="EX" {...(onOpenInbox !== undefined ? { onInbox: onOpenInbox } : {})} />
      <Text style={styles.h1} role="heading" aria-level={1}>
        {t('shop:title')}
      </Text>

      {/* The balance, as the first thing on the screen rather than a chip beside the
          heading.
   
          It is the number every row on this screen is measured against — "1,000 coins"
          means nothing until you know what you have — and it was a 20pt pill sharing a
          line with the title. The reference gives it a card of its own with the mascot
          leaning in, which is what makes it read as YOUR balance rather than as a unit
          label. Atlas is decorative; the card says what it is in words. */}
      <Card level={2} style={styles.wallet} accessibilityLabel={t('shop:balance', { count: coins })}>
        <View style={styles.walletText}>
          <Text style={styles.walletLabel}>{t('shop:balance.label')}</Text>
          <View style={styles.walletAmount}>
            <Icon name="coins" size={24} color={colors.reward.coin} />
            <Text style={styles.walletNumber}>{coins}</Text>
          </View>
        </View>
        <View style={styles.walletArt} pointerEvents="none">
          <Art name="atlas/explorer" size={WALLET_ART} />
        </View>
      </Card>

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
            insignia={insigniaFor(levelTitleKey)}
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
                glyph={TITLE_ICON[item.id]}
                owned={isOwned}
                equipped={equippedId === item.id}
                price={t('shop:price', { count: item.price })}
                // A fact, once. No offer to buy coins — this app does not sell them.
                //
                // Suppressed at zero, where "1,000 coins to go" is the price restated:
                // every row showed the same number twice, which reads as a rendering
                // bug rather than as progress. The gap is only information once some
                // of it has been closed.
                short={
                  short > 0 && !isOwned && coins > 0
                    ? t('shop:short', { count: short })
                    : undefined
                }
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

/**
 * A glyph per title, keyed on the item id.
 *
 * Every cosmetic row drew an empty 48pt slot: the space is reserved so the one row with
 * an insignia does not indent its name past the five without one, and for the five it was
 * reserved and then left blank — a column of white gutter down the left of the only
 * screen in the app that asks for money.
 *
 * These are Lucide glyphs rather than commissioned art, and that is the right call rather
 * than a stopgap: a shop title is a WORD you wear, not an object, and drawing six
 * illustrations for six adjectives would make them look like items you own. The rank
 * insignia stays art, because a rank is a thing.
 *
 * Keyed on the id and `Partial`: ids are permanent by rule, and a title shipped without a
 * glyph gets the empty slot it has today rather than a wrong one.
 */
/** Atlas leaning into the wallet card. Sized to the card, not to the mascot. */
const WALLET_ART = 96

const TITLE_ICON: Partial<Record<string, IconName>> = {
  'title.flag-fanatic': 'flag',
  'title.capital-collector': 'capital',
  'title.night-owl': 'moon',
  'title.early-bird': 'sunrise',
  'title.island-hopper': 'pin',
  'title.map-nerd': 'map',
  // The 2026-08-13 batch. Twelve more, glyphed from the set that already ships — a
  // title is a word you wear, so none of these needed drawing.
  'title.compass-rose': 'pin',
  'title.border-hopper': 'continent',
  'title.peak-seeker': 'explore',
  'title.river-reader': 'globe',
  'title.timezone-tamer': 'clock',
  'title.atlas-apprentice': 'medal',
  'title.coast-watcher': 'map',
  'title.dune-walker': 'sunrise',
  'title.star-steerer': 'star',
  'title.cloud-spotter': 'offline',
  'title.deep-diver': 'heart',
  'title.long-way-round': 'quests',
}

function TitleRow({
  name,
  help,
  insignia,
  glyph,
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
  /**
   * The rank insignia, for the one row that has one.
   *
   * Only the level title is a rank, and only ranks have been drawn — the shop's own
   * titles are bought, not climbed to, and `asset-prompts.md` briefs no art for them.
   * So one row in seven carries a picture, which is not an inconsistency to tidy up:
   * that row is the earned one, and looking different is the whole point of it.
   */
  readonly insignia?: ArtName | null | undefined
  /** The bought titles' glyph, filling the slot the insignia leaves empty. */
  readonly glyph?: IconName | undefined
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
      {/* The slot is reserved even when it is empty.
   
          Only rank titles carry an insignia; the cosmetic ones have no art and never
          will, because they are not ranks. Rendering the image conditionally meant the
          one row with a picture indented its name and the four without it did not, so a
          list of otherwise identical rows had two left edges and the earned title read
          as a different KIND of thing rather than as the same thing, owned. */}
      <View style={styles.insignia}>
        {insignia != null ? (
          <Art name={insignia} size={INSIGNIA_SIZE} />
        ) : glyph !== undefined ? (
          // Dimmed until it is owned, so the column reads as a set of things you could
          // have. Decorative — the row already says the title's name.
          <View style={[styles.glyph, !owned && styles.glyphLocked]}>
            <Icon name={glyph} size={22} color={colors.reward.coin} />
          </View>
        ) : null}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{name}</Text>
        {help !== undefined && <Text style={styles.rowHelp}>{help}</Text>}
        {/* A coin beside the price, in the coin's own tint.

            Seven gold numbers ran down this screen with no unit on any of them but the
            word "coins", and the one place a child is asked to spend something is the
            worst place to make them read to find out what. It is the same icon↔label pair
            Explore puts on its "countries to meet" line and the tab bar puts on the
            balance — `space[1]`, the 4pt rung that exists for exactly this.

            `aria-hidden`: the line says "1,000 coins" in words, and the row's own text is
            what a reader gets. */}
        {!owned && price !== undefined && (
          <View style={styles.rowPriceLine}>
            <Icon name="coins" size={13} color={colors.reward.coin} />
            <Tally style={styles.rowPrice} numberStyle={styles.rowPriceNumber}>
              {price}
            </Tally>
          </View>
        )}
        {/* Stated once, and never followed by a way to spend money on coins. */}
        {short !== undefined && (
          <Tally style={styles.rowShort} numberStyle={styles.rowShortNumber}>
            {short}
          </Tally>
        )}
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
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[3] },

  wallet: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  walletText: { flex: 1, gap: space[1] },
  walletLabel: { ...text('caption'), color: colors.text.secondary },
  walletAmount: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  walletNumber: { ...text('display', { numeric: true }), color: colors.text.primary },
  // Bleeds past the card's padding on the trailing side, the way the quest card's
  // mascot does on Home: a cutout inside its own padding reads as a sticker.
  walletArt: { marginEnd: -space[3], marginVertical: -space[2] },
  // A tinted disc, so a 22pt glyph fills the 48pt slot an insignia would occupy
  // instead of floating in the middle of it.
  glyph: {
    width: INSIGNIA_SIZE,
    height: INSIGNIA_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.surfaceRaised,
  },
  // Dimmed, not ghosted. 0.45 photographed as a watermark — the glyph is the only thing
  // distinguishing five otherwise identical rows, so it has to be legible while still
  // reading as something you do not own yet.
  glyphLocked: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { ...text('h1'), color: colors.text.primary },
  intro: { ...text('body'), color: colors.text.secondary },

  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    padding: space[3],
    borderRadius: radius.md,
    ...squircle,
    backgroundColor: colors.bg.surface,
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, flex: 1 },

  section: { ...text('overline'), color: colors.text.secondary, marginTop: space[3] },

  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  rowOn: { borderColor: colors.status.progress },
  rowSkeleton: { minHeight: 64 },
  skeletonBar: { height: 16, flex: 1, borderRadius: radius.sm, backgroundColor: colors.bg.surfaceRaised, ...squircle },
  insignia: { width: INSIGNIA_SIZE, alignItems: 'center' },
  rowText: { flex: 1, gap: space[1] },
  rowName: { ...text('bodyStrong'), color: colors.text.primary },
  rowHelp: { ...text('caption'), color: colors.text.secondary },
  rowPriceLine: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  rowPrice: { ...text('caption'), color: colors.reward.coin },
  rowPriceNumber: { ...text('caption', { weight: '700', numeric: true }) },
  rowShort: { ...text('caption'), color: colors.text.secondary },
  rowShortNumber: { ...text('caption', { weight: '700', numeric: true }) },

  action: { alignSelf: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  badgeText: { ...text('caption'), color: colors.status.progress },

  empty: { gap: space[2] },
  emptyTitle: { ...text('h3'), color: colors.text.primary },
  emptyBody: { ...text('body'), color: colors.text.secondary },

  soon: { ...text('body'), color: colors.text.secondary },
  tail: { height: space[5] },
})
