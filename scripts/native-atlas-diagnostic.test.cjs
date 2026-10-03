const assert = require('node:assert/strict')
const test = require('node:test')
const vm = require('node:vm')
const { runtimeSource } = require('./native-atlas-diagnostic.cjs')

function runtime(eventsOnly) {
  const reports = [], timers = []
  const module = { exports: {} }
  const fileSystem = {
    documentDirectory: 'file:///diagnostic/',
    readAsStringAsync: async () => { throw new Error('No previous report') },
    writeAsStringAsync: async (_uri, body) => { reports.push(JSON.parse(body)) },
  }
  vm.runInNewContext(runtimeSource({ eventsOnly }), {
    module, Date, Map, Set,
    setTimeout: callback => { timers.push(callback) },
    require: name => {
      assert.equal(name, 'expo-file-system/legacy', 'Event-only tracing must not load snapshot APIs')
      return fileSystem
    },
  })
  return { api: module.exports, reports, timers }
}

test('event-only tracing never reads, waits for, or snapshots the GL queue', async () => {
  const { api, reports, timers } = runtime(true)
  const gl = new Proxy({ contextId: 1, drawingBufferWidth: 1110, drawingBufferHeight: 1146 }, {
    get(target, name) {
      assert.ok(Object.hasOwn(target, name), `Unexpected GL access: ${String(name)}`)
      return target[name]
    },
  })
  for (let i = 0; i < 80; i++) {
    api.limited('camera-change', { viewId: 1, distance: 4 - i / 100 })
    api.drawStart(gl, { distance: 4 - i / 100 })
    api.drawEnd(gl, true)
  }
  api.record('camera-animation-complete', { targetDistance: 2.8475 })
  await new Promise(setImmediate)
  const session = reports.at(-1).sessions.at(-1)
  assert.equal(session.mode, 'events-only')
  assert.equal(session.events.filter(event => event.kind === 'frame-enqueued').length, 40)
  assert.equal(session.events.filter(event => event.kind === 'draw-start').length, 40)
  assert.equal(session.events.at(-1).kind, 'camera-animation-complete')
  assert.equal(timers.length, 0)
  assert.doesNotMatch(runtimeSource({ eventsOnly: true }), /getError|checkFramebufferStatus|getParameter|takeSnapshotAsync/)
})

test('event-only diagnostics retain a bounded report even if a scene keeps changing', async () => {
  const { api, reports } = runtime(true)
  for (let i = 0; i < 1000; i++) api.record('synthetic-event', { count: i })
  await new Promise(setImmediate)
  assert.equal(reports.at(-1).sessions.at(-1).events.length, 600)
})

test('framebuffer mode still explicitly records GL inspection and schedules two snapshots', async () => {
  const { api, reports, timers } = runtime(false)
  const gl = {
    contextId: 1, drawingBufferWidth: 1110, drawingBufferHeight: 1146,
    FRAMEBUFFER: 1, VIEWPORT: 2,
    getError: () => 0,
    checkFramebufferStatus: () => 36053,
    getParameter: () => [0, 0, 1110, 1146],
  }
  api.drawStart(gl, { distance: 4 })
  api.drawEnd(gl, true)
  await new Promise(setImmediate)
  const session = reports.at(-1).sessions.at(-1)
  assert.equal(session.mode, 'framebuffer')
  assert.equal(session.events.at(-1).kind, 'frame-submitted')
  assert.equal(session.events.at(-1).error, 0)
  assert.equal(timers.length, 2)
})
