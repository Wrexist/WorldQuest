/**
 * New faces for Atlas from his own clay: a blink, a laugh, a proud smile, a wink.
 *
 * The clay poses are painted art, not a rig, and each new pose from the image model is a
 * new chance for him to drift off-model. But most expressions are only a different face
 * on a pose he already has, and the face is made of parts he already wears: resting's
 * closed eyes and closed smile, sculpted in the same navy clay as his brows. So a new face
 * is made the way a 2D animator would make it: take the open eyes (or the open mouth) out,
 * fill the hole with the clay around it, and lay on the borrowed part.
 *
 * - **Taking a part out.** The hole is filled with the smoothest surface that meets the
 *   face around it (Laplace's equation, over-relaxed). Clay is smooth, so this carries
 *   the light across the hole without a seam. Blush and land at the edge are not face,
 *   and are left out of the boundary so they cannot bleed in.
 * - **Laying a part on.** A part is the *difference* it makes to resting's face, so it
 *   carries its own soft edge and highlight and lands on any shade of blue.
 * - **Everything else is untouched.** A blink frame is laid over its open pose and shown
 *   for a moment, so any other difference would flicker; `clay-face.test.cjs` fails on
 *   a changed pixel away from the eyes and mouth.
 *
 * Parts are found, not listed: an eye is the white of a sclera plus every dark pixel
 * joined to it, a mouth is the red or navy shape under the eyes. If the art changes so
 * that the search finds anything implausible, this throws rather than painting a face
 * somewhere wrong.
 */

const sharp = require('sharp')

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
const opaque = (d, i) => d[i + 3] > 200
const white = (d, i) => opaque(d, i) && d[i] > 205 && d[i + 1] > 205 && d[i + 2] > 205
const dark = (d, i) => opaque(d, i) && lum(d, i) < 105
const navy = (d, i) => opaque(d, i) && d[i + 2] > d[i] + 25 && lum(d, i) < 110
/** The blue clay of his face: what a hole is filled from. */
const skin = (d, i) => d[i + 3] > 250 && d[i + 2] > d[i] + 60 && d[i + 2] > d[i + 1] + 10 && lum(d, i) > 95
/** Blush and land: never sampled as face, and never painted over unless asked. */
const notFace = (d, i) => d[i] > d[i + 2] + 10 || d[i + 1] > d[i + 2] + 10

/** Where his face is, as fractions of the square canvas: below the hat brim, above the chin. */
const FACE = { x0: 0.29, x1: 0.78, y0: 0.29, y1: 0.56 }
const MOUTH = { x0: 0.45, x1: 0.66, y0: 0.45, y1: 0.61 }

/** How far a closed lid sits from the middle of the open eye, at 512 px: a blink drops, a smile lifts. */
const DROP = { blink: 2, happy: -1 }

async function load(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 4) throw new Error(`${file}: expected RGBA`)
  return { data: Float32Array.from(data), W: info.width, H: info.height }
}

