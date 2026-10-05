/** Instrument only a disposable native-acceptance checkout; never an EAS entry. */
const fs = require('node:fs')
const path = require('node:path')

const ENTRY = 'native-link-diagnostic-entry.cjs'
const RUNTIME = 'native-link-diagnostic-runtime.cjs'
const REPORT = 'native-link-diagnostic.json'
const ORIGINAL_DELEGATE = 'native-link-diagnostic-AppDelegate.original.swift'
const SYNTHETIC_URL = 'worldquest://country/%53%45'

function prepareEntry(projectRoot) {
  const packagePath = path.join(projectRoot, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  if (manifest.main !== 'expo-router/entry') throw new Error('Link diagnostic requires the unmodified production entry')
  const intentPath = path.join(projectRoot, 'app/+native-intent.ts')
  if (fs.existsSync(intentPath)) throw new Error('Refusing to replace an existing native intent handler')

  // This module has no native imports until initialize(). The router may load its
  // pass-through intent probe during startup without changing asset import order.
  const runtime = `const report = { version: 1, events: [] }
const fixedURL = '${SYNTHETIC_URL}'
const paths = new Set(['/', '/onboarding', '/lesson', '/country/SE', '/country/%53%45', '/welcome-back', '/account', '/explore', '/quests', '/profile', '/shop'])
const routeNames = new Set(['__root', 'root', '(tabs)', '(auth)', 'index', 'country/[code]', 'lesson', 'onboarding', 'welcome-back', 'account', 'explore', 'quests', 'profile', 'shop', '+not-found', '+sitemap'])
const safePath = value => paths.has(value) ? value : value == null ? null : '[redacted]'
const safeURL = value => value === fixedURL || value === 'worldquest://country/SE' ? value : value == null ? null : '[redacted]'
let FileSystem
let store
let writes = Promise.resolve()
function save() {
  if (!FileSystem || !FileSystem.documentDirectory) return
  const body = JSON.stringify(report, null, 2)
  writes = writes.then(() => FileSystem.writeAsStringAsync(FileSystem.documentDirectory + '${REPORT}', body)).catch(() => {})
}
function record(kind, fields = {}) {
  report.events.push({ time: new Date().toISOString(), kind, ...fields })
  if (report.events.length > 160) report.events.shift()
  save()
}
function routeState(state, depth = 0) {
  if (!state || depth > 5) return null
  return { index: state.index ?? null, routeNames: state.routeNames?.map(name => routeNames.has(name) ? name : '[redacted]'),
    routes: state.routes?.map(route => ({ name: routeNames.has(route.name) ? route.name : '[redacted]',
      ...(route.params?.code === 'SE' || route.params?.code === '%53%45' ? { code: route.params.code } : {}),
      ...(route.state ? { state: routeState(route.state, depth + 1) } : {}) })) }
}
function snapshot(kind) {
  record(kind, { pathname: safePath(store?.getRouteInfo()?.pathname),
    ready: store?.navigationRef?.isReady?.() ?? false,
    state: routeState(store?.navigationRef?.getRootState?.()) })
}
function inspectSyntheticURL() {
  try {
    const { extractExpoPathFromURL } = require('expo-router/build/fork/extractPathFromURL')
    const extracted = extractExpoPathFromURL([], fixedURL)
    const parsed = store?.linking?.getStateFromPath(extracted, store.linking.config)
    record('synthetic-parser', { extracted: safePath('/' + extracted),
      expoURLPolyfill: globalThis.URL?.[Symbol.for('expo.builtin')] === true,
      parsed: routeState(parsed) })
  } catch (error) { record('synthetic-parser-error', { errorType: error?.name || 'Error' }) }
}
function intent(path, initial) {
  record('router-redirectSystemPath', { url: safeURL(path), initial })
  return path
}
function initialize() {
  try {
    FileSystem = require('expo-file-system/legacy')
    const { Linking, AppState } = require('react-native')
    store = require('expo-router/build/global-state/router-store').store
    record('initialized')
    Linking.addEventListener('url', ({ url }) => {
      record('rn-linking-url', { url: safeURL(url) })
      if (url === fixedURL || url === 'worldquest://country/SE') {
        snapshot('before-link-navigation')
        inspectSyntheticURL()
        setTimeout(() => snapshot('after-link-navigation'), 1000)
      }
    })
    const ExpoLinking = require('expo-linking/build/ExpoLinking').default
    ExpoLinking.addListener('onURLReceived', ({ url }) => record('expo-linking-native-url', { url: safeURL(url) }))
    record('expo-initial-url', { url: safeURL(ExpoLinking.getLinkingURL()) })
    AppState.addEventListener('change', state => record('app-state', { state }))
    let attempts = 0
    function subscribe() {
      if (!store.navigationRef?.isReady?.()) {
        if (++attempts < 100) setTimeout(subscribe, 100)
        else record('navigation-not-ready')
        return
      }
      store.navigationRef.addListener('state', () => snapshot('navigation-state'))
      snapshot('navigation-subscribed')
      inspectSyntheticURL()
    }
    subscribe()
  } catch (error) { record('initialization-error', { errorType: error?.name || 'Error' }) }
}
module.exports = { intent, initialize }
`
  fs.writeFileSync(path.join(projectRoot, RUNTIME), runtime)
  fs.writeFileSync(path.join(projectRoot, ENTRY), `require('expo-router/entry')\nsetTimeout(() => require('./${RUNTIME}').initialize(), 5000)\n`)
  fs.writeFileSync(intentPath, `// Generated only in the disposable native-acceptance checkout.\nconst diagnostic = require('../${RUNTIME}')\nexport function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {\n  return diagnostic.intent(path, initial)\n}\n`)
  fs.writeFileSync(packagePath, JSON.stringify({ ...manifest, main: `./${ENTRY}` }, null, 2) + '\n')
  return { entry: ENTRY, report: REPORT }
}

function prepareNative(projectRoot) {
  const delegatePath = path.join(projectRoot, 'ios/WorldQuest/AppDelegate.swift')
  const original = fs.readFileSync(delegatePath, 'utf8')
  const anchor = 'return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)'
  if (original.split(anchor).length !== 2) throw new Error('Unexpected generated AppDelegate URL forwarding; refusing to change it')
  const originalPath = path.join(projectRoot, ORIGINAL_DELEGATE)
  if (fs.existsSync(originalPath)) throw new Error('Original AppDelegate already preserved')
  fs.writeFileSync(originalPath, original)
  const probe = `let diagnosticURL = url.absoluteString == "${SYNTHETIC_URL}" || url.absoluteString == "worldquest://country/SE" ? url.absoluteString : "[redacted]"
    NSLog("WQ_LINK_DIAGNOSTIC native-open-url %@", diagnosticURL)
    ${anchor}`
  fs.writeFileSync(delegatePath, original.replace(anchor, probe))
  return { originalDelegate: originalPath, delegate: delegatePath }
}

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '../apps/mobile')
  const phase = process.argv[2]
  if (phase !== 'entry' && phase !== 'native') throw new Error('Usage: node scripts/native-link-diagnostic.cjs entry|native')
  console.log(JSON.stringify(phase === 'entry' ? prepareEntry(projectRoot) : prepareNative(projectRoot)))
}

module.exports = { prepareEntry, prepareNative }
