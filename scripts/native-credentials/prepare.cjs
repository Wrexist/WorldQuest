// CI-only application: never ship this entry point or install it over WorldQuest.
const fs = require('node:fs')
if (process.env.CI !== 'true') throw new Error('Use an isolated CI checkout for the credential proof')
const packagePath = 'apps/mobile/package.json'
const configPath = 'apps/mobile/app.json'
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
pkg.main = '../../scripts/native-credentials/probe.tsx'
config.expo.name = 'WorldQuest Credential Proof'
config.expo.slug = 'worldquest-credential-proof'
config.expo.scheme = 'worldquestcredentialsproof'
config.expo.ios.bundleIdentifier = 'com.wrexist.worldquest.credentialsproof'
config.expo.android.package = 'com.wrexist.worldquest.credentialsproof'
delete config.expo.extra
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
console.log('Prepared isolated credential proof; separate app ID, no backend or store submission')
