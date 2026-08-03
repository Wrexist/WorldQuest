# Monetization

How WorldQuest makes money, what the numbers say, and the two rules that decide every
call in here.

Prices and tiers come from [`product-bible.md §9`](../product/product-bible.md).
Currency design comes from [ADR 0011](../adr/0011-xp-and-coins-split.md). This document
covers the **subscription**: what we sell, where we ask, and how we keep the revenue we
have already earned.

---

## The two rules

**1. We never charge for the next lesson.** Premium sells depth and delight, never
access to learning. If a user would learn *less* because they did not pay, the paywall
is in the wrong place. This is a Product Bible rule and it is also self-interested: the
North Star is Weekly Learning Days, and a paywall that reduces lessons reduces the
metric the whole company is steered by.

**2. A child never sees a purchase decision.** Onboarding already computes `isChild`
from the age gate. Every purchase surface is gated behind an adult check for those
accounts. This is not caution — it is the difference between shipping and not:

> Apps in the Kids Category must not include **purchasing opportunities**, links out of
> the app, or other distractions to kids unless reserved for a designated area behind a
> **parental gate**. Apps primarily intended for users under 13 must get parental
> permission or use a parental gate before allowing commerce.
> — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

A paywall aimed at a ten-year-old earns nothing — children do not have cards — and
costs the listing. The payer is **Marcus, persona 7**, the parent. Design for him.

### The category decision this forces

**Ship in Education with a 9+ rating, not in the Kids Category.** The Kids Category
locks *all* commerce behind a parental gate permanently, and — per Apple — once
customers expect Kids Category behaviour, later updates must keep meeting it even if
the category is deselected. That is a one-way door. Education with an age rating keeps
normal commerce for adult accounts while we still gate child accounts ourselves, which
is what a compliant, monetising education app does.

---

## What the market actually does

