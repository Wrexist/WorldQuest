const { test } = require('node:test')
const assert = require('node:assert/strict')
const { geometryFromLog, compareZoom, comparePageBand, presentationEvidence } = require('./verify-native-globe-zoom.cjs')

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

test('distinguishes a moving globe from its parent page scrolling', () => {
  const before = image(), after = image()
  after.data.fill(0, 0, 200 * 220 * 4)
  assert.equal(comparePageBand(before, after, geometry), 0)
  after.data.fill(0, 200 * 236 * 4, 200 * 300 * 4)
  assert.ok(comparePageBand(before, after, geometry) > .9)
  assert.throws(() => comparePageBand(before, after, { ...geometry, globe: { ...geometry.globe, height: 350 } }), /Too little/)
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

const captureLog = `17:01:26.682 [ INFO] Take screenshot native-explore-globe RUNNING
17:01:34.301 [ INFO] Take screenshot native-explore-zoomed RUNNING`
const trace = { sessions: [{ events: [
  { kind: 'mount', mode: 'explore', viewId: 1, time: '2026-10-03T17:01:16.688Z' },
  { kind: 'context-created', viewId: 1, contextId: 3, time: '2026-10-03T17:01:17.036Z' },
  { kind: 'control-press', control: 'in', time: '2026-10-03T17:01:28.613Z' },
] }] }
const present = (time, contextId = 3, presented = true) => ({ kind: 'present', contextId, presented, time: Date.parse(`2026-10-03T${time}Z`) / 1000 })

test('rejects the textured preview becoming the initial live frame during the baseline capture', () => {
  // Actual event-only failure: both initial presents followed capture start and no
  // zoom frame reached the native surface, despite a 98% pixel change from preview.
  const result = presentationEvidence(captureLog, trace, [present('17:01:26.769'), present('17:01:26.783')])
  assert.equal(result.baselinePresentedBeforeCapture, false)
  assert.equal(result.zoomPresentedAfterPress, false)
  assert.equal(result.passed, false)
})

test('requires a baseline present and a post-press present before their respective captures', () => {
  const initial = present('17:01:25.000')
  assert.equal(presentationEvidence(captureLog, trace, [initial]).passed, false)
  assert.equal(presentationEvidence(captureLog, trace, [initial, present('17:01:35.000')]).passed, false)
  assert.equal(presentationEvidence(captureLog, trace, [initial, present('17:01:29.000', 7), present('17:01:29.100', 3, false)]).passed, false)
  const result = presentationEvidence(captureLog, trace, [initial, present('17:01:29.000')])
  assert.equal(result.passed, true)
  assert.equal(result.baselinePresentCount, 1)
  assert.equal(result.zoomPresentCount, 1)
})

test('fails incomplete tracing and handles captures crossing UTC midnight', () => {
  assert.throws(() => presentationEvidence(captureLog, { sessions: [] }, []), /Expected one traced/)
  assert.throws(() => presentationEvidence('', trace, []), /capture start/)
  const midnight = structuredClone(trace)
  midnight.sessions[0].events[0].time = '2026-10-03T23:59:50.000Z'
  midnight.sessions[0].events[2].time = '2026-10-04T00:00:01.000Z'
  const result = presentationEvidence('23:59:59.000 Take screenshot native-explore-globe RUNNING\n00:00:02.000 Take screenshot native-explore-zoomed RUNNING', midnight, [
    present('23:59:58.000'),
    { kind: 'present', contextId: 3, presented: true, time: Date.parse('2026-10-04T00:00:01.500Z') / 1000 },
  ])
  assert.equal(result.passed, true)
  assert.equal(result.baselineCaptureStartedAt, '2026-10-03T23:59:59.000Z')
})
