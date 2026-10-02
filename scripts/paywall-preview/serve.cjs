/** Local presentation harness. Sample products are never installed in the app runtime. */
const esbuild = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const root = path.resolve(__dirname, '../..')
const out = path.join(root, 'node_modules/.cache/paywall-preview')
async function main() {
  fs.mkdirSync(out, { recursive: true })
  await esbuild.build({ entryPoints:[path.join(__dirname,'entry.tsx')],bundle:true,format:'esm',platform:'browser',jsx:'automatic',outfile:path.join(out,'app.js'),
    alias:{ 'react-native':'react-native-web', '@worldquest/design':path.join(root,'packages/design/src/index.ts'), '@worldquest/i18n':path.join(root,'packages/i18n/src/index.ts'), '@worldquest/analytics':path.join(root,'packages/analytics/src/index.ts') },
    define:{ 'process.env':'{}', __DEV__:'false', 'process.env.NODE_ENV':'"development"', 'process.env.EXPO_PUBLIC_PRIVACY_URL':'undefined', 'process.env.EXPO_PUBLIC_TERMS_URL':'undefined' },
    resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.js','.json'],
    loader:{ '.js':'jsx', '.png':'dataurl','.webp':'file' }, assetNames:'assets/[name]-[hash]',
    plugins:[{name:'preview-haptics',setup(build){build.onResolve({filter:/lib\/haptics\.js$/},()=>({path:path.join(__dirname,'haptics.ts')}))}}],
  })
  const fonts=path.dirname(require.resolve('@expo-google-fonts/nunito/package.json',{paths:[path.join(root,'apps/mobile')]}))
  const families=['400Regular','600SemiBold','700Bold','800ExtraBold','900Black']
  const css=families.map(weight=>{const name='Nunito_'+weight;fs.copyFileSync(path.join(fonts,weight,name+'.ttf'),path.join(out,name+'.ttf'));return `@font-face{font-family:${name};src:url('/${name}.ttf')}`}).join('')
  fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WorldQuest · Premium motion preview</title><style>${css}html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`)
  http.createServer((req,res)=>{let file=path.resolve(out,'.'+new URL(req.url,'http://localhost').pathname);if(file===out)file=path.join(out,'index.html');if(!file.startsWith(out+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.webp':'image/webp','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)}).listen(4196,'127.0.0.1',()=>console.log('Paywall preview: http://localhost:4196'))
}
main().catch(e=>{console.error(e);process.exit(1)})
