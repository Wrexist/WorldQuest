import { describe, expect, it, afterEach } from 'vitest'
import {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  collator,
  currentLocale,
  formatCompact,
  formatDuration,
  formatList,
  formatNumber,
  formatPercent,
  PSEUDO_LOCALE,
  enablePseudoLocale,
  i18n,
  resolveLocale,
  setLocale,
  t,
} from './index.js'
import { hasPluralRules, pluralRulesArePolyfilled } from './intl-polyfill.js'
import { NAMESPACES } from './keys.js'
import { generateKeys } from '../scripts/keys.js'
import { pseudo } from './pseudo.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Every test that changes language puts it back. A leaked language turns the next
// test's failure into a mystery.
afterEach(async () => {
  await setLocale(FALLBACK_LOCALE)
})

const keysOf = (locale: string, ns: string): string[] =>
  Object.keys(
    JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'locales', locale, `${ns}.json`), 'utf8'),
    ) as Record<string, string>,
  ).filter((k) => !k.endsWith('__note'))

describe('generated keys', () => {
  it('is in step with the English catalogue', () => {
    // A stale generated file is worse than no generated file: it compiles, so it
    // looks right, until a key that no longer exists renders as itself on screen.
    // Adding a string and forgetting `pnpm i18n:types` fails here rather than in
    // review.
    const { source } = generateKeys(join(import.meta.dirname, '..', 'locales', 'en'))
    const committed = readFileSync(join(import.meta.dirname, 'keys.ts'), 'utf8')
    expect(source, 'src/keys.ts is stale — run `pnpm i18n:types`').toBe(committed)
  })
})

describe('pseudo-locale', () => {
  it('expands the copy inside plural branches, not just around them', () => {
    // The naive implementation leaves everything between braces alone, which expands
    // an all-ICU string by exactly zero percent — and those are the longest strings
    // in the catalogue. It looked like it worked, and tested nothing.
    const source = '{count, plural, =0 {No friends online} other {# friends online}}'
    const result = pseudo(source)
    expect(result.length).toBeGreaterThan(source.length)
  })

  it('leaves every placeholder and selector intact', () => {
    // A mangled `{count}` no longer matches the parameter the code passes, so the
    // string renders as its own pattern — a broken bundle instead of a wide one.
    for (const source of [
      'Level {level}',
      '{current} / {total}',
      '{count, plural, =0 {No streak yet} one {# day streak} other {# day streak}}',
    ]) {
      const result = pseudo(source)
      for (const token of source.match(/\{\w+(?=[,}])/g) ?? []) {
        expect(result, `${token} was mangled in "${result}"`).toContain(token)
      }
      // Structure is preserved: same braces, still parseable.
      expect([...result].filter((c) => c === '{').length).toBe(
        [...source].filter((c) => c === '{').length,
      )
    }
    expect(pseudo('{count, plural, one {# day} other {# days}}')).toContain('plural,')
  })

  it('produces something a translator can tell apart from English', () => {
    expect(pseudo('Continue')).not.toBe('Continue')
  })

  it('can be switched on at runtime, built from the English bundle', async () => {
    // Generated in memory rather than loaded from files, so it can never be stale
    // and there is nothing to commit. This is the whole point of E4.
    await expect(enablePseudoLocale()).resolves.toBe(true)
    expect(i18n.language).toBe(PSEUDO_LOCALE)

    const rendered = t('common:continue')
    expect(rendered).not.toBe('Continue')
    // Accented AND wider — the two things it exists to surface.
    expect(rendered).toMatch(/[áéíóúñçšž]/i)
    expect(rendered.length).toBeGreaterThan('Continue'.length)

    // ICU still parses: the placeholders survived the transform.
    const plural = t('home:streak.days', { count: 12 })
    expect(plural).toContain('12')
    expect(plural).not.toContain('{')

    await setLocale(FALLBACK_LOCALE)
  })
})

