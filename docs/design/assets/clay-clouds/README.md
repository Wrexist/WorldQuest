# Clay cloud backdrop

Generated on 2026-10-02 for the owner's request for soft clouds around a more
prominent Atlas, based on their Profile reference IMG_3388.png. This is original
decorative scenery, not geographic content or a flattened screen.

- `source.png`: approved transparent 2048 × 683 generation.
- `apps/mobile/assets/art/clay-clouds/backdrop.webp`: alpha-preserving 1536 × 512
  runtime export, 76,524 bytes. Regenerate with `node scripts/build-clay-clouds.cjs`.
- `apps/mobile/assets/art/clay-clouds/backdrop-dark.webp`: the same export with its
  light and shade remapped onto `darkColor.bg.surfacePressed`, built by the same script.
- `CloudBackdrop.tsx`: shared decorative layer, original 3:1 proportions retained.
  Foreground text and Atlas controls remain separate native elements.

Prompt direction: smooth white and powder-blue sculpted cumulus, soft top-left
light, a low bank with a taller group at the far right, a smaller left group and
transparent central space for the character/title. No text, mascot, stars, card,
sky fill or map. No existing mascot artwork was repainted.

The layer moves vertically by `space[1]` using `motion.drift` through `useDrift`,
with the native driver. Reduced Motion and backgrounding stop the animation.
Dark mode uses the night-blue copy at full opacity (`illustration.cloudOpacity`).
The white art at 14% read as grey smoke on navy (owner report, 2026-10-06).
Clouds are pointer-transparent and hidden from the accessibility tree.
