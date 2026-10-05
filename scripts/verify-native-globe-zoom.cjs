#!/usr/bin/env node
/* Verify pixels, not only accessibility labels: native zoom controls can be present
 * while the GL surface is blank or a press never changes the rendered camera. */
const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

function geometryFromLog(log) {
  const start = log.indexOf('Scrolling DOWN until id: explore-globe')
  const end = log.indexOf('centering enabled COMPLETED', start)
  if (start < 0 || end < 0) throw new Error('Missing completed globe viewport scroll')
  const scroll = log.slice(start, end)
  const screens = [...scroll.matchAll(/DeviceWidth: (\d+), DeviceWidth: (\d+)/g)]
  const bounds = [...scroll.matchAll(/Element bounds: Bounds\(x=(-?[\d.]+), y=(-?[\d.]+), width=([\d.]+), height=([\d.]+)\)/g)]
  const tap = log.slice(end).match(/Tapping on element:.*accessibilityText=Zoom in,.*?bounds=\[(-?[\d.]+),(-?[\d.]+)\]\[(-?[\d.]+),(-?[\d.]+)\]/)
  if (!screens.length || !bounds.length || !tap) throw new Error('Missing globe or zoom tap geometry')
  const [, width, height] = screens.at(-1).map(Number)
  const [, x, y, globeWidth, globeHeight] = bounds.at(-1).map(Number)
  return { screen: { width, height }, globe: { x, y, width: globeWidth, height: globeHeight }, controlsTop: Number(tap[2]) }
}

function compareZoom(before, after, geometry) {
  if (before.width !== after.width || before.height !== after.height) throw new Error('Zoom screenshots have different dimensions')
  const { screen, globe, controlsTop } = geometry
  const scale = before.width / screen.width
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(before.height / screen.height - scale) > 0.02) throw new Error('Screenshot and device dimensions disagree')
  // The scroll can clip the top of the globe. Keep only its visible interior, above
  // the control row; the 10% screen band excludes the status bar on this iOS flow.
  const pointCrop = {
    left: Math.max(0, globe.x + globe.width * 0.1),
    top: Math.max(screen.height * 0.1, globe.y + globe.height * 0.1),
    right: Math.min(screen.width, globe.x + globe.width * 0.9),
    bottom: Math.min(controlsTop - 8, globe.y + globe.height * 0.9, screen.height * 0.8),
  }
  if (pointCrop.right - pointCrop.left < 80 || pointCrop.bottom - pointCrop.top < 48) throw new Error('Too little unobscured globe area to verify zoom')
  const crop = Object.fromEntries(Object.entries(pointCrop).map(([key, value]) => [key, Math.round(value * scale)]))
  const baseline = { sum: [0, 0, 0], square: [0, 0, 0], colors: new Set() }
  const zoomed = { sum: [0, 0, 0], square: [0, 0, 0], colors: new Set() }
  let changed = 0
  let count = 0
  let absoluteDifference = 0
  for (let y = crop.top; y < crop.bottom; y++) for (let x = crop.left; x < crop.right; x++) {
    const offset = (y * before.width + x) * 4
    let maximum = 0
    for (let c = 0; c < 3; c++) {
      const a = before.data[offset + c], b = after.data[offset + c]
      baseline.sum[c] += a; baseline.square[c] += a * a
      zoomed.sum[c] += b; zoomed.square[c] += b * b
      maximum = Math.max(maximum, Math.abs(a - b))
      absoluteDifference += Math.abs(a - b)
    }
    baseline.colors.add((before.data[offset] >> 4) * 256 + (before.data[offset + 1] >> 4) * 16 + (before.data[offset + 2] >> 4))
    zoomed.colors.add((after.data[offset] >> 4) * 256 + (after.data[offset + 1] >> 4) * 16 + (after.data[offset + 2] >> 4))
    if (maximum >= 8) changed++
    count++
  }
  const texture = sample => ({
    channelDeviation: sample.sum.reduce((total, sum, c) => total + Math.sqrt(Math.max(0, sample.square[c] / count - (sum / count) ** 2)), 0) / 3,
    colorBins: sample.colors.size,
  })
  const baselineTexture = texture(baseline), zoomedTexture = texture(zoomed)
  const baselineHasTexture = baselineTexture.channelDeviation >= 12 && baselineTexture.colorBins >= 24
  const zoomedHasTexture = zoomedTexture.channelDeviation >= 12 && zoomedTexture.colorBins >= 24
  const changedFraction = changed / count
  return {
    passed: baselineHasTexture && zoomedHasTexture && changedFraction >= 0.05,
    crop, pointCrop, sampledPixels: count, changedPixels: changed, changedFraction,
    meanChannelDifference: absoluteDifference / (count * 3),
    baselineHasTexture, zoomedHasTexture, baselineTexture, zoomedTexture,
    thresholds: { channelDelta: 8, changedFraction: 0.05, textureDeviation: 12, textureColorBins: 24 },
  }
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(file) : [file]
  })
}

