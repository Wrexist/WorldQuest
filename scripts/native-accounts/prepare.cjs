const fs = require('node:fs')
if (process.env.CI !== 'true') throw new Error('Use isolated CI for native account acceptance')
const pkg = JSON.parse(fs.readFileSync('apps/mobile/package.json', 'utf8'))
const config = JSON.parse(fs.readFileSync('apps/mobile/app.json', 'utf8'))
pkg.main = '../../scripts/native-accounts/probe.tsx'
config.expo.name = 'WorldQuest Account Proof'
config.expo.slug = 'worldquest-account-proof'
config.expo.scheme = 'worldquestaccountsproof'
config.expo.ios.bundleIdentifier = 'com.wrexist.worldquest.accountsproof'
config.expo.android.package = 'com.wrexist.worldquest.accountsproof'
config.expo.ios.infoPlist = { ...config.expo.ios.infoPlist,
  NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } }
delete config.expo.extra
fs.writeFileSync('apps/mobile/package.json', JSON.stringify(pkg, null, 2) + '\n')
fs.writeFileSync('apps/mobile/app.json', JSON.stringify(config, null, 2) + '\n')
console.log('Prepared separate native account proof with synthetic loopback backend')
