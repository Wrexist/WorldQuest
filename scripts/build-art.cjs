/**
 * Derive the shipped artwork from the delivered masters.
 *
 * The masters landed in `docs/design/assets/**` as raw generation output, and raw
 * generation output is not a shippable asset. Measured on arrival:
 *
 *   · every illustration is 1536×1024 — a 3:2 landscape frame, where the delivery spec
 *     asks for 1024×1024. They are kept at 3:2 rather than squared; see ILLUSTRATION_WIDTH
 *     for why squaring them was tried first and was wrong;
 *   · `app/icon.png` is 1536×1024 **with an alpha channel**. Both halves are
 *     disqualifying on their own: App Store Connect rejects an icon that is not square,
 *     and it rejects one with transparency at upload rather than at review;
 *   · they run 1.3–2.8 MB each, against a delivery budget of ≤120 KB per shipped asset.
 *     Twenty-two of them is ~50 MB — an order of magnitude over the whole app's current
 *     2.90 MB of bundled assets.
 *
 * So the masters stay as masters, and this writes what the app actually ships. Same
 * shape as `build-flags.cjs` and `build-maps.cjs`: a script owns the transform, the
 * output is derived and reproducible, and the index that imports it is generated too so
 * the two cannot drift.
 *
 * ## Chromium, again
 *
 * There is no ImageMagick, no sharp and no PIL in this repo, and adding one to resize
 * twenty-two images would be a new native dependency in the install path for every
 * contributor. Chromium is already here — it rasterises the flags, the maps and the
 * icons, and CI already installs it. A canvas resize is the same tool doing the same
 * class of work.
 *
 * ## Why the illustrations are WebP and the app icons are not
 *
 * These are photographic-density illustrations with gradients, glows and starfields.
 * PNG is lossless and stores exactly that kind of image badly. Measured, not assumed:
 * the nineteen masters total 42 MB as delivered PNGs and 2.0 MB as the WebP this
 * writes — `atlas/resting` goes 2.0 MB → 41 KB, and the worst of them,
 * `celebration/burst`, still goes 2.7 MB → 120 KB.
 *
 * The four app-level icons stay PNG because the platforms require it — Expo's
 * `icon`/`splash` are handed to native packagers that expect PNG, and a WebP icon fails
 * the build rather than looking worse.
 *
 * Run: `pnpm build:art`. Only when the masters change.
 */

const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { token } = require('./tokens.cjs')
const { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } = require('node:fs')
const { join, dirname } = require('node:path')

const ROOT = join(__dirname, '..')
const MASTERS = join(ROOT, 'docs', 'design', 'assets')
const APP = join(ROOT, 'apps', 'mobile', 'assets')
const ART = join(APP, 'art')
const INDEX = join(ROOT, 'apps', 'mobile', 'src', 'lib', 'art.generated.ts')

/**
 * Everything composites onto this, so gaps are filled with it — the letterbox bands
 * beside a 3:2 illustration, the opaque backing an App Store icon needs, and the
 * backdrop of the Android adaptive icon, which has to be the same colour as
 * `app.json`'s `adaptiveIcon.backgroundColor` or the seam shows through the mask.
 *
 * Read from the token file rather than copied, because it is baked into PNGs here.
 */
const CANVAS = token('color.bg.canvas')

/**
 * Per-asset budget for a shipped illustration.
 *
 * `asset-prompts.md` says ≤120 KB per @3x asset after compression. 768px is the @3x of
 * a 256pt slot, which is the largest any of these is drawn at.
 */
const ILLUSTRATION = { budget: 120 * 1024, format: 'image/webp', fit: 'contain' }

/**
 * Illustrations keep the master's aspect ratio. They are not square, and squaring them
 * was wrong.
 *
 * The first version of this centre-cropped them to 1024×1024 on the reasoning that the
 * style block asks for "subject centred with generous padding". That is what the brief
 * says; it is not what the art does. `onboarding/explore` is a 3:2 COMPOSITION — Atlas
 * descending by parachute at the upper right, a planet curving across the lower left —
 * and cropping the middle square out of it put the mascot in a corner and sliced the
 * planet in half. It is the first illustration a new user ever sees.
 *
 * So the width is fixed and the height follows the source. `<Art>` renders into a square
 * box with `resizeMode: contain`, which centres the whole frame and lets the transparent
 * bands fall where they will — nothing is lost, and a master that IS square (as some of
 * these are) simply fills the box.
 *
 * Checked by looking at the output rather than by trusting the brief, which is rule 5 on
 * that page and the step this skipped the first time round.
 */
const ILLUSTRATION_WIDTH = 768

/**
 * Masters delivered on an opaque plate that should ship as cutouts.
 *
 * Named rather than detected, for the same reason `ALLOWANCE` is: the continent skies
 * are deliberately opaque and a knockout deciding for itself would dissolve them. See
 * the transform in `render` for how it works and why luminance is the right key.
 */
