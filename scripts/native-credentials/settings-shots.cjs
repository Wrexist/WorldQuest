// Static, synthetic Settings error fixture. Native credential acceptance is separate.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, execSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { chromium } = require('playwright')
const { launchOptions } = require('../chromium.cjs')

async function main() {
  const out = path.resolve('node_modules/.cache/credential-settings')
  fs.mkdirSync(out, { recursive: true })
  // Reuse the repository's static-renderer build, excluding its bulk screenshot step.
  execSync('pnpm exec ' + require('../../package.json').scripts.screenshot.split(' && ')[0], { stdio: 'pipe' })
  const browser = await chromium.launch(launchOptions())
  try {
    for (const locale of ['en', 'sv']) {
      const html = execFileSync(process.execPath, ['node_modules/.cache/wq-render.cjs'], {
        env: { ...process.env, WQ_SCREEN_LOCALE: locale, WQ_PREVIEW_SIGNOUT_ERROR: '1' },
        maxBuffer: 80 * 1024 * 1024,
      })
      const file = path.join(out, `${locale}.html`)
      fs.writeFileSync(file, html)
      for (const scale of [1, 2]) {
        const page = await browser.newPage({ viewport: { width: 400, height: 700 }, deviceScaleFactor: 1 })
        await page.goto(pathToFileURL(file).href)
        await page.evaluate(scale => {
          const frame = document.querySelector('[data-testid="phone-settings"]')
          document.body.replaceChildren(frame)
          const phone = frame.lastElementChild
          phone.style.width = '320px'
          phone.style.height = '568px'
          if (scale === 2) {
            const styles = [...frame.querySelectorAll('[dir="auto"]')].map(el => {
              const style = getComputedStyle(el)
              return { el, size: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) }
            })
            for (const { el, size, line } of styles) {
              el.style.setProperty('font-size', `${size * scale}px`, 'important')
              if (Number.isFinite(line)) el.style.setProperty('line-height', `${line * scale}px`, 'important')
            }
          }
        }, scale)
        await page.evaluate(() => document.fonts.ready)
        const alert = page.getByRole('alert')
        await alert.scrollIntoViewIfNeeded()
        const bounds = await alert.boundingBox()
        if (!bounds || bounds.width > 320) throw new Error('Logout message overflows the frame')
        await page.getByTestId('phone-settings').screenshot({ path: path.join(out, `${locale}-320-${scale}x.png`) })
        const retry = page.getByRole('button', { name: locale === 'en' ? 'Sign out' : 'Logga ut', exact: true })
        await retry.scrollIntoViewIfNeeded()
        const target = await retry.boundingBox()
        if (!target || target.width < 44 || target.height < 44) throw new Error('Logout retry target is too small')
        await page.getByTestId('phone-settings').screenshot({ path: path.join(out, `${locale}-320-${scale}x-retry.png`) })
        console.log(`${locale}: 320 pt, ${scale * 100}% text, logout error rendered`)
        await page.close()
      }
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
