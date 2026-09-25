/**
 * The app's outward links: privacy policy, terms, licences and support.
 *
 * Build configuration rather than constants, so publishing the pages (A05) is an EAS
 * environment change, not a code change: set `EXPO_PUBLIC_PRIVACY_URL` and friends for
 * the production profile and the next build carries them.
 *
 * `undefined` when unset, and every caller treats that as "no row" or "no button".
 * A link to nowhere is a dead end App Review rejects (2.1) and a user reads as a lie;
 * absent is honest. HTTPS only: anything else is treated as unset.
 */

const https = (value: string | undefined): string | undefined =>
  value !== undefined && /^https:\/\/[^\s]+$/.test(value) ? value : undefined

export const PRIVACY_URL: string | undefined = https(process.env.EXPO_PUBLIC_PRIVACY_URL)
export const TERMS_URL: string | undefined = https(process.env.EXPO_PUBLIC_TERMS_URL)
export const LICENCES_URL: string | undefined = https(process.env.EXPO_PUBLIC_LICENCES_URL)
export const SUPPORT_URL: string | undefined = https(process.env.EXPO_PUBLIC_SUPPORT_URL)