const KNOCKOUT = new Set([
  'continents-silhouette/NA',
])

/**
 * Assets allowed past the budget, each with the reason and its own ceiling.
 *
 * Same shape as the contrast waivers and the escape-hatch allowlist: an exception is
 * allowed to exist, has to be named, and a stale one fails exactly like a violation.
 */
const ALLOWANCE = {
  /**
   * The one cutout in the set, and the only asset whose weight is its alpha.
   *
   * It reached the bottom of the ladder at 126 KB — 512 px on the long side, four
   * resolution steps below every sibling — and the last 6 KB will not come out with
   * quality, because WebP codes alpha in its own near-lossless channel and this alpha is
   * a coastline with an archipelago in it. Only area moves it, and the next step down
   * makes the largest illustration in the app visibly soft to save six kilobytes.
   *
   * Named rather than absorbed into the budget: 120 KB is the right ceiling for the
   * other twenty-one, and raising it for all of them to fit one would be the drift the
   * budget exists to catch. The staleness check below removes this the moment a
   * redelivered master or a better encoder makes it untrue.
   */
  'continents-silhouette/NA': { max: 130 * 1024 },
  // Otherwise empty, and it earned being empty. Three entries lived here while the illustrations
  // were being centre-cropped to square: cropping throws away the transparent margin,
  // so what remained was all subject and all detail, and three of them could not be
  // squeezed under 120 KB at any quality worth shipping. Keeping the master's aspect put
  // the margin back — `celebration/burst` went 149 KB → 120 KB without a quality change
  // — and the stale check below is what said so rather than letting three exemptions sit
  // there being quietly untrue.
}

/**
 * What to try, in order, until one fits the budget.
 *
 * A ladder rather than one setting, because these nineteen images are not one kind of
 * picture. `atlas/resting` is a figure on a plain ground and lands at 41 KB untouched;
 * `celebration/burst` is confetti over a starfield — noise in every pixel, which is
 * exactly what a lossy codec cannot throw away — and needs three rungs down. Picking a
 * single quality low enough for the worst would spend that cost on all nineteen.
 *
 * Size first, then quality: 768 is the @3x of the largest slot any of these is drawn in
 * (200pt onboarding), so dropping to 640 is dropping real resolution, and a quality step
 * is cheaper than a resolution step until roughly q0.6 where WebP starts to blotch.
 */
const LADDER = [
  { width: ILLUSTRATION_WIDTH, quality: 0.86 },
  { width: ILLUSTRATION_WIDTH, quality: 0.78 },
  { width: ILLUSTRATION_WIDTH, quality: 0.7 },
  { width: ILLUSTRATION_WIDTH, quality: 0.62 },
  { width: 640, quality: 0.7 },
  { width: 640, quality: 0.62 },
  // Two rungs below what any asset needed until the knockout started working.
  //
  // A cutout costs bytes a plate does not, and the cost is not in the quality setting:
  // WebP codes alpha in its own channel, near-losslessly, so `continents-silhouette/NA`
  // — a coastline with islands, the most intricate alpha in the set — barely moved
  // between q0.86 and q0.62 and sat 60 % over budget at every rung. Only area moves it.
  //
  // Reaching for `ALLOWANCE` instead would have recorded a waiver for the one asset that
  // is actually big, which is what the budget is for. Adding rungs is the honest lever:
  // nothing else falls this far, because the loop stops at the first rung under budget.
  { width: 512, quality: 0.7 },
  { width: 512, quality: 0.62 },
]

/**
 * What ships, and at what size.
 *
 * `fit` is the whole reason this table exists rather than a loop over a directory:
 *
 *   · `cover` centre-crops to fill the frame. Correct for the app icon, which must be
 *     square and full-bleed and has no other option.
 *   · `contain` fits the whole image inside it. Correct for everything whose COMPOSITION
 *     carries the meaning — which turned out to be the illustrations too, see below.
 */
const APP_ICONS = [
  {
    // Square, opaque, full-bleed. `cover` is not a preference here: a store icon may not
    // be letterboxed and may not carry alpha, and the master is neither square nor
    // opaque.
    from: 'app/icon.png',
    to: 'icon.png',
    size: 1024,
    fit: 'cover',
    opaque: true,
  },
  {
    // Android masks this to a circle, squircle or rounded square depending on the
    // launcher, and it crops hard — the outer ~33% can be cut on any given device. So
    // the subject is inset into the middle 66% and the rest is the canvas colour, which
    // is also what `android.adaptiveIcon.backgroundColor` is set to, so the seam is
    // invisible whatever shape the launcher picks.
    from: 'brand/mark.png',
    to: 'adaptive-icon.png',
    size: 1024,
    fit: 'contain',
    opaque: true,
    inset: 0.66,
  },
  {
    // The browser tab. Small enough that the mark reads better than the icon's wider
    // composition, which collapses to a smudge at 48px.
    from: 'brand/mark.png',
    to: 'favicon.png',
    size: 48,
    fit: 'cover',
    opaque: true,
  },
  {
    // Portrait, kept at its own aspect. The master's upper-centre is deliberately empty
    // — the splash prompt has always said "that space is reserved for the logo, which is
    // composited by the app" — so cropping it square would either cut the planet off the
    // bottom or throw away the space the mark goes in.
    from: 'app/splash.png',
    to: 'splash.png',
    width: 1024,
    height: 1536,
    fit: 'cover',
    opaque: true,
  },
]

