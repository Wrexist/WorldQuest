/** Explicit locale keeps English selectors independent of the host's language. */
const browserContext = { locale: 'en-US', timezoneId: 'Europe/Stockholm' }

function routeSlug(route) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-zA-Z0-9._-]/g, '-')
}

/** Do not attach measurements to a route that redirected back to onboarding. */
function assertRoute(page, route) {
  const actualUrl = new URL(page.url())
  const expectedUrl = new URL(route, page.url())
  const actual = actualUrl.pathname.replace(/\/$/, '') || '/'
  const expected = expectedUrl.pathname.replace(/\/$/, '') || '/'
  if (actual !== expected) {
    throw new Error(`Expected route ${expected}, but rendered ${actual}; refusing misleading evidence`)
  }
  for (const [key, value] of expectedUrl.searchParams) {
    if (actualUrl.searchParams.get(key) !== value) {
      throw new Error(`Expected ${key}=${value} on ${expected}; refusing evidence for the wrong screen mode`)
    }
  }
}

module.exports = { browserContext, routeSlug, assertRoute }
