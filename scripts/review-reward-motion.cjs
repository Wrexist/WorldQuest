/** Sample the actual reward transform, its settled state and reduced-motion behavior. */
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(process.env.WQ_WEB ?? 'node_modules/.cache/wq-motion-refine')
const output = path.resolve(process.env.WQ_REVIEW_OUT ?? 'node_modules/.cache/reward-motion-review')
const port = 4190
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
  const report = {}
  try {
    for (const reduced of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', reducedMotion: reduced ? 'reduce' : 'no-preference', recordVideo: { dir: output } })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(base + '/onboarding')
      await page.getByRole('button', { name: 'Get started', exact: true }).waitFor()
      await walkOnboarding(page)
      await page.goto(base + '/quests', { waitUntil: 'domcontentloaded' })
      await page.getByTestId('reward-motion').first().waitFor()
      const frames = await page.getByTestId('reward-motion').first().evaluate(async element => {
        const frames = []
        const start = performance.now()
        while (performance.now() - start < 1100) {
          frames.push({ time: Math.round(performance.now() - start), transform: getComputedStyle(element).transform })
          await new Promise(requestAnimationFrame)
        }
        return frames
      })
      const states = new Set(frames.map(frame => frame.transform))
      assert(reduced ? states.size === 1 : states.size > 2, reduced ? 'reduced motion stays static' : 'reward advances through eased transforms')
      assert(new Set(frames.filter(frame => frame.time > 800).map(frame => frame.transform)).size === 1, 'reward settles and does not loop')
      assert(errors.length === 0, 'no uncaught errors')
      report[reduced ? 'reduced' : 'animated'] = frames
      await page.screenshot({path: path.join(output, reduced ? 'reduced.png' : 'settled.png')})
      const video = page.video()
      await context.close()
      await video.saveAs(path.join(output, reduced ? 'reward-reduced.webm' : 'reward-animated.webm'))
    }
    fs.writeFileSync(path.join(output, 'frames.json'), JSON.stringify(report, null, 2))
  } finally { await browser.close(); server.close() }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