/**
 * Illustrations, DISCOVERED from the master library rather than listed here.
 *
 * It was a hardcoded array of nineteen names, which was fine while nineteen was the
 * number. A delivery of fifty-eight more made it a list nobody would keep in step: an
 * artist drops a PNG in `docs/design/assets/rewards/` and nothing ships it, with no
 * error, because a name that is absent from an array looks exactly like a name that
 * was never drawn. Same failure mode as the screenshot harness's hardcoded frame list,
 * and the same fix — read the directory.
 *
 * Explicit directories rather than a recursive walk, because this folder also holds
 * things that must NOT ship: `screens/` is the rendered screenshot record, `app/` and
 * `brand/` are masters the four platform icons are derived from above, and
 * `mockup-v1.png` is a 15-screen design reference.
 */
const ART_DIRS = [
  'atlas',
  'onboarding',
  'states',
  'celebration',
  'achievements',
  'avatars',
  'continents',
  /**
   * The continent shapes that sit on the Explore cards.
   *
   * A separate set from `continents/`, which is the seven photographic SKIES that fill a
   * tile edge to edge. These are cutout landmasses on transparency, drawn to be tinted
   * and laid over a card — different art, different handling (`isBackground` matches
   * `continents/` and not this, which is what keeps them apart), so they get their own
   * directory rather than a naming convention inside one.
   *
   * The folder already existed carrying six PNGs of a MOUNTAIN RANGE under continent
   * names — delivered against the wrong brief, never built, and never noticed because
   * nothing here listed the directory. The real shapes replace them.
   */
  'continents-silhouette',
  'leagues',
  'levels',
  'rewards',
]

/**
 * Masters that exist and are deliberately not shipped.
 *
 * The list and its reasons live in `art-manifest.cjs`, shared with `import-art.cjs`. That
 * script has to tell a PARKED master apart from an UNMAPPED one — they look identical on
 * disk and mean opposite things — and with one list neither script can disagree with the
 * other about which is which.
 */
const NOT_SHIPPED = new Set(Object.keys(require('./art-manifest.cjs').NOT_SHIPPED))

const ILLUSTRATIONS = ART_DIRS.flatMap((dir) =>
  readdirSync(join(MASTERS, dir))
    .filter((f) => f.endsWith('.png'))
    .map((f) => `${dir}/${f.replace(/\.png$/, '')}`)
    .filter((name) => !NOT_SHIPPED.has(name))
    .sort(),
)

/**
 * The continents are full-bleed backgrounds, not subjects on transparency.
 *
 * `cover` and opaque: a continent card is a filled panel with real Natural Earth
 * geometry composited on top (asset-prompts.md §8), so letterboxing it onto the canvas
 * colour like a mascot would leave bands down either side of the card.
 */
const isBackground = (name) => name.startsWith('continents/')

/**
 * How wide-to-tall a master's *content* has to be before it is trimmed to it.
 *
 * Every generator here returns a 3:2 frame, whatever was asked for. That is right for a
 * subject — Atlas has margin around him and the margin is part of the composition — and
 * wrong for a banner: `celebration/burst-wide` is a confetti ribbon 1536×237 sitting in
 * the middle of a 1536×1024 frame, so 77 % of the shipped file is empty pixels and the
 * band arrives 23 % as tall as the box the app draws it in. Rendered behind the lesson's
 * feedback card it vanished completely — the card is opaque and the band was centred
 * exactly underneath it.
 *
 * MEASURED, like the feather below, not listed. A master whose content bbox is at least
 * this wide relative to its height is a banner and is trimmed to that bbox; everything
 * else keeps its frame untouched. 4:1 is well clear of the 3:2 the illustrations arrive
 * at and of any subject that happens to sit wide in frame, so the rule fires on ribbons
 * and nothing else — and if a future banner is delivered pre-trimmed, the bbox already
 * fills the frame, the trim is a no-op, and nobody has to remember to edit a list.
 */
const BANNER_ASPECT = 4

/**
 * Draw one master into a canvas and read the bytes back.
 *
 * The image is passed in as a data URL rather than a file path because the page has no
 * filesystem, and read back as a data URL because that is the only way out of a canvas.
 * Both are wasteful and both are irrelevant at twenty-two images run occasionally.
 */
