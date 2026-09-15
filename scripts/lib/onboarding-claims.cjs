const path = require('node:path')
const { browserContext } = require('./browser-harness.cjs')

// General overflow checks can miss prose hidden by the carousel's clipping.
// Compare the whole copy box to the actual navigation and page indicators.
async function checkOnboardingClaims(browser, origin, screenshots, step) {
  for (const locale of ['en', 'sv']) {
    const copy = require(`../../packages/i18n/locales/${locale}/onboarding.json`)
    for (let slide = 1; slide <= 3; slide++) {
      const context = await browser.newContext({ ...browserContext, viewport: { width: 320, height: 568 } })
      try {
        const page = await context.newPage()
        await page.goto(origin, { waitUntil: 'networkidle' })
        await page.getByText('Get started', { exact: true }).click()
        await page.getByRole('radio', { name: locale === 'sv' ? 'Svenska' : 'English', exact: true }).click()
        await page.waitForTimeout(800)
        for (let n = 1; n < slide; n++) {
          await page.getByText(copy['onboarding:cta.next'], { exact: true }).click()
          await page.waitForTimeout(500)
        }
        const name = `onboarding-${locale}-slide-${slide}`
        await page.screenshot({ path: path.join(screenshots, `${name}-100.png`) })
        await page.evaluate(() => {
          // Snapshot first: inherited sizes must be doubled only once.
          const sizes = Array.from(document.querySelectorAll('*')).map(node => ({
            node, font: parseFloat(getComputedStyle(node).fontSize),
            line: parseFloat(getComputedStyle(node).lineHeight),
          }))
          for (const { node, font, line } of sizes) {
            const cap = node.closest('[data-max-scale]')
            const factor = cap ? Number(cap.getAttribute('data-max-scale')) || 2 : 2
            if (Number.isFinite(font)) node.style.setProperty('font-size', `${font * factor}px`, 'important')
            if (Number.isFinite(line)) node.style.setProperty('line-height', `${line * factor}px`, 'important')
          }
        })
        await page.waitForTimeout(800)
        const title = page.getByText(copy[`onboarding:slide.${slide}.title`], { exact: true })
        // The wrapper has padding that may share the navigation's empty space.
        // Measure the actual title and body, retaining their full unclipped bounds.
        const box = await title.evaluate(node => {
          const boxes = Array.from(node.parentElement.children).map(child => child.getBoundingClientRect())
          const top = Math.min(...boxes.map(b => b.top))
          return { y: top, height: Math.max(...boxes.map(b => b.bottom)) - top }
        })
        const back = await page.getByRole('button', { name: copy['onboarding:back'], exact: true }).boundingBox()
        const dot = await page.getByRole('tab').nth(slide - 1).boundingBox()
        const fits = box && back && dot && box.y >= back.y + back.height - 2 && box.y + box.height <= dot.y + 2
        await page.screenshot({ path: path.join(screenshots, `${name}-200.png`) })
        step(`320pt / 200% ${name}: entire copy stays between navigation and dots`, Boolean(fits), JSON.stringify({ box, back, dot }))
      } finally {
        await context.close()
      }
    }
  }
}

module.exports = { checkOnboardingClaims }
