/** Add a diagnostic entry only to the disposable native-acceptance checkout. */
const fs = require('node:fs')
const path = require('node:path')

const ENTRY = 'native-asset-diagnostic-entry.cjs'
const REPORT = 'native-asset-diagnostic.json'

function prepareNativeAssetDiagnostic(projectRoot = path.resolve(__dirname, '../apps/mobile')) {
  const packagePath = path.join(projectRoot, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  if (manifest.main !== 'expo-router/entry' && manifest.main !== `./${ENTRY}`) {
    throw new Error(`Unexpected mobile entry: ${manifest.main}`)
  }
  // Delay diagnostic imports until the real entry has mounted, preserving the
  // application's initial asset registration order. Never included by EAS builds.
  const source = `require('expo-router/entry')
setTimeout(async () => {
  const report = { version: 1, delayMs: 5000, assets: {}, errors: [] }
  let FileSystem
  try {
    const { Image, Platform } = require('react-native')
    const registry = require('@react-native/assets-registry/registry')
    FileSystem = require('expo-file-system/legacy')
    report.platform = Platform.OS
    report.osVersion = Platform.Version
    const sources = {
      welcome: require('./assets/art/atlas-clay/welcome.png'),
      celebrate: require('./assets/art/atlas-clay/celebrate.png'),
      cloud: require('./assets/art/clay-clouds/backdrop.webp'),
      island: require('./assets/art/expedition/discovery-island.webp'),
      shop: require('./assets/icons/shop.png'),
    }
    for (const [name, handle] of Object.entries(sources)) {
      try {
        const metadata = typeof handle === 'number' ? registry.getAssetByID(handle) : null
        report.assets[name] = { handle, handleType: typeof handle,
          resolved: Image.resolveAssetSource(handle), metadata }
      } catch (error) {
        report.assets[name] = { handle, handleType: typeof handle, error: String(error) }
      }
    }
  } catch (error) {
    report.errors.push(String(error))
  }
  try {
    FileSystem = FileSystem || require('expo-file-system/legacy')
    if (!FileSystem.documentDirectory) throw new Error('No native document directory')
    await FileSystem.writeAsStringAsync(FileSystem.documentDirectory + '${REPORT}', JSON.stringify(report, null, 2))
    console.info('Native asset diagnostic saved')
  } catch (error) {
    console.error('Native asset diagnostic write failed', String(error))
  }
}, 5000)
`
  fs.writeFileSync(path.join(projectRoot, ENTRY), source)
  fs.writeFileSync(packagePath, JSON.stringify({ ...manifest, main: `./${ENTRY}` }, null, 2) + '\n')
  return { entry: path.join(projectRoot, ENTRY), report: REPORT }
}

if (require.main === module) {
  console.log(JSON.stringify(prepareNativeAssetDiagnostic()))
}

module.exports = { prepareNativeAssetDiagnostic }
