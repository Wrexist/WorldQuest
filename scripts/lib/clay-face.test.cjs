// A new face may change his eyes and mouth and nothing else. A blink frame is shown over
// its open pose for a moment, so any other difference would flicker every time he blinks;
// a whole new pose that changed his hat or hands would be a different character.
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { faceOf, load, openEyes } = require('./clay-face.cjs')

const art = path.resolve(__dirname, '../../apps/mobile/assets/art/atlas-clay')

const faces = [
  { face: 'welcome-blink', from: 'welcome', shut: 2 },
  { face: 'celebrate-blink', from: 'celebrate', shut: 2 },
  { face: 'thinking-blink', from: 'thinking', shut: 2 },
  { face: 'laughing', from: 'celebrate', shut: 2 },
  { face: 'proud', from: 'celebrate', shut: 2, mouth: true },
  { face: 'wink', from: 'welcome', shut: 1 },
]

for (const { face, from, shut, mouth } of faces) {
  test(`${face}: a new face on ${from}, and nothing else changed`, async () => {
    const before = await load(path.join(art, `${from}.png`))
    const after = await load(path.join(art, `${face}.png`))
    assert.equal(after.W, before.W)
    assert.equal(after.H, before.H)
    const { eyes, mouth: lips } = faceOf(before, from)
    // Within each eye's box, grown by the fill's 7 px reach — and sideways a little more,
    // because the lids come from resting, whose closed right eye is wider than the open one.
    const nearAnEye = (x, y) => eyes.some(e => Math.abs(x - e.cx) <= e.rx + 12 && Math.abs(y - e.cy) <= e.ry + 8)
    const onTheMouth = (x, y) => mouth === true && Math.abs(x - lips.cx) <= lips.rx + 8 && Math.abs(y - lips.cy) <= lips.ry + 8
    let changed = 0
    for (let p = 0; p < before.W * before.H; p++) {
      if ([0, 1, 2, 3].every(c => before.data[p * 4 + c] === after.data[p * 4 + c])) continue
      changed++
      const x = p % before.W
      const y = (p / before.W) | 0
      assert.ok(nearAnEye(x, y) || onTheMouth(x, y), `${face} differs from ${from} at ${x},${y}, away from the face it changes`)
    }
    assert.ok(changed > 1000 * shut, `${face} barely differs from ${from} (${changed} px)`)
    if (shut === 2) assert.throws(() => openEyes(after, face), /expected two open eyes/)
  })
}
