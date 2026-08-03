/**
 * Bundle the app for iOS and Android, and fail if either cannot be built.
 *
 * ## The gap this closes
 *
 * `pnpm e2e` exports `--platform web` and nothing else, so until this script existed
 * **the app had never been bundled for iOS or Android at all**. That is not a small
 * distinction. Metro resolves per platform: `foo.ios.ts`, `foo.android.ts` and
 * `foo.web.ts` are three different files, `react-native-web` substitutes for
 * `react-native` on one platform only, and a native module that throws at import is
 * invisible to a web build that never loads it.
 *
 * This repo has already been bitten by exactly that class of bug once — 71 imports
 * used TypeScript's `.js` convention, Metro does not rewrite `.js` to `.ts`, and the
 * app had never bundled on ANY platform. `pnpm typecheck` runs tsc and `pnpm test`
 * runs vitest; neither is the bundler. Web-only bundling left two thirds of the same
 * hole open.
 *
 * ## What a green run here does and does not mean
 *
 * It means the Hermes bytecode builds: every import resolves on that platform, every
 * asset is found, and the whole graph compiles. It does **not** mean the app runs.
 * Nothing here executes a single line of the bundle — a component that throws on
 * mount, a native module that needs a permission, a layout that collapses on a real
 * screen, all pass this and fail on a phone.
 *
 * It is the floor below "runs on a device", and the floor was missing.
 *
 * ## The size budget
 *
 * Bundle size is the only performance property in this repo measurable without a
 * phone, and it was ungated until now. Every other performance claim in
 * `docs/plan/device-pass.md` waits on hardware; this one does not, so it should not
 * wait.
 *
 * It matters because of who this app is for. The budget is written against a mid-tier
 * Android three or four years old — the phone a ten-year-old is actually handed — and
 * on that device the JS bundle is not just download weight, it is startup work: Hermes
 * has to read every byte of it before the first frame. The 3 s cold-start target in
 * the device pass is bought or lost here.
 *
 * The limit below is deliberately close to the current measurement. A generous budget
 * is not a budget — it is a number that gets crossed once, quietly, by an import
 * nobody weighed, and then raised. A tight one fails on the commit that added the
 * weight, while the person who added it is still looking. Raising it is fine, but it
 * should be a decision with a reason next to it, not a side effect.
 *
 * Run: pnpm bundle:native
 */

const { execFileSync } = require('node:child_process')
const { existsSync, readdirSync, statSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const OUT = join(process.cwd(), 'node_modules', '.cache', 'wq-native')
const MOBILE = join(process.cwd(), 'apps', 'mobile')

/**
 * The ceiling for the Hermes bytecode bundle, per platform, in MB.
 *
 * ## History, because this number should never move without one
 *
 * - **3.80 MB** when this check was written, budget 4.5.
 * - **5.72 MB** after `@sentry/react-native` landed. The SDK costs **1.92 MB** — a
 *   50 % increase in a single dependency. Budget raised to 6.0.
 *
 * That raise was a real decision, not a rubber stamp, and it went the way it did for
 * one reason: this app has never run on a physical device. Crash reporting is most
 * valuable exactly when device coverage is thinnest, and shipping blind to production
 * crashes on hardware nobody has tested is a worse failure than 1.92 MB of bytecode.
 *
 * It is also a debt. If cold start misses the 3 s target on the mid-tier Android in
 * `docs/plan/device-pass.md`, this is the first thing to weigh — Sentry has a
 * lighter-weight JS-only path, and the trade can be revisited with real numbers
 * instead of the guess this comment is standing in for.
 *
 * Note that the `require` in lib/reporting.ts being lazy does NOT keep the SDK out of
 * the bundle: Metro resolves every statically-analysable `require` at build time
 * regardless of where it sits. Lazy avoids *executing* it at startup, which is worth
 * having, but the bytes are in every build whether a DSN is configured or not.
 *
 * If a legitimate change needs more: raise this number in the same commit, and say in
 * the message what bought the weight. The number is not sacred. Crossing it silently
 * is the thing being prevented.
 */
const BUDGET_MB = 6.0

/** Warn from 90 % of the budget, so the wall is visible before it is hit. */
const WARN_AT = BUDGET_MB * 0.9

/** Largest .hbc under a directory, in bytes — the bundle itself. */
function bundleSize(dir) {
  let largest = 0
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.hbc')) largest = Math.max(largest, statSync(full).size)
    }
  }
  if (existsSync(dir)) walk(dir)
  return largest
}

console.log('Native bundles\n')

let failed = 0
let overBudget = 0
let nearBudget = 0
for (const platform of ['ios', 'android']) {
  const dir = join(OUT, platform)
  rmSync(dir, { recursive: true, force: true })
  try {
    execFileSync('npx', ['expo', 'export', '--platform', platform, '--output-dir', dir], {
      cwd: MOBILE,
      stdio: 'pipe',
      maxBuffer: 1 << 26,
    })
    const size = bundleSize(dir)
    const mb = size / 1024 / 1024
    if (size === 0) {
      failed++
      console.log(`  ✗ ${platform.padEnd(8)} export succeeded but produced no .hbc bundle`)
    } else if (mb > BUDGET_MB) {
      overBudget++
      console.log(
        `  ✗ ${platform.padEnd(8)} ${mb.toFixed(2)} MB — over the ${BUDGET_MB} MB budget by ` +
          `${(mb - BUDGET_MB).toFixed(2)} MB`,
      )
    } else if (mb > WARN_AT) {
      nearBudget++
      console.log(
        `  ⚠ ${platform.padEnd(8)} ${mb.toFixed(2)} MB — within ${(BUDGET_MB - mb).toFixed(2)} MB ` +
          `of the ${BUDGET_MB} MB budget`,
      )
    } else {
      console.log(`  ✓ ${platform.padEnd(8)} ${mb.toFixed(2)} MB  (budget ${BUDGET_MB} MB)`)
    }
  } catch (error) {
    failed++
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    console.log(`  ✗ ${platform.padEnd(8)} failed to bundle`)
    // The last lines are where Metro puts the unresolved module, which is the only
    // part anyone needs.
    for (const line of output.split('\n').filter((l) => l.trim() !== '').slice(-12)) {
      console.log(`      ${line}`)
    }
  }
}

console.log()
if (failed > 0) {
  console.error(`✗ ${failed} platform(s) do not bundle — the app cannot ship to them\n`)
  process.exit(1)
}
if (overBudget > 0) {
  console.error(
    `✗ ${overBudget} platform(s) over the ${BUDGET_MB} MB bundle budget.\n\n` +
      '  The app still compiles — this is a startup-cost failure, not a build failure.\n' +
      '  Hermes reads the whole bundle before the first frame, so on the mid-tier Android\n' +
      '  this budget is written for, these megabytes are seconds of cold start.\n\n' +
      '  Find what grew (`npx expo export --platform android --dump-sourcemap`), and either\n' +
      '  remove it, load it lazily, or raise BUDGET_MB in this file and say in the commit\n' +
      '  message what bought the weight.\n',
  )
  process.exit(1)
}
console.log(
  (nearBudget > 0
    ? `✓ both platforms bundle, under the ${BUDGET_MB} MB budget but close to it — the next\n` +
      '  dependency is likely the one that breaks it.\n'
    : `✓ both platforms bundle, both within the ${BUDGET_MB} MB budget.\n`) +
    '  This proves the graph compiles for each platform and that it is not getting quietly\n' +
    '  heavier. It does NOT prove the app runs: nothing here executes the bundle, and size\n' +
    '  is only one of the things that make a cold start slow. That still needs a device.\n',
)
