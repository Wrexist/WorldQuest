const { test } = require('node:test')
const assert = require('node:assert/strict')
const { routeSlug, assertRoute } = require('./browser-harness.cjs')
const { onOnboarding } = require('./onboarding-walk.cjs')
const pageAt = (route) => ({ url: () => `http://localhost:8080${route}` })

test('query routes produce valid Windows filenames', () => {
  assert.equal(routeSlug('/account?mode=link'), 'account-mode-link')
  assert.equal(routeSlug('/country/SE'), 'country-SE')
  assert.equal(routeSlug('/'), 'home')
  assert.doesNotMatch(routeSlug('/paywall?source=settings'), /[<>:"/\\|?*]/)
})

test('redirected screenshots fail instead of being labelled as the requested route', () => {
  assert.throws(() => assertRoute(pageAt('/onboarding'), '/profile'), /refusing misleading evidence/)
  assert.throws(() => assertRoute(pageAt('/explore'), '/country/SE'), /Expected route/)
  assert.throws(
    () => assertRoute(pageAt('/account?mode=signIn'), '/account?mode=link'),
    /wrong screen mode/,
  )
})

test('matching routes accept query strings and trailing slashes', () => {
  assert.doesNotThrow(() => assertRoute(pageAt('/account?mode=link'), '/account?mode=link'))
  assert.doesNotThrow(() => assertRoute(pageAt('/profile/'), '/profile'))
  assert.doesNotThrow(() => assertRoute(pageAt('/'), '/'))
})

test('onboarding detection does not depend on English text', async () => {
  assert.equal(await onOnboarding(pageAt('/onboarding')), true)
  assert.equal(await onOnboarding(pageAt('/onboarding?language=sv')), true)
  assert.equal(await onOnboarding(pageAt('/profile')), false)
})