function comparePageBand(before, after, geometry) {
  if (before.width !== after.width || before.height !== after.height) throw new Error('Gesture screenshots have different dimensions')
  const scale = before.width / geometry.screen.width
  const top = Math.ceil((geometry.globe.y + geometry.globe.height + 16) * scale)
  const bottom = Math.floor(geometry.screen.height * .75 * scale)
  if (bottom - top < 48 * scale) throw new Error('Too little page content below globe to verify gesture ownership')
  let changed = 0, count = 0
  for (let y = top; y < bottom; y++) for (let x = Math.floor(before.width * .1); x < before.width * .9; x++) {
    const offset = (y * before.width + x) * 4
    if ([0, 1, 2].some(channel => Math.abs(before.data[offset + channel] - after.data[offset + channel]) >= 8)) changed++
    count++
  }
  return changed / count
}

function presentationEvidence(log, diagnostic, nativeEvents) {
  const sessions = diagnostic.sessions.filter(session => session.events.some(event => event.kind === 'mount' && event.mode === 'explore'))
  const presses = sessions.flatMap(session => session.events.filter(event => event.kind === 'control-press' && event.control === 'in').map(press => ({ session, press })))
  if (presses.length !== 1) throw new Error(`Expected one traced Explore zoom press, found ${presses.length}`)
  const { session, press } = presses[0]
  const mount = session.events.find(event => event.kind === 'mount' && event.mode === 'explore')
  const context = session.events.find(event => event.kind === 'context-created' && event.viewId === mount.viewId)
  if (!context) throw new Error('Missing traced Explore GL context')
  const pressTime = Date.parse(press.time)
  const captureTime = name => {
    const matches = [...log.matchAll(new RegExp(`^(\\d{2}:\\d{2}:\\d{2}\\.\\d{3}).*Take screenshot ${name} RUNNING`, 'gm'))]
    if (matches.length !== 1) throw new Error(`Expected one ${name} capture start, found ${matches.length}`)
    let time = Date.parse(`${press.time.slice(0, 10)}T${matches[0][1]}Z`)
    // Maestro logs UTC time-of-day; associate captures across midnight with the press.
    if (time - pressTime > 12 * 60 * 60 * 1000) time -= 24 * 60 * 60 * 1000
    if (pressTime - time > 12 * 60 * 60 * 1000) time += 24 * 60 * 60 * 1000
    return time
  }
  const baselineStarted = captureTime('native-explore-globe')
  const zoomedStarted = captureTime('native-explore-zoomed')
  if (!(Date.parse(mount.time) < baselineStarted && baselineStarted < pressTime && pressTime < zoomedStarted)) throw new Error('Unexpected baseline, zoom press or capture order')
  const presents = nativeEvents.filter(event => event.kind === 'present' && event.presented === true && event.contextId === context.contextId && event.time * 1000 >= Date.parse(mount.time)).map(event => event.time * 1000)
  const baselinePresents = presents.filter(time => time < baselineStarted)
  const zoomPresents = presents.filter(time => time > pressTime && time < zoomedStarted)
  return {
    available: true,
    passed: baselinePresents.length > 0 && zoomPresents.length > 0,
    baselinePresentedBeforeCapture: baselinePresents.length > 0,
    zoomPresentedAfterPress: zoomPresents.length > 0,
    baselinePresentCount: baselinePresents.length,
    zoomPresentCount: zoomPresents.length,
    baselineCaptureStartedAt: new Date(baselineStarted).toISOString(),
    zoomPressedAt: press.time,
    zoomCaptureStartedAt: new Date(zoomedStarted).toISOString(),
  }
}

