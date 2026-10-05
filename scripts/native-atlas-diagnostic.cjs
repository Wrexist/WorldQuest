/** Instrument a disposable simulator checkout; never alter the release entry. */
const fs = require('node:fs')
const path = require('node:path')

const REPORT = 'native-atlas-diagnostic.json'
const RUNTIME = 'native-atlas-diagnostic-runtime.cjs'

function replaceOnce(source, before, after, label) {
  if (source.split(before).length !== 2) throw new Error(`Atlas diagnostic anchor changed: ${label}`)
  return source.replace(before, after)
}

function runtimeSource({ eventsOnly = false } = {}) {
  return `// WQ_ATLAS_DIAGNOSTIC: generated only in Native acceptance CI.
const FileSystem = require('expo-file-system/legacy')
const session = { id: Date.now().toString(36), startedAt: new Date().toISOString(), mode: '${eventsOnly ? 'events-only' : 'framebuffer'}', events: [] }
const destination = FileSystem.documentDirectory + '${REPORT}'
let report = { version: 1, sessions: [session] }
let nextView = 0
const frames = new Map()
const snapshots = new Set()
const limitedEvents = new Map()
// Preserve quiz evidence when Maestro terminates and relaunches before Explore.
let writes = FileSystem.readAsStringAsync(destination).then(text => {
  const previous = JSON.parse(text)
  if (previous.version === 1 && Array.isArray(previous.sessions)) {
    report.sessions = [...previous.sessions.slice(-5), session]
  }
}).catch(() => {})
function record(kind, fields = {}) {
  if (session.events.length >= ${eventsOnly ? 600 : 220}) return
  session.events.push({ time: new Date().toISOString(), kind, ...fields })
  writes = writes.then(() => FileSystem.writeAsStringAsync(destination, JSON.stringify(report, null, 2))).catch(() => {})
}
function safeError(error) {
  return { name: error?.name || 'Error', message: String(error?.message || error).slice(0, 240).replace(/file:\\/\\/\\S+/g, '[local file]') }
}
function limited(kind, fields = {}) {
  const key = kind + ':' + (fields.viewId || fields.contextId || fields.control || '')
  const count = (limitedEvents.get(key) || 0) + 1
  limitedEvents.set(key, count)
  if (count <= ${eventsOnly ? 40 : 12}) record(kind, { ...fields, count })
}
function context(gl) {
  return { contextId: gl.contextId, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }
}
function mount(mode) {
  const viewId = ++nextView
  record('mount', { viewId, mode: mode === 'explore' ? 'explore' : 'lesson' })
  return viewId
}
function drawStart(gl, fields) {
  const count = (frames.get(gl.contextId) || 0) + 1
  frames.set(gl.contextId, count)
  if (count <= ${eventsOnly ? 40 : 12}) record('draw-start', { ...context(gl), count, ...fields })
}
function drawEnd(gl, ready) {
  const count = frames.get(gl.contextId) || 0
${eventsOnly ? `  // JS submission is not native presentation. Do not read GL state, synchronize,
  // or snapshot here: this mode must preserve production's asynchronous queue.
  if (count <= 40) record('frame-enqueued', { ...context(gl), count, ready })` : `
  if (count <= 12) {
    try {
      record('frame-submitted', { ...context(gl), count, ready, error: gl.getError(),
        framebufferStatus: gl.checkFramebufferStatus(gl.FRAMEBUFFER),
        viewport: Array.from(gl.getParameter(gl.VIEWPORT)) })
    } catch (error) { record('frame-inspection-error', { ...context(gl), error: safeError(error) }) }
  }
  if (!ready || snapshots.has(gl.contextId) || snapshots.size >= 4) return
  snapshots.add(gl.contextId)
  for (const delay of [0, 1000]) setTimeout(async () => {
    const filename = 'native-atlas-frame-' + session.id + '-' + gl.contextId + '-' + delay + '.png'
    try {
      const snapshot = await require('expo-gl').GLView.takeSnapshotAsync(gl, { format: 'png', flip: true })
      await FileSystem.copyAsync({ from: snapshot.uri, to: FileSystem.documentDirectory + filename })
      record('snapshot', { ...context(gl), filename, delay, width: snapshot.width, height: snapshot.height })
    } catch (error) { record('snapshot-error', { ...context(gl), delay, error: safeError(error) }) }
  }, delay)`}
}
record('initialized')
module.exports = { record, limited, safeError, context, mount, drawStart, drawEnd }
`
}

