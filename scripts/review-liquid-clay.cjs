// Real exported app journey. Account state is earned through the UI, never seeded.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { browserContext, assertRoute, routeSlug } = require('./lib/browser-harness.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')
const { beginLesson, answerCurrent, questionShown } = require('./lib/lesson-walk.cjs')
const root = path.resolve(__dirname, '..')
const cloudTabletOnly = process.argv.includes('--cloud-tablet-only')
const cloudsOnly = process.argv.includes('--clouds-only') || cloudTabletOnly
const web = path.resolve(process.argv[2] || 'node_modules/.cache/wq-liquid-clay-web')
const out = path.resolve(process.env.WQ_REVIEW_OUT || (cloudsOnly ? 'docs/design/reviews/cloud-companions-2026-10-02/browser' : 'docs/design/reviews/liquid-clay-2026-10-02/browser'))
const port = Number(process.env.WQ_REVIEW_PORT || 4228)
const base = `http://127.0.0.1:${port}`
const report = { source: web, realApp: true, seededAccount: false, cases: [], errors: [], limitations: ['Chromium and react-native-web, not a physical device.', 'The accessibility mode doubles rendered glyphs; native fontScale branches need separate fixture/device proof.'] }
const handoff = process.argv.includes('--handoff')
const preview = process.argv.includes('--preview') || handoff || cloudTabletOnly
const countryOnly = process.argv.includes('--country-only')
const polishOnly = process.argv.includes('--polish-only')
const focused = countryOnly || polishOnly
const routes = cloudTabletOnly ? ['/quests', '/shop'] : cloudsOnly ? ['/', '/quests', '/profile', '/shop'] : countryOnly ? ['/country/SE'] : polishOnly ? ['/explore', '/country/SE'] : preview ? ['/', '/explore', '/quests', '/profile', '/shop', '/lesson'] : ['/', '/explore', '/quests', '/profile', '/shop', '/country/SE', '/settings', '/lesson']
const viewports = cloudTabletOnly ? [[390, 844], [768, 1024]] : handoff ? [[390, 844]] : preview ? [[320, 568], [390, 844]] : [[320, 568], [390, 844], [768, 1024]]
const server = http.createServer((req, res) => {
  let file = path.resolve(web, '.' + decodeURIComponent(new URL(req.url, base).pathname))
  if (file !== web && !file.startsWith(web + path.sep)) { res.writeHead(403); res.end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(web, 'index.html')
  res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') })
async function visit(page, route) {
  await page.goto(base + route, { waitUntil: 'networkidle' }); assertRoute(page, route)
  await page.waitForTimeout(600)
  if (route === '/explore') await page.waitForTimeout(1500)
}
async function metrics(page) {
  return page.evaluate(() => {
    const rect = node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom } }
    const controls = [...document.querySelectorAll('[role="button"],[role="tab"],button')].filter(node => !node.closest('[aria-hidden="true"]') && node.getBoundingClientRect().width)
    const textOutsideViewport = []
    for (const node of document.querySelectorAll('[dir="auto"]')) {
      if (!node.textContent?.trim() || node.closest('[aria-hidden="true"]') || !node.getBoundingClientRect().width) continue
      let horizontalScroller = false
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth + 1) horizontalScroller = true
      }
      if (horizontalScroller) continue
      const range = document.createRange(); range.selectNodeContents(node)
      const bounds = range.getBoundingClientRect()
      if (bounds.width > 0 && (bounds.left < -1 || bounds.right > innerWidth + 1)) textOutsideViewport.push(node.textContent.trim())
    }
    return {
      sidewaysScroll: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      smallTargets: controls.map(node => ({ label: node.getAttribute('aria-label') || node.textContent, ...rect(node) })).filter(b => b.width < 43.5 || b.height < 43.5),
      textOutsideViewport: [...new Set(textOutsideViewport)],
      viewport: { width: innerWidth, height: innerHeight },
    }
  })
}
async function box(locator) {
  return locator.evaluate(node => {
    const r = node.getBoundingClientRect()
    const viewportContained = r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth
    let clipped = false
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), boundary = parent.getBoundingClientRect()
      if (/(hidden|scroll|auto)/.test(style.overflowY) && (r.top < boundary.top - 1 || r.bottom > boundary.bottom + 1)) clipped = true
      if (/(hidden|scroll|auto)/.test(style.overflowX) && (r.left < boundary.left - 1 || r.right > boundary.right + 1)) clipped = true
    }
    return { top: r.top, bottom: r.bottom, width: r.width, height: r.height, viewportContained, clipped, fullyVisible: viewportContained && !clipped }
  })
}
async function enlargeGlyphs(page) {
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('[dir="auto"]:not([data-review-scaled])')].map(node => ({ node, size: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight), scale: Math.min(2, Number(node.closest('[data-max-scale]')?.getAttribute('data-max-scale') || 2)) }))
    for (const { node, size, line, scale } of items) { if (Number.isFinite(size)) node.style.fontSize = size * scale + 'px'; if (Number.isFinite(line)) node.style.lineHeight = line * scale + 'px'; node.setAttribute('data-review-scaled', 'true') }
  })
}
async function scrollToTop(page) {
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('*')) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) node.scrollTo(0, 0)
    }
  })
  await page.waitForTimeout(250)
}
async function decodedImages(locator) {
  return locator.evaluate(async node => {
    const images = [...node.querySelectorAll('img')]
    await Promise.all(images.map(image => image.decode()))
    return images.map(image => {
      // RN-web paints its background on the Image host; the nested img only decodes it.
      const bounds = image.parentElement.getBoundingClientRect()
      return { source: (image.currentSrc || image.src).split('/').pop(), decoded: image.complete && image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight, renderedWidth: bounds.width, renderedHeight: bounds.height, renderedTop: bounds.top, renderedLeft: bounds.left }
    })
  })
}
async function cloudCompanionEvidence(page, reduced) {
  const clouds = page.getByTestId('cloud-backdrop')
  assert.ok(await clouds.count() > 0, 'Focused cloud routes must render their backdrop')
  const backdrops = []
  for (const cloud of await clouds.all()) {
    const images = await decodedImages(cloud)
    assert.ok(images.length > 0 && images.every(image => image.decoded), 'Cloud artwork must decode')
    const naturalRatio = images.every(image => image.renderedHeight > 0 && Math.abs(image.renderedWidth / image.renderedHeight - image.width / image.height) < 0.05)
    if (!naturalRatio) await shot(page, 'cloud-aspect-diagnostic')
    assert.ok(naturalRatio, `Cloud artwork must preserve its natural aspect ratio: ${JSON.stringify(images)}`)
    if (!report.firstCloudFrame) {
      report.firstCloudFrame = images[0]
      console.log(JSON.stringify({ firstCloudFrame: report.firstCloudFrame }))
    }
    const presentation = await cloud.evaluate(node => ({ hidden: node.getAttribute('aria-hidden'), pointerEvents: getComputedStyle(node).pointerEvents, opacity: getComputedStyle(node).opacity, transform: getComputedStyle(node).transform }))
    assert.equal(presentation.hidden, 'true', 'Clouds are decorative')
    assert.equal(presentation.pointerEvents, 'none', 'Clouds must not intercept actions')
    backdrops.push({ bounds: await box(cloud), presentation, images })
  }
  const mascots = []
  for (const mascot of await page.getByTestId('world-mascot').all()) {
    const state = await mascot.evaluate(node => ({ label: node.getAttribute('aria-label'), role: node.getAttribute('role'), pose: node.querySelector('[data-testid^="mascot-pose-"]')?.getAttribute('data-testid'), stills: node.querySelectorAll('[data-testid="mascot-still"]').length, films: node.querySelectorAll('[data-testid="mascot-film"]').length }))
    if (reduced) { assert.equal(state.films, 0, 'Reduced motion must use mascot stills'); assert.equal(state.stills, 1) }
    mascots.push({ bounds: await box(mascot), ...state, images: await decodedImages(mascot) })
  }
  assert.ok(mascots.length > 0, 'Focused cloud routes must retain Atlas')
  return { backdrops, mascots, reducedMotion: reduced }
}
async function companionBehavior(page, route, width, suffix) {
  const reduced = Boolean(suffix)
  const mascot = page.locator('[data-testid="world-mascot"][role="button"]').first()
  assert.ok(await mascot.count() > 0, 'The foreground companion must remain boopable')
  await mascot.scrollIntoViewIfNeeded()
  const beforeUrl = page.url()
  const protectedState = async () => page.locator('[data-testid="quest-progress"], [data-testid="quest-tasks"], [data-testid="profile-passport"], [data-testid="coin-wallet"]').evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute('data-testid'), value: node.getAttribute('aria-valuenow'), text: node.textContent })))
  const before = await protectedState()
  const originalPose = await mascot.locator('[data-testid^="mascot-pose-"]').getAttribute('data-testid')
  const bounds = await box(mascot)
  await mascot.click()
  const laughing = mascot.getByTestId('mascot-pose-laughing')
  await laughing.waitFor()
  const images = await decodedImages(laughing)
  assert.ok(images.length > 0 && images.every(image => image.decoded))
  const moving = laughing.getByTestId('mascot-motion')
  const still = laughing.getByTestId('mascot-still')
  assert.equal(await laughing.getByTestId('mascot-film').count(), 0)
  assert.equal(await laughing.getByTestId('mascot-sheet').count(), 0)
  assert.equal(await moving.count(), 1)
  assert.equal(await still.count(), 1, 'The complete mascot image stays present in every motion mode')
  const transforms = []
  for (let frame = 0; frame < 7; frame++) {
    transforms.push(await moving.evaluate(node => getComputedStyle(node).transform))
    await page.waitForTimeout(90)
  }
  if (reduced) assert.equal(new Set(transforms).size, 1, 'Reduced-motion boop remains a still')
  else assert.ok(new Set(transforms).size > 1, 'The decoded whole-image mascot must move')
  await shot(page, `${routeSlug(route)}-boop-${width}${suffix}`)
  await laughing.waitFor({ state: 'detached', timeout: 6000 })
  assert.equal(await mascot.locator('[data-testid^="mascot-pose-"]').getAttribute('data-testid'), originalPose)
  assert.equal(page.url(), beforeUrl, 'A boop must not navigate')
  assert.deepEqual(await protectedState(), before, 'A boop must not change progress or currency')
  const cloud = page.getByTestId('cloud-backdrop').first()
  const cloudTransforms = []
  // Normal clouds deliberately start drifting after the screen settles.
  if (!reduced) await page.waitForTimeout(3000)
  for (let frame = 0; frame < 5; frame++) {
    cloudTransforms.push(await cloud.evaluate(node => getComputedStyle(node).transform))
    await page.waitForTimeout(160)
  }
  if (reduced) assert.equal(new Set(cloudTransforms).size, 1, 'Reduced-motion clouds remain still')
  else assert.ok(new Set(cloudTransforms).size > 1, 'Cloud drift should advance after settling')
  return { label: await mascot.getAttribute('aria-label'), bounds, originalPose, laughingDecoded: true, transforms, cloudTransforms, reducedMotion: reduced, returnedToOriginalPose: true, routeAndProgressUnchanged: true }
}
async function captures(page, width, suffix = '') {
  for (const route of routes) {
    await visit(page, route)
    if (route === '/lesson') {
      await beginLesson(page)
      for (let attempt = 0; attempt < 12 && !(await questionShown(page)); attempt++) await page.waitForTimeout(250)
      assert.equal(await questionShown(page), true, 'Lesson must show a real question before capture')
    }
    if (suffix) await enlargeGlyphs(page)
    if (route === '/' || route === '/quests') await scrollToTop(page)
    const details = { name: route, width, mode: suffix || 'light default', layout: await metrics(page) }
    assert.equal(details.layout.sidewaysScroll, 0)
    if (cloudsOnly) details.companions = await cloudCompanionEvidence(page, Boolean(suffix))
    if (cloudTabletOnly) {
      const barBottom = await page.getByText('WorldQuest', { exact: true }).first().evaluate(node => node.parentElement.getBoundingClientRect().bottom)
      const cloudImages = details.companions.backdrops.flatMap(backdrop => backdrop.images)
      details.cloudHeaderClearance = Math.min(...cloudImages.map(image => image.renderedTop)) - barBottom
      assert.ok(cloudImages.every(image => image.renderedWidth <= 384.1), 'Cloud layers should remain bounded on tablet')
      assert.ok(details.cloudHeaderClearance >= 0, 'Cloud artwork should remain below the TopBar')
    }
    if (route === '/country/SE') {
      const favourite = page.getByRole('switch').first()
      details.favourite = await box(favourite)
      assert.equal(details.favourite.fullyVisible, true, 'Country favourite must remain on screen after text scaling')
      details.countryTitle = await page.getByRole('heading', { name: suffix ? 'Sverige' : 'Sweden', exact: true }).evaluate(node => {
        const range = document.createRange(); range.selectNodeContents(node)
        const bounds = range.getBoundingClientRect()
        return { text: node.textContent, width: bounds.width, height: bounds.height, lineRects: range.getClientRects().length }
      })
      assert.equal(details.countryTitle.lineRects, 1, 'Sweden/Sverige should remain a whole word in the full-width title')
    }
    if (route === '/explore') {
      details.tabLabels = await page.locator('[role="tablist"] [role="tab"] [dir="auto"]').evaluateAll(nodes => nodes.map(node => {
        const range = document.createRange(); range.selectNodeContents(node)
        const bounds = range.getBoundingClientRect()
        return { label: node.textContent, left: bounds.left, right: bounds.right }
      }))
    }
    if (route === '/quests') {
      details.chest = await box(page.getByTestId('quest-treasure-card'))
      const next = page.getByRole('button', { name: /^(Continue quest|Fortsätt uppdrag)/ })
      details.continueBeforeScroll = await box(next)
      assert.equal(details.continueBeforeScroll.fullyVisible, true)
      await shot(page, `quests-${width}${suffix}`)
      await page.getByTestId('quest-tasks').locator('[aria-label]').last().scrollIntoViewIfNeeded()
      details.continueAfterScroll = await box(next)
      assert.equal(details.continueAfterScroll.fullyVisible, true)
      await shot(page, `quests-scrolled-${width}${suffix}`)
    } else {
      if (route === '/profile') {
        const start = page.getByRole('button', { name: /^(Start a lesson|Starta en lektion)$/ })
        details.guestStart = await box(start)
        if (!suffix) assert.equal(details.guestStart.fullyVisible, true)
      }
      if (route === '/shop') {
        for (const id of ['coin-wallet', 'shop-next-unlock', 'shop-freeze']) if (await page.getByTestId(id).count()) details[id] = await box(page.getByTestId(id))
      }
      await shot(page, `${routeSlug(route)}-${width}${suffix}`)
      if (route === '/') {
        const start = page.getByRole('button', { name: /^(Start challenge|Starta utmaning)/ }).first()
        if (await start.count()) {
          await start.scrollIntoViewIfNeeded()
          details.currentChallenge = { bounds: await box(start), label: await start.innerText() }
          await shot(page, `home-current-challenge-${width}${suffix}`)
        }
      }
      if (route === '/explore' && !preview) {
        const input = page.getByTestId('explore-search')
        const country = suffix ? 'Spanien' : 'Spain'
        await input.fill(country)
        const result = page.getByRole('button', { name: country, exact: true })
        await result.waitFor()
        if (suffix) await enlargeGlyphs(page)
        await input.scrollIntoViewIfNeeded()
        details.searchInput = { value: await input.inputValue(), position: await input.evaluate(node => getComputedStyle(node).position), bounds: await box(input) }
        assert.equal(details.searchInput.value, country)
        await shot(page, `explore-search-${width}${suffix}`)
        await result.click()
        const open = page.getByTestId('explore-atlas-open')
        await open.waitFor()
        if (suffix) await enlargeGlyphs(page)
        await page.waitForTimeout(1500)
        assert.equal(await input.inputValue(), '')
        details.countrySelection = { openLabel: await open.getAttribute('aria-label'), bounds: await box(open), searchCleared: true }
        await shot(page, `explore-selected-${width}${suffix}`)
      }
      if (route === '/settings') {
        const language = page.getByRole('radio', { name: suffix ? 'English' : 'Svenska', exact: true })
        if (await language.count()) {
          await language.scrollIntoViewIfNeeded()
          await shot(page, `settings-language-${width}${suffix}`)
        }
      }
    }
    if (cloudsOnly && !cloudTabletOnly && width === 390) details.boop = await companionBehavior(page, route, width, suffix)
    report.cases.push(details)
  }
}
async function behavior(page) {
  await visit(page, '/quests')
  const progress = page.getByTestId('quest-progress')
  const prior = await progress.getAttribute('aria-valuenow')
  const tasksBefore = await page.getByTestId('quest-tasks').innerText()
  await page.getByTestId('quest-chest').click()
  await page.waitForTimeout(100)
  const nudged = await page.getByTestId('explorer-chest-motion').evaluate(el => getComputedStyle(el).transform)
  await page.waitForTimeout(700)
  assert.equal(await progress.getAttribute('aria-valuenow'), prior)
  assert.equal(await page.getByTestId('quest-tasks').innerText(), tasksBefore)
  await page.getByRole('tab', { name: 'Achievements', exact: true }).click(); await page.waitForURL('**/achievements')
  await visit(page, '/shop')
  const unlockBefore = await page.getByTestId('shop-next-unlock').innerText()
  const buyButtons = page.getByRole('button', { name: 'Buy', exact: true })
  const unavailablePurchases = await buyButtons.evaluateAll(nodes => nodes.every(node => node.getAttribute('aria-disabled') === 'true' || node.disabled))
  assert.equal(unavailablePurchases, true)
  await page.getByRole('button', { name: 'Open streak', exact: true }).click(); await page.waitForURL('**/streak')
  await visit(page, '/shop'); assert.equal(await page.getByTestId('shop-next-unlock').innerText(), unlockBefore)
  assert.equal(await page.getByText('Wearing', { exact: true }).count(), 1)
  report.cases.push({ name: 'navigation and protected state', chestNudgeTransform: nudged, questProgressUnchanged: true, tasksUnchanged: true, achievementsOpens: true, freezeOpensStreak: true, unaffordablePurchasesDisabled: true, unlockUnchanged: true, levelTitleWorn: true })
}
async function captureEarnedProfile(page, width, suffix = '') {
  await visit(page, '/profile')
  if (suffix) await enlargeGlyphs(page)
  await scrollToTop(page)
  const populated = await page.getByTestId('profile-passport').count() > 0
  if (cloudsOnly) assert.equal(populated, true, 'Earned Profile must come from the completed UI lesson')
  const details = { name: 'profile after actual UI lesson', width, mode: suffix || 'light default', populated, passport: populated ? await box(page.getByTestId('profile-passport')) : null, layout: await metrics(page) }
  if (cloudsOnly) details.companions = await cloudCompanionEvidence(page, Boolean(suffix))
  await shot(page, `profile-after-lesson-${populated ? 'populated' : 'guest'}-${width}${suffix}`)
  if (cloudsOnly && width === 390) details.boop = await companionBehavior(page, '/profile-earned', width, suffix)
  report.cases.push(details)
}
async function learn(page) {
  await visit(page, '/profile')
  await page.getByRole('button', { name: 'Start a lesson', exact: true }).click()
  await page.waitForURL('**/lesson**'); await page.waitForTimeout(800); await beginLesson(page)
  let answered = 0
  for (let step = 0; step < 60; step++) {
    if (await page.getByTestId('summary-continue').count()) break
    if (await questionShown(page)) { await page.waitForTimeout(1500); await answerCurrent(page); answered++ }
    const feedback = page.getByRole('button', { name: /^(Continue|Got it|Finish)$/ }).first()
    if (await feedback.count()) await feedback.click()
    else if (!(await questionShown(page))) throw Error('Lesson stopped before summary at ' + page.url())
    await page.waitForTimeout(400)
  }
  await page.getByTestId('summary-continue').waitFor()
  const summary = await page.locator('body').innerText(); await shot(page, 'earned-lesson-summary')
  await page.getByTestId('summary-continue').click()
  for (let beat = 0; beat < 15; beat++) {
    await page.waitForTimeout(400)
    if (await page.getByTestId('open-streak-chest').count()) { await page.getByTestId('open-streak-chest').click(); await page.getByText('+1 streak gem', { exact: true }).waitFor({ timeout: 12000 }); continue }
    if (await page.getByTestId('create-profile-later').count()) { await page.getByTestId('create-profile-later').click(); continue }
    const next = page.getByRole('button', { name: 'Continue', exact: true }).first()
    if (await next.count()) await next.click(); else break
  }
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024]]) {
    await page.setViewportSize({ width, height }); await captureEarnedProfile(page, width)
  }
  report.lesson = { answered, completed: true, summary }
}
;(async () => {
  assert.ok(fs.existsSync(path.join(web, 'index.html')), 'Provide an existing immutable Expo export')
  fs.mkdirSync(out, { recursive: true }); await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }))
  const context = await browser.newContext({ ...browserContext, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' })
  const page = await context.newPage(); page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.errors.push(String(error)))
  try {
    await page.goto(base + '/', { waitUntil: 'networkidle' }); await walkOnboarding(page)
    for (const [width, height] of viewports) { await page.setViewportSize({ width, height }); await captures(page, width) }
    if (!preview) {
    await page.setViewportSize({ width: 390, height: 844 }); if (!focused) await behavior(page)
    const guestState = await context.storageState()
    if (!focused && !process.argv.includes('--skip-lesson')) await learn(page)
    const earnedState = cloudsOnly && report.lesson?.completed ? await context.storageState() : null
    const contrastContext = await browser.newContext({ ...browserContext, storageState: guestState, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
    const contrast = await contrastContext.newPage(); contrast.on('pageerror', error => report.errors.push(String(error)))
    await visit(contrast, '/settings'); await contrast.getByRole('radio', { name: 'Dark', exact: true }).click(); await contrast.getByRole('radio', { name: 'Svenska', exact: true }).click()
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024]]) { await contrast.setViewportSize({ width, height }); await captures(contrast, width, '-sv-dark-glyph2-reduced') }
    await contrastContext.close()
    if (earnedState) {
      const earnedContext = await browser.newContext({ ...browserContext, storageState: earnedState, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
      const earned = await earnedContext.newPage(); earned.on('pageerror', error => report.errors.push(String(error)))
      try {
        await visit(earned, '/settings'); await earned.getByRole('radio', { name: 'Dark', exact: true }).click(); await earned.getByRole('radio', { name: 'Svenska', exact: true }).click()
        for (const [width, height] of [[320, 568], [390, 844], [768, 1024]]) { await earned.setViewportSize({ width, height }); await captureEarnedProfile(earned, width, '-sv-dark-glyph2-reduced') }
      } finally { await earnedContext.close() }
    }
    assert.deepEqual(report.errors, [])
    }
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)) }
  console.log(JSON.stringify({ cases: report.cases.length, errors: report.errors }, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
