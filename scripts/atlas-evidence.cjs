#!/usr/bin/env node
/**
 * Photograph and measure the 3D atlas in a real browser GL context. ADR 0017.
 *
 * Drives `/atlas-lab` (the renderer proof) in an export made with
 * EXPO_PUBLIC_ATLAS_LAB=1 EXPO_PUBLIC_ATLAS_GLOBE=1, and records:
 *   - which GL implementation actually drew (UNMASKED_RENDERER — a SwiftShader number is
 *     not a phone number, and the report says which it was);
 *   - a screenshot per fixture × phase, of the canvas pixels themselves;
 *   - frame-interval and draw-CPU percentiles during a 3 s spin;
 *   - JS heap and live-context behaviour across repeated remounts and question changes;
 *   - every console error.
 *
 * This is browser evidence. It is not native GPU evidence and says so in its output.
 *
 * Run: pnpm atlas:evidence        (exports with the lab enabled, then runs this)
 *      node scripts/atlas-evidence.cjs [--export] [exportDir] [outDir]
 */

const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')
const { browserContext } = require('./lib/browser-harness.cjs')
const { PNG } = require('pngjs')

/**
 * Whether a screenshot shows a globe rather than an empty canvas: the share of pixels
 * that are neither the canvas background nor near-white. A blank or cleared WebGL canvas
 * scores ~0; a drawn Earth scores well above half of the frame's centre.
 */
function globeCoverage(buffer) {
  const png = PNG.sync.read(buffer)
  let painted = 0
  let total = 0
  const x0 = Math.floor(png.width * 0.3)
  const x1 = Math.floor(png.width * 0.7)
  const y0 = Math.floor(png.height * 0.3)
  const y1 = Math.floor(png.height * 0.7)
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4
      const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]]
      total++
      // The light canvas is ~#F0FAFF; Earth is blue water or green/tan land.
      if (!(r > 225 && g > 235 && b > 240)) painted++
    }
  return Math.round((painted / total) * 1000) / 1000
}

const { execFileSync } = require('node:child_process')

const argv = process.argv.slice(2).filter((a) => a !== '--export')
const ROOT = path.resolve(argv[0] ?? 'node_modules/.cache/wq-web-atlas')
const OUT = path.resolve(argv[1] ?? 'docs/design/world-atlas/evidence')

