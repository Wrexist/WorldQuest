/**
 * Screenshots the rendered app.
 *
 * Pairs with render.tsx: that produces HTML from the real components, this drives
 * headless Chromium over it. Together they give a repeatable visual record without
 * a simulator — useful in review, and the closest thing to a regression test for
 * layout we can run in CI.
 *
 * Run: pnpm screenshot
 */
const { chromium } = require('playwright')
const path = require('path')

const SHOTS = [
  'home-first', 'home-returning', 'home-loading', 'home-offline',
  'lesson-question', 'lesson-correct', 'lesson-wrong', 'lesson-flag',
  'explore', 'country', 'quests', 'profile', 'achievements', 'settings',
]

;(async () => {
  const [, , htmlPath, outDir] = process.argv
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  })
  // deviceScaleFactor 2 so the output is legible when zoomed, like a retina capture.
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
  })
  // Absolute, always. `file://` + a relative path is not a URL Chromium will accept,
  // and the failure reads as ERR_INVALID_URL rather than "path was relative".
  await page.goto(`file://${path.resolve(htmlPath)}`)
  await page.waitForTimeout(500)

  await page.screenshot({ path: path.join(outDir, 'app-overview.png'), fullPage: true })
  console.log('  app-overview.png')

  for (const id of SHOTS) {
    const el = await page.$(`[data-testid="phone-${id}"]`)
    if (!el) {
      console.log(`  MISSING ${id}`)
      continue
    }
    await el.screenshot({ path: path.join(outDir, `${id}.png`) })
    console.log(`  ${id}.png`)
  }

  await browser.close()
})().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
