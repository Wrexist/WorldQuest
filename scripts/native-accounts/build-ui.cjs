const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const target = 'node_modules/.cache/d1-account-ui'
async function main() {
  fs.mkdirSync(target, { recursive: true })
  await build({ entryPoints: ['scripts/native-accounts/ui.tsx'], outfile: target + '/ui.js', bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
    alias: { 'react-native': 'react-native-web', '@worldquest/design': path.resolve('packages/design/src/index.ts'), '@worldquest/i18n': path.resolve('packages/i18n/src/index.ts'),
      'expo-linear-gradient': path.resolve('scripts/screenshot/linear-gradient-web.tsx') }, loader: { '.png': 'dataurl', '.webp': 'dataurl', '.js': 'jsx' },
    define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"' },
  })
  const fontRoot = path.dirname(require.resolve('@expo-google-fonts/nunito/package.json', { paths: [path.resolve('apps/mobile')] }))
  let css = ''
  for (const directory of fs.readdirSync(fontRoot)) {
    if (!/^\d+/.test(directory)) continue
    const folder = path.join(fontRoot, directory)
    if (!fs.statSync(folder).isDirectory()) continue
    for (const file of fs.readdirSync(folder).filter(file => file.endsWith('.ttf'))) {
      const family = file.replace('.ttf', '')
      css += `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${fs.readFileSync(path.join(folder,file)).toString('base64')})}`
    }
  }
  fs.writeFileSync(target + '/index.html', `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{margin:0;height:100%;min-width:0;display:flex;flex:1}body{overflow:hidden}</style></head><body><div id="root"></div><script src="/__proof/ui.js"></script></body></html>`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
