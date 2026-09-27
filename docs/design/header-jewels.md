# WorldQuest 3D header

Original editable Three.js assets: sapphire and lime globe with a gold meridian, layered orange flame, and embossed gold coin stack. Transparent 384px WebP renders replace the pale header's small flat symbols. A midnight-blue surface, raised counters and larger white values keep the artwork and real balances legible.

## Sources and rebuild

- Scene: `3d/header-jewels.scene.js`, with individual wrapper scenes beside it.
- Geographic texture: `3d/header-world.svg`, generated from the installed world-atlas land-50m data (Natural Earth geography, public domain).
- Rendered assets: `assets/header-jewels/icons/`.
- Editable GLB models: `assets/header-jewels/models/{globe,flame,coins}/`.
- Runtime images: `apps/mobile/assets/art/header-jewels/` from repository root.
- Rebuild from repository root: `node scripts/render-header-jewels.cjs`. Requires the user-supplied 3D Asset Studio extracted at `node_modules/.cache/user-skills/3d-asset-studio` and its local dependencies.

The app ships approximately 224 KiB of transparent images, not the high-resolution source models. These are static studio renders of actual geometry; they are not live animated 3D. Coins still use the existing wallet balance and the streak still opens its existing screen. Custom user portraits remain supported.

## Validation

All three GLB containers have correct magic, version and byte lengths, with finite accessor bounds. The coin exporter normalized a source normal attribute during export. This is a structural sanity check, not a full glTF conformance certification. Final renders were visually inspected individually. Header text contrast is 12.08:1, balance contrast 9.13:1 and pending-streak contrast 6.41:1.

Browser screenshots and interaction results live in `reviews/jewel-header-2026-09-27/`. Native-device appearance requires a device build.

The final web build and mobile TypeScript check passed. The Home, Quests and Shop suites passed all 58 tests. Browser review passed 20 checks across 320px, 390px and 768px, including enlarged text, image loading, navigation and circular platform alignment. Visual review caught and corrected an initial counter wrap at 390px; the final default header is a single row at both phone widths.
