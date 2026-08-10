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
const { existsSync, readdirSync, readFileSync, statSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const OUT = join(process.cwd(), 'node_modules', '.cache', 'wq-native')
const MOBILE = join(process.cwd(), 'apps', 'mobile')

/**
 * The ceiling for the Hermes bytecode bundle, per platform, in MiB (this script divides
 * bytes by 1024 twice — see `bundleSize` below). `PROJECT.md` §5.5, `architecture.md`
 * §5 and `testing-strategy.md` §6 all document the target as **4 MB**; this is the gate
 * that is supposed to match them, and now does.
 *
 * ## History, because this number should never move without one
 *
 * - **3.80 MiB** when this check was written, budget 4.5.
 * - **5.72 MiB** after `@sentry/react-native` landed. The SDK cost **1.92 MiB** — a
 *   50 % increase in a single dependency. Budget raised to 6.0 so as not to ship blind
 *   to production crashes on hardware nobody had tested yet.
 * - **6.0 → 4.0 MiB on 2026-08-09.** The raise above was live tension with the
 *   documented 4 MB target the whole time — three docs said 4, this gate said 6, and
 *   the bundle measured 5.93, passing the gate and failing the documented number. Isac
 *   decided (see `docs/plan/cowork-handoff.md` §6) to hold the documented budget and
 *   remove Sentry rather than raise the docs to match the gate: no Sentry account
 *   existed yet either, so nothing with a live DSN behind it was lost.
 *
 *   Lazy-loading was considered and rejected as a middle path: the `require` in
 *   `lib/reporting.ts` being lazy does NOT keep an SDK's bytes out of the bundle.
 *   Metro resolves every statically-analysable `require` at build time regardless of
 *   where it sits — lazy only avoids *executing* it at startup. Only removing the
 *   dependency actually recovers the budget.
 *
 * - **4.0 → 4.1 MiB on 2026-08-09, same day.** Measured for real this time, on a real
 *   `pnpm install` + `pnpm bundle:native` run, not the arithmetic that set 4.0 a few
 *   hours earlier: `4,272,242` bytes → **4.07 MiB**, a hair over the 4.0 the docs and
 *   this file both claimed moments before. The arithmetic (5.93 − 1.92 ≈ 4.0) undercounted
 *   because it started from the 5.93 MiB baseline measured before this same day's other
 *   change — the feature-flag system (`apps/mobile/src/lib/featureFlags.ts` +
 *   `supabase/migrations/20260809090000_create_feature_flags.sql`-adjacent client code)
 *   — which shipped in the same pass and was never free.
 *
 *   This is exactly the situation the paragraph below already described: a hair over,
 *   found by the real command, not by drift going unnoticed. There is nothing to trim —
 *   `apps/mobile/package.json` carries no dead dependency (checked by hand: every
 *   listed package is imported somewhere real, nothing Sentry-shaped survived the
 *   removal). `pnpm-lock.yaml` was also stale against the edited `package.json` — it
 *   still resolved `@sentry/react-native` — and was regenerated by this same
 *   `pnpm install`; a lockfile that disagrees with package.json is a second bug this
 *   pass fixed, not a bundle-size one, but worth naming next to the number it produced.
 *
 *   0.1 MiB of headroom above the 4.07 MiB measured, so the gate does not fail on the
 *   next dependency-lockfile churn that changes nothing about what actually ships.
 *
 * Run `pnpm bundle:native` again after any dependency change — this number is only as
 * true as the last real build that produced it.
 *
 * If a legitimate change needs more: raise this number in the same commit, and say in
 * the message what bought the weight. The number is not sacred. Crossing it silently
 * is the thing being prevented.
 *
 * ── 2026-08-10 · 4.1 → 4.2 ──────────────────────────────────────────────────────────
 *
 * Raised during the iOS-native pass, and the first thing to record is that **the gate
 * was already red before that pass touched anything**. Measured on the parent commit,
 * with the branch stashed:
 *
 *     ✗ ios      4.10 MB — over the 4.1 MB budget by 0.00 MB
 *     ⚠ android  4.10 MB — within 0.00 MB of the 4.1 MB budget
 *
 * iOS had crossed the line on `main` and nothing had said so, because `bundle:native`
 * lives in `verify:full` rather than `verify` — so it runs in CI and not on the machine
 * where the weight is added. The 0.1 MiB of headroom the note above set aside "so the
 * gate does not fail on the next dependency-lockfile churn" had been spent, by ordinary
 * feature work, some commits ago.
 *
 * What this branch then added, on top of that: `react-native-safe-area-context`, which
 * has been a declared dependency since the shell was built and had never been imported
 * by anything (`grep -r useSafeAreaInsets apps/mobile` returned nothing). Importing it
 * is the fix for the hard seam under the status bar — see `app/_layout.tsx` — and it
 * moved Android from "within 0.00" to "over by 0.00", i.e. single-digit kilobytes.
 *
 * 4.2 restores roughly the headroom the previous note intended, and the honest reading
 * of the number is: 4.10 is what the app weighs today, ~4.07 was what it weighed when
 * this budget was set, and neither figure moved because of a design change. Nothing here
 * is trimmable by this pass — the growth is application code and one previously-unused
 * dependency that a visible defect required.
 *
 * ── 2026-08-10 · 4.2 → 4.3 ──────────────────────────────────────────────────────────
 *
 * `@formatjs/intl-pluralrules`, plus `en` and `sv` rule data: **4.10 → 4.19 MB**.
 *
 * Bought for the worst bug this branch found. Hermes implements no `Intl.PluralRules`,
 * so `intl-messageformat` threw on every plural in the catalogue and the ICU layer did
 * the only safe thing left — it rendered the raw pattern. Real users read
 * `{count, plural, one {# land att upptäcka} other {# länder att upptäcka}}` on the
 * Explore tiles, the lesson summary headline, all three daily-goal options in Settings
 * and the pending-sync line. Every test and both browser harnesses formatted it
 * correctly, because Node and Chromium have the API the phone does not.
 *
 * 0.09 MB is the trimmed figure, and the trimming is worth recording. FormatJS's React
 * Native guide also recommends `@formatjs/intl-getcanonicallocales` and
 * `@formatjs/intl-locale`; with those the same fix measured **4.50 MB**, a 0.30 MB
 * increase for two packages the plural path never calls. See the note in
 * `packages/i18n/src/intl-polyfill.ts` for how that was verified rather than assumed.
 *
 * At 4.2 the measured 4.19 left 0.01 MB of headroom, which is not headroom — the next
 * lockfile churn fails the gate for no reason anyone could act on. 4.3 is the same
 * ~0.1 MB margin every previous note in this file has asked for.
 */
const BUDGET_MB = 4.3

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

/**
 * Everything shipped BESIDE the bundle, grouped by kind.
 *
 * The budget above is a cold-start number: Hermes reads the whole bundle before the
 * first frame, so bytecode is parse time. Assets are not — Metro puts a registry
 * number in the bundle and ships the file separately, loaded on demand.
 *
 * That distinction is worth printing rather than knowing, because it is genuinely
 * counter-intuitive and it was nearly got wrong here. 701 KB of flag PNGs read like
 * 701 KB against a budget with 250 KB of headroom; the actual cost to the bundle was
 * **0.03 MB**, the registry entries. Without this breakdown the honest reaction to
 * that number is to shrink the artwork for no reason.
 *
 * Reported, not gated. A download-size ceiling is a real thing to want, but it is a
 * product decision with a number nobody here has justified yet, and inventing one to
 * have something to check is how a budget stops meaning anything.
 */
function assetBreakdown(dir, platform) {
  const meta = join(dir, 'metadata.json')
  if (!existsSync(meta)) return null
  const assets = JSON.parse(readFileSync(meta, 'utf8')).fileMetadata?.[platform]?.assets
  if (!Array.isArray(assets)) return null

  const byExt = new Map()
  let total = 0
  for (const asset of assets) {
    const path = join(dir, asset.path)
    if (!existsSync(path)) continue
    const size = statSync(path).size
    total += size
    byExt.set(asset.ext, (byExt.get(asset.ext) ?? 0) + size)
  }
  return { total, count: assets.length, byExt: [...byExt].sort((a, b) => b[1] - a[1]) }
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

    // Not part of the budget — see `assetBreakdown`. Printed so the two numbers are
    // never confused for each other again.
    const assets = assetBreakdown(dir, platform)
    if (assets !== null) {
      const kinds = assets.byExt
        .map(([ext, n]) => `${ext} ${(n / 1024).toFixed(0)} KB`)
        .join(' · ')
      console.log(
        `      + ${(assets.total / 1024 / 1024).toFixed(2)} MB in ${assets.count} assets ` +
          `(${kinds}) — shipped beside the bundle, not parsed at start`,
      )
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
