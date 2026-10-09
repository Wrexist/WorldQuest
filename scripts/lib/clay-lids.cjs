/**
 * Close Atlas's eyes: the blink frame for one complete clay pose.
 *
 * A character that never blinks reads as a picture, and the blink is the cheapest thing
 * that makes him read as alive (mascot research, 2026-10-09). The clay poses are painted
 * art, not a rig, so the closed eyes are made the way a 2D animator would: take the open
 * eyes out, then put in the lids he already has. The resting pose's closed eyes are the
 * lids, flipped to curve down — a calm blink, not resting's happy squint — so they are
 * the same sculpted navy clay as his brows rather than a drawn line.
 *
 * Every pixel outside the eyes is left exactly as it was, and that is the property that
 * matters: the blink frame is laid over the open pose and shown for a moment, so any
 * other difference would flicker every time he blinks. `clay-lids.test.cjs` holds it.
 *
 * Eyes are found, not listed: a sclera is the white shape on his face and an eye is that
 * shape plus every dark pixel joined to it (pupil, lid line). If the art changes so that
 * the search finds anything other than two plausible eyes, this throws rather than
 * painting lids somewhere wrong.
 */

const sharp = require('sharp')

/** Luminance of an RGB triple. */
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
const opaque = (d, i) => d[i + 3] > 200
const white = (d, i) => opaque(d, i) && d[i] > 205 && d[i + 1] > 205 && d[i + 2] > 205
const dark = (d, i) => opaque(d, i) && lum(d, i) < 105
/** The blue clay of his face: what the hole left by an eye is filled from. */
const skin = (d, i) => d[i + 3] > 250 && d[i + 2] > d[i] + 60 && d[i + 2] > d[i + 1] + 10 && lum(d, i) > 95
/** Blush and land: never painted over, never sampled as face. */
const notFace = (d, i) => d[i] > d[i + 2] + 10 || d[i + 1] > d[i + 2] + 10

/** How far the closed lid sits below the middle of the open eye, at 512 px. */
const LID_DROP = 2

async function load(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 4) throw new Error(`${file}: expected RGBA`)
  return { data: Float32Array.from(data), W: info.width, H: info.height }
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

/** Where his face is, as fractions of the square canvas: below the hat brim, above the mouth. */
const FACE = { x0: 0.29, x1: 0.78, y0: 0.29, y1: 0.56 }

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
  if (!plausible) throw new Error(`${name}: expected two open eyes on the face, found ${JSON.stringify(eyes.map(({ px, ...e }) => e))}`)
  return eyes
}

function closedLids(img) {
  const size = img.W / 512
  const lids = shapes(img, dark, { x0: FACE.x0, x1: FACE.x1, y0: 0.37, y1: 0.46 }).filter(s => s.px.length > 60 * size * size)
    .slice(0, 2).sort((a, b) => a.cx - b.cx)
  if (lids.length !== 2 || lids.some(l => l.rx < 15 * size || l.rx > 35 * size)) {
    throw new Error(`resting: expected two closed eyes to borrow as lids, found ${lids.length}`)
  }
  return lids
}

/** A mask over an ellipse (`round`) or its bounding box, grown by `margin` pixels. */
function mask(img, shapesToCover, margin, round) {
  const m = new Uint8Array(img.W * img.H)
  for (const s of shapesToCover) {
    const rx = s.rx + margin
    const ry = s.ry + margin
    for (let y = Math.floor(s.cy - ry); y <= s.cy + ry; y++) {
      for (let x = Math.floor(s.cx - rx); x <= s.cx + rx; x++) {
        if (round && ((x - s.cx) / rx) ** 2 + ((y - s.cy) / ry) ** 2 > 1) continue
        if (!notFace(img.data, (y * img.W + x) * 4)) m[y * img.W + x] = 1
      }
    }
  }
  return m
}

/**
 * Fill the masked pixels with the smoothest surface that meets the face around them
 * (Laplace's equation, over-relaxed). Clay is smooth, so the smoothest fill is the right
 * one: it carries the light across the hole without a seam. Blush and land at the edge
 * are not face and are left out of the boundary, or they would bleed in.
 */
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

/** Resting's lids as the difference they make to his face, ready to lay on another pose. */
async function lidsFrom(restingFile) {
  const resting = await load(restingFile)
  const lids = closedLids(resting)
  const area = mask(resting, lids, 3, false)
  const bare = fill(resting, area)
  return lids.map(lid => {
    const layer = []
    for (let y = Math.floor(lid.cy - lid.ry - 3); y <= lid.cy + lid.ry + 3; y++) {
      for (let x = Math.floor(lid.cx - lid.rx - 3); x <= lid.cx + lid.rx + 3; x++) {
        const p = y * resting.W + x
        if (!area[p]) continue
        // Flipped top to bottom: resting's lids curve up in a smile; a blink curves down.
        layer.push({ dx: x - lid.cx, dy: lid.cy - y, delta: [0, 1, 2].map(c => resting.data[p * 4 + c] - bare[p * 4 + c]) })
      }
    }
    return layer
  })
}

/** The blink frame for one open-eyed pose, as PNG bytes. */
async function closeEyes(openFile, lids, name) {
  const img = await load(openFile)
  const eyes = openEyes(img, name)
  const out = fill(img, mask(img, eyes, 7, true))
  eyes.forEach((eye, side) => {
    for (const { dx, dy, delta } of lids[side]) {
      const p = Math.round(eye.cy + LID_DROP + dy) * img.W + Math.round(eye.cx + dx)
      for (let c = 0; c < 3; c++) out[p * 4 + c] += delta[c]
    }
  })
  const bytes = Buffer.alloc(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = Math.max(0, Math.min(255, Math.round(out[i])))
  return sharp(bytes, { raw: { width: img.W, height: img.H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer()
}

module.exports = { closeEyes, lidsFrom, openEyes, load }