async function render(page, sourceBytes, spec) {
  const width = spec.width ?? spec.size
  // `null` means "whatever the master's aspect gives" — computed in the page, where the
  // decoded image is, rather than by parsing the PNG header out here.
  const height = spec.height ?? spec.size ?? null

  return page.evaluate(
    async ({ dataUrl, width, height: requested, fit, opaque, inset, canvasColor, format, quality, bannerAspect, knockout }) => {
      let height = requested
      const img = new Image()
      img.src = dataUrl
      await img.decode()

      // The source rectangle, which is the whole master unless it turns out to be a
      // banner — see BANNER_ASPECT.
      let sx = 0
      let sy = 0
      let sw = img.width
      let sh = img.height

      if (bannerAspect !== undefined) {
        // Measured on a downscaled copy: the bbox only has to be right to within a
        // pixel of the master, and reading 1.5 M pixels once per rung per image is
        // minutes of nothing. The result is padded by one probe cell before it is
        // mapped back, so the downscale's own smoothing cannot shave a confetto.
        const PROBE = 256
        const probe = document.createElement('canvas')
        probe.width = PROBE
        probe.height = Math.max(1, Math.round((PROBE * img.height) / img.width))
        const pctx = probe.getContext('2d')
        pctx.drawImage(img, 0, 0, probe.width, probe.height)
        const pixels = pctx.getImageData(0, 0, probe.width, probe.height).data

        let x0 = probe.width
        let y0 = probe.height
        let x1 = -1
        let y1 = -1
        for (let y = 0; y < probe.height; y++) {
          for (let x = 0; x < probe.width; x++) {
            if (pixels[(y * probe.width + x) * 4 + 3] > 8) {
              if (x < x0) x0 = x
              if (x > x1) x1 = x
              if (y < y0) y0 = y
              if (y > y1) y1 = y
            }
          }
        }

        if (x1 >= x0 && y1 >= y0) {
          const scaleBack = img.width / probe.width
          const pad = 1
          const bx = Math.max(0, Math.floor((x0 - pad) * scaleBack))
          const by = Math.max(0, Math.floor((y0 - pad) * scaleBack))
          const bw = Math.min(img.width - bx, Math.ceil((x1 - x0 + 1 + pad * 2) * scaleBack))
          const bh = Math.min(img.height - by, Math.ceil((y1 - y0 + 1 + pad * 2) * scaleBack))
          // Both conditions, not just the aspect: a master already delivered as a tight
          // ribbon would pass the aspect test and gain nothing from being re-cropped.
          if (bh > 0 && bw / bh >= bannerAspect && bh < img.height * 0.75) {
            sx = bx
            sy = by
            sw = bw
            sh = bh
          }
        }
      }

      /**
       * The rung's number caps the LONGEST side, not the width.
       *
       * `ILLUSTRATION_WIDTH` is documented as "the @3x of a 256pt slot, which is the
       * largest any of these is drawn at" — a statement about the biggest dimension on
       * screen, which for a portrait master is its height. Applied as a width it means
       * something else entirely: `continents-silhouette/NA` is the one master delivered
       * 1024×1536, so at "width 768" it came out 768×1152 — 2.2× the pixels of every
       * landscape asset at the same rung, and the only asset in the set that ran off the
       * end of the ladder still 31 KB over budget.
       *
       * It could have been waived through `ALLOWANCE`, and that would have recorded a
       * portrait image as an exception to a budget it was never actually breaking. The
       * budget is about bytes, bytes follow area, and this is the line that was reading
       * one dimension and charging for two.
       */
      // `== null` catches both spellings deliberately: `render` resolves an absent height
      // to `null` ("whatever the master's aspect gives") while the destructure defaults to
      // `undefined`, and a check for one of the two silently never fires. It didn't.
      const canvas = document.createElement('canvas')
      if (height == null && sh > sw) {
        canvas.height = width
        canvas.width = Math.round((width * sw) / sh)
      } else {
        canvas.width = width
        canvas.height = height ?? Math.round((width * sh) / sw)
      }
      width = canvas.width
      height = canvas.height
      const ctx = canvas.getContext('2d')

      if (opaque) {
        ctx.fillStyle = canvasColor
        ctx.fillRect(0, 0, width, height)
      }

      // `cover` fills and crops; `contain` fits and letterboxes. `inset` shrinks the
      // drawn art within the frame without changing the frame.
      const scale =
        fit === 'cover'
          ? Math.max(width / sw, height / sh)
          : Math.min(width / sw, height / sh) * (inset ?? 1)

      const w = sw * scale
      const h = sh * scale
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sw, sh, (width - w) / 2, (height - h) / 2, w, h)

      // Feather a baked-in background, if there is one.
      //
      // The delivery is mixed and the difference is visible on screen: most of these
      // are clean cutouts on transparency and sit on the canvas as if drawn there,
      // but `states/empty-profile`, `states/empty-no-friends` and `atlas/resting` came
      // back with an opaque ground baked in — so the profile empty state rendered a
      // hard-edged dark-brown rectangle pasted onto a navy screen. Next to the
      // hourglass on the out-of-hearts card, which is a cutout, it reads as a
      // screenshot of a different app.
      //
      // MEASURED, not listed. The corner alpha decides it, so a redelivered asset with
      // a proper cutout stops being feathered without anyone editing this file — the
      // same reason the budget allowances are checked rather than trusted.
      //
      // Only the outer eighth is touched, as an alpha ramp rather than a vignette: a
      // radial fade would dim the middle of a 3:2 composition, and the subject of
      // every one of these is in the middle.
      /**
       * Turn a pure-black plate into transparency, for a master delivered on one.
       *
       * `continents-silhouette/NA` arrives as a terrain render on black — measured, the
       * corners are exactly (0,0,0) and the darkest land sits near luminance 33. Its five
       * siblings are cutouts, so dropped in as delivered it would be the one continent
       * drawn as an opaque rectangle: `Art` measures a full-frame plate as a PANEL, gives
       * it a hairline border and its own aspect, and the card gets a black box in the
       * corner instead of a landmass bleeding into the sky.
       *
       * Alpha FROM LUMINANCE rather than a flood fill or a threshold, and for this kind of
       * image it is not a compromise — it is the right transform. The art is a lit subject
       * on black, so brightness already IS coverage: the land comes out opaque, the black
       * comes out gone, and the glow around the coastline keeps its soft edge for free
       * instead of being cut to a hard alpha step. A threshold would have hardened that
       * edge; a flood fill would have preserved it but needed a rule about how dark an
       * interior lake is allowed to be before it becomes a hole in the continent.
       *
       * Opt-in per asset, never automatic. The seven continent SKIES are deliberately
       * opaque full-bleed plates, and a knockout that ran on its own judgement would
       * quietly dissolve them.
       */
      if (knockout) {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = pixels.data
        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
          // Scaled so anything at or above a quarter brightness is fully opaque; below
          // that it ramps, which is where the glow and the coastline antialiasing live.
          const alpha = Math.min(255, Math.round((lum / 64) * 255))
          data[i + 3] = Math.min(data[i + 3], alpha)
        }
        ctx.putImageData(pixels, 0, 0)
      }

      if (!opaque) {
        const probe = ctx.getImageData(0, 0, Math.max(1, Math.round(width * 0.06)), 1).data
        let solid = 0
        for (let i = 3; i < probe.length; i += 4) if (probe[i] > 200) solid++
        const cornerIsSolid = solid / (probe.length / 4) > 0.5

        if (cornerIsSolid) {
          const band = Math.round(Math.min(width, height) * 0.12)
          ctx.globalCompositeOperation = 'destination-out'
          const ramps = [
            [0, 0, band, 0],
            [width, 0, width - band, 0],
            [0, 0, 0, band],
            [0, height, 0, height - band],
          ]
          for (const [x0, y0, x1, y1] of ramps) {
            const g = ctx.createLinearGradient(x0, y0, x1, y1)
            g.addColorStop(0, 'rgba(0,0,0,1)')
            g.addColorStop(1, 'rgba(0,0,0,0)')
            ctx.fillStyle = g
            ctx.fillRect(0, 0, width, height)
          }
          ctx.globalCompositeOperation = 'source-over'
        }
      }

      return canvas.toDataURL(format, quality)
    },
    {
      dataUrl: `data:image/png;base64,${sourceBytes.toString('base64')}`,
      width,
      height,
      fit: spec.fit,
      opaque: spec.opaque === true,
      inset: spec.inset,
      canvasColor: CANVAS,
      format: spec.format ?? 'image/png',
      quality: spec.quality,
      bannerAspect: spec.bannerAspect,
      // Forwarded explicitly, like every other field. `page.evaluate` serialises this
      // object and nothing else — a key that exists on `spec` but not here arrives in
      // the callback as `undefined`, silently, with no error anywhere. That is how the
      // knockout came to be destructured at the top, branched on in the middle, and
      // switched on per asset at the call site while never once running: the only
      // asset that asked for it shipped as the opaque plate it was supposed to stop
      // being. Adding a field to `render`'s spec means adding it in BOTH places.
      knockout: spec.knockout === true,
    },
  )
}

