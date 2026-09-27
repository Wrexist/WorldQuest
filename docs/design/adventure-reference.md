# WorldQuest — illustrated adventure direction

The user's five-screen reference on 27 September 2026 is the visual target for this pass. Large destination scenes, a detailed golden safari explorer and dimensional reward artwork replace the sparse pastel-card presentation. The selected warm ivory, emerald and brass palette remains the app's base.

## Implemented

- Home's current unit uses a full landscape with real, accessible lesson controls layered over it. Finished and locked steps keep their existing actions and ordering.
- Explore uses seven new illustrated destination cards. Geography questions and teaching maps still come from the content pack; these scenes are decorative, not geographic diagrams.
- Profile has a larger explorer landscape, with a clear first-lesson action for a new user. Existing earned progress remains data-driven.
- Quests has a gold-and-blue treasure banner. Task counts, completion and XP come from the existing quest engine.
- Shop uses the new treasure illustration and places the explorer in the real earned-title card, alongside its existing equip action. No fictitious outfit products or prices were added.
- Typography uses Inter. Navigation and wallet chips have lighter outlines; primary actions use emerald with white labels.

Coins remain spendable currency. Streak gems remain collectible badges. This pass does not change reward transactions or chest idempotency.

## Asset production

Eleven decorative raster assets were generated with the built-in image-generation tool, visually inspected, then packaged as WebP. The transparent explorer retains alpha. Runtime total: 1,380,772 bytes. Masters and exact prompts are in [assets/adventure/PROMPTS.md](assets/adventure/PROMPTS.md). Rebuild with `node scripts/build-adventure-art.cjs` or the normal art pipeline.

The new explorer illustrations are **not** an articulated 3D model. The experimental expedition model in `docs/design/3d` did not reach the reference's sculpting quality and was not substituted into the app. Existing character and chest animation sequences remain separate; matching this new character in a fully rigged animation is outstanding.

## Review

Use `scripts/review-adventure.cjs` against an exported web build to capture all five tabs at 320, 390 and 768 pixels and verify the locked-step explanation and lesson launch. Evidence is saved under `docs/design/reviews/adventure-2026-09-27`. Browser evidence does not substitute for an iOS/Android device performance or screen-reader audit.
