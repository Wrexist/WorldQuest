const path = require('node:path')
const { browserContext } = require('./browser-harness.cjs')

// Verify the short flow in both languages at the smallest viewport and large text.
async function checkOnboardingClaims(browser, origin, screenshots, step) {
  for (const locale of ['en', 'sv']) {
    const copy = require(`../../packages/i18n/locales/${locale}/onboarding.json`)
    for (const stage of ['welcome', 'age', 'taster']) {
      const context = await browser.newContext({ ...browserContext, locale: locale === 'sv' ? 'sv-SE' : 'en-US', viewport: { width: 320, height: 568 } })
      try {
        const page = await context.newPage()
        await page.goto(origin, { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: copy['onboarding:cta.start'], exact: true }).waitFor()
        if (stage !== 'welcome') await page.getByRole('button', { name: copy['onboarding:cta.start'], exact: true }).click()
        if (stage === 'taster') {
          await page.getByRole('radio', { name: String(new Date().getFullYear() - 30), exact: true }).click()
          await page.getByRole('button', { name: copy['onboarding:age.continue'], exact: true }).click()
        }
        await page.waitForTimeout(400)
        const name = `onboarding-${locale}-${stage}`
        await page.screenshot({ path: path.join(screenshots, `${name}-100.png`) })
        await page.evaluate(() => {
          const sizes = Array.from(document.querySelectorAll('*')).map(node => ({ node,
            font: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight) }))
          for (const { node, font, line } of sizes) {
            if (Number.isFinite(font)) node.style.setProperty('font-size', `${font * 2}px`, 'important')
            if (Number.isFinite(line)) node.style.setProperty('line-height', `${line * 2}px`, 'important')
          }
        })
        const body = page.getByText(copy[`onboarding:${stage === 'welcome' ? 'welcome' : stage}.body`], { exact: true })
        await body.scrollIntoViewIfNeeded()
        const box = await body.boundingBox()
        const cta = page.getByRole('button', { name: copy[stage === 'welcome' ? 'onboarding:cta.start' : stage === 'age' ? 'onboarding:age.continue' : 'onboarding:taster.start'], exact: true })
        const button = await cta.boundingBox()
        const width = await page.evaluate(() => document.documentElement.scrollWidth)
        await page.screenshot({ path: path.join(screenshots, `${name}-200.png`) })
        step(`320pt / 200% ${name}: copy is reachable and action stays on screen`, Boolean(box && button && box.x >= -1 && box.x + box.width <= 321 && box.y >= -1 && box.y + box.height <= button.y + 1 && button.y + button.height <= 569 && width <= 320), JSON.stringify({ box, button, width }))
      } finally { await context.close() }
    }
  }
}
module.exports = { checkOnboardingClaims }
