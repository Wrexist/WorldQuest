import { test } from 'node:test'
import assert from 'node:assert/strict'
import { productionEnvironmentErrors, productionBackendErrors } from './check-production-env.mjs'

const ready = { EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_BACKEND: 'd1',
  EXPO_PUBLIC_D1_URL: 'https://worldquest-api.workers.dev',
  EXPO_PUBLIC_PRIVACY_URL: 'https://wrexist.github.io/WorldQuest/privacy.html',
  EXPO_PUBLIC_TERMS_URL: 'https://wrexist.github.io/WorldQuest/terms.html',
  EXPO_PUBLIC_SUPPORT_URL: 'https://wrexist.github.io/WorldQuest/support.html',
  EXPO_PUBLIC_LICENCES_URL: 'https://wrexist.github.io/WorldQuest/licences.html' }
test('production cannot fall back silently to no backend or legacy', () => {
  assert.equal(productionEnvironmentErrors({ EAS_BUILD_PROFILE: 'production' }).length, 6)
  assert.match(productionEnvironmentErrors({ ...ready, EXPO_PUBLIC_BACKEND: 'supabase' })[0], /must be d1/)
})
test('valid hosted configuration passes without claiming device acceptance', () => {
  assert.deepEqual(productionEnvironmentErrors(ready), [])
})
test('local, insecure, placeholder and credential-bearing URLs cannot ship', () => {
  for (const url of ['http://worldquest-api.workers.dev', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://api.example.com', 'https://api.worldquest.test', 'https://worldquest.invalid', 'https://worldquest.local', 'https://user:secret@worldquest-api.workers.dev']) {
    const errors = productionEnvironmentErrors({ ...ready, EXPO_PUBLIC_D1_URL: url })
    assert.equal(errors.length, 1)
    assert.ok(!errors[0].includes('secret'))
  }
})
test('production env still checks when no EAS profile exists; development remains usable offline', () => {
  assert.equal(productionEnvironmentErrors({ EXPO_PUBLIC_ENV: 'production' }).length, 6)
  assert.deepEqual(productionEnvironmentErrors({ EAS_BUILD_PROFILE: 'development' }), [])
})

test('production requires the actual Worker API to be enabled, not just a 200 health route', async () => {
  const fetchHealth = (apiEnabled) => async (url, options) => {
    assert.equal(url, ready.EXPO_PUBLIC_D1_URL + '/health')
    assert.ok(options.signal instanceof AbortSignal)
    return { ok: true, json: async () => ({ service: 'worldquest', backend: 'cloudflare-d1', apiEnabled }) }
  }
  assert.deepEqual(await productionBackendErrors(ready, fetchHealth(true)), [])
  assert.match((await productionBackendErrors(ready, fetchHealth(false)))[0], /API is disabled/)
  assert.match((await productionBackendErrors(ready, fetchHealth(undefined)))[0], /API is disabled/)
})

test('unavailable, unexpected and unreadable health responses cannot authorize a production build', async () => {
  for (const transport of [
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({ apiEnabled: true }) }),
    async () => ({ ok: true, json: async () => { throw new Error('not JSON') } }),
    async () => { throw new Error('timeout') },
  ]) assert.equal((await productionBackendErrors(ready, transport)).length, 1)
})

test('development and invalid configuration never make a readiness request', async () => {
  const unexpectedFetch = async () => { assert.fail('must not fetch') }
  assert.deepEqual(await productionBackendErrors({ EAS_BUILD_PROFILE: 'development' }, unexpectedFetch), [])
  assert.deepEqual(await productionBackendErrors({ EAS_BUILD_PROFILE: 'production' }, unexpectedFetch), [])
})