/**
 * Where the subject actually is inside a shipped illustration.
 *
 * Returned normalised — `{ aspect, x, y, w, h }` with the box in fractions of the
 * image's own width and height — because the app never learns an asset's pixel
 * dimensions and should not have to.
 *
 * ## Why the app needs this
 *
 * Every master is a subject inside a 3:2 frame with a generous transparent margin, and
 * the margin is not small: `atlas/thinking` is 274×314 of a 768×512 file, so drawing the
 * FRAME at 84pt drew ATLAS at about 34. Measured across the set, the subject filled
 * 38–62 % of the box a screen asked for. That is the whole of "the mockup is image-led
 * and the app is text-led" in one number — the art was landed, sized to the brief, and
 * still arrived at half scale everywhere, because `size` meant the empty frame.
 *
 * The alternative was to trim every master to its content the way a banner is trimmed.
 * That was rejected on measurement, not taste: trimming keeps the pixel width and throws
 * away the empty part, so the same 768px carries strictly more detail and the files grow.
 * `celebration/burst` already sits on the 120 KB budget at the bottom of the ladder. The
 * geometry costs nothing — it is four numbers per asset in a file that is generated
 * anyway — and it leaves the shipped bytes exactly as they were.
 */
async function measure(page, webpBytes) {
  return page.evaluate(async (dataUrl) => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()

    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data

    // WHERE THE INK IS, not where the outermost surviving pixel is.
    //
    // This used to be a plain bounding box of every pixel over alpha 24 — "24, not 0,
    // because WebP is lossy and a transparent margin comes back with a scatter of
    // alpha-1..8 noise in it". Raising the floor above the noise was right and it was
    // not enough: an extremal box is decided by its most extreme pixel, so ONE surviving
    // speck of dust in a corner reports the whole frame as the subject. The comment below
    // claimed the two populations were 92–100 % and 36–73 % with "nothing in the set
    // between"; measured across all 68 shipped assets they overlap continuously
    // (`onboarding/conquer` 0.81×0.72, `avatar-08…12` 0.82–0.84, `celebration/burst`
    // 0.73×0.88), and five assets landed on the wrong side of the line:
    //
    //   atlas/welcome      0.92×0.92 -> 0.41×0.82     the onboarding taster's hero
    //   onboarding/learn   0.87×0.86 -> 0.39×0.48     onboarding slide 2
    //   states/error-generic 1.00×0.87 -> 0.95×0.52
    //   states/offline     1.00×0.99 -> 0.99×0.63
    //   avatars/avatar-07  0.91×0.99 -> 0.85×0.95     the odd one out of twelve
    //
    // Each was drawn as a whole-frame PANEL: a hairline border, the file's own 3:2 box,
    // and the subject left at the size it happens to be in the file. Two of them are the
    // first and fourth screens a new user sees, and both photographed as an empty
    // rounded rectangle with a small robot in it — which is the exact "placeholder frame"
    // look this geometry exists to remove, arriving from the other end.
    //
    // So the box is taken by alpha MASS instead: accumulate per column and per row, then
    // trim the faintest 0.5 % from each end of each axis. A solid plate spreads its mass
    // evenly and loses half a percent of its width, so a panel still measures as a panel
    // (`continents/*` 0.99, `empty-profile` 0.95×0.93, `atlas/resting` 0.93×0.93 — the
    // three the feather above was written for, all still on the panel side). A subject
    // sitting in a starfield carries almost all of the mass, so the stars trim away and
    // the subject is what gets measured.
    const width = img.width
    const height = img.height
    const columns = new Float64Array(width)
    const rows = new Float64Array(height)
    let total = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = pixels[(y * width + x) * 4 + 3]
        if (alpha > 24) {
          columns[x] += alpha
          rows[y] += alpha
          total += alpha
        }
      }
    }

    // A fully transparent asset would be a bug elsewhere; a fully opaque one — a
    // continent card — has no margin to find. Both come back as the whole frame, which is
    // the behaviour the app had before this existed.
    const whole = { aspect: width / height, x: 0, y: 0, w: 1, h: 1 }
    if (total === 0) return whole

    /** The span of `axis` holding all but `TRIM` of its mass at each end. */
    const TRIM = 0.005
    const span = (axis) => {
      const cut = total * TRIM
      let low = 0
      let high = axis.length - 1
      let seen = 0
      for (; low < axis.length; low++) {
        seen += axis[low]
        if (seen > cut) break
      }
      seen = 0
      for (; high >= 0; high--) {
        seen += axis[high]
        if (seen > cut) break
      }
      return [low, high]
    }

    const [x0, x1] = span(columns)
    const [y0, y1] = span(rows)

    const w = (x1 - x0 + 1) / width
    const h = (y1 - y0 + 1) / height

    // A picture that already fills its frame is reported as filling its frame, exactly.
    //
    // Not a rounding nicety — this is the difference between the feather working and not.
    // `states/empty-profile`, `states/empty-no-friends` and `atlas/resting` carry a baked
    // ground, and the build ramps their outer eighth to transparent so the edge does not
    // read as a rectangle pasted onto the canvas. That ramp measures as margin here: the
    // box comes back a little under 1, the app would scale the image up by the difference
    // to make the "subject" fit, and the frame would clip the ramp clean off — a
    // hard-edged dark rectangle, which is the exact bug the feather exists to prevent,
    // reintroduced from the other end.
    //
    // 85 % is where those three sit comfortably above and everything else sits
    // comfortably below, on the mass measurement above: they come back 0.93–0.99, the
    // seven opaque continent tiles come back 0.99, and the next asset down is
    // `avatars/avatar-07` at 0.85×0.95 — which belongs with its eleven siblings on the
    // cutout side and now lands there.
    //
    // Deliberately NOT stated as "the populations do not overlap". They do, on the
    // extremal box this used to take: `onboarding/conquer` measured 0.81×0.72 and
    // `avatars/avatar-08…12` 0.82–0.84 against baked grounds at 0.92–1.00, which is a
    // gap of eight points and no room at all. The mass measurement is what opens it.
    if (w >= 0.85 && h >= 0.85) return whole

    return { aspect: width / height, x: x0 / width, y: y0 / height, w, h }
  }, `data:image/webp;base64,${webpBytes.toString('base64')}`)
}

