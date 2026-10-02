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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = productionEnvironmentErrors(process.env)
  if (errors.length) {
    console.error('Production build stopped: configure the EAS production environment.\n' + errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log(process.env.EAS_BUILD_PROFILE === 'production' || process.env.EXPO_PUBLIC_ENV === 'production'
      ? 'Production environment configured. Hosted account and device acceptance still required.'
      : 'Non-production build: hosted environment gate skipped.')
  }
}
