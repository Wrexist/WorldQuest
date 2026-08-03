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
 * Run: pnpm bundle:native
 */

const { execFileSync } = require('node:child_process')
const { existsSync, readdirSync, statSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const OUT = join(process.cwd(), 'node_modules', '.cache', 'wq-native')
const MOBILE = join(process.cwd(), 'apps', 'mobile')

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
    if (size === 0) {
      failed++
      console.log(`  ✗ ${platform.padEnd(8)} export succeeded but produced no .hbc bundle`)
    } else {
      console.log(`  ✓ ${platform.padEnd(8)} ${(size / 1024 / 1024).toFixed(2)} MB`)
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
console.log(
  '✓ both platforms bundle.\n' +
    '  This proves the graph compiles for each platform. It does NOT prove the app runs:\n' +
    '  nothing here executes the bundle. That still needs a device.\n',
)
