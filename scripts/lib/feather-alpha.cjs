/**
 * Fade a picture's alpha to nothing at its edges.
 *
 * Atlas is rendered with a soft contact shadow and glow. Both reach the frame's border
 * with alpha still above zero (up to ~30 % at the bottom edge), so wherever he is drawn the
 * frame shows as a faint light rectangle with a hard edge: a box around the mascot on the
 * navy Home header and the pale lesson sheet alike. The render cannot know where it will be
 * cropped; the pipeline that packs it can, and fading the last few percent to zero turns
 * the cut into a falloff. The character itself is nowhere near the border.
 */
const sharp = require('sharp')

/** Share of the frame's width, from each edge, over which alpha ramps from 0 to full. */
const FEATHER = 0.14

/** Smooth 0 → 1 ramp: no visible start or end, unlike a straight line. */
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

/** Multiplies the alpha of raw RGBA pixels (`width` × `height`) by the edge ramp, in place. */
function featherRaw(data, width, height) {
  const reach = Math.min(width, height) * FEATHER
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y)
      const i = (y * width + x) * 4 + 3
      data[i] = Math.round(data[i] * smooth(edge / reach))
    }
  }
  return data
}

/** A PNG/WebP buffer in, a feathered PNG buffer out. */
async function featherImage(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  featherRaw(data, info.width, info.height)
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
}

module.exports = { featherImage, featherRaw, FEATHER }
