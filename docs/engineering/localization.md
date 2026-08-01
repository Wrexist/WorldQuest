# Localisation

> "Don't wait. Build for translation from the first commit. Never hardcode strings."

Exactly right, and the reason is arithmetic: retrofitting i18n across a finished app
means touching every screen, every component, and every test. Doing it from commit one
costs roughly nothing.

**v1.0:** English, Swedish. **v2.0:** Spanish, German, French, Portuguese.
**Later:** Italian, Dutch, Polish, Japanese, and the RTL languages.

---

## 1. Stack

**i18next** + **ICU MessageFormat**, via `react-i18next`.

ICU because Swedish, German and Polish have plural and gender rules English doesn't,
and `if (n === 1)` is wrong in most of the world.

```
packages/i18n/
  locales/
    en/     common.json  home.json  lesson.json  nav.json  notifications.json
            (explore · profile · settings · achievements · errors follow with their screens)
    sv/     same files, same keys
    en-XA/  GENERATED pseudo-locale, gitignored — pnpm i18n:pseudo
  src/
    index.ts          # init, detection, fallback, the typed `t`
    keys.ts           # GENERATED — typed key union + per-key params
    format.ts         # number, date, list, relative-time, collation
    icu.ts            # the ICU MessageFormat adapter — see ADR 0009
  scripts/
    check.ts          # the CI gate
    keys.ts           # the key generator, as a pure function
    build-keys.ts     # writes src/keys.ts
    pseudo-text.ts    # the pseudo-localisation transform
    pseudo.ts         # writes locales/en-XA/
```

`t` is typed against the generated union in both directions: an unknown key is a
compile error, **and so is a missing placeholder**. `t('home:level')` does not compile
without `{ level }`. That second half is the one that catches real bugs — a missing
placeholder renders as the literal text `{level}`, which no test that merely asserts
"the key resolved" will ever notice.

Keys that come from a **content pack** — a question template names its own prompt —
use `tContent`, which is unchecked by the compiler and validated by
`pnpm content:validate` instead. Reaching for it anywhere else silently opts out.

## 2. Keys

`namespace:screen.element[.variant]`

```
home:greeting.morning
home:quest.continue
lesson:prompt.capital_of
lesson:feedback.correct.title
lesson:feedback.wrong.body
settings:notifications.daily.label
errors:network.offline.title
achievements:flags.collector.name
```

**Rules**
- Namespaces map to screens/features so a screen loads only its own bundle.
- Keys are **semantic, never literal**: `lesson:feedback.correct.title`, never
  `lesson:perfect_exclamation`. The English copy will change; the key must not.
- Keys are permanent. Renaming one orphans every translation.
- `keys.ts` is generated from `en/`, so `t('home:greting.morning')` is a **type error**.

## 3. Rules

### 3.1 Never concatenate

```tsx
❌  <Text>{t('lesson:youFound')} {country.name}</Text>
✅  <Text>{t('lesson:youFound', { country: country.name })}</Text>
```

Word order differs by language. Concatenation produces sentences no translator can fix.

### 3.2 Never build a sentence from fragments

The unit of translation is a **whole sentence**. A "reusable" fragment is a fragment
that cannot be conjugated, declined, or reordered.

### 3.3 Plurals via ICU

```json
{
  "explore:countriesLearned":
    "{count, plural, =0 {No countries yet} one {# country} other {# countries}}"
}
```

Swedish, German and Polish need forms English doesn't have. ICU handles it; a ternary
does not.

### 3.4 Gender and grammatical case

Some languages inflect country names. Where a name appears inside a sentence, the
locale file may carry inflected forms:

```json
{ "lesson:capitalOf": "Vad är huvudstaden i {country}?" }
```

If a language needs a case the data doesn't have, that's a **content** problem —
solved in the entity's locale data, not with a string hack in a component.

### 3.5 Numbers, dates, lists

Always `Intl`. Never manual formatting.

```ts
formatNumber(125_800_000, locale)   // "125,800,000" / "125 800 000"
formatDate(date, locale)
formatList(['Japan','Korea','China'], locale)
formatRelative(-3, 'day', locale)   // "3 days ago" / "för 3 dagar sedan"
```