function verify(directory, { requirePresentation = false } = {}) {
  const files = filesUnder(directory)
  const unique = name => {
    const found = files.filter(file => path.basename(file) === name)
    if (found.length !== 1) throw new Error(`Expected one ${name}, found ${found.length}`)
    return found[0]
  }
  const beforePath = unique('native-explore-globe.png')
  const afterPath = unique('native-explore-zoomed.png')
  const logPath = path.join(path.dirname(path.dirname(beforePath)), 'logs', 'maestro.log')
  const log = fs.readFileSync(logPath, 'utf8')
  const geometry = geometryFromLog(log)
  const pixels = compareZoom(PNG.sync.read(fs.readFileSync(beforePath)), PNG.sync.read(fs.readFileSync(afterPath)), geometry)
  let gesture = { available: false }
  if (files.some(file => path.basename(file) === 'native-explore-dragged.png')) {
    const zoomed = PNG.sync.read(fs.readFileSync(afterPath))
    const dragged = PNG.sync.read(fs.readFileSync(unique('native-explore-dragged.png')))
    const scrolled = PNG.sync.read(fs.readFileSync(unique('native-explore-page-scroll.png')))
    const globe = compareZoom(zoomed, dragged, geometry)
    const pageChangedDuringDrag = comparePageBand(zoomed, dragged, geometry)
    const pageChangedOutsideGlobe = comparePageBand(dragged, scrolled, geometry)
    gesture = { available: true, passed: globe.passed && pageChangedDuringDrag < .01 && pageChangedOutsideGlobe >= .05,
      globeChangedFraction: globe.changedFraction, pageChangedDuringDrag, pageChangedOutsideGlobe }
  }
  const evidenceDirectory = path.dirname(path.resolve(directory))
  const jsTrace = path.join(evidenceDirectory, 'native-atlas-diagnostic.json')
  const nativeTrace = path.join(evidenceDirectory, 'native-atlas-native.jsonl')
  let presentation = { available: false }
  if (requirePresentation || fs.existsSync(jsTrace) || fs.existsSync(nativeTrace)) {
    if (!fs.existsSync(jsTrace) || !fs.existsSync(nativeTrace)) throw new Error('Missing required native globe presentation traces')
    presentation = presentationEvidence(log, JSON.parse(fs.readFileSync(jsTrace, 'utf8')), fs.readFileSync(nativeTrace, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)))
  }
  return { ...pixels, passed: pixels.passed && (!presentation.available || presentation.passed) && (!gesture.available || gesture.passed), geometry, presentation, gesture }
}

if (require.main === module) {
  const [directory, reportPath, option] = process.argv.slice(2)
  if (!directory || !reportPath || (option && option !== '--require-presentation')) throw new Error('Usage: node scripts/verify-native-globe-zoom.cjs <native-flow-directory> <report.json> [--require-presentation]')
  let report
  try { report = verify(directory, { requirePresentation: option === '--require-presentation' }) } catch (error) { report = { passed: false, error: error.message } }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
  if (!report.passed) process.exitCode = 1
}

module.exports = { geometryFromLog, compareZoom, comparePageBand, presentationEvidence, verify }
