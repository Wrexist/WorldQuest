/**
 * Static assets, as the two bundlers in this repo actually hand them over.
 *
 * Metro turns `import flag from './SE.png'` into an opaque numeric handle into its
 * asset registry. Vite — which is what vitest and the screenshot harness run — turns
 * the same line into a URL string. Both are true, and a declaration that names only
 * one of them is a type that lies to half the codebase.
 *
 * `Image` accepts a number directly and a string only wrapped as `{ uri }`, so the
 * union is narrowed once, in `src/lib/flags.ts`, rather than at every call site.
 *
 * Sounds are `require`d rather than imported (see `src/lib/sound.ts`) and so do not
 * need an entry here.
 */

declare module '*.png' {
  const asset: number | string
  export default asset
}

/**
 * The illustrations, which are WebP rather than PNG.
 *
 * Not a preference: they are photographic-density art with gradients, glows and
 * starfields, which is the case PNG stores worst. `welcome` is 2.8 MB as a lossless PNG
 * and 78 KB as WebP at a quality nobody can tell apart on a phone, and there are
 * nineteen of them. See scripts/build-art.cjs.
 *
 * The flags stay PNG, because a flag is flat colour and large areas of one hue — the
 * case PNG stores BEST, and where a lossy codec would put ringing on the edge between
 * two fields.
 */
declare module '*.webp' {
  const asset: number | string
  export default asset
}
