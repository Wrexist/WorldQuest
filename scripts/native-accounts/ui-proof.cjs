const { chromium } = require('playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const output = 'node_modules/.cache/d1-account-ui/evidence'
const base = 'http://127.0.0.1:8791'
async function main() {
  fs.mkdirSync(output, { recursive: true })
  const service = spawn(process.execPath, ['scripts/native-accounts/server.cjs'], { env: { ...process.env, CI: 'true', WQ_PROOF_PORT: '8791' }, windowsHide: true })
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { service.kill(); reject(new Error('Local proof server did not start')) }, 30000)
    service.once('error', error => { clearTimeout(timeout); reject(error) })
    service.once('exit', code => { clearTimeout(timeout); reject(new Error('Proof server exited: ' + code)) })
    service.stdout.on('data', data => { if (data.toString().includes('Synthetic account proof ready')) { clearTimeout(timeout); resolve() } })
    service.stderr.on('data', data => process.stderr.write(data))
  })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const click = name => page.getByRole('button', { name, exact: true }).click()
  const code = async () => (await (await fetch(base + '/__proof/mailbox')).json()).code
  const shot = async name => {
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ': horizontal overflow')
    const small = await page.getByRole('button').evaluateAll(nodes => nodes.filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44) }).map(node => node.textContent))
    assert.deepEqual(small, [], name + ': small controls')
  }
  try {
    await page.goto(base + '/__proof/ui')
    await click('Start as guest'); await click('Link your email')
    await page.getByLabel('Birth year', { exact: true }).fill('2000'); await click('Continue')
    await shot('email-en-320')
    await page.getByLabel('Email', { exact: true }).fill('native-proof@example.invalid'); await click('Send me a code')
    await page.getByLabel('Eight-digit code').waitFor()
    await shot('code-en-320')
    assert.equal(await page.getByRole('button', { name: 'Resend code', exact: true }).getAttribute('aria-disabled'), 'true')
    await page.reload(); await page.getByLabel('Eight-digit code').waitFor()
    assert.equal(await page.getByLabel('Email', { exact: true }).count(), 0)
    await page.getByLabel('Eight-digit code').fill('00000000'); await click('Confirm')
    await page.getByRole('alert').waitFor(); await shot('wrong-code-en-320')
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(base + '/__proof/ui?locale=sv'); await page.getByLabel('Åttasiffrig kod').waitFor()
      await shot(`code-sv-${width}`)
      await page.evaluate(() => {
        for (const node of document.querySelectorAll('[dir="auto"],input')) {
          const css = getComputedStyle(node)
          node.style.fontSize = parseFloat(css.fontSize) * 2 + 'px'
          if (css.lineHeight !== 'normal') node.style.lineHeight = parseFloat(css.lineHeight) * 2 + 'px'
        }
      })
      await shot(`code-sv-${width}-text200`)
    }
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(base + '/__proof/ui'); await page.getByLabel('Eight-digit code').fill(await code()); await click('Confirm')
    await page.getByText('Your email is linked', { exact: true }).waitFor()
    await click('Continue'); await page.getByText('Your linked account', { exact: true }).waitFor()
    await shot('linked-en-320')
    // A separate browser has no local identity. Recovery uses the same rendered form.
    const second = await browser.newContext({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })
    const recovery = await second.newPage()
    await recovery.goto(base + '/__proof/ui')
    await recovery.getByRole('button', { name: 'Start as guest', exact: true }).click()
    await recovery.getByRole('button', { name: 'Sign in', exact: true }).click()
    await recovery.getByLabel('Birth year', { exact: true }).fill('2000')
    await recovery.getByRole('button', { name: 'Continue', exact: true }).click()
    await recovery.getByLabel('Email', { exact: true }).fill('native-proof@example.invalid')
    await recovery.getByRole('button', { name: 'Send me a code', exact: true }).click()
    await recovery.getByLabel('Eight-digit code').waitFor()
    await recovery.getByLabel('Eight-digit code').fill(await code())
    await recovery.getByRole('button', { name: 'Confirm', exact: true }).click()
    await recovery.getByText('Welcome back', { exact: true }).waitFor()
    await recovery.screenshot({ path: output + '/recovered-second-browser.png' })
    await second.close()
    await click('Delete account'); await shot('delete-en-320')
    await click('Send me a code'); await page.getByLabel('Eight-digit code').waitFor(); await page.getByLabel('Eight-digit code').fill(await code())
    await click('Delete permanently'); await page.getByText('Your account is deleted', { exact: true }).waitFor()
    await shot('deleted-en-320')
    assert.equal(await page.evaluate(() => localStorage.getItem('proof.d1.auth.state.v1')), null)
    assert.deepEqual(errors, [])
    console.log('PASS: rendered D1 linking, restart, wrong code, fresh-browser recovery, deletion; EN/SV 320/768 and doubled text')
  } catch (error) {
    await page.screenshot({ path: output + '/failure.png', fullPage: true })
    console.error(await page.locator('body').innerText(), errors)
    throw error
  } finally { await browser.close(); service.kill() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