describe('catalogue', () => {
  it('resolves every generated key in every shipped locale', () => {
    // The strongest guarantee this package can offer: if keys.ts, the English files
    // and the translations ever drift apart, this fails rather than a screen quietly
    // rendering "home:greeting.morning" to a user.
    const missing: string[] = []
    for (const locale of SUPPORTED_LOCALES) {
      for (const ns of NAMESPACES) {
        for (const key of keysOf('en', ns)) {
          if (!i18n.exists(key, { lng: locale })) missing.push(`${locale} → ${key}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('strips translator notes out of the runtime bundle', () => {
    // __note keys are context for a human, not strings anyone renders. Shipping them
    // is dead weight in the bundle and a key a fuzzer could surface on screen.
    expect(i18n.exists('common:continue__note')).toBe(false)
    expect(i18n.exists('common:continue')).toBe(true)
  })

  it('renders a plain key', () => {
    expect(t('common:continue')).toBe('Continue')
  })

  it('interpolates a placeholder rather than leaking the pattern', () => {
    // The bug this guards: a missing or misnamed param renders the literal text
    // "{level}" on screen. Invisible to a test that only asserts the key resolved.
    const rendered = t('home:level', { level: 11 })
    expect(rendered).toBe('Level 11')
    expect(rendered).not.toContain('{')
  })
})

describe('ICU plurals', () => {
  it('selects the exact-zero branch over the keyword branches', () => {
    // `=0` beating `other` is ICU behaviour the old hand-rolled shim had to special
    // case. Getting it wrong reads as "0 day streak" instead of "No streak yet".
    expect(t('home:streak.days', { count: 0 })).toBe('No streak yet')
  })

  it('selects one and other, substituting #', () => {
    expect(t('home:streak.days', { count: 1 })).toBe('1 day streak')
    expect(t('home:streak.days', { count: 12 })).toBe('12 day streak')
  })

  it('handles a nested plural inside a sentence', () => {
    expect(t('home:friends.online', { count: 0 })).toBe('No friends online')
    expect(t('home:friends.online', { count: 1 })).toBe('1 friend online')
    expect(t('home:friends.online', { count: 12 })).toBe('12 friends online')
  })

  it('applies the target language plural rules, not English ones', async () => {
    await setLocale('sv')
    const one = t('home:friends.online', { count: 1 })
    const many = t('home:friends.online', { count: 12 })
    expect(one).not.toBe(many)
    expect(one).toContain('1')
    expect(many).toContain('12')
    expect(one).not.toContain('{')
  })
})

/**
 * The suite that would have caught the bug the four other harnesses could not.
 *
 * Every plural in the shipped app rendered as its own ICU source on device, for one
 * reason: **Hermes implements no `Intl.PluralRules`**. `intl-messageformat` throws at
 * construction, `icu.ts` returns the raw pattern rather than crash a screen, and users
 * read `{count, plural, one {# land att upptäcka} other {# länder att upptäcka}}` on
 * the Explore tiles.
 *
 * It survived every check in the repo because every check runs somewhere with a
 * complete `Intl` — Node here, jsdom in the component tests, Chromium in `design:shots`
 * and `e2e`. Four green harnesses, all of them structurally unable to see it.
 *
 * The polyfill is the fix; this is what keeps it. Deleting `Intl.PluralRules` from a
 * Node process is the closest this can get to standing where Hermes stands, and it is
 * close enough: it is the exact API the formatter reaches for and does not find.
 */
/**
 * The suite that covers what the four other harnesses structurally cannot.
 *
 * Every plural in the shipped app rendered as its own ICU source on device, for one
 * reason: **Hermes implements no `Intl.PluralRules`**. `intl-messageformat` throws at
 * construction, `icu.ts` returns the raw pattern rather than crash a screen, and users
 * read `{count, plural, one {# land att upptäcka} other {# länder att upptäcka}}` on
 * the Explore tiles, the lesson summary and all three Settings goal options.
 *
 * It survived every check in the repo because every check runs somewhere with a
 * complete `Intl` — Node here, jsdom in the component tests, Chromium in `design:shots`
 * and `e2e`. Four green harnesses, none of them able to see it.
 *
 * Deleting `Intl.PluralRules` at runtime does NOT reproduce it, and that was the first
 * attempt: the polyfill decides what to install when the module loads, so by the time a
 * test deletes the global there is nothing left to stand in for it. The reproduction is
 * real and the test built on it was measuring the wrong thing.
 *
 * What closes the gap instead is `polyfill-force` — the app now runs FormatJS's
 * implementation in every environment, so the branch this test picks is chosen by the
 * same code that will choose it on a phone. These assertions guard that property.
 */
describe('plural rules come from the same implementation the device uses', () => {
  it('runs FormatJS here, not the engine', () => {
    // If this ever reads false, the import in intl-polyfill.ts went back to the
    // conditional `polyfill` and this suite has quietly stopped covering the device.
    expect(pluralRulesArePolyfilled()).toBe(true)
    expect(hasPluralRules()).toBe(true)
  })

  it('picks Swedish branches through it', async () => {
    await setLocale('sv')
    // Keys the suite above does not touch: formatters are cached per (locale, key,
    // value), so a pattern compiled earlier would pass without formatting anything.
    const one = t('explore:region.size', { count: 1 })
    const many = t('explore:region.size', { count: 19 })
    expect(one).not.toContain('{')
    expect(many).not.toContain('{')
    expect(one).not.toBe(many)
    expect(many).toContain('19')
    await setLocale('en')
  })

  it('picks English branches through it', () => {
    const one = t('explore:region.size', { count: 1 })
    const many = t('explore:region.size', { count: 19 })
    expect(one).toBe('1 country to meet')
    expect(many).toBe('19 countries to meet')
  })
})

describe('locale selection', () => {
  it('prefers an exact supported match', () => {
    expect(resolveLocale(['sv', 'en'])).toBe('sv')
  })

  it('falls back from a region to its language', () => {
    // A Swedish speaker in Finland gets Swedish, not English. Spec §7.
    expect(resolveLocale(['sv-FI'])).toBe('sv')
    expect(resolveLocale(['en_GB'])).toBe('en')
  })

  it('skips locales we do not ship', () => {
    expect(resolveLocale(['de-DE', 'ja', 'sv'])).toBe('sv')
  })

  it('lands on English when nothing matches', () => {
    expect(resolveLocale(['ja', 'ko'])).toBe('en')
    expect(resolveLocale([])).toBe('en')
    expect(resolveLocale([''])).toBe('en')
  })

  it('changes language without a restart', async () => {
    expect(t('common:continue')).toBe('Continue')
    await setLocale('sv')
    expect(currentLocale()).toBe('sv')
    expect(t('common:continue')).toBe('Fortsätt')
  })
})

describe('formatters', () => {
  it('groups thousands the way each locale does', () => {
    expect(formatNumber(125_800_000, 'en')).toBe('125,800,000')
    // Swedish groups with a non-breaking space. Asserting the separator is NOT a
    // comma is the point; asserting which flavour of space is brittle across ICU
    // versions and tells us nothing extra.
    const sv = formatNumber(125_800_000, 'sv')
    expect(sv).not.toContain(',')
    expect(sv.replace(/[\s  ]/g, '')).toBe('125800000')
  })

  it('compacts large stats so a chip does not have to grow', () => {
    expect(formatCompact(12_850, 'en')).toBe('12.9K')
  })

  it('formats a percentage without decimals', () => {
    expect(formatPercent(0.842, 'en')).toBe('84%')
  })

  it('joins a list with the locale conjunction', () => {
    expect(formatList(['Japan', 'Korea', 'China'], 'en')).toBe('Japan, Korea, and China')
    expect(formatList(['Japan', 'Korea', 'China'], 'sv')).toContain('och')
  })

  it('sorts å, ä and ö after z in Swedish but not in English', () => {
    const names = ['Österrike', 'Zimbabwe', 'Andorra', 'Ängelholm']

    // Swedish: å, ä, ö are their own letters, at the END of the alphabet.
    expect([...names].sort(collator('sv').compare)).toEqual([
      'Andorra',
      'Zimbabwe',
      'Ängelholm',
      'Österrike',
    ])

    // English: they are accented A and O, and sort with them. Same data, different
    // order — which is the whole reason a locale-aware comparator exists. Getting
    // this wrong is invisible to everyone except the users it is wrong for.
    expect([...names].sort(collator('en').compare)).toEqual([
      'Andorra',
      'Ängelholm',
      'Österrike',
      'Zimbabwe',
    ])
  })

  it('sorts case-insensitively, which a raw sort does not', () => {
    // `.sort()` compares UTF-16 code units, so every capital letter sorts before
    // every lowercase one: "Zimbabwe" lands before "andorra".
    const names = ['Zimbabwe', 'andorra', 'Belgium']
    expect([...names].sort(collator('en').compare)).toEqual(['andorra', 'Belgium', 'Zimbabwe'])
    expect([...names].sort()).toEqual(['Belgium', 'Zimbabwe', 'andorra'])
  })

  it('pads a countdown so its width does not jitter', () => {
    expect(formatDuration(51_738_000, 'en')).toBe('14:22:18')
    expect(formatDuration(5_000, 'en')).toBe('00:00:05')
    expect(formatDuration(-1, 'en')).toBe('00:00:00')
  })
})
