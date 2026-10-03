// Layout fixture only: real components with labeled synthetic props, native fontScale
// emulation plus enlarged glyphs. It never reads or seeds a user account.
const esbuild = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const root = path.resolve(__dirname, '..')
const build = path.join(root, 'node_modules/.cache/compact-app-layout-fixture')
const out = path.resolve(process.env.WQ_REVIEW_OUT || path.join(root, 'docs/design/reviews/compact-app-2026-10-02/native-layout-fixture'))
const source = `
import React, { useState } from 'react'
import { AppRegistry, Dimensions, Text, View } from 'react-native'
import { setLocale } from '@worldquest/i18n'
import { setAppearance, setAppReducedMotion } from '@worldquest/design'
import { ProfileScreen } from './apps/mobile/src/features/profile/ProfileScreen'
import { ShopScreen } from './apps/mobile/src/features/shop/ShopScreen'
import { QuestScreen } from './apps/mobile/src/features/quests/QuestScreen'
import { CATALOGUE } from './apps/mobile/src/features/shop/catalogue'
const params = new URLSearchParams(location.search)
const state = params.get('screen') || 'quests'
const scale = Number(params.get('scale') || 2)
setAppearance('dark'); setAppReducedMotion(true)
Object.assign(Dimensions.get('window'), { fontScale: scale })
const action = name => () => { window.fixtureActions = [...(window.fixtureActions || []), name] }
const stats = { xpTotal:4820, coins:430, streak:12, longestStreak:31, factsMastered:7 }
const world = { regions:[{ region:'EU',entitiesTotal:4,entitiesComplete:2,entitiesStarted:4,factsTotal:8,factsLearned:6,factsDue:1,fraction:0.75 }], entitiesTotal:4,entitiesComplete:2,factsTotal:8,factsLearned:6,factsDue:1,fraction:0.75 }
const quest = { id:'layout-fixture:2026-10-02',date:'2026-10-02',tasks:[
  {slot:'locate',target:4,factIds:['a'],progress:2,complete:false},
  {slot:'recognise',target:4,factIds:['b'],progress:4,complete:true},
  {slot:'recall',target:4,factIds:['c'],progress:0,complete:false},
  {slot:'discover',target:2,factIds:['d'],progress:0,complete:false},
  {slot:'perform',target:1,factIds:[],goal:'perfect_lesson',progress:0,complete:false},
], complete:false,bonusClaimed:false }
function App() {
  const [equippedId,setEquippedId] = useState(null)
  return <View style={{ height:'100vh',backgroundColor:'#0A1F33' }} testID="layout-fixture">
    <View style={{flex:1}}>
      {state === 'quests' ? <QuestScreen quest={quest} loading={false} onStart={action('continue-quest')} onOpenAchievements={action('achievements')} onOpenStreak={action('streak')} coins={430} streak={12} />
      : state === 'shop' ? <ShopScreen catalogue={CATALOGUE} coins={430} owned={new Set([CATALOGUE[0].id])} equippedId={equippedId} levelTitleKey="titles:wanderer" loading={false} isOffline={false} onBuy={action('buy')} onEquip={id=>{setEquippedId(id);action('equip')()}} onOpenStreak={action('streak')} streak={12} />
      : <ProfileScreen stats={state === 'profile-guest' ? null : stats} world={state === 'profile-guest' ? null : world} loading={false} onStartLesson={action('start-lesson')} onOpenSettings={action('settings')} onRename={action('rename')} onOpenAchievements={action('achievements')} onCreateAccount={action('account')} />}
    </View>
    <View style={{height:80,justifyContent:'center',padding:12,borderTopWidth:1,borderColor:'#34536A'}}><Text style={{color:'white',fontSize:12}} dataSet={{maxScale:1}}>LAYOUT FIXTURE · synthetic state · {state} · fontScale {scale}. Reserved navigation area.</Text></View>
  </View>
}
setLocale('sv').then(() => { AppRegistry.registerComponent('CompactAppFixture', () => App); AppRegistry.runApplication('CompactAppFixture', {rootTag:document.getElementById('root')}) })
`
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  await esbuild.build({ stdin: { contents: source, loader: 'tsx', resolveDir: root, sourcefile: 'compact-app-layout-fixture.tsx' }, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: { 'react-native': 'react-native-web', '@worldquest/design': path.join(root, 'packages/design/src/index.ts'), '@worldquest/i18n': path.join(root, 'packages/i18n/src/index.ts'), '@worldquest/engines': path.join(root, 'packages/engines/src/index.ts'), 'expo-linear-gradient': path.join(root, 'scripts/screenshot/linear-gradient-web.tsx') },
    define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"', 'process.env': '{}', global: 'globalThis' }, loader: { '.png': 'file', '.webp': 'file' }, assetNames: 'assets/[name]-[hash]', outdir: build,
    // Profile imports Explore's region constants. No reviewed screen renders a globe.
    plugins: [{ name: 'unused-globe-exclusion', setup(build) { build.onResolve({ filter: /\/WorldAtlasView\.js$/ }, () => ({ path: 'unused-globe', namespace: 'fixture' })); build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function WorldAtlasView(){throw new Error("Globe must not render in compact screen fixture")}', loader: 'js' })) } }],
  })
  const fontRoot = path.dirname(require.resolve('@expo-google-fonts/nunito/package.json', { paths: [path.join(root, 'apps/mobile')] }))
  const fonts = ['400Regular', '600SemiBold', '700Bold', '800ExtraBold', '900Black'].map(weight => { const name = 'Nunito_' + weight; return '@font-face{font-family:' + name + ';src:url(data:font/ttf;base64,' + fs.readFileSync(path.join(fontRoot, weight, name + '.ttf')).toString('base64') + ')}' }).join('')
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + fonts + 'html,body,#root{margin:0;width:100%;height:100%;background:#0A1F33;color:white}</style></head><body><div id="root"></div><script src="/stdin.js"></script></body></html>'
  const server = http.createServer((req, res) => { const file = path.join(build, decodeURIComponent(req.url.split('?')[0])); const exists = file.startsWith(build) && fs.existsSync(file) && fs.statSync(file).isFile(); res.setHeader('Content-Type', exists ? ({ '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file)] || 'application/octet-stream') : 'text/html'); res.end(exists ? fs.readFileSync(file) : html) })
  await new Promise(resolve => server.listen(4225, '127.0.0.1', resolve))
  const browser = await chromium.launch(launchOptions())
  const report = { fixture: true, description: 'Actual ProfileScreen/ShopScreen/QuestScreen with explicitly synthetic props. Native fontScale=2 simulated before mount and glyphs doubled separately (RNW does not apply native scaling). Swedish dark reduced motion. Reserved navigation block is a placeholder. No account persistence, economy or server proof.', cases: [], errors: [] }
  try {
    for (const width of [320, 390, 768]) for (const screen of ['quests', 'shop', 'profile-guest', 'profile']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
      page.on('pageerror', error => report.errors.push(String(error)))
      await page.goto(`http://127.0.0.1:4225/?screen=${screen}&scale=2`)
      await page.getByTestId('layout-fixture').waitFor(); await page.evaluate(() => document.fonts.ready)
      await page.evaluate(() => { const list = [...document.querySelectorAll('[dir="auto"]')].map(node => ({ node, size: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight), scale: Math.min(2, Number(node.closest('[data-max-scale]')?.getAttribute('data-max-scale') || 2)) })); for (const { node, size, line, scale } of list) { if (Number.isFinite(size)) node.style.fontSize = size * scale + 'px'; if (Number.isFinite(line)) node.style.lineHeight = line * scale + 'px' } })
      await page.screenshot({ path: path.join(out, `${screen}-sv-dark-fontScale2-${width}.png`) })
      const measure = await page.evaluate(() => {
        const overflow = []
        const walker = document.createTreeWalker(document.querySelector('[data-testid="layout-fixture"]'), NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) { const node = walker.currentNode; if (node.parentElement.closest('[aria-hidden="true"]')) continue; const range = document.createRange(); range.selectNodeContents(node); for (const b of range.getClientRects()) if (b.width && (b.left < -1 || b.right > innerWidth + 1)) overflow.push(node.textContent) }
        const controls = [...document.querySelectorAll('[role="button"]')].filter(node => !node.closest('[aria-hidden="true"]')).map(node => { const b = node.getBoundingClientRect(); return { label: node.getAttribute('aria-label') || node.textContent, width: b.width, height: b.height } })
        const blocks = [...document.querySelectorAll('[data-testid="quest-treasure-card"],[data-testid="profile-passport"],[data-testid="coin-wallet"]')].map(node => { const b = node.getBoundingClientRect(); return { id: node.dataset.testid, height: b.height, width: b.width } })
        return { pageOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), textOutsideViewport: [...new Set(overflow)], undersizedControls: controls.filter(b => b.width > 0 && (b.width < 43.5 || b.height < 43.5)), blocks }
      })
      const elements = []
      const targets = screen === 'quests' ? [['treasure', page.getByTestId('quest-treasure-card')]]
        : screen === 'profile' ? [['passport', page.getByTestId('profile-passport')], ['companion', page.getByTestId('atlas-companion')], ['stats', page.getByText('Bemästrade fakta', { exact: true }).locator('..').locator('..')]]
        : screen === 'shop' ? [['freeze', page.getByTestId('shop-freeze')], ['wallet', page.getByTestId('coin-wallet')]] : []
      for (const [name, target] of targets) {
        await target.screenshot({ path: path.join(out, `${screen}-${name}-full-sv-dark-fontScale2-${width}.png`) })
        elements.push(await target.evaluate((node, name) => {
          const boundary = node.getBoundingClientRect(), outside = [], walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
          while (walker.nextNode()) { const child = walker.currentNode; if (child.parentElement.closest('[aria-hidden="true"]')) continue; const range = document.createRange(); range.selectNodeContents(child); for (const box of range.getClientRects()) if (box.width && (box.left < boundary.left - 1 || box.right > boundary.right + 1 || box.top < boundary.top - 1 || box.bottom > boundary.bottom + 1)) outside.push(child.textContent) }
          return { name, width: boundary.width, height: boundary.height, textOutsideElement: [...new Set(outside)] }
        }, name))
      }
      report.cases.push({ width, screen, nativeFontScale: 2, glyphScale: 2, measure, elements })
      if (screen === 'profile') { await page.getByText('Bemästrade fakta', { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `profile-stats-sv-dark-fontScale2-${width}.png`) }) }
      if (screen === 'quests') { const next = page.getByRole('button', { name: /^Fortsätt uppdraget/ }); await next.click(); assert.ok((await page.evaluate(() => window.fixtureActions)).includes('continue-quest')) }
      if (screen === 'profile-guest') { await page.getByRole('button', { name: 'Starta en lektion', exact: true }).click(); assert.ok((await page.evaluate(() => window.fixtureActions)).includes('start-lesson')) }
      if (screen === 'shop') { const wear = page.getByRole('button', { name: 'Bär den', exact: true }).first(); assert.ok(await wear.count()); await wear.click(); assert.ok((await page.evaluate(() => window.fixtureActions)).includes('equip')); await page.getByTestId('shop-title-confirmed').waitFor() }
      await page.close()
    }
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.cases.filter(item => item.measure.pageOverflow || item.measure.textOutsideViewport.length || item.measure.undersizedControls.length), [], 'All native fontScale fixture layouts must fit')
    assert.deepEqual(report.cases.flatMap(item => item.elements).filter(element => element.textOutsideElement.length), [], 'Full elements must contain their text')
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); await new Promise(resolve => server.close(resolve)) }
  console.log(JSON.stringify({ cases: report.cases.length, errors: report.errors }, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
