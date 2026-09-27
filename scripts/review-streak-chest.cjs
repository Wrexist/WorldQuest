/** Real Expo browser evidence for the articulated character and reduced-motion controls. */
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(process.env.WQ_WEB ?? 'node_modules/.cache/wq-web')
const output = path.resolve(process.env.WQ_REVIEW_OUT ?? 'docs/design/reviews/streak-chest-2026-09-26')
const port = 4193
const base = `http://localhost:${port}`
fs.mkdirSync(output,{recursive:true})
const server = http.createServer((req,res)=>{
  const route=decodeURIComponent(new URL(req.url,base).pathname)
  let file=path.resolve(root,'.'+route)
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html')
  const type={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.png':'image/png','.css':'text/css','.ttf':'font/ttf','.json':'application/json'}[path.extname(file)]
  res.writeHead(200,{'Content-Type':type??'application/octet-stream'});fs.createReadStream(file).pipe(res)
})
const assert=(ok,message)=>{if(!ok)throw Error(message);console.log('PASS '+message)}
async function main() {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  const browser = await chromium.launch(launchOptions())
  const report = { errors: [] }
  try {
    const setup = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' })
    const learner = await setup.newPage()
    await learner.goto(base + '/onboarding', { waitUntil: 'networkidle' })
    await walkOnboarding(learner)
    await learner.goto(base + '/lesson', { waitUntil: 'networkidle' })
    await learner.waitForTimeout(1800)
    for (let i = 0; i < 45; i++) {
      const options = await learner.getByTestId('answer-option').all()
      if (!options.length) break
      await learner.waitForTimeout(600)
      await options[0].click()
      await learner.getByTestId('lesson-check').click()
      await learner.waitForTimeout(300)
      const next = learner.getByRole('button', { name: 'Continue', exact: true })
      if (await next.count()) await next.first().click()
      await learner.waitForTimeout(300)
    }
    await learner.getByTestId('summary-continue').waitFor()
    const saved = await setup.storageState()
    await setup.close()
    for (const reduced of [false, true]) {
      const context = await browser.newContext({ storageState: saved, viewport: { width: 390, height: 844 },
        locale: 'en-US', reducedMotion: reduced ? 'reduce' : 'no-preference',
        ...(!reduced ? { recordVideo: { dir: output, size: { width: 390, height: 844 } } } : {}) })
      const page = await context.newPage()
      page.on('pageerror', e => report.errors.push(e.message))
      await page.goto(base + (reduced ? '/streak-extended' : '/streak'), { waitUntil: 'networkidle' })
      if (!reduced) {
        await page.getByRole('button', { name: 'Open today’s chest', exact: true }).click()
        assert(new URL(page.url()).searchParams.get('from') === 'collection', 'collection opens its pending chest')
      }
      await page.getByTestId('open-streak-chest').waitFor()
      await page.screenshot({ path: path.join(output, reduced ? 'reduced-closed.png' : 'closed.png') })
      await page.getByTestId('open-streak-chest').click()
      const frames = []
      for (let i = 0; i < 22; i++) {
        frames.push(await page.getByTestId('chest-film').evaluate(el => getComputedStyle(el).transform))
        if (i === 6 && !reduced) await page.screenshot({ path: path.join(output, 'opening.png') })
        await page.waitForTimeout(100)
      }
      report[reduced ? 'reducedFrames' : 'animatedFrames'] = [...new Set(frames)]
      assert(reduced ? new Set(frames).size === 1 : new Set(frames).size > 3, reduced ? 'reduced motion stays still' : 'lid animates through multiple poses')
      await page.screenshot({ path: path.join(output, reduced ? 'reduced-opened.png' : 'opened.png') })
      assert(await page.getByText('+1 streak gem', { exact: true }).count() === 1, 'one gem revealed')
      if (!reduced) {
        await page.setViewportSize({ width: 320, height: 568 })
        await page.evaluate(() => {
          for (const node of document.querySelectorAll('*')) {
            const style = getComputedStyle(node)
            const size = parseFloat(style.fontSize), line = parseFloat(style.lineHeight)
            if (Number.isFinite(size)) node.style.setProperty('font-size', `${size * 2}px`, 'important')
            if (Number.isFinite(line)) node.style.setProperty('line-height', `${line * 2}px`, 'important')
          }
        })
        const footer = await page.getByRole('button', { name: 'Continue', exact: true }).boundingBox()
        assert(footer && footer.y >= 0 && footer.y + footer.height <= 568, 'Continue stays visible at 320pt with 200% text')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= 320), 'chest has no sideways overflow at 200% text')
        await page.screenshot({ path: path.join(output, 'opened-320-large-text.png') })
        await page.setViewportSize({ width: 390, height: 844 })
      }
      await page.reload({ waitUntil: 'networkidle' })
      assert(await page.getByTestId('open-streak-chest').count() === 0, 'reloading cannot reopen the chest')
      if (!reduced) {
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        await page.getByTestId('streak-gem-collection').waitFor()
        assert(new URL(page.url()).pathname === '/streak', 'chest returns to the collection that opened it')
      } else await page.goto(base + '/streak', { waitUntil: 'networkidle' })
      assert(await page.getByTestId('streak-gem-collection').getByText('1 collected', { exact: true }).count() === 1, 'one gem saved in collection')
      if (!reduced) {
        await page.getByTestId('streak-gem-collection').scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.join(output, 'collection.png') })
        await page.goto(base + '/', { waitUntil: 'networkidle' })
        await page.screenshot({ path: path.join(output, 'home.png') })
      }
      const video = page.video()
      await context.close()
      if (video) { await video.saveAs(path.join(output, 'chest-in-app.webm')); await video.delete() }
    }
    assert(report.errors.length === 0, 'no uncaught errors')
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(e => { console.error(e); server.close(); process.exitCode = 1 })