const write = (path, dataUrl) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'))
  return statSync(path).size
}

/**
 * Art the app EXPECTS and does not have.
 *
 * A missing illustration is silent in a way an extra one is not. `<Art>` will not compile
 * against a name that does not exist, so the code simply never asks — and the screen
 * renders without a picture, which looks like a design decision. `ProfileScreen`'s
 * `insigniaFor` returns null for a rank with no file precisely so that a gap degrades
 * gracefully; the cost of degrading gracefully is that nobody notices.
 *
 * Level 100 has had no insignia since the set was delivered, and the delivery contained a
 * "Pioneer" that is not a rank instead. That mismatch survived because nothing said it
 * out loud. This says it, every build.
 *
 * A warning rather than a failure: a missing asset must not stop everyone else's build,
 * and there is nothing a developer can do about it in the moment. `/wq-ship-check` is
 * where a gap should block, because that is the point at which someone can commission it.
 */
function reportGaps() {
  const ladder = Object.keys(
    JSON.parse(readFileSync(join(ROOT, 'packages', 'i18n', 'locales', 'en', 'titles.json'), 'utf8')),
  )
    .filter((key) => !key.endsWith('__note'))
    .map((key) => key.slice('titles:'.length))

  const missing = ladder.filter(
    (rank) => !existsSync(join(MASTERS, 'levels', `${rank}.png`)),
  )
  if (missing.length === 0) return

  console.log(
    `\n⚠ ${missing.length} rank insignia missing: ${missing.join(', ')}` +
      '\n\n  The ladder is docs/systems/progression.md §1 and the prompt is asset-prompts.md §12.' +
      '\n  Nothing breaks — `insigniaFor` returns null and the rank renders without art — which' +
      '\n  is exactly why this needs saying out loud. Drop the PNG into docs/design/assets/levels' +
      '\n  and re-run; the masters are discovered, so no list needs editing.',
  )
}

