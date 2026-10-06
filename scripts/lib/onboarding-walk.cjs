/** Shared fresh-install path. Language and the practice demo are optional. */
async function onOnboarding(page) {
  return new URL(page.url()).pathname === '/onboarding'
}
async function walkOnboarding(page, at = async () => {}) {
  if (!(await onOnboarding(page))) return false
  const capture = async stage => {
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode().catch(() => {}))))
    await page.waitForTimeout(400) // finite scene entrance before a screenshot hook
    await at(stage)
  }
  await capture('welcome')
  await page.getByRole('button', { name: 'Get started', exact: true }).click()
  await page.getByRole('radio', { name: String(new Date().getFullYear() - 30), exact: true }).waitFor()
  await capture('age')
  await page.getByRole('radio', { name: String(new Date().getFullYear() - 30), exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Start learning', exact: true }).waitFor()
  await capture('taster')
  await page.getByRole('button', { name: 'Start learning', exact: true }).click()
  await page.waitForURL(url => url.pathname === '/lesson', { timeout: 10_000 })
  return true
}
module.exports = { walkOnboarding, onOnboarding }
