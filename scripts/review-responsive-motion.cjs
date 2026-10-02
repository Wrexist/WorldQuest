// Focused exported-app interactions plus explicitly labelled component fixtures.
// No account data is seeded; weekly counts and gem history exist only in the fixture.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const esbuild = require('esbuild')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { browserContext, assertRoute } = require('./lib/browser-harness.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')
const root = path.resolve(__dirname, '..')
const web = path.resolve(process.argv[2] || 'node_modules/.cache/wq-responsive-motion-web')
const out = path.resolve(process.env.WQ_REVIEW_OUT || 'docs/design/reviews/responsive-motion-2026-10-02')
const build = path.join(root, 'node_modules/.cache/responsive-motion-fixture')
const port = Number(process.env.WQ_REVIEW_PORT || 4233)
const base = `http://127.0.0.1:${port}`
const report = process.argv.includes('--resume') && fs.existsSync(path.join(out, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')) : { export: web, seededAccount: false, cases: [], errors: [], limitations: [
  'Chromium/react-native-web; no physical device, native frame-time or haptic proof.',
  'Weekly updates and 16 gem dates are labelled synthetic component fixtures, not earned account state.',
  'Fixture gradients use the existing screenshot adapter. Reduced fixture includes simulated native fontScale=2 and doubled rendered glyphs; it is not OS Dynamic Type.',
] }
const fixture = `
import React, { useState } from 'react'
import { AppRegistry, Dimensions, Text, View } from 'react-native'
import { Button, Card, setAppearance, setAppReducedMotion, space, text, useTheme } from '@worldquest/design'
import { setLocale } from '@worldquest/i18n'
import { WeekStrip } from './apps/mobile/src/components/WeekStrip'
import { StreakGemCollection } from './apps/mobile/src/features/streak/StreakGemCollection'
const params = new URLSearchParams(location.search)
const reduced = params.get('reduced') === 'true'
setAppearance(reduced ? 'dark' : 'light'); setAppReducedMotion(reduced)
Object.assign(Dimensions.get('window'), { fontScale: reduced ? 2 : 1 })
const days = Array.from({ length:16 }, (_,i) => '2026-09-' + String(i+1).padStart(2,'0'))
function App() {
  const { colors } = useTheme()
  const [count, setCount] = useState(1)
  const [actions, setActions] = useState(0)
  const labels = reduced ? ['L','S','M','T','O','T','F'] : ['S','S','M','T','W','T','F']
  const week = [0,0,2,0,0,0,count].map((count,index) => ({day:labels[index],count}))
  return <View testID="responsive-motion-fixture" style={{padding:space[4],gap:space[4],backgroundColor:colors.bg.canvas,minHeight:'100vh'}}>
    <Text dataSet={{maxScale:1}} style={[text('caption'),{color:colors.text.secondary}]}>COMPONENT FIXTURE · synthetic weekly counts and 16 gem dates · {reduced ? 'Swedish / dark / reduced / fontScale 2' : 'English / light / normal'}</Text>
    <Card testID="weekly-fixture" style={{gap:space[3]}}>
      <Text style={[text('h3'),{color:colors.text.primary}]}>{reduced ? 'Denna vecka' : 'This week'}</Text>
      <WeekStrip week={week} />
      <View style={{gap:space[2]}}>
        <Button label="Update synthetic Friday" testID="fixture-week-update" onPress={()=>setCount(value=>value===1?2:1)} />
        <Button label="Check control response" testID="fixture-action" variant="secondary" onPress={()=>setActions(value=>value+1)} />
      </View>
      <Text testID="fixture-count" dataSet={{maxScale:1}} style={[text('caption'),{color:colors.text.secondary}]}>Friday: {count}; actions: {actions}</Text>
    </Card>
    <StreakGemCollection days={days} />
  </View>
}
setLocale(reduced ? 'sv' : 'en').then(()=>{AppRegistry.registerComponent('ResponsiveMotionFixture',()=>App);AppRegistry.runApplication('ResponsiveMotionFixture',{rootTag:document.getElementById('root')})})
`
async function buildFixture() {
  await esbuild.build({ stdin: { contents: fixture, loader: 'tsx', resolveDir: root, sourcefile: 'responsive-motion-fixture.tsx' }, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: { 'react-native': 'react-native-web', '@worldquest/design': path.join(root, 'packages/design/src/index.ts'), '@worldquest/i18n': path.join(root, 'packages/i18n/src/index.ts'), '@worldquest/engines': path.join(root, 'packages/engines/src/index.ts'), 'expo-linear-gradient': path.join(root, 'scripts/screenshot/linear-gradient-web.tsx') },
    define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"', 'process.env': '{}', global: 'globalThis' }, loader: { '.png': 'file', '.webp': 'file' }, assetNames: 'assets/[name]-[hash]', outdir: build,
  })
  const fontRoot = path.dirname(require.resolve('@expo-google-fonts/nunito/package.json', { paths: [path.join(root, 'apps/mobile')] }))
  const fonts = ['400Regular', '600SemiBold', '700Bold', '800ExtraBold', '900Black'].map(weight => { const name = 'Nunito_' + weight; return '@font-face{font-family:' + name + ';src:url(data:font/ttf;base64,' + fs.readFileSync(path.join(fontRoot, weight, name + '.ttf')).toString('base64') + ')}' }).join('')
  fs.writeFileSync(path.join(build, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + fonts + 'html,body,#root{margin:0;width:100%;min-height:100%}</style></head><body><div id="root"></div><script src="/fixture/stdin.js"></script></body></html>')
  report.fixtureSources = Object.fromEntries(['apps/mobile/src/components/WeekStrip.tsx', 'apps/mobile/src/features/streak/StreakGemCollection.tsx', 'apps/mobile/src/components/SceneEntrance.tsx', 'packages/design/src/motion.ts'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]))
}
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf' }
const server = http.createServer((req, res) => {
  const route = decodeURIComponent(new URL(req.url, base).pathname)
  const fixtureRoute = route.startsWith('/fixture/')
  const directory = fixtureRoute ? build : web
  let file = path.resolve(directory, '.' + (fixtureRoute ? route.slice('/fixture'.length) : route))
  if (file !== directory && !file.startsWith(directory + path.sep)) { res.writeHead(403); res.end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(directory, 'index.html')
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
async function shot(page, name, locator) {
  const file = path.join(out, name + '.png')
  if (locator) await locator.screenshot({ path: file })
  else await page.screenshot({ path: file })
  return name + '.png'
}
async function metrics(page, scope = 'body') {
  return page.locator(scope).evaluate(node => {
    const controls = [...node.querySelectorAll('[role="button"],[role="tab"],button')].filter(el => !el.closest('[aria-hidden="true"]') && el.getBoundingClientRect().width)
    const targets = controls.map(el => { const b = el.getBoundingClientRect(); return { label: el.getAttribute('aria-label') || el.textContent, x: b.x, y: b.y, width: b.width, height: b.height } })
    return { sideways: Math.max(0, document.documentElement.scrollWidth - innerWidth), targets, smallTargets: targets.filter(b => b.width < 43.5 || b.height < 43.5) }
  })
}
async function beginTrace(page, selectors) {
  await page.evaluate(selectors => {
    window.motionTrace = []; window.motionTraceStart = performance.now()
    const frame = () => {
      const row = { time: performance.now() - window.motionTraceStart }
      for (const [key, selector] of Object.entries(selectors)) {
        const el = document.querySelector(selector)
        if (!el) { row[key] = null; continue }
        const b = el.getBoundingClientRect(), style = getComputedStyle(el)
        row[key] = { transform: style.transform, opacity: style.opacity, x: b.x, y: b.y, width: b.width, height: b.height, selected: el.getAttribute('aria-selected'), label: el.getAttribute('aria-label') }
      }
      window.motionTrace.push(row)
      if (row.time < 700) requestAnimationFrame(frame)
    }
    frame()
  }, selectors)
}
async function endTrace(page) { await page.waitForFunction(() => window.motionTrace.at(-1)?.time >= 700); return page.evaluate(() => window.motionTrace) }
const unique = (trace, key, prop) => [...new Set(trace.filter(row => row[key]).map(row => row[key][prop]))]
const changedTransform = (trace, key) => unique(trace, key, 'transform').length > 1
const clickNow = locator => locator.evaluate(el => el.click())
async function enlargeGlyphs(page) {
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[dir="auto"]:not([data-review-scaled])')].map(node => ({ node, size: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight), scale: Math.min(2, Number(node.closest('[data-max-scale]')?.getAttribute('data-max-scale') || 2)) }))
    for (const { node, size, line, scale } of nodes) { if (Number.isFinite(size)) node.style.fontSize = size * scale + 'px'; if (Number.isFinite(line)) node.style.lineHeight = line * scale + 'px'; node.dataset.reviewScaled = 'true' }
  })
}
async function realInteractions(page, width, reduced) {
  const suffix = `${width}-${reduced ? 'reduced' : 'normal'}`
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await page.goto(base + '/', { waitUntil: 'networkidle' }); assertRoute(page, '/')
  await page.getByRole('tab', { name: 'Home', exact: true }).waitFor(); await page.waitForTimeout(650)
  const tablist = page.getByRole('tablist')
  const beforeTargets = await metrics(page, '[role="tablist"]')
  const frames = [await shot(page, `tabs-before-${suffix}`, tablist)]
  await beginTrace(page, { home: '[role="tab"][aria-label="Home"] [data-testid="tab-chip"]', profile: '[role="tab"][aria-label="Profile"] [data-testid="tab-chip"]', target: '[role="tab"][aria-label="Profile"]' })
  await clickNow(page.getByRole('tab', { name: 'Profile', exact: true }))
  await page.waitForURL('**/profile')
  assert.equal(await page.getByRole('tab', { name: 'Profile', exact: true }).getAttribute('aria-selected'), 'true')
  frames.push(await shot(page, `tabs-changing-${suffix}`))
  const tabTrace = await endTrace(page)
  assert.equal(unique(tabTrace, 'profile', 'opacity').some(value => Number(value) > 0 && Number(value) < 1), !reduced, 'Only normal motion interpolates the selected clay highlight')
  assert.equal(await page.getByRole('tab', { name: 'Profile', exact: true }).getByTestId('tab-chip').evaluate(el => getComputedStyle(el).opacity), '1')
  frames.push(await shot(page, `tabs-settled-${suffix}`, tablist))
  assert.equal(new Set(tabTrace.filter(row => row.target).map(row => `${row.target.width}:${row.target.height}`)).size, 1, 'Decorative tab motion keeps the press target fixed')
  // Two actions within one highlight transition must still select the latest route.
  await clickNow(page.getByRole('tab', { name: 'Home', exact: true }))
  await page.waitForTimeout(35)
  await clickNow(page.getByRole('tab', { name: 'Shop', exact: true }))
  await page.waitForURL('**/shop')
  assert.equal(await page.getByRole('tab', { name: 'Shop', exact: true }).getAttribute('aria-selected'), 'true')
  await page.waitForTimeout(450)
  await clickNow(page.getByRole('tab', { name: 'Home', exact: true })); await page.waitForURL(base + '/')
  const locked = page.getByTestId('path-node-locked').first()
  await locked.scrollIntoViewIfNeeded(); await page.waitForTimeout(550)
  const lockLabel = await locked.getAttribute('aria-label')
  const pathFrames = [await shot(page, `home-stop-before-${suffix}`)]
  await beginTrace(page, { card: '[data-testid="path-card"]', entrance: '[data-testid="scene-entrance"]:has(> [data-testid="path-card"])' })
  await clickNow(locked)
  await page.getByTestId('path-card').waitFor()
  pathFrames.push(await shot(page, `home-stop-changing-${suffix}`))
  const pathTrace = await endTrace(page)
  assert.equal(changedTransform(pathTrace, 'entrance'), !reduced, 'Only normal motion moves the opened course explanation')
  await page.getByTestId('path-card').scrollIntoViewIfNeeded()
  pathFrames.push(await shot(page, `home-stop-settled-${suffix}`))
  assert.equal(await locked.getAttribute('aria-expanded'), 'true')
  const cardCopy = await page.getByTestId('path-card').innerText()
  // Close and reopen immediately; the entrance cannot lock its trigger.
  await clickNow(locked); assert.equal(await page.getByTestId('path-card').count(), 0)
  await clickNow(locked); await page.waitForTimeout(35); await clickNow(locked)
  assert.equal(await page.getByTestId('path-card').count(), 0)
  assert.equal(await locked.getAttribute('aria-expanded'), 'false')
  const measured = await metrics(page)
  assert.equal(measured.sideways, 0); assert.deepEqual(beforeTargets.smallTargets, [])
  report.cases.push({ type: 'exported app', width, reduced, tabs: { frames, tabTrace, rapidLatestRoute: '/shop', pressTargetsUnchanged: true, targets: beforeTargets.targets }, courseStop: { frames: pathFrames, lockLabel, cardCopy, pathTrace, immediateCloseAndReopen: true }, measure: measured })
  console.log(JSON.stringify({ type: 'app', width, reduced, pass: true }))
}
async function fixtureInteractions(browser, width, height, reduced, geometryOnly = false) {
  const suffix = `${width}-${reduced ? 'sv-dark-reduced-fontScale2' : 'normal'}`
  const page = await browser.newPage({ ...browserContext, viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  page.on('pageerror', error => report.errors.push({ source: 'fixture', error: String(error) }))
  try {
    await page.goto(base + '/fixture/?reduced=' + reduced, { waitUntil: 'networkidle' })
    await page.getByTestId('responsive-motion-fixture').waitFor(); await page.evaluate(() => document.fonts.ready)
    if (reduced) await enlargeGlyphs(page)
    await page.waitForTimeout(550)
    const weekly = page.getByTestId('weekly-fixture')
    if (geometryOnly) {
      const frames = [await shot(page, `fixture-week-layout-${suffix}`, weekly), await shot(page, `fixture-gems-layout-${suffix}`, page.getByTestId('streak-gem-collection'))]
      const measured = await metrics(page)
      assert.equal(measured.sideways, 0); assert.deepEqual(measured.smallTargets, [])
      report.cases.push({ type: 'component geometry fixture', width, reduced, nativeFontScale: 2, frames, measure: measured })
      console.log(JSON.stringify({ type: 'fixture geometry', width, reduced, pass: true }))
      return
    }
    const weekFrames = [await shot(page, `fixture-week-before-${suffix}`, weekly)]
    // Query the seventh explicitly: each fill is the last child of its own track.
    await page.evaluate(() => document.querySelectorAll('[data-testid="week-activity-fill"]')[6].setAttribute('data-proof-friday', 'true'))
    await beginTrace(page, { friday: '[data-proof-friday="true"]', label: '[data-proof-friday="true"]' })
    await clickNow(page.getByTestId('fixture-week-update'))
    const trueLabel = await page.locator('[data-proof-friday="true"]').evaluate(el => el.parentElement.parentElement.getAttribute('aria-label'))
    assert.match(trueLabel, /2/)
    await clickNow(page.getByTestId('fixture-action'))
    assert.match(await page.getByTestId('fixture-count').innerText(), /Friday: 2; actions: 1/)
    weekFrames.push(await shot(page, `fixture-week-changing-${suffix}`))
    const weekTrace = await endTrace(page)
    // Reduced motion still changes the value; it must skip the intervening scales.
    const scales = unique(weekTrace, 'friday', 'transform').map(value => Number(value.slice(7, -1).split(',')[3]))
    assert.equal(scales.some(value => value > .5001 && value < .9999), !reduced)
    const finalMatrix = await page.locator('[data-proof-friday="true"]').evaluate(el => ({ transform: getComputedStyle(el).transform, origin: getComputedStyle(el).transformOrigin, hidden: el.getAttribute('aria-hidden'), pointerEvents: getComputedStyle(el).pointerEvents }))
    assert.equal(finalMatrix.transform, 'matrix(1, 0, 0, 1, 0, 0)')
    assert.equal(finalMatrix.hidden, 'true'); assert.equal(finalMatrix.pointerEvents, 'none')
    weekFrames.push(await shot(page, `fixture-week-settled-${suffix}`, weekly))
    const collection = page.getByTestId('streak-gem-collection')
    await collection.scrollIntoViewIfNeeded()
    const older = collection.getByRole('button', { name: reduced ? 'Äldre juveler' : 'Older gems', exact: true })
    const newer = collection.getByRole('button', { name: reduced ? 'Nyare juveler' : 'Newer gems', exact: true })
    await older.focus()
    const gemFrames = [await shot(page, `fixture-gems-before-${suffix}`, collection)]
    await beginTrace(page, { gems: '[data-testid="streak-gem-page"]', older: '[data-testid="streak-gem-collection"] [role="button"]:last-child' })
    await clickNow(older)
    const status = await collection.getByRole('status').innerText()
    assert.match(status, /8.*14.*16/)
    assert.equal(await older.evaluate(el => el === document.activeElement), true)
    if (reduced) await enlargeGlyphs(page)
    gemFrames.push(await shot(page, `fixture-gems-changing-${suffix}`))
    const gemTrace = await endTrace(page)
    assert.equal(changedTransform(gemTrace, 'gems'), !reduced)
    gemFrames.push(await shot(page, `fixture-gems-settled-${suffix}`, collection))
    await clickNow(newer); await page.waitForTimeout(35); await clickNow(older)
    assert.match(await collection.getByRole('status').innerText(), /8.*14.*16/)
    assert.equal(await collection.getByTestId('collected-streak-gem').count(), 7)
    const outside = await collection.getByTestId('streak-gem-page').evaluate(el => ({ statusInside: Boolean(el.querySelector('[role="status"]')), controlsInside: Boolean(el.querySelector('[role="button"]')) }))
    assert.deepEqual(outside, { statusInside: false, controlsInside: false })
    const measured = await metrics(page)
    assert.equal(measured.sideways, 0); assert.deepEqual(measured.smallTargets, [])
    report.cases.push({ type: 'component fixture', width, reduced, nativeFontScale: reduced ? 2 : 1, weekly: { frames: weekFrames, trueLabel, weekTrace, finalMatrix, actionResponsiveDuringUpdate: true }, gems: { frames: gemFrames, status, gemTrace, controlsOutside: true, focusRetained: true, pagingResponsiveDuringEntrance: true }, measure: measured })
    console.log(JSON.stringify({ type: 'fixture', width, reduced, pass: true }))
  } finally { await page.close() }
}
;(async () => {
  assert.ok(fs.existsSync(path.join(web, 'index.html')), 'A completed immutable Expo export is required')
  fs.mkdirSync(out, { recursive: true }); await buildFixture()
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }))
  const context = await browser.newContext({ ...browserContext, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' })
  const page = await context.newPage(); page.on('pageerror', error => report.errors.push({ source: 'exported app', error: String(error) }))
  try {
    if (!report.cases.some(item => item.type === 'exported app' && item.reduced)) {
      await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(700); await walkOnboarding(page)
    }
    for (const reduced of [false, true]) {
      if (!report.cases.some(item => item.type === 'exported app' && item.reduced === reduced)) await realInteractions(page, 390, reduced)
      if (!report.cases.some(item => item.type === 'component fixture' && item.reduced === reduced)) await fixtureInteractions(browser, 390, 844, reduced)
    }
    for (const [width, height] of [[320, 568], [768, 1024]]) if (!report.cases.some(item => item.type === 'component geometry fixture' && item.width === width)) await fixtureInteractions(browser, width, height, true, true)
    assert.deepEqual(report.errors, [])
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve))
  }
  console.log(JSON.stringify({ cases: report.cases.length, errors: report.errors }, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