function instrumentNativeGL(source, { eventsOnly = false } = {}) {
  let native = replaceOnce(source, 'import ExpoModulesCore', `import ExpoModulesCore

// WQ_ATLAS_DIAGNOSTIC: serialized append survives the test's app relaunch.
private let wqAtlasTraceQueue = DispatchQueue(label: "worldquest.atlas.diagnostic")
private let wqAtlasNativeSession = UUID().uuidString
private var wqAtlasNativeEvents = 0
private func wqAtlasAppend(_ fields: [String: Any]) {
  wqAtlasTraceQueue.async {
    guard wqAtlasNativeEvents < 300 else { return }
    wqAtlasNativeEvents += 1
    guard let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
      var data = try? JSONSerialization.data(withJSONObject: fields) else { return }
    data.append(0x0A)
    let url = directory.appendingPathComponent("native-atlas-native.jsonl")
    if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
    guard let handle = try? FileHandle(forWritingTo: url) else { return }
    defer { try? handle.close() }
    _ = try? handle.seekToEnd()
    try? handle.write(contentsOf: data)
  }
}`, 'native trace writer')
  native = replaceOnce(native, '  var viewBuffersSize: CGSize = .zero', `  var viewBuffersSize: CGSize = .zero
  private var wqAtlasPresentCount = 0
  private var wqAtlasLayoutCount = 0
  private func wqAtlasTrace(_ kind: String, rect: CGRect? = nil, presented: Bool? = nil) {
    var fields: [String: Any] = ["time": Date().timeIntervalSince1970, "session": wqAtlasNativeSession,
      "kind": kind, "contextId": glContext.contextId, "initialized": glContext.isInitialized(),
      "layerWidth": layerWidth, "layerHeight": layerHeight, "viewFramebuffer": viewFramebuffer,
      "msaaFramebuffer": msaaFramebuffer, "viewColorbuffer": viewColorbuffer]
    if let rect { fields["frame"] = ["x": rect.origin.x, "y": rect.origin.y, "width": rect.width, "height": rect.height] }
    if let presented { fields["presented"] = presented }
    wqAtlasAppend(fields)
  }`, 'native fields')
  native = replaceOnce(native, '  override func layoutSubviews() {', `  override func layoutSubviews() {
    wqAtlasLayoutCount += 1
    if wqAtlasLayoutCount <= 12 { wqAtlasTrace("layout", rect: frame) }`, 'native layout')
  native = replaceOnce(native, '  override func removeFromSuperview() {', `  override func removeFromSuperview() {
    wqAtlasTrace("remove-from-superview", rect: frame)`, 'native removal')
  native = replaceOnce(native, '      // Resize viewport', `      wqAtlasTrace("buffers-created")
      // Resize viewport`, 'native buffers')
  native = replaceOnce(native, '      onSurfaceCreate?([', `      wqAtlasTrace("surface-create-event")
      onSurfaceCreate?([`, 'native surface')
  native = replaceOnce(native, '          self.eaglContext.presentRenderbuffer(Int(GL_RENDERBUFFER))', `          let wqPresented = self.eaglContext.presentRenderbuffer(Int(GL_RENDERBUFFER))
          self.wqAtlasPresentCount += 1
          if self.wqAtlasPresentCount <= ${eventsOnly ? 40 : 12} { self.wqAtlasTrace("present", presented: wqPresented) }`, 'native presentation')
  native = replaceOnce(native, '  func glContextInitialized(_ context: EXGLContext) {', `  func glContextInitialized(_ context: EXGLContext) {
    wqAtlasTrace("context-initialized")`, 'native context initialization')
  native = replaceOnce(native, '  func glContextWillDestroy(_ context: EXGLContext) {', `  func glContextWillDestroy(_ context: EXGLContext) {
    wqAtlasTrace("context-will-destroy")`, 'native context destruction')
  return native
}

