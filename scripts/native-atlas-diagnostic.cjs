/** Instrument a disposable simulator checkout; never alter the release entry. */
const fs = require('node:fs')
const path = require('node:path')

const REPORT = 'native-atlas-diagnostic.json'
const RUNTIME = 'native-atlas-diagnostic-runtime.cjs'

function replaceOnce(source, before, after, label) {
  if (source.split(before).length !== 2) throw new Error(`Atlas diagnostic anchor changed: ${label}`)
  return source.replace(before, after)
}

function runtimeSource() {
  return `// WQ_ATLAS_DIAGNOSTIC: generated only in Native acceptance CI.
const FileSystem = require('expo-file-system/legacy')
const session = { id: Date.now().toString(36), startedAt: new Date().toISOString(), events: [] }
const destination = FileSystem.documentDirectory + '${REPORT}'
let report = { version: 1, sessions: [session] }
let nextView = 0
const frames = new Map()
const snapshots = new Set()
// Preserve quiz evidence when Maestro terminates and relaunches before Explore.
let writes = FileSystem.readAsStringAsync(destination).then(text => {
  const previous = JSON.parse(text)
  if (previous.version === 1 && Array.isArray(previous.sessions)) {
    report.sessions = [...previous.sessions.slice(-5), session]
  }
}).catch(() => {})
function record(kind, fields = {}) {
  if (session.events.length >= 220) return
  session.events.push({ time: new Date().toISOString(), kind, ...fields })
  writes = writes.then(() => FileSystem.writeAsStringAsync(destination, JSON.stringify(report, null, 2))).catch(() => {})
}
function safeError(error) {
  return { name: error?.name || 'Error', message: String(error?.message || error).slice(0, 240).replace(/file:\\/\\/\\S+/g, '[local file]') }
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
  if (count <= 12) record('draw-start', { ...context(gl), count, ...fields })
}
function drawEnd(gl, ready) {
  const count = frames.get(gl.contextId) || 0
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
  }, delay)
}
record('initialized')
module.exports = { record, safeError, context, mount, drawStart, drawEnd }
`
}

function instrumentNativeGL(source) {
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
          if self.wqAtlasPresentCount <= 12 { self.wqAtlasTrace("present", presented: wqPresented) }`, 'native presentation')
  native = replaceOnce(native, '  func glContextInitialized(_ context: EXGLContext) {', `  func glContextInitialized(_ context: EXGLContext) {
    wqAtlasTrace("context-initialized")`, 'native context initialization')
  native = replaceOnce(native, '  func glContextWillDestroy(_ context: EXGLContext) {', `  func glContextWillDestroy(_ context: EXGLContext) {
    wqAtlasTrace("context-will-destroy")`, 'native context destruction')
  return native
}

function prepareNativeAtlasDiagnostic(workspaceRoot = path.resolve(__dirname, '..'), nativeGLPath) {
  const projectRoot = path.join(workspaceRoot, 'apps/mobile')
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  if (manifest.main !== 'expo-router/entry') throw new Error('Atlas diagnostic requires the production entry')
  const viewPath = path.join(projectRoot, 'src/features/atlas/WorldAtlasView.tsx')
  const rendererPath = path.join(projectRoot, 'src/features/atlas/render/GlobeRenderer.ts')
  const glPath = nativeGLPath || path.join(path.dirname(require.resolve('expo-gl/package.json', { paths: [projectRoot] })), 'ios/GLView.swift')
  let view = fs.readFileSync(viewPath, 'utf8')
  let renderer = fs.readFileSync(rendererPath, 'utf8')
  const nativeOriginal = fs.readFileSync(glPath, 'utf8')
  if ([view, renderer, nativeOriginal].some(source => source.includes('WQ_ATLAS_DIAGNOSTIC'))) throw new Error('Atlas diagnostic already installed')
  const native = instrumentNativeGL(nativeOriginal)

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

  renderer = replaceOnce(renderer, "import { toVec3 } from '../geo/sphere.js'", `import { toVec3 } from '../geo/sphere.js'
// WQ_ATLAS_DIAGNOSTIC: only counters, GL inspection and framebuffer capture.
const atlasDiagnostic = require('../../../../${RUNTIME}')`, 'renderer import')
  renderer = replaceOnce(renderer, '    if (width === 0 || height === 0) return', `    atlasDiagnostic.drawStart(gl, { viewportWidth: viewport.width, viewportHeight: viewport.height, ready: this.ready, distance: camera.distance })
    if (width === 0 || height === 0) return`, 'draw start')
  renderer = replaceOnce(renderer, '      gl.endFrameEXP?.()\n      return', '      gl.endFrameEXP?.()\n      atlasDiagnostic.drawEnd(gl, false)\n      return', 'pre-texture draw')
  renderer = replaceOnce(renderer, '    gl.flush()\n    gl.endFrameEXP?.()', '    gl.flush()\n    gl.endFrameEXP?.()\n    atlasDiagnostic.drawEnd(gl, true)', 'completed draw')
  renderer = replaceOnce(renderer, '    this.disposed = true', `    atlasDiagnostic.record('renderer-dispose', atlasDiagnostic.context(this.gl))
    this.disposed = true`, 'dispose')

  // Resolve every exact anchor before modifying the disposable checkout.
  fs.writeFileSync(path.join(projectRoot, RUNTIME), runtimeSource())
  fs.writeFileSync(path.join(projectRoot, 'native-atlas-diagnostic-GLView.original.swift'), nativeOriginal)
  fs.writeFileSync(glPath, native)
  fs.writeFileSync(viewPath, view)
  fs.writeFileSync(rendererPath, renderer)
  return { report: REPORT, nativeReport: 'native-atlas-native.jsonl', frames: 'native-atlas-frame-*.png', entry: manifest.main, patched: [viewPath, rendererPath, glPath] }
}

if (require.main === module) {
  if (process.env.GITHUB_WORKFLOW !== 'Native acceptance' || process.env.CI !== 'true') {
    throw new Error('Atlas instrumentation is restricted to the Native acceptance CI checkout')
  }
  console.log(JSON.stringify(prepareNativeAtlasDiagnostic()))
}
module.exports = { prepareNativeAtlasDiagnostic, runtimeSource, instrumentNativeGL }
