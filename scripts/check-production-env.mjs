import { pathToFileURL } from 'node:url'

const urlKeys = ['EXPO_PUBLIC_D1_URL', 'EXPO_PUBLIC_PRIVACY_URL', 'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_SUPPORT_URL', 'EXPO_PUBLIC_LICENCES_URL']

/** Runs inside EAS, where the actual build environment has been injected. */
export function productionEnvironmentErrors(env) {
  if (env.EAS_BUILD_PROFILE !== 'production' && env.EXPO_PUBLIC_ENV !== 'production') return []
  const errors = []
  if (env.EXPO_PUBLIC_BACKEND !== 'd1') errors.push('EXPO_PUBLIC_BACKEND must be d1.')
  for (const key of urlKeys) {
    try {
      const url = new URL(env[key] ?? '')
      if (url.protocol !== 'https:' || url.username || url.password
        || /^(localhost|127\.|0\.|\[::1\]|.*\.localhost$)/.test(url.hostname)
        || /(^|\.)(test|invalid|example|local)$/.test(url.hostname)
        || /(^|\.)example\.(com|org|net)$/.test(url.hostname)) throw new Error('invalid')
    } catch { errors.push(`${key} must be a real HTTPS URL without embedded credentials.`) }
  }
  return errors
}

/** A reachable health route alone is not enough: disabled Workers still return 200. */
export async function productionBackendErrors(env, transport = fetch) {
  if (env.EAS_BUILD_PROFILE !== 'production' && env.EXPO_PUBLIC_ENV !== 'production') return []
  if (productionEnvironmentErrors(env).length > 0) return []
  try {
    const response = await transport(`${env.EXPO_PUBLIC_D1_URL.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
    })
    if (!response.ok) return ['D1 health check failed. Production requires an available backend.']
    const health = await response.json()
    if (health?.service !== 'worldquest' || health?.backend !== 'cloudflare-d1') {
      return ['D1 health check returned an unexpected service. Verify the production endpoint.']
    }
    if (health.apiEnabled !== true) return ['D1 API is disabled. Complete hosted acceptance and enable the API before building production.']
    return []
  } catch {
    return ['D1 health check could not complete within 10 seconds. Verify the backend and retry the build.']
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = [...productionEnvironmentErrors(process.env), ...await productionBackendErrors(process.env)]
  if (errors.length) {
    console.error('Production build stopped: configure the EAS production environment.\n' + errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log(process.env.EAS_BUILD_PROFILE === 'production' || process.env.EXPO_PUBLIC_ENV === 'production'
      ? 'Production environment configured; D1 API reports enabled. Hosted account and device acceptance still required.'
      : 'Non-production build: hosted environment gate skipped.')
  }
}
