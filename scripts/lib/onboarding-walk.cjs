/**
 * Walking the onboarding flow, once, for every harness that has to get past it.
 *
 * Four scripts drive this flow — `a11y-tree`, `design-shots`, `build-store-shots` and
 * the e2e run — and none of them is interested in onboarding. They are interested in
 * what is *behind* it: the tab bar, the lesson, the store listing. Onboarding is a gate
 * on the way, and each of them had its own copy of the key to it.
 *
 * Four copies drifted, exactly as you would expect and exactly as a review predicted.
 * By the time this module was written `build-store-shots.cjs` was still clicking a
 * DECADE CHIP — a control the wheel picker deleted two passes ago — and had no language
 * step at all, so it had been walking into a wall and photographing whatever was there.
 * That is the failure mode this repo keeps rediscovering: not a wrong answer, a
 * confident one produced by a harness that stopped early.
 *
 * ## The `at` hook is why one copy can serve all four
 *
 * The callers differ only in what they do *between* steps. `design-shots` photographs
 * each one, e2e asserts on each one, and the other two want nothing. So the walk is the
 * shared part and the pause is the parameter: `at(step)` is called with a stable step
 * name before each is answered, and defaults to doing nothing.
 *
 * Step names are the flow's own: `language · slide-1 · slide-2 · slide-3 · age · goal ·
 * region · level · taster`. They are part of this module's contract — `design-shots`
 * names its PNGs after them.
 *
 * ## Why the waits are what they are
 *
 * Every single-select step now advances on the tap rather than on a Continue, after a
 * deliberate beat (`ANSWER_BEAT_MS`, 260 ms) in which the answer registers. So a click
 * here is followed by that beat plus the step transition, and the waits below are sized
 * for both. They are generous on purpose: a harness that is 50 ms optimistic fails in
 * CI only, on the machine nobody is watching.
 */

const ADULT_YEARS_AGO = 30

/** Long enough for the answer beat (260) plus the step transition (260), plus slack. */
const AFTER_ANSWER = 700
const AFTER_TAP = 400

/**
 * True when the app is sitting on onboarding rather than already past it.
 *
 * Checked by CONTENT, not by route: every one of these harnesses may be run against a
 * profile that has already completed the flow, and the honest answer there is "nothing
 * to walk" rather than a timeout hunting for a button that will never exist.
 */
async function onOnboarding(page) {
  const text = await page.evaluate(() => document.body.innerText)
  return /Choose your language|five minutes a day|Get started|Next/i.test(text)
}

/**
 * Answer every question and land on the other side.
 *
 * @param page Playwright page, already navigated to the app root.
 * @param at   Called with each step's name before it is answered. Optional.
 * @returns    `false` when the app was not on onboarding and nothing was walked.
 */
async function walkOnboarding(page, at = async () => {}) {
  if (!(await onOnboarding(page))) return false

  // ── language ──────────────────────────────────────────────────────────────
  // A named row, not a Continue. The step lost its button when answering became the
  // navigation, and clicking the answer is now the only way forward.
  await at('language')
  await page.getByRole('radio', { name: 'English' }).first().click()
  await page.waitForTimeout(AFTER_ANSWER)

  // ── the three value slides ────────────────────────────────────────────────
  for (let i = 0; i < 2; i++) {
    await at(`slide-${i + 1}`)
    await page.getByText('Next', { exact: true }).first().click()
    await page.waitForTimeout(AFTER_TAP)
  }
  await at('slide-3')
  await page.getByText('Get started', { exact: true }).first().click()
  await page.waitForTimeout(500)

  // ── age ───────────────────────────────────────────────────────────────────
  // One click on the year itself. The wheel's rows are real radios precisely so a
  // driver — and a screen reader — can reach them; a scroll gesture is invisible to
  // both. An adult year, so the walk continues past the child branch.
  await at('age')
  const adultYear = new Date().getFullYear() - ADULT_YEARS_AGO
  await page.getByRole('radio', { name: String(adultYear) }).first().click()
  await page.waitForTimeout(250)
  // The one Continue left in the questions: a wheel is a scroll, and a scroll that
  // navigated the moment it settled would advance while the user is still looking.
  await page.getByText('Continue', { exact: true }).first().click()
  await page.waitForTimeout(500)

  // ── the three single-select questions ─────────────────────────────────────
  // Answered rather than defaulted, because there is no longer a way past them without
  // answering. Photographed on the answer the walk gives them, which is what the
  // `design-shots` captions should say.
  await at('goal')
  await page.getByRole('radio', { name: /10 min/ }).first().click()
  await page.waitForTimeout(AFTER_ANSWER)

  await at('region')
  await page.getByRole('radio', { name: 'Europe' }).first().click()
  await page.waitForTimeout(AFTER_ANSWER)

  await at('level')
  await page.getByRole('radio', { name: /I know some/ }).first().click()
  await page.waitForTimeout(AFTER_ANSWER)

  // ── taster ────────────────────────────────────────────────────────────────
  await at('taster')
  await page.getByText('Start learning', { exact: true }).first().click()
  await page.waitForTimeout(1200)
  return true
}

module.exports = { walkOnboarding, onOnboarding }
