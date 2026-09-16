# Audit 6: App Store readiness and monetization

13 September 2026. Scope: shipped source, web journey, build configuration and current Apple documentation. App Store Connect, signing credentials, actual StoreKit products and native receipts were not accessed. P0 blocks public payment/release; operational items below are unverified until demonstrated.

## Current purchase journey

The purchase abstraction is a useful seam, but its runtime default is `UNAVAILABLE`. Loading products throws, purchase/restore cannot complete and billing management is a no-op. Sample products are confined to test/harness use. The captured [paywall](screens/paywall-source-settings@390.png) correctly displays store-unavailable copy rather than invented prices. That is good failure handling, not a functioning subscription business. Sources: [purchase port](../../../apps/mobile/src/features/paywall/purchases.ts), [lesson route](../../../apps/mobile/app/lesson.tsx).

The paywall advertises unlimited hearts, offline packs, deep stats and exclusive cosmetics. Audit each benefit against its actual entitlement boundary. In particular, `isPremium` skips the post-taster upsell in the route, but `LessonScreen` does not pass `heartsEnabled` into `useLesson`; the hook's default remains enabled. Selling unlimited hearts before connecting that setting would break the advertised benefit. Base bundled offline lessons already exist: make any premium offline benefit genuinely additional and explicit.

Coin-funded continues have a separate correctness gap. `LessonScreen` calls `void payForContinue(makeUuid())` and immediately revives. The payment helper swallows failures; a refused debit still permits a consumed continue. Connectivity checks cannot guarantee payment. Make the grant and debit consistent: await an idempotent server result with a friendly pending/retry state, or define a deliberate free-rescue rule and stop presenting it as a paid purchase. Persist the offer's idempotency key across retries. Sources: [lesson screen](../../../apps/mobile/src/features/lesson/LessonScreen.tsx), [continue purchase](../../../apps/mobile/src/features/lesson/continuePurchase.ts).

## Store and privacy gaps

