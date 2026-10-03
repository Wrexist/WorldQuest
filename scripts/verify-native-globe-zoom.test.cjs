const { test } = require('node:test')
const assert = require('node:assert/strict')
const { geometryFromLog, compareZoom } = require('./verify-native-globe-zoom.cjs')

const geometry = { screen: { width: 200, height: 400 }, globe: { x: 10, y: 20, width: 180, height: 200 }, controlsTop: 190 }
function image(textured = true) {
  const data = Buffer.alloc(200 * 400 * 4)
  for (let y = 0; y < 400; y++) for (let x = 0; x < 200; x++) {
    const i = (y * 200 + x) * 4
    data[i] = textured ? (x * 7 + y * 3) % 256 : 200
    data[i + 1] = textured ? (x * 3 + y * 11) % 256 : 220
    data[i + 2] = textured ? (x * 5 + y * 2) % 256 : 240
    data[i + 3] = 255
  }
  return { width: 200, height: 400, data }
}

test('rejects the unchanged textured globe and changes confined to controls or status text', () => {
  const before = image(), after = image()
  assert.equal(compareZoom(before, after, geometry).passed, false)
  after.data.fill(0, 0, 200 * 25 * 4)
  after.data.fill(0, 200 * 190 * 4)
  const result = compareZoom(before, after, geometry)
  assert.equal(result.baselineHasTexture, true)
  assert.equal(result.changedPixels, 0)
  assert.equal(result.passed, false)
})

test('rejects a delayed first paint and a newly blank surface', () => {
  assert.equal(compareZoom(image(false), image(), geometry).passed, false)
  assert.equal(compareZoom(image(), image(false), geometry).passed, false)
})

test('requires a meaningful changed area and accepts a changed textured scene', () => {
  const before = image(), after = image()
  after.data[4 * (60 * 200 + 60)] ^= 128
  assert.equal(compareZoom(before, after, geometry).passed, false)
  for (let i = 0; i < after.data.length; i += 4) after.data[i] ^= 128
  assert.equal(compareZoom(before, after, geometry).passed, true)
})

test('rejects hidden or too-small samples and mismatched image geometry', () => {
  assert.throws(() => compareZoom(image(), image(), { ...geometry, controlsTop: 60 }), /Too little/)
  assert.throws(() => compareZoom(image(), { ...image(), height: 401 }, geometry), /different dimensions/)
})

test('uses final centred globe bounds and the actual physical zoom target from Maestro', () => {
  const result = geometryFromLog(`Scrolling DOWN until id: explore-globe RUNNING
Scrolling try count: 0, DeviceWidth: 402, DeviceWidth: 874
Element bounds: Bounds(x=16, y=444, width=370, height=382)
Scrolling try count: 1, DeviceWidth: 402, DeviceWidth: 874
Element bounds: Bounds(x=16, y=-99, width=370, height=381)
Scrolling DOWN until id: explore-globe centering enabled COMPLETED
Tapping on element: UiElement(attributes={accessibilityText=Zoom in, bounds=[213,221][261,269]})`)
  assert.deepEqual(result, { screen: { width: 402, height: 874 }, globe: { x: 16, y: -99, width: 370, height: 381 }, controlsTop: 221 })
  assert.throws(() => geometryFromLog('No scroll or zoom'), /Missing/)
})