/**
 * The index, generated for the same reason the flags' is.
 *
 * Metro resolves assets at BUILD time, so every import specifier has to be a literal —
 * a computed `require(`../../assets/art/${name}.webp`)` bundles nothing and fails at
 * runtime rather than at build. Nineteen literals is not something to maintain by hand.
 */
function writeIndex(names, geometry) {
  const ident = (n) => n.replace(/[/-]([a-z])/g, (_, c) => c.toUpperCase()).replace(/[/-]/g, '')
  const imports = names.map((n) => `import ${ident(n)} from '../../assets/art/${n}.webp'`)
  const entries = names.map((n) => `  '${n}': ${ident(n)},`)
  const round = (v) => Number(v.toFixed(4))
  const geometryEntries = names.map((n) => {
    const g = geometry[n]
    return `  '${n}': { aspect: ${round(g.aspect)}, x: ${round(g.x)}, y: ${round(g.y)}, w: ${round(g.w)}, h: ${round(g.h)} },`
  })

  writeFileSync(
    INDEX,
    `/**
 * GENERATED by \`pnpm build:art\` — do not edit.
 *
 * Illustrations derived from the masters in docs/design/assets. See scripts/build-art.cjs
 * for why they are WebP, why they are 768px, and why this file exists at all.
 */

${imports.join('\n')}

/** Metro hands back a numeric handle; Vite hands back a URL. Both are real. */
export type ArtModule = number | string

/** Art name → the bundled illustration. */
export const ART_BY_NAME = {
${entries.join('\n')}
} as const satisfies Readonly<Record<string, ArtModule>>

/** Every illustration this build ships. */
export type ArtName = keyof typeof ART_BY_NAME

/**
 * Where the subject sits inside each illustration, as fractions of the image.
 *
 * \`aspect\` is width ÷ height; \`x\`/\`y\`/\`w\`/\`h\` are the opaque content's bounding box.
 * MEASURED off the shipped WebP, so it already accounts for anything the build did to
 * the master. \`<Art>\` uses it to size the SUBJECT rather than the frame — see the note
 * on \`measure()\` in scripts/build-art.cjs for why that gap was worth closing.
 */
export type ArtGeometry = {
  readonly aspect: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export const ART_GEOMETRY = {
${geometryEntries.join('\n')}
} as const satisfies Readonly<Record<ArtName, ArtGeometry>>
`,
  )
}

