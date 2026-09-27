/** Enter the real teaching step before exercising questions. Never seeds progress. */
async function beginLesson(page, at = async () => {}) {
  const begin = page.getByTestId('lesson-begin')
  if (await begin.isVisible()) {
    await at('lesson-introduction')
    await begin.click()
    await page.getByTestId('answer-option').first().waitFor({ state: 'visible' })
  }
}
module.exports = { beginLesson }
