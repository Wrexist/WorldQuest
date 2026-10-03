/**
 * Walking a lesson the way a person does, for the end-to-end journeys.
 *
 * A question is no longer always four options to tap. It can be a MATCHING BOARD (four things
 * and their four partners — a gentle exercise a learner meets early) or a TYPED answer (the
 * hardest way of being asked, met late). Each journey used to wait for `answer-option` and tap
 * the first one, which is the one shape these are not. These helpers are the one place that
 * knows all three, so a journey asks "is a question showing?" and "play it", and a fourth kind
 * is one change here and not one in every walker.
 *
 * Never seeds progress, and never knows an answer: the board is solved by trying, as a person
 * who did not know would, and a typed answer is a guess. What a journey asserts about is that
 * the app and the Worker agree about a lesson, not that the learner was right.
 */

/** Is any kind of question on screen? */
async function questionShown(page) {
  return (
    (await page.getByTestId('answer-option').count()) +
      (await page.getByTestId('pairs-left').count()) +
      (await page.getByTestId('typed-answer').count()) >
    0
  )
}

/** Wait for the first question, whatever it is. */
async function waitForQuestion(page, timeout = 15000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    if (await questionShown(page)) return true
    await page.waitForTimeout(200)
  }
  return false
}

/** Enter the real teaching step before exercising questions. Never seeds progress. */
async function beginLesson(page, at = async () => {}) {
  const begin = page.getByTestId('lesson-begin')
  if (await begin.isVisible()) {
    await at('lesson-introduction')
    await begin.click()
    await waitForQuestion(page)
  }
}

/**
 * Solve a matching board by trying, left card by left card.
 *
 * A wrong pairing leaves its two cards inert for a beat (the board is calm, never punishing),
 * so after one the walker waits for them to take presses again rather than clicking into them.
 */
async function solveBoard(page) {
  const count = await page.getByTestId('pairs-left').count()
  for (let i = 0; i < count; i++) {
    const matched = async () => {
      const left = page.getByTestId('pairs-left').nth(i)
      // Completing the last pair replaces the board with feedback immediately.
      return !(await left.count()) || ((await left.getAttribute('aria-label')) ?? '').endsWith('matched')
    }
    for (let j = 0; j < count && !(await matched()); j++) {
      const right = page.getByTestId('pairs-right').nth(j)
      if ((await right.getAttribute('aria-disabled')) === 'true') continue
      await page.waitForTimeout(150)
      await page.getByTestId('pairs-left').nth(i).click()
      await right.click()
      await page.waitForTimeout(250)
      if (!(await matched())) await page.waitForTimeout(1500)
    }
  }
}

/**
 * Answer whichever question is showing, and press Check where there is one. Returns false when
 * nothing is showing.
 */
async function answerCurrent(page) {
  if ((await page.getByTestId('pairs-left').count()) > 0) {
    await solveBoard(page)
    return true
  }
  const typed = page.getByTestId('typed-answer')
  if ((await typed.count()) > 0) {
    await typed.first().fill('x')
    await page.waitForTimeout(200)
    await page.getByTestId('lesson-check').click()
    return true
  }
  const options = await page.getByTestId('answer-option').all()
  if (options.length === 0) return false
  await options[0].click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Check' }).first().click()
  return true
}

module.exports = { beginLesson, questionShown, waitForQuestion, solveBoard, answerCurrent }