Settings has undefined privacy, terms and licences URLs. No in-app account-deletion flow or endpoint was found. Apple specifically includes automatically created guest accounts in its deletion guidance. Build deletion with authentication/re-authentication where appropriate, progress/export choices, background erasure status and clear subscription information; deleting an account is not itself cancellation of the App Store subscription. The append-only review-log triggers need a controlled deletion path. [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

The app must be complete, describe its functionality accurately, meet applicable digital-purchase rules and protect personal data. Decide explicitly whether to enter the Kids Category; parental gates and category restrictions are separate from merely hiding adult buttons. Email OTP alone does not automatically require adding Sign in with Apple under the third-party-login rule. Review that rule if adding social login. Storefront-specific payment exceptions should be assessed only if actually used. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

`privacyTracking: false`, an empty collected-data declaration and a UserDefaults reason entry are not evidence that no data is collected. The backend stores learning activity, identity and subscription state. Inventory actual collection, purpose, linkage, retention and every SDK, then reconcile the privacy policy, App Store privacy answers and privacy manifests. [Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/)

As of this audit, uploads require Xcode 26 or later and the iOS 26 SDK; that requirement began 28 April 2026. Updated age-rating questions and EU trader-status requirements also need App Store Connect verification. The repository's Expo version does not by itself prove the selected EAS build image meets upload requirements. [Apple current requirements](https://developer.apple.com/news/upcoming-requirements/)

`app.json` enables iPad. Either support and test the iPad experience and submit appropriate assets, or deliberately change supported devices before release. Native exports succeeded, but exports do not prove device installation, signing, StoreKit, notification permission behavior or review acceptance.

Build numbering needs one authority. EAS is configured for local version sourcing with production auto-increment; the cloud workflow does not use the local workflow's build-number allocator. Ephemeral checkouts can repeat a number. Adopt EAS remote version management or one shared allocator across every release path. [Expo version management](https://docs.expo.dev/build-reference/app-versions/)

## Monetization recommendation

First make the free course deliver a complete, useful learning loop. Charge for additional depth and convenience that users can actually experience. Avoid monetizing basic error correction before testing whether hearts reduce learning and retention. Compare a generous free core plus premium practice/statistics against the current heart model in a controlled beta; this is a product hypothesis, not proof of higher revenue.

Choose one billing source of truth. Direct StoreKit integration offers control but creates more purchase lifecycle work. RevenueCat is a reasonable candidate for the existing purchase port: currently free up to $2,500 monthly tracked revenue, then 1% of tracked revenue at the threshold. That fee is additional to store economics and backend costs. Validate its native integration, privacy footprint, account alias/transfer policy and webhook model before selecting it. [RevenueCat pricing](https://www.revenuecat.com/pricing)

Do not run Apple-server notifications and another provider as independently authoritative entitlement writers. Normalize verified events into one entitlement model, with provider event IDs, effective dates, product mapping and reconciliation. Test out-of-order notifications, refund/revocation, renewal, expiration, billing retry/grace, account linking, reinstall, restore and a device that was offline at renewal.

Do not set price from competitor screenshots alone. Use local StoreKit prices and clear billing periods, test willingness to pay after demonstrated learning value, and model net proceeds after refunds, applicable store fees, tax treatment, provider fees, support and acquisition. Annual conversion without renewal or learning retention is an incomplete success metric.

## Action list

| ID | Priority / owner / effort | Action and completion evidence |
|---|---|---|
| A01 | P0 / Mobile / L | Implement the runtime purchase port with real products; sandbox purchase, cancellation, pending, failure and restore all work. |
| A02 | P0 / Mobile + Backend / M | Connect entitlements to every advertised benefit; premium user can complete lessons without heart loss when unlimited hearts is promised. |
| A03 | P0 / Backend / L | Define one verified subscription authority, idempotent webhooks and scheduled reconciliation; lifecycle matrix passes. |
| A04 | P0 / Mobile + Backend / M | Make coin continues grant only according to a documented debit/free-rescue policy; failed requests cannot silently consume a paid benefit. |
| A05 | P0 / Product + Mobile / M | Publish real privacy, terms, support and licence destinations and wire all relevant screens; links work in production. |
| A06 | P0 / Backend + Mobile / L | Implement account/guest deletion and controlled log erasure; verify deletion across auth, data, device and subprocessors. |
| A07 | P0 / Product + Privacy / M | Reconcile policy, data inventory, App Store answers and manifests against the actual binary and backend. |
| A08 | P0 / Release / M | Verify Xcode/SDK, current age-rating responses and EU trader status in the release account; retain dated evidence. |
| A09 | P0 / Release / M | Verify agreements, tax/banking setup, product IDs, subscription group, territories, review information and backend secrets without exposing them in logs. |
| A10 | P1 / Tooling / M | Unify build numbers across local/cloud release paths; two independent builds receive distinct increasing numbers. |
| A11 | P0 / QA / L | Run native TestFlight journeys on supported iPhone/iPad sizes and OS versions, including reinstall, upgrade, offline and low storage. |
| A12 | P1 / Product + Design / M | Produce localized screenshots, icon, subtitle, description, support page and truthful preview using release behavior. |
| A13 | P0 / QA / M | Give App Review a reproducible working path, any required access, subscription explanation and reachable production service. |
| A14 | P1 / Product / M | Decide free/premium boundary and test benefit comprehension before pricing experiments. |
| A15 | P1 / Finance + Product / M | Build cohort economics with actual store proceeds, refunds, churn, hosting, support and acquisition; set a spending limit. |
| A16 | P1 / Operations / M | Document entitlement support, refund guidance, subscription management and account-transfer rules; exercise support scenarios. |
| A17 | P1 / Release / M | Define phased rollout, incident owner, kill switches and native rollback limitations; test the release checklist. |
| A18 | P2 / Product / M | Test ethical review prompts and localized store-page variants after meaningful learning success; measure retained learners, not only installs. |

Effort scale: [audit 2](02-learning-content.md). These tasks are release planning, not a legal-compliance certification.