function prepareNativeAtlasDiagnostic(workspaceRoot = path.resolve(__dirname, '..'), nativeGLPath, { eventsOnly = false } = {}) {
  const projectRoot = path.join(workspaceRoot, 'apps/mobile')
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  if (manifest.main !== 'expo-router/entry') throw new Error('Atlas diagnostic requires the production entry')
  const viewPath = path.join(projectRoot, 'src/features/atlas/WorldAtlasView.tsx')
  const rendererPath = path.join(projectRoot, 'src/features/atlas/render/GlobeRenderer.ts')
  const glPath = nativeGLPath || path.join(path.dirname(require.resolve('expo-gl/package.json', { paths: [projectRoot] })), 'ios/GLView.swift')
  let view = fs.readFileSync(viewPath, 'utf8').replace(/\r\n/g, '\n')
  let renderer = fs.readFileSync(rendererPath, 'utf8').replace(/\r\n/g, '\n')
  const nativeOriginal = fs.readFileSync(glPath, 'utf8')
  if ([view, renderer, nativeOriginal].some(source => source.includes('WQ_ATLAS_DIAGNOSTIC'))) throw new Error('Atlas diagnostic already installed')
  const native = instrumentNativeGL(nativeOriginal, { eventsOnly })

  view = replaceOnce(view, "import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl'", `import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl'
// WQ_ATLAS_DIAGNOSTIC: removed with the disposable CI checkout.
const atlasDiagnostic = require('../../../${RUNTIME}')`, 'view import')
  view = replaceOnce(view, "  const [status, setStatus] = useState<AtlasStatus>('loading')", `  const [status, setStatus] = useState<AtlasStatus>('loading')
  const [diagnosticId] = useState(() => atlasDiagnostic.mount(spec.mode))
  useEffect(() => () => atlasDiagnostic.record('unmount', { viewId: diagnosticId }), [diagnosticId])`, 'view lifetime')
  view = replaceOnce(view, '    setStatus(next)', `    atlasDiagnostic.record('status', { viewId: diagnosticId, status: next, ...(error ? { error: atlasDiagnostic.safeError(error) } : {}) })
    setStatus(next)`, 'status')
  view = replaceOnce(view, '      let created: GlobeRenderer', `      atlasDiagnostic.record('context-created', { viewId: diagnosticId, ...atlasDiagnostic.context(gl) })
      let created: GlobeRenderer`, 'context creation')
  view = replaceOnce(view, '    const { width, height } = event.nativeEvent.layout', `    const { width, height } = event.nativeEvent.layout
    atlasDiagnostic.record('outer-layout', { viewId: diagnosticId, ...event.nativeEvent.layout })`, 'outer layout')
  view = replaceOnce(view, '<GLView key={generation} style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />', `<GLView key={generation} style={StyleSheet.absoluteFill} onContextCreate={onContextCreate}
          onLayout={event => atlasDiagnostic.record('gl-view-layout', { viewId: diagnosticId, ...event.nativeEvent.layout })} />`, 'GL layout')
  view = replaceOnce(view, '  const requestDraw = useCallback(() => {\n    dirty.current = true', `  const requestDraw = useCallback(() => {
    dirty.current = true
    atlasDiagnostic.limited('draw-request', { viewId: diagnosticId, pendingFrame: frame.current, frameInFlight: flight.current !== null, status: statusRef.current, hasRenderer: renderer.current !== null, hasSize: sizeRef.current !== null })`, 'draw scheduling')
  view = replaceOnce(view, '    frame.current = requestAnimationFrame(() => {\n      frame.current = null', `    frame.current = requestAnimationFrame(() => {
      atlasDiagnostic.limited('draw-callback', { viewId: diagnosticId })
      frame.current = null`, 'draw callback')
  view = replaceOnce(view, '      const complete = () => {\n        if (flight.current !== pending) return', `      const complete = () => {
        if (flight.current !== pending) return
        atlasDiagnostic.limited('frame-completed', { viewId: diagnosticId, contextId: nativeContext.current?.contextId, distance: renderedCamera.distance, dirty: dirty.current, active: foreground.current })`, 'frame acknowledgement')
  view = replaceOnce(view, '      cameraRef.current = next', `      atlasDiagnostic.limited('camera-change', { viewId: diagnosticId, distance: next.distance })
      cameraRef.current = next`, 'camera change')
  view = replaceOnce(view, '    if (animation.current !== null) cancelAnimationFrame(animation.current)', `    atlasDiagnostic.limited('stop-animation', { viewId: diagnosticId, pendingAnimation: animation.current })
    if (animation.current !== null) cancelAnimationFrame(animation.current)`, 'animation cancellation')
  view = replaceOnce(view, '    (target: Camera) => {\n      stopAnimation()', `    (target: Camera) => {
      atlasDiagnostic.record('fly-to', { viewId: diagnosticId, reducedMotion: reduceMotion, fromDistance: cameraRef.current.distance, targetDistance: target.distance })
      stopAnimation()`, 'fly entry')
  view = replaceOnce(view, '        const progress = Math.min(1, (Date.now() - start) / duration)', `        const progress = Math.min(1, (Date.now() - start) / duration)
        if (progress === 1) atlasDiagnostic.record('camera-animation-complete', { viewId: diagnosticId, targetDistance: target.distance })
        atlasDiagnostic.limited('camera-animation-frame', { viewId: diagnosticId, progress })`, 'camera RAF')
  view = replaceOnce(view, "      if (state === 'active') {", `      atlasDiagnostic.record('app-state', { viewId: diagnosticId, state })
      if (state === 'active') {`, 'app state')
  view = replaceOnce(view, '<Pressable role="button" aria-label={label} onPress={onPress} style=', `<Pressable role="button" aria-label={label}
      onPressIn={() => atlasDiagnostic.record('control-press-in', { control: kind })}
      onPressOut={() => atlasDiagnostic.record('control-press-out', { control: kind })}
      onPress={() => { atlasDiagnostic.record('control-press', { control: kind }); onPress() }} style=`, 'control touch callbacks')

  renderer = replaceOnce(renderer, "import { toVec3 } from '../geo/sphere.js'", `import { toVec3 } from '../geo/sphere.js'
// WQ_ATLAS_DIAGNOSTIC: only counters, GL inspection and framebuffer capture.
const atlasDiagnostic = require('../../../../${RUNTIME}')`, 'renderer import')
  renderer = replaceOnce(renderer, '    if (width === 0 || height === 0) return false', `    atlasDiagnostic.drawStart(gl, { viewportWidth: viewport.width, viewportHeight: viewport.height, ready: this.ready, distance: camera.distance })
    if (width === 0 || height === 0) return false`, 'draw start')
  renderer = replaceOnce(renderer, '    const mvp = viewProjection(camera, width / height)', `    atlasDiagnostic.limited('halo-submitted', atlasDiagnostic.context(gl))
    const mvp = viewProjection(camera, width / height)`, 'halo phase')
  renderer = replaceOnce(renderer, '    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0)', `    atlasDiagnostic.limited('globe-uniforms-ready', atlasDiagnostic.context(gl))
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0)
    atlasDiagnostic.limited('globe-submitted', atlasDiagnostic.context(gl))`, 'globe phase')
  renderer = replaceOnce(renderer, '    gl.flush()\n    gl.endFrameEXP?.()', '    gl.flush()\n    gl.endFrameEXP?.()\n    atlasDiagnostic.drawEnd(gl, true)', 'completed draw')
  renderer = replaceOnce(renderer, '    this.disposed = true', `    atlasDiagnostic.record('renderer-dispose', atlasDiagnostic.context(this.gl))
    this.disposed = true`, 'dispose')

  // Resolve every exact anchor before modifying the disposable checkout.
  fs.writeFileSync(path.join(projectRoot, RUNTIME), runtimeSource({ eventsOnly }))
  fs.writeFileSync(path.join(projectRoot, 'native-atlas-diagnostic-GLView.original.swift'), nativeOriginal)
  fs.writeFileSync(glPath, native)
  fs.writeFileSync(viewPath, view)
  fs.writeFileSync(rendererPath, renderer)
  return { mode: eventsOnly ? 'events-only' : 'framebuffer', report: REPORT, nativeReport: 'native-atlas-native.jsonl', frames: 'native-atlas-frame-*.png', entry: manifest.main, patched: [viewPath, rendererPath, glPath] }
}

if (require.main === module) {
  if (process.env.GITHUB_WORKFLOW !== 'Native acceptance' || process.env.CI !== 'true') {
    throw new Error('Atlas instrumentation is restricted to the Native acceptance CI checkout')
  }
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--events-only')) throw new Error('Unknown atlas diagnostic option')
  console.log(JSON.stringify(prepareNativeAtlasDiagnostic(undefined, undefined, { eventsOnly: args.includes('--events-only') })))
}
module.exports = { prepareNativeAtlasDiagnostic, runtimeSource, instrumentNativeGL }