async function encode(img, data) {
  const bytes = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) bytes[i] = Math.max(0, Math.min(255, Math.round(data[i])))
  return sharp(bytes, { raw: { width: img.W, height: img.H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer()
}

/** Connected shapes (8-neighbour) of pixels passing `test`, inside a box given in fractions of the image. */
function shapes(img, test, box) {
  const { W, H, data } = img
  const hit = new Uint8Array(W * H)
  const seen = new Uint8Array(W * H)
  const out = []
  const [x0, x1, y0, y1] = [box.x0, box.x1, box.y0, box.y1].map((v, k) => Math.round(v * (k < 2 ? W : H)))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (test(data, (y * W + x) * 4)) hit[y * W + x] = 1
  for (let p = 0; p < hit.length; p++) {
    if (!hit[p] || seen[p]) continue
    const stack = [p]
    const px = []
    seen[p] = 1
    while (stack.length) {
      const q = stack.pop()
      px.push(q)
      for (const d of [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1]) {
        const r = q + d
        if (hit[r] && !seen[r]) { seen[r] = 1; stack.push(r) }
      }
    }
    let [l, r, t, b] = [W, 0, H, 0]
    for (const q of px) { const x = q % W, y = (q / W) | 0; l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y) }
    out.push({ px, cx: (l + r) / 2, cy: (t + b) / 2, rx: (r - l) / 2, ry: (b - t) / 2 })
  }
  return out.sort((a, b) => b.px.length - a.px.length)
}

const plain = ({ px, ...shape }) => shape

function openEyes(img, name) {
  const eyes = shapes(img, white, FACE).slice(0, 2).map(sclera => {
    const box = {
      x0: (sclera.cx - sclera.rx - 18) / img.W, x1: (sclera.cx + sclera.rx + 18) / img.W,
      y0: (sclera.cy - sclera.ry - 12) / img.H, y1: (sclera.cy + sclera.ry + 8) / img.H,
    }
    const seed = sclera.px[0]
    return shapes(img, (d, i) => white(d, i) || dark(d, i), box).find(shape => shape.px.includes(seed))
  }).sort((a, b) => a.cx - b.cx)
  const size = img.W / 512
  const plausible = eyes.length === 2 && eyes.every(e => e.rx > 15 * size && e.rx < 40 * size && e.ry > 20 * size && e.ry < 40 * size)
    && Math.abs(eyes[0].cy - eyes[1].cy) < 10 * size
  if (!plausible) throw new Error(`${name}: expected two open eyes on the face, found ${JSON.stringify(eyes.map(plain))}`)
  return eyes
}

function closedEyes(img, name) {
  const size = img.W / 512
  const lids = shapes(img, dark, { x0: FACE.x0, x1: FACE.x1, y0: 0.37, y1: 0.46 }).filter(s => s.px.length > 60 * size * size)
    .slice(0, 2).sort((a, b) => a.cx - b.cx)
  if (lids.length !== 2 || lids.some(l => l.rx < 15 * size || l.rx > 35 * size)) {
    throw new Error(`${name}: expected two closed eyes, found ${JSON.stringify(lids.map(plain))}`)
  }
  return lids
}

/**
 * The mouth: the largest red (open) or navy (closed) shape under the eyes and centred
 * between them — the blush is red too, but sits out under one eye.
 */
function mouth(img, name) {
  const size = img.W / 512
  const [left, right] = openEyesOrLids(img, name)
  const middle = (left.cx + right.cx) / 2
  const found = shapes(img, (d, i) => opaque(d, i) && (d[i] > d[i + 1] + 25 || navy(d, i)), MOUTH)
    .find(shape => Math.abs(shape.cx - middle) < 30 * size)
  if (found === undefined || found.rx < 15 * size || found.rx > 40 * size || found.ry < 4 * size || found.ry > 30 * size) {
    throw new Error(`${name}: expected one mouth under the eyes, found ${JSON.stringify(found && plain(found))}`)
  }
  return found
}

function openEyesOrLids(img, name) {
  try { return openEyes(img, name) } catch { return closedEyes(img, name) }
}

/**
 * A mask over an ellipse (`round`) or its bounding box, grown by `margin` pixels. Blush
 * and land inside it are left alone unless `all`: a mouth is red, and is the point.
 */
function mask(img, cover, margin, round, all = false) {
  const m = new Uint8Array(img.W * img.H)
  for (const s of cover) {
    const rx = s.rx + margin
    const ry = s.ry + margin
    for (let y = Math.floor(s.cy - ry); y <= s.cy + ry; y++) {
      for (let x = Math.floor(s.cx - rx); x <= s.cx + rx; x++) {
        if (round && ((x - s.cx) / rx) ** 2 + ((y - s.cy) / ry) ** 2 > 1) continue
        if (all || !notFace(img.data, (y * img.W + x) * 4)) m[y * img.W + x] = 1
      }
    }
  }
  return m
}

/** Fill the masked pixels with the smoothest surface that meets the face around them. */
function fill(img, m) {
  const { W, data } = img
  const d = Float32Array.from(data)
  const inside = []
  const face = new Uint8Array(m.length)
  for (let p = 0; p < m.length; p++) {
    if (m[p]) inside.push(p)
    else if (skin(d, p * 4)) face[p] = 1
  }
  const mean = [0, 0, 0]
  let n = 0
  for (const p of inside) for (const q of [p + 1, p - 1, p + W, p - W]) {
    if (m[q] || !face[q]) continue
    for (let c = 0; c < 3; c++) mean[c] += d[q * 4 + c]
    n++
  }
  for (const p of inside) { for (let c = 0; c < 3; c++) d[p * 4 + c] = mean[c] / n; d[p * 4 + 3] = 255 }
  for (let pass = 0; pass < 2500; pass++) {
    for (const p of inside) {
      let k = 0
      const sum = [0, 0, 0]
      for (const q of [p + 1, p - 1, p + W, p - W]) {
        if (!m[q] && !face[q]) continue
        k++
        for (let c = 0; c < 3; c++) sum[c] += d[q * 4 + c]
      }
      if (k) for (let c = 0; c < 3; c++) d[p * 4 + c] += 1.9 * (sum[c] / k - d[p * 4 + c])
    }
  }
  return d
}

/** Each shape as the difference it makes to the face under it, around its own centre. */
function lift(img, cover, all) {
  const area = mask(img, cover, 3, false, all)
  const bare = fill(img, area)
  return cover.map(shape => {
    const layer = []
    const [cx, cy] = [Math.round(shape.cx), Math.round(shape.cy)]
    for (let y = Math.floor(shape.cy - shape.ry - 3); y <= shape.cy + shape.ry + 3; y++) {
      for (let x = Math.floor(shape.cx - shape.rx - 3); x <= shape.cx + shape.rx + 3; x++) {
        const p = y * img.W + x
        if (area[p]) layer.push({ dx: x - cx, dy: y - cy, delta: [0, 1, 2].map(c => img.data[p * 4 + c] - bare[p * 4 + c]) })
      }
    }
    return layer
  })
}

function paint(img, out, layer, cx, cy, flip) {
  for (const { dx, dy, delta } of layer) {
    const p = Math.round(cy + (flip ? -dy : dy)) * img.W + Math.round(cx + dx)
    for (let c = 0; c < 3; c++) out[p * 4 + c] += delta[c]
  }
}

/** Resting's closed eyes and closed smile, the parts every other face borrows. */
async function partsFrom(restingFile) {
  const resting = await load(restingFile)
  const lids = lift(resting, closedEyes(resting, 'resting'), false)
  const [smile] = lift(resting, [mouth(resting, 'resting')], true)
  return { lids, smile }
}

/**
 * A new face on an open-eyed pose, as PNG bytes.
 *
 * `eyes`: `blink` (both shut, curving down — a calm blink, not a squint), `happy` (both
 * shut, curving up as resting's do — a laugh or a beam) or `wink` (his right eye, on the
 * viewer's left, shut happy). `mouth`: `smile` swaps the open mouth for resting's closed one.
 */
async function express(openFile, parts, { eyes, mouth: newMouth }, name) {
  const img = await load(openFile)
  const open = openEyes(img, name)
  const shut = eyes === 'wink' ? [0] : [0, 1]
  let face = fill(img, mask(img, shut.map(k => open[k]), 7, true))
  const lips = newMouth === 'smile' ? mouth(img, name) : undefined
  if (lips !== undefined) face = fill({ ...img, data: face }, mask(img, [lips], 3, false, true))
  for (const k of shut) {
    const curl = eyes === 'blink' ? 'blink' : 'happy'
    paint(img, face, parts.lids[k], open[k].cx, open[k].cy + DROP[curl], curl === 'blink')
  }
  // A closed smile sits higher than the middle of an open mouth: at its top lip.
  if (lips !== undefined) paint(img, face, parts.smile, lips.cx, lips.cy - 2, false)
  return encode(img, face)
}

/** The face's parts on a pose, for checking that a new face changed nothing else. */
function faceOf(img, name) {
  return { eyes: openEyes(img, name), mouth: mouth(img, name) }
}

module.exports = { express, faceOf, load, openEyes, partsFrom }