Numbers from [RevenueCat's State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps)
(115,000+ apps, $16 bn tracked revenue), [Adapty's 2026 benchmarks](https://adapty.io/state-of-in-app-subscriptions/)
and [Superwall's paywall data](https://superwall.com/blog/new-postmulti-page-onboarding-paywalls-convert-37-better-than-single-page-heres-why).
Recorded rather than paraphrased, because a plan built on a remembered statistic is a
plan built on nothing.

| Finding | Number | What we do with it |
|---|---|---|
| Hard paywall vs freemium, install→paid | **10.7 % vs 2.1 %** | Ask early — but see the value-moment row, which is the resolution. |
| Paywall after a measurable value moment vs immediate hard gate, trial starts | **65 % vs 31 %** (2.1×) | Put the ask *immediately after* the taster lesson, not before it. |
| Multi-page vs single-page onboarding paywall | **12.41 % vs 9.07 %** (+37 %) | Three pages, not one. |
| High-priced vs low-priced apps, download→paid | **2.8 % vs 1.4 %** | Do not discount the headline price. Cheap converts *worse*. |
| 3-day trial vs 30-day trial cancellation | **26 % vs 51 %** | Short trial. 7 days with a day-5 reminder is our starting point. |
| Google Play cancellations that are **involuntary billing failures** | **31–32 %** (App Store: 14 %) | The single biggest recoverable loss. See "the money nobody collects". |
| Recoverable by grace period + retry + real-time notifications | **15–20 %** of lost revenue, up to **40 %** of at-risk subscribers in Google's Truecaller case | Build it before building anything else revenue-shaped. |
| Annual subscribers cancelling within year 1 | **72 %** in 2026, up from 56 % in 2025 | Annual is no longer a retention silver bullet. Defend the renewal. |
| Annual reactivation after cancelling | **5 %** | Catch them *at* cancel. Afterwards is nearly hopeless. |
| Monthly subscriber surviving 1st renewal → reaching 3rd | **73–82 %** | The first renewal is the cliff. Everything after is comparatively safe. |
| Regional | North America leads conversion; IN/SEA lags every funnel step | Price by market, do not assume one number. |

---

## The offer

| | |
|---|---|
| **Trial** | 7 days free, card required, cancel any time |
| **Default plan** | Annual, ~€39 — shown pre-selected with the monthly price beside it |
| **Anchor** | Monthly ~€5.99, shown second, unselected |
| **Framing** | "€3.25 a month, billed yearly" against "€5.99 a month" — a 46 % saving stated as a number, not a badge |
| **Family** | ~€89/yr, 6 seats — the highest-LTV product we have and the one a parent actually wants |

Annual default with a monthly anchor is price anchoring, and it is the one
"psychological" technique here that is both effective and honest: both prices are real,
both are selectable, and the saving is arithmetic rather than a claim.

**No countdown timers, no fake scarcity, no "3 spots left".** Not squeamishness —
those are the patterns that draw regulator attention to a product used by children, and
they convert a one-off purchase at the cost of the trust that renews it. The Product
Bible bans dark patterns; the FTC agrees.

---

## Where we ask

```
value slides → age gate → goal picker → TASTER LESSON → ✦ paywall ✦ → home
                             │                                │
                             └── isChild? ──────────────────► skipped, adult check first
```

The taster lesson is the value moment: two minutes, a real lesson, real XP, a real
summary with the countries you just placed. **Asking immediately after it is both "at
the start of the game" and "after the value moment"** — the two things the benchmarks
disagree about turn out to agree here, because our value moment arrives inside the
first three minutes.

Three pages, per the +37 % finding:

1. **What you just did** — your taster result, and what a week of it looks like
2. **What Premium adds** — unlimited hearts, offline packs, deep stats, cosmetics
3. **The plans** — annual pre-selected, monthly beside it, trial terms in plain words

Dismissible on every page. A soft paywall here and contextual hard gates later
(out-of-hearts, deep stats, offline packs) is the layered pattern the data supports:
keep the funnel wide, then ask at the moment of highest intent.

---

## The money nobody collects

This is the part most teams skip, and on the numbers above it is worth more than any
paywall A/B test they will run instead.

**A third of Android cancellations are not decisions.** They are expired cards, failed
charges, and banks declining a foreign transaction — 31–32 % on Google Play, 14 % on
the App Store. Those users did not choose to leave. Handled properly, 15–20 % of that
revenue comes back with no new user acquired, and Google's own Truecaller case study
recovered 40 % of at-risk subscribers.

What that requires, in order of return:

1. **Grace period** on both stores, so a failed charge does not immediately revoke
   access. The user keeps learning while the retry runs.
2. **Server-to-server notifications** — App Store Server Notifications v2 and Google
   Play Real-Time Developer Notifications — so entitlement state is driven by the
   store's truth rather than by whether the app happened to be opened.
3. **Account hold** after grace, not deletion. Access pauses; progress never does.
4. **A fix-your-card message** that arrives while it can still help, saying what
   happened and what to press. Not a churn email a week later.

**Progress is never held hostage.** Lessons, streaks, XP and every learned fact survive
a lapse untouched. Only Premium's extras pause. A learning app that deletes a child's
progress over a declined card deserves the review it gets.

## Keeping what we win

- **Trial reminder on day 5.** Apple sends one anyway; ours arrives first and is kinder.
  It reduces surprise charges, which reduces refunds and chargebacks — both of which
  cost more than the subscription.
- **Defend the first renewal.** A monthly subscriber who survives it has a 73–82 %
  chance of reaching the third. That is where retention effort pays.
- **Cancel flow offers pause, not pleading.** One screen, one alternative, no maze. A
  paused subscriber returns; a trapped one leaves a one-star review.
- **Win-back at the moment of cancelling.** Annual reactivation afterwards is 5 %, so
  the offer has to reach them before they are gone, not after.

---

## Engineering

**Entitlements are server-authoritative**, exactly like XP and coins
([ADR 0006](../adr/0006-server-authoritative-progress.md)). The client may render
optimistically; it may never decide. A client-trusted entitlement is a free
subscription for anyone willing to change a device clock.

- Receipts validate **server-side**, against Apple and Google, never on device.
- Store notifications write the authoritative row; the app reads it.
- `packages/engines/src/entitlements` holds the pure state machine — the same module
  runs on the client for optimistic UI and in the edge function for the real answer, so
  the two cannot disagree. Injected clock, no network, like everything else there.
- The purchase SDK sits behind a port (`PurchasePort`) with one adapter. Nothing above
  it knows which vendor is underneath, and the tests do not need a store.

### What is built, and what is stubbed

| Piece | Where | State |
|---|---|---|
| The five-state machine | `packages/engines/src/entitlements` | Built, 11 tests |
| The cached read of the server's row | `apps/mobile/src/features/paywall/useEntitlement.ts` | Built, 12 tests |
| The paywall, three pages + parental gate | `…/paywall/PaywallScreen.tsx` | Built, 26 tests |
| Store prices and their four failure modes | `…/paywall/usePurchases.ts` | Built, 7 tests |
| Subscription status, billing fix, restore | `…/settings/SettingsScreen.tsx` | Built |
| The billing SDK itself | `…/paywall/purchases.ts` → `UNAVAILABLE` | **Stub** |
| The subscription row and its notification handlers | `supabase/` | **Not built** |

`UNAVAILABLE` is deliberately a stub that **fails** rather than a fake that succeeds.
Every caller therefore handles "the store would not answer" from the first day, which
is the same path a real device takes in a tunnel — and is what `pnpm e2e` exercises
today, because there is genuinely no SDK behind it.

Nothing above the port grants anything. `setSubscription` is the seam the sync layer
will call when the server's row arrives; until the row exists, every user is free, and
that is the correct answer rather than a placeholder.

### Where the paywall opens

`/paywall` is a route, not a modal inside onboarding — Settings, the hearts fork and a
future win-back notification all need the same destination.

- `?source=onboarding` with countries → the three-page tour, page 1 naming the
  countries just placed by flag. This is the only caller that gets the tour.
- Anywhere else → straight to the prices. They tapped "See Premium"; a tour is friction,
  and page 1 would greet them with a lesson they finished yesterday.
- An existing subscriber finishing the taster is **not** asked at all.

## Analytics

Every event in the funnel, so the benchmarks above can be checked against our own
numbers rather than believed: `paywall_shown`, `paywall_dismissed`, `plan_selected`,
`trial_started`, `trial_converted`, `trial_cancelled`, `purchase_failed`,
`billing_issue_detected`, `billing_issue_resolved`, `subscription_cancelled`,
`subscription_paused`, `winback_shown`, `winback_accepted`.

**No purchase event ever fires on a child account** — the analytics layer already
no-ops for those, and that must stay true here.

---

## What we will not do

Listed because "we forgot" and "we decided not to" look identical in a diff.

| Not doing | Why |
|---|---|
| Selling access to lessons | Rule 1. Also kills WLD, the North Star. |
| Purchasable coins | Coins are earned. The moment they have a price, a children's app has a pay-to-win economy and a regulator. |
| Countdown timers, fake scarcity, "limited spots" | Dark patterns. Banned by the Product Bible, and a fast route to review attention on a child-facing app. |
| Any purchase surface reachable by a child account | App Review, COPPA, and basic decency. |
| Interstitial ads | Not in this product. Premium removes ads we do not run. |
| Auto-opting users into the highest tier | Pre-*selected* is fine and is anchoring; pre-*charged* is a chargeback. |
| Hiding the cancel path | Illegal in several markets, and it converts a churned user into an angry one. |
