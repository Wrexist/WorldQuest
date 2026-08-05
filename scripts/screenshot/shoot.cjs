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
const { launchOptions } = require('../chromium.cjs')
const path = require('path')

/**
 * Which frames to shoot is READ FROM THE PAGE, not listed here.
 *
 * It was a hardcoded array, which made it a second copy of a list that already exists
 * in render.tsx — and the two silently disagreed the first time anyone added a frame:
 * six new panels rendered into the HTML and none of them were captured, with no error,
 * because a list that does not mention a frame looks exactly like a list that has
 * nothing to say about it. Same argument as every other parity check in this repo,
 * and here the fix is to delete one of the two lists rather than to compare them.
 */
const shotIds = (page) =>
  page.$$eval('[data-testid^="phone-"]', (els) =>
    els.map((el) => (el.getAttribute('data-testid') ?? '').replace(/^phone-/, '')),
  )

;(async () => {
  const [, , htmlPath, outDir] = process.argv
  const browser = await chromium.launch(launchOptions())
  // deviceScaleFactor 2 so the output is legible when zoomed, like a retina capture.
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
  })
  // Absolute, always. `file://` + a relative path is not a URL Chromium will accept,
  // and the failure reads as ERR_INVALID_URL rather than "path was relative".
  await page.goto(`file://${path.resolve(htmlPath)}`)
  // Longer than the longest motion token (`celebrate`, 900ms). The summary's XP tally
  // animates on mount, and at 500ms this caught it mid-count — a screenshot showing
  // "+31 XP" for a lesson that awarded 62, which reads as an economy bug rather than
  // as a frame of an animation.
  await page.waitForTimeout(1500)

  await page.screenshot({ path: path.join(outDir, 'app-overview.png'), fullPage: true })
  console.log('  app-overview.png')

  const ids = await shotIds(page)
  if (ids.length === 0) throw new Error('no phone frames found — did render.tsx output change?')

  for (const id of ids) {
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
