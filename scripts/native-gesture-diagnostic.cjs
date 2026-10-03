// Disposable simulator instrumentation; never included in a release bundle.
const fs = require('node:fs')
const path = require('node:path')
if (process.env.CI !== 'true' || process.env.GITHUB_WORKFLOW !== 'iOS journey replay') throw new Error('Simulator CI only')
const root = path.resolve(__dirname, '../apps/mobile')
const file = path.join(root, 'src/features/atlas/WorldAtlasView.tsx')
let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
function replace(before, after) {
  if (source.split(before).length !== 2) throw new Error('Gesture diagnostic anchor changed: ' + before)
  source = source.replace(before, after)
}
replace('  const responder = useMemo(', `  const traceGesture = (kind: string, e?: GestureResponderEvent, state?: { dx: number; dy: number }) => {
    const n = e?.nativeEvent
    require('../../../native-gesture-runtime.cjs').record({ kind, mode: specRef.current.mode, status: statusRef.current,
      pageX: n?.pageX, pageY: n?.pageY, locationX: n?.locationX, locationY: n?.locationY,
      touches: n?.touches?.map(t => ({ x: t.pageX, y: t.pageY })), dx: state?.dx, dy: state?.dy,
      camera: cameraRef.current, displayed: displayedCamera.current, frame: frame.current,
      flight: flight.current !== null, dirty: dirty.current, foreground: foreground.current,
      size: sizeRef.current, interaction: specRef.current.interaction })
  }
  const responder = useMemo(`)
replace('        onPanResponderGrant: (e) => {', "        onPanResponderGrant: (e) => {\n          traceGesture('grant', e)")
replace('        onPanResponderMove: (e, state) => {', "        onPanResponderMove: (e, state) => {\n          traceGesture('move', e, state)")
replace('        onPanResponderRelease: () => {', "        onPanResponderRelease: () => {\n          traceGesture('release')")
replace('        onPanResponderTerminate: endGesture,', "        onPanResponderTerminate: () => { traceGesture('terminate'); endGesture() },")
replace('      const renderedCamera = cameraRef.current', "      const renderedCamera = cameraRef.current\n      require('../../../native-gesture-runtime.cjs').record({kind:'render-start',camera:renderedCamera})")
replace('      const complete = () => {', "      const complete = () => {\n        require('../../../native-gesture-runtime.cjs').record({kind:'render-complete',camera:renderedCamera})")
fs.writeFileSync(file, source)
fs.writeFileSync(path.join(root, 'native-gesture-runtime.cjs'), `const F = require('expo-file-system/legacy')
const destination = F.documentDirectory + 'native-gesture.json'
let events = []
let writes = F.readAsStringAsync(destination).then(t => { events = JSON.parse(t) }).catch(() => {})
exports.record = fields => { writes = writes.then(() => { if(events.length >= 500) return; events.push({time: Date.now(), ...fields}); return F.writeAsStringAsync(destination, JSON.stringify(events)) }).catch(() => {}) }
`)