### 3.6 Layout expansion

German and Finnish run **~40 % longer** than English; Japanese and Chinese are much
shorter.

- Buttons size to content with a minimum width; they never truncate a label.
- Test every screen with a **pseudo-locale** (`en-XA`) that inflates strings by 40 %
  and adds accents. It catches truncation before a translator ever sees it.
  `enablePseudoLocale()` builds it in memory from the English bundle at runtime —
  no generated files to commit or keep in step. `pnpm i18n:pseudo` additionally
  writes the bundle to disk and reports the longest strings.
- Never fix a layout to an English string's width.

### 3.7 RTL

Arabic and Hebrew are not v1.0, but the plumbing is:

- Use `start`/`end`, never `left`/`right`, in every style.
- `I18nManager.isRTL` drives layout; icons that indicate direction (back, next) mirror.
- **Flags, maps, the globe, and photographs never mirror.** A mirrored flag is wrong.
- Numbers and progress bars follow the locale's direction.

## 4. Translator context

A key with no context gets mistranslated. Every string ships with a note:

```json
{
  "home:quest.continue": "Continue",
  "home:quest.continue__note":
    "Button label. Verb, imperative — resumes an in-progress lesson. Max 12 chars."
}
```

`__note` keys are stripped at build time. Required for: any single word, any string
under 15 characters, anything with a placeholder, and anything where "Continue" could
be a noun.

## 5. Content vs UI strings

Two different systems — don't confuse them.

| | UI strings | Content |
|---|---|---|
| Lives in | `packages/i18n/locales/` | `packages/content/packs/` |
| Example | "Which country's flag is this?" | "Japan" / "Tokyo" |
| Translated by | Translators | Content authors, from authoritative sources |
| Changes | With design | With facts |

Country and city names in the content packs are `{ "en": "Japan", "sv": "Japan" }` —
**translated at the data layer**, because a country name is a fact, not copy. Sourced
from a canonical list (UN multilingual country names), never machine-translated.

## 6. Workflow

```
dev writes t('key')  →  adds en value + __note
      ↓  CI: key exists in en? note present where required?
      ↓  export en → translation platform
      ↓  translate → review by a native speaker
      ↓  import → CI: all shipped locales complete?
      ↓  pseudo-locale screenshot test
      ↓  ship
```

**CI fails on:** a `t()` call with a key missing from `en` · a shipped locale missing a
key · a placeholder present in `en` but absent in a translation · a raw user-facing
string literal in JSX.

That last check is the one that keeps the whole system honest. Without it, English
leaks back in within a month.

## 7. Locale selection

1. User's explicit choice in Settings (persisted)
2. Device locale, if we ship it
3. Device language without region (`sv-FI` → `sv`)
4. `en`

Changing the language applies immediately, without a restart. Content packs for the
new locale download if needed, with the English content as a fallback rather than a
blank screen.

## 8. Swedish first (after English)

Deliberate: the founder is Swedish, it's a small and testable market, and it forces
real i18n discipline early (Swedish has two grammatical genders, compound words, and
"å ä ö" — enough to break naive implementations before they spread).

Swedish specifics:
- `en`/`ett` genders affect articles in generated sentences
- Compounds get long: *"Huvudstadsutmaning"* — layouts must cope
- Sorting: å, ä, ö come **after** z. Use `Intl.Collator('sv')`, never a raw sort.
- Date format `2026-07-31`, 24-hour time, space as thousands separator

## 9. Quality

| Check | When |
|---|---|
| Key coverage per locale | CI |
| Placeholder parity | CI |
| No hardcoded user-facing strings | CI (ESLint rule) |
| Pseudo-locale screenshots | CI, per screen |
| Native-speaker review | Before each locale ships |
| In-app language switch smoke test | Per release |
| RTL layout audit | Before an RTL locale ships |

**Never machine-translate without review.** A learning app that speaks broken Swedish
loses Swedish users permanently — and they will not tell you why.
