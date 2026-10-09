// The blink frame is shown over the open pose for a moment, so it must differ from it in
// the eyes and nowhere else: any other difference would flicker every time he blinks.
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { load, openEyes } = require('./clay-lids.cjs')

const art = path.resolve(__dirname, '../../apps/mobile/assets/art/atlas-clay')

for (const name of ['welcome', 'celebrate', 'thinking']) {
  test(`${name}: the blink closes both eyes and changes nothing else`, async () => {
    const open = await load(path.join(art, `${name}.png`))
    const blink = await load(path.join(art, `${name}-blink.png`))
    assert.equal(blink.W, open.W)
    assert.equal(blink.H, open.H)
    const eyes = openEyes(open, name)
    // Within each eye's box, grown by the fill's 7 px reach — and sideways a little more,
    // because the lids come from resting, whose closed right eye is wider than the open one.
    const nearAnEye = (x, y) => eyes.some(e => Math.abs(x - e.cx) <= e.rx + 12 && Math.abs(y - e.cy) <= e.ry + 8)
    let changed = 0
    for (let p = 0; p < open.W * open.H; p++) {
      const same = [0, 1, 2, 3].every(c => open.data[p * 4 + c] === blink.data[p * 4 + c])
      if (same) continue
      changed++
      const x = p % open.W
      const y = (p / open.W) | 0
      assert.ok(nearAnEye(x, y), `${name}-blink differs from ${name} at ${x},${y}, away from the eyes`)
    }
    assert.ok(changed > 2000, `${name}-blink barely differs (${changed} px): are the eyes closed?`)
    assert.throws(() => openEyes(blink, `${name}-blink`), /expected two open eyes/)
  })
}