// The export the lab needs: the lab route compiled in, and the globe on regardless of
// platform verification. Set here rather than in package.json, where `VAR=1 cmd` does
// not work under Windows' shell.
if (process.argv.includes('--export')) {
  execFileSync('pnpm', ['--filter', '@worldquest/mobile', 'exec', 'expo', 'export', '--platform', 'web', '--output-dir', path.relative(path.join(__dirname, '..', 'apps', 'mobile'), ROOT)], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, EXPO_PUBLIC_ATLAS_LAB: '1', EXPO_PUBLIC_ATLAS_GLOBE: '1' },
  })
}
const PORT = Number(process.env.WQ_ATLAS_PORT ?? 4198)

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bin': 'application/octet-stream',
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  let file = path.join(ROOT, url)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const asHtml = path.join(ROOT, url + '.html')
    file = fs.existsSync(asHtml) ? asHtml : path.join(ROOT, 'index.html')
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error(`✗ no export at ${ROOT}`)
    process.exit(1)
  }
  fs.mkdirSync(OUT, { recursive: true })
  await new Promise((r) => server.listen(PORT, r))
  const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }))
  const context = await browser.newContext({ ...browserContext, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const errors = []
  const offHost = []
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname
    if (host !== 'localhost' && host !== '127.0.0.1' && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) offHost.push(r.url())
  })
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await sleep(1200)
  await walkOnboarding(page, () => {})

  const report = { gl: null, fixtures: [], spin: null, remounts: null, errors }
  const status = () => page.getByTestId('atlas-lab-status').innerText()
  const waitReady = async () => {
    for (let i = 0; i < 120; i++) {
      if ((await status()).startsWith('ready')) return true
      if ((await status()).startsWith('error')) return false
      await sleep(250)
    }
    return false
  }

  await page.goto(`http://localhost:${PORT}/atlas-lab`, { waitUntil: 'networkidle' })
  const t0 = Date.now()
  const ready = await waitReady()
  report.firstReadyMs = Date.now() - t0
  report.gl = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
    return {
      version: gl && gl.getParameter(gl.VERSION),
      renderer: gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      maxTexture: gl && gl.getParameter(gl.MAX_TEXTURE_SIZE),
      canvas: { width: c.width, height: c.height },
    }
  })
  if (!ready) {
    console.error('✗ atlas never became ready:', await status(), errors)
    await page.screenshot({ path: path.join(OUT, 'lab-failed.png') })
    await browser.close()
    server.close()
    process.exit(1)
  }

  const click = (id) => page.getByTestId(id).click()
  const shoot = async (name) => {
    await sleep(700)
    const view = page.getByTestId('atlas-lab-view')
    await view.screenshot({ path: path.join(OUT, `${name}.png`) })
    report.fixtures.push({ name, summary: await page.getByTestId('atlas-lab-summary').innerText() })
  }

  const fixtures = (process.env.WQ_ATLAS_FIXTURES ?? 'ES,SE,JP,FJ,SG,ID,RU,NZ,VA,KI').split(',')
  for (const code of fixtures) {
    await click(`lab-${code}`)
    await shoot(`capital-${code}-question`)
    await click('lab-reveal')
    await shoot(`capital-${code}-revealed`)
    await click('lab-hide')
  }
  await click('lab-identify')
  await click('lab-JP')
  await shoot('identify-JP-question')
  await click('lab-reveal')
  await shoot('identify-JP-revealed')
  await click('lab-hide')
  await click('lab-explore')
  await click('lab-BR')
  await shoot('explore-BR')

  // Frame pacing while the globe turns continuously.
  await click('lab-measure')
  await click('lab-spin')
  await sleep(3000)
  await click('lab-measure')
  await click('lab-stop')
  report.spin = await page.getByTestId('atlas-lab-stats').innerText()

  // Repeated question changes and remounts: the heap and the error log should not grow.
  const heap = () => page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null))
  const before = await heap()
  for (let i = 0; i < 40; i++) await click(`lab-${fixtures[i % fixtures.length]}`)
  for (let i = 0; i < 8; i++) {
    await click('lab-remount')
    await waitReady()
  }
  await page.evaluate(() => (globalThis.gc ? globalThis.gc() : undefined))
  await sleep(500)
  const after = await heap()
  report.remounts = { questionChanges: 40, remounts: 8, heapBefore: before, heapAfter: after, canvases: await page.locator('canvas').count() }
  await shoot('after-remounts')

  // Background and resume: hidden, then visible again. The globe must still be drawn.
  const coverage = async () => globeCoverage(await page.getByTestId('atlas-lab-view').screenshot())
  const cdp = await context.newCDPSession(page)
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
  await sleep(500)
  await cdp.send('Page.setWebLifecycleState', { state: 'active' })
  await sleep(800)
  report.resume = { coverageAfterResume: await coverage() }

  // Resize, as a rotation or split-screen would: the canvas follows its layout.
  await page.setViewportSize({ width: 844, height: 390 })
  await sleep(1200)
  report.resize = { landscapeCoverage: await coverage() }
  await page.getByTestId('atlas-lab-view').screenshot({ path: path.join(OUT, 'resized-landscape.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(1200)

  // Explore: search → focus → card → the existing country page.
  await page.goto(`http://localhost:${PORT}/explore`, { waitUntil: 'networkidle' })
  await sleep(2500)
  await page.screenshot({ path: path.join(OUT, 'explore-world.png') })
  await page.getByTestId('explore-search').fill('Spa')
  await sleep(600)
  await page.getByText('Spain', { exact: true }).last().click()
  await sleep(2000)
  await page.screenshot({ path: path.join(OUT, 'explore-search-spain.png') })
  const card = await page.getByTestId('explore-atlas-card').innerText()
  await page.getByTestId('explore-atlas-open').click()
  await sleep(1500)
  report.explore = { card, landedOn: new URL(page.url()).pathname }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(
    JSON.stringify(
      {
        gl: report.gl,
        firstReadyMs: report.firstReadyMs,
        spin: report.spin,
        remounts: report.remounts,
        resume: report.resume,
        resize: report.resize,
        explore: report.explore,
        offHostRequests: offHost.length,
        errors,
      },
      null,
      2,
    ),
  )
  await browser.close()
  server.close()
})().catch((error) => {
  console.error('✗', error)
  process.exit(1)
})
