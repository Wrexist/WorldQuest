/**
 * The shop — where coins finally go.
 *
 * ## Why this was "blocked", and why only a third of it actually was
 *
 * `BALANCE.prices` has named six cosmetic categories since the balance table was
 * written — `avatarItem`, `pet`, `mapSkin`, `theme`, `titleUnlock`, `celebration` —
 * and shipped a shop for none of them. Coins were earned everywhere and spendable on
 * three utility items (a heart refill, a streak freeze, a streak repair), which
 * violates Product Bible principle 10: a currency with no sink is a number that stops
 * meaning anything, and the balance targets say a hoard means nothing is worth buying.
 *
 * The whole category was filed as "needs an illustrator". Sorting it by what it
 * actually needs:
 *
 * | Category | Needs | Status |
 * |---|---|---|
 * | avatarItem, pet, mapSkin, celebration | Illustration (asset-prompts §16, §17) | Briefed, not drawn |
 * | theme | Runtime theming | Blocked, but on ARCHITECTURE, not art |
 * | titleUnlock | A string | **Not blocked at all** |
 *
 * Themes are worth stating precisely, because "we need an artist" is the wrong reason
 * and would send someone to the wrong place. A theme is design tokens, and this repo's
 * tokens are deliberately semantic so that exact swap is possible. What stops it is
 * that `colors` resolves at module load inside 34 `StyleSheet.create` calls — swapping
 * a theme at runtime means a context and a re-architecture of every stylesheet, which
 * is a real piece of work and not an art commission.
 *
 * So the shop opens with titles. A title is a string, it is visible on the profile the
 * moment it is equipped, and it is the one category that can be COMPLETE rather than
 * a screen with a "coming soon" on it.
 *
 * ## Rules this file enforces
 *
 * 1. **Coins buy delight, never advantage** (`xp-economy.md`). Nothing purchasable
 *    here touches lessons, difficulty, XP or league position. The type system helps:
 *    a `ShopItem` has no field that could grant one.
 * 2. **The server decides.** `purchase()` returns what SHOULD happen; the edge function
 *    runs this identical module against the authoritative wallet. A client that
 *    debited its own coins is a client that can mint them.
 * 3. **Never sell something twice.** Owning an item makes it un-buyable rather than
 *    buyable-and-refunded, because the refund path is where double-charges live.
 *
 * Spec: docs/systems/xp-economy.md · ADR 0011
 */

import { BALANCE } from '../xp/balance.js'

/**
 * What the shop can sell.
 *
 * Only `title` today. The rest are listed because the balance table prices them and
 * a reader should see the whole shape — but `SHOP_KINDS` is what the catalogue may
 * actually contain, and it is deliberately shorter.
 */
export type CosmeticKind = 'title' | 'avatarItem' | 'pet' | 'mapSkin' | 'theme' | 'celebration'

/** The kinds that can be sold today. Everything else has no artwork or no runtime. */
export const SELLABLE_KINDS: readonly CosmeticKind[] = ['title']

export type ShopItem = {
  /**
   * Stable forever. This ships in user save data — a renamed id is somebody's
   * purchase disappearing, which is a refund request and a one-star review.
   */
  readonly id: string
  readonly kind: CosmeticKind
  /** i18n key for the display name. Never a literal string. */
  readonly nameKey: string
  /** Coins. Read from the balance table by the pack loader, never invented here. */
  readonly price: number
}

export type Wallet = {
  readonly coins: number
}

/** Ids the user already owns. A Set because the shop screen asks this per row. */
export type Owned = ReadonlySet<string>

export type PurchaseOutcome =
  | { readonly ok: true; readonly spend: number; readonly itemId: string }
  | { readonly ok: false; readonly reason: 'already-owned' | 'cannot-afford' | 'not-for-sale' }

/**
 * Can this user buy this item, and what does it cost them.
 *
 * Pure, and the SAME function the edge function runs. Two implementations could
 * disagree about whether somebody could afford something, and that disagreement is
 * either a free cosmetic or a user charged for nothing.
 */
export function purchase(item: ShopItem, wallet: Wallet, owned: Owned): PurchaseOutcome {
  // Ownership first: a user who already owns it must see "owned", not "you cannot
  // afford this", which would be both wrong and insulting.
  if (owned.has(item.id)) return { ok: false, reason: 'already-owned' }
  if (!SELLABLE_KINDS.includes(item.kind)) return { ok: false, reason: 'not-for-sale' }
  if (wallet.coins < item.price) return { ok: false, reason: 'cannot-afford' }
  return { ok: true, spend: item.price, itemId: item.id }
}

/**
 * How many coins short they are — for "1,000 more to go", never for a nag.
 *
 * Returns 0 when they can afford it. The copy that uses this must state the gap as a
 * fact and stop there: no countdown, no "just 200 away!", and above all no offer to
 * buy coins, which this app does not sell (`xp-economy.md`, permanent no-list).
 */
export const coinsShort = (item: ShopItem, wallet: Wallet): number =>
  Math.max(0, item.price - wallet.coins)

/**
 * The price for a kind, from the balance table.
 *
 * Ranged kinds get their minimum — the catalogue sets the real figure per item within
 * the range, and a pack that priced something outside it is a content bug the loader
 * should catch rather than a number this function should silently clamp.
 */
export function priceFor(kind: CosmeticKind): number {
  const p = BALANCE.prices
  switch (kind) {
    case 'title':
      return p.titleUnlock
    case 'theme':
      return p.theme
    case 'mapSkin':
      return p.mapSkin
    case 'celebration':
      return p.celebration
    case 'avatarItem':
      return p.avatarItem.min
    case 'pet':
      return p.pet.min
  }
}

/**
 * What the profile should show, given what is owned and equipped.
 *
 * The level title is ALWAYS available and is the fallback — a bought title is a
 * different hat, not a replacement ladder. Someone who buys nothing still has a title
 * that goes up as they learn, and someone who equips one and later wants their rank
 * back can always get it.
 */
export function equippedTitleKey(
  levelTitleKey: string,
  equippedId: string | null,
  catalogue: readonly ShopItem[],
  owned: Owned,
): string {
  if (equippedId === null) return levelTitleKey
  // Equipping something you no longer own should not be possible, but a stale local
  // row after a restore can say so. Fall back rather than render a key as text.
  if (!owned.has(equippedId)) return levelTitleKey
  return catalogue.find((i) => i.id === equippedId)?.nameKey ?? levelTitleKey
}
