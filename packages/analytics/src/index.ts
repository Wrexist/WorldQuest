/**
 * The package entry point.
 *
 * `package.json` has declared `"main": "./src/index.ts"` since the package was created
 * and this file did not exist. Metro resolved it anyway — the events are in the
 * shipped bundle — but vitest could not, which meant `apps/mobile/src/lib/analytics.ts`
 * was not importable by any test in the mobile package.
 *
 * That is the second reason the child-privacy no-op sat broken: the setter was never
 * called from anywhere AND the module holding the rule could not be tested. Neither
 * alone would have been enough to hide it for this long.
 */

export * from './events.js'
