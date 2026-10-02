// Explicit layout fixture: actual ExploreAtlas, real pack names, native fontScale
// emulation and enlarged glyphs. The globe is replaced with a labeled placeholder.
const esbuild = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const root = path.resolve(__dirname, '..')
const build = path.join(root, 'node_modules/.cache/compact-explore-layout-fixture')
const out = path.join(root, 'docs/design/reviews/compact-explore-2026-10-02/native-layout-fixture')
const source = `
import React from 'react'
import { AppRegistry, Dimensions, Text, View } from 'react-native'
import { setLocale } from '@worldquest/i18n'
import { setAppearance } from '@worldquest/design'
import { ExploreAtlas } from './apps/mobile/src/features/atlas/ExploreAtlas'
import entities from './packages/content/packs/geography/entities.countries.v1.json'
import capitals from './packages/content/packs/geography/facts.capitals.v1.json'
const countries = entities.items.filter(item => ['GB','SE'].includes(item.id)).map(item => ({ id: item.id, name: item.names.sv, region: 'EU', flagPath: item.assets.flag.path }))
const names = { countryName: id => entities.items.find(item => item.id === id)?.names.sv, factValueName: id => capitals.items.find(item => item.id === id)?.value.names.sv }
setAppearance('dark')
const scale = Number(new URLSearchParams(location.search).get('scale') || 2)
Object.assign(Dimensions.get('window'), { fontScale: scale })
function App() { return <View style={{ padding:16, gap:12 }} testID="layout-fixture"><Text>Layout fixture Â· native fontScale {scale}, doubled glyphs Â· globe placeholder</Text><ExploreAtlas countries={countries} names={names} selected="GB" onSelect={()=>{}} region={null} onRegion={()=>{}} matches={[]} onOpenCountry={()=>{ window.openCount=(window.openCount||0)+1 }}/></View> }
setLocale('sv').then(() => { AppRegistry.registerComponent('CountryLayoutFixture', () => App); AppRegistry.runApplication('CountryLayoutFixture',{rootTag:document.getElementById('root')}) })
`
;(async () => {
  fs.mkdirSync(out, { recursive:true })
  await esbuild.build({ stdin: { contents:source, loader:'tsx', resolveDir:root, sourcefile:'compact-explore-layout-fixture.tsx' }, bundle:true, platform:'browser', format:'iife', jsx:'automatic',
    resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'],
    alias:{ 'react-native':'react-native-web', '@worldquest/design':path.join(root,'packages/design/src/index.ts'), '@worldquest/i18n':path.join(root,'packages/i18n/src/index.ts'), '@worldquest/engines':path.join(root,'packages/engines/src/index.ts'), 'expo-linear-gradient':path.join(root,'scripts/screenshot/linear-gradient-web.tsx') },
    define:{ __DEV__:'false','process.env.NODE_ENV':'"production"' }, loader:{'.png':'file','.webp':'file'}, assetNames:'assets/[name]-[hash]', outdir:build,
    plugins:[{ name:'labeled-globe-placeholder',setup(b) { b.onResolve({filter:/\/WorldAtlasView\.js$/},()=>({path:'globe-placeholder',namespace:'fixture'})); b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'import {View,Text} from "react-native"; export function WorldAtlasView(){return <View style={{height:48,justifyContent:"center"}}><Text>Globe placeholder â€” card layout fixture only</Text></View>}',loader:'jsx',resolveDir:root})) } }],
  })
  const fontRoot = path.dirname(require.resolve('@expo-google-fonts/nunito/package.json',{paths:[path.join(root,'apps/mobile')]}))
  const fonts=['400Regular','600SemiBold','700Bold','800ExtraBold','900Black'].map(weight=>{const name='Nunito_'+weight;return '@font-face{font-family:'+name+';src:url(data:font/ttf;base64,'+fs.readFileSync(path.join(fontRoot,weight,name+'.ttf')).toString('base64')+')}'}).join('')
  const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+fonts+'body{margin:0;background:#0A1F33;color:white}</style></head><body><div id="root"></div><script src="/stdin.js"></script></body></html>'
  const server=http.createServer((req,res)=>{const file=path.join(build,decodeURIComponent(req.url.split('?')[0]));const exists=file.startsWith(build)&&fs.existsSync(file)&&fs.statSync(file).isFile();res.setHeader('Content-Type',exists ? ({'.js':'text/javascript','.png':'image/png','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream'):'text/html');res.end(exists?fs.readFileSync(file):html)})
  await new Promise(r=>server.listen(4191,'127.0.0.1',r))
  const browser=await chromium.launch(launchOptions())
  const report={ fixture:true, description:'Actual ExploreAtlas. Native fontScale=2 simulated before mount; glyphs doubled separately because RNW does not apply native text scaling. Real pack names. Globe placeholder; no account or reward persistence.',cases:[],errors:[] }
  try { for(const width of [320,390,768]) {
    const page=await browser.newPage({viewport:{width,height:1100},deviceScaleFactor:2,reducedMotion:'reduce'})
    page.on('pageerror',error=>report.errors.push(String(error)))
    await page.goto('http://127.0.0.1:4191/?scale=2');await page.getByTestId('explore-atlas-card').waitFor();await page.evaluate(()=>document.fonts.ready)
    await page.evaluate(()=>{const sizes=[...document.querySelectorAll('[dir="auto"]')].map(node=>({node,font:parseFloat(getComputedStyle(node).fontSize),line:parseFloat(getComputedStyle(node).lineHeight)}));for(const{node,font,line}of sizes){if(Number.isFinite(font))node.style.fontSize=font*2+'px';if(Number.isFinite(line))node.style.lineHeight=line*2+'px'}})
    const card=page.getByTestId('explore-atlas-card')
    await card.screenshot({path:path.join(out,`country-sv-fontScale2-${width}.png`)})
    const metrics=await card.evaluate(el=>{const bound=el.getBoundingClientRect();return{width:bound.width,height:bound.height,scrollWidth:el.scrollWidth,cardText:el.textContent,transform:getComputedStyle(el).transform}})
    assert.equal(metrics.scrollWidth<=metrics.width+1,true)
    assert.match(metrics.cardText,/Storbritannien/)
    await page.getByTestId('explore-atlas-open').click()
    assert.equal(await page.evaluate(()=>window.openCount),1)
    report.cases.push({width,nativeFontScale:2,glyphScale:2,metrics,openWorks:true});await page.close()
  }
  assert.deepEqual(report.errors,[])
  } finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r))}
  console.log(JSON.stringify(report,null,2))
})().catch(error=>{console.error(error);process.exitCode=1})
