/**
 * Where Chromium is, asked once instead of eight times.
 *
 * Seven scripts drive headless Chromium — the flag, map and icon rasterisers, the
 * screenshot harness, design:shots, design:measure, a11y:tree and the e2e flow — and
 * every one of them had this hardcoded:
 *
 *   executablePath: process.env.WQ_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
 *
 * That path is a property of the container this repo happened to be developed in. On a
 * GitHub runner it does not exist, and `executablePath` is not a hint: passing a path
 * that is not there makes Playwright fail rather than fall back to the browser it
 * downloaded itself. So `pnpm e2e` — the one step in the pipeline that runs Metro and
 * proves the app bundles — died at launch with
 *
 *   browserType.launch: Failed to launch chromium because executable doesn't exist at
 *   /opt/pw-browsers/chromium-1194/chrome-linux/chrome
 *
 * after successfully exporting the entire bundle. The check that matters ran to
 * completion and then threw its result away.
 *
 * The order below is the honest one:
 *   1. `WQ_CHROMIUM` — an explicit override always wins.
 *   2. A `/opt/pw-browsers/chromium*` install, GLOBBED rather than pinned, because the
 *      revision number changes when Playwright is upgraded and a pinned one silently
 *      stops matching.
 *   3. Nothing — omit `executablePath` entirely and let Playwright resolve the browser
 *      it manages. This is the branch CI takes.
 *
 * Returning `undefined` is the point. `{ executablePath: undefined }` is spread into
 * the launch options as an ABSENT key, not a null one, which is what makes Playwright
 * use its own resolution instead of trying to launch "undefined".
 */

const { existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

const CONTAINER_ROOT = '/opt/pw-browsers'

/** @returns {string | undefined} an explicit path, or undefined to let Playwright decide. */
function chromiumPath() {
  const explicit = process.env.WQ_CHROMIUM ?? process.env.CHROMIUM_PATH
  if (explicit !== undefined && explicit !== '') return explicit

  if (!existsSync(CONTAINER_ROOT)) return undefined

  // Newest revision first: `chromium-1194` sorts after `chromium-1091` numerically,
  // and localeCompare with `numeric` is the only comparison that agrees.
  const candidates = readdirSync(CONTAINER_ROOT)
    .filter((d) => d.startsWith('chromium'))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))

  for (const dir of candidates) {
    for (const exe of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const full = join(CONTAINER_ROOT, dir, exe)
      if (existsSync(full)) return full
    }
  }
  return undefined
}

/**
 * Launch options every headless script in this repo should spread.
 *
 * `--no-sandbox` because these run as root in containers, where the sandbox cannot
 * initialise; nothing here loads untrusted pages.
 */
function launchOptions(extra = {}) {
  const executablePath = chromiumPath()
  return {
    ...(executablePath === undefined ? {} : { executablePath }),
    ...extra,
    args: ['--no-sandbox', ...(extra.args ?? [])],
  }
}

module.exports = { chromiumPath, launchOptions }