;(async () => {
  const browser = await chromium.launch(launchOptions())
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } })
  await page.setContent('<!doctype html><meta charset="utf-8">')

  console.log('Art → app assets\n')

  const missing = []
  const over = []
  const stale = []
  const geometry = {}
  let bytes = 0

  for (const spec of APP_ICONS) {
    const src = join(MASTERS, spec.from)
    if (!existsSync(src)) {
      missing.push(spec.from)
      continue
    }
    const out = join(APP, spec.to)
    const size = write(out, await render(page, readFileSync(src), spec))
    bytes += size
    const dims = spec.width ? `${spec.width}×${spec.height}` : `${spec.size}×${spec.size}`
    console.log(`  ${spec.to.padEnd(20)} ${dims.padEnd(11)} ${(size / 1024).toFixed(0).padStart(5)} KB`)
  }

  console.log('')
  for (const name of ILLUSTRATIONS) {
    const src = join(MASTERS, `${name}.png`)
    if (!existsSync(src)) {
      missing.push(`${name}.png`)
      continue
    }
    const master = readFileSync(src)
    const out = join(ART, `${name}.webp`)

    // `bytes`, not `size` — the rung's `size` is a pixel dimension, and spreading a byte
    // count over it would have made every line report its own weight as its resolution.
    let chosen = null
    for (const rung of LADDER) {
      // `opaque` for a background, and it is not cosmetic: the edge feather below only
      // runs when `opaque` is false, and feathering a full-bleed continent card would
      // fade its own edges to transparent — the opposite of what it is for.
      const written = write(
        out,
        await render(page, master, {
          ...ILLUSTRATION,
          ...rung,
          fit: 'cover',
          opaque: isBackground(name),
          knockout: KNOCKOUT.has(name),
          bannerAspect: BANNER_ASPECT,
        }),
      )
      chosen = { ...rung, bytes: written }
      if (written <= ILLUSTRATION.budget) break
    }

    bytes += chosen.bytes
    // Off the file that was actually written, not off the master: the ladder may have
    // changed its width, and a banner was cropped.
    geometry[name] = await measure(page, readFileSync(out))
    const allowed = ALLOWANCE[name]
    const ceiling = allowed ? allowed.max : ILLUSTRATION.budget
    if (chosen.bytes > ceiling) {
      over.push(`${name} — ${(chosen.bytes / 1024).toFixed(0)} KB (ceiling ${(ceiling / 1024).toFixed(0)} KB)`)
    }
    // An allowance that is no longer needed is a lie in a script — the same rule the
    // waiver checks elsewhere in this repo enforce. If the art is redelivered smaller,
    // this says so rather than quietly keeping the exemption alive.
    if (allowed && chosen.bytes <= ILLUSTRATION.budget) {
      stale.push(`${name} — fits in ${(ILLUSTRATION.budget / 1024).toFixed(0)} KB now, at ${(chosen.bytes / 1024).toFixed(0)} KB`)
    }
    // The rung is printed, not just the bytes. "141 KB" says nothing about whether an
    // asset is comfortable or was squeezed to fit, and the one that dropped to 640 is
    // the one to look at first when somebody says the art looks soft.
    console.log(
      `  ${name.padEnd(28)} ${`${chosen.width}px`.padStart(5)} q${chosen.quality.toFixed(2)}` +
        `${(chosen.bytes / 1024).toFixed(0).padStart(6)} KB`,
    )
  }

  await browser.close()

  if (missing.length > 0) {
    console.error(
      `\n✗ ${missing.length} master(s) missing:\n    ${missing.join('\n    ')}\n\n` +
        '  Deliver them to docs/design/assets, or remove them from this script. Never\n' +
        '  substitute a stand-in — a placeholder that looks deliberate is worse than a gap.',
    )
    process.exit(1)
  }

  // The budget is the whole reason this script exists, so it fails rather than warns.
  if (stale.length > 0) {
    console.error(
      `\n✗ ${stale.length} allowance(s) no longer needed — delete them:\n    ${stale.join('\n    ')}`,
    )
    process.exit(1)
  }

  if (over.length > 0) {
    console.error(
      `\n✗ over the ${ILLUSTRATION.budget / 1024} KB per-asset budget:\n    ${over.join('\n    ')}\n\n` +
        '  Lower the quality, lower the size, or raise the budget deliberately — but do\n' +
        '  not let it drift. 2.90 MB of assets is already most of what this app ships.',
    )
    process.exit(1)
  }

  writeIndex(ILLUSTRATIONS, geometry)
  console.log(`\n✓ ${APP_ICONS.length} app icons + ${ILLUSTRATIONS.length} illustrations · ${(bytes / 1024 / 1024).toFixed(2)} MB total`)
  reportGaps()
})()
