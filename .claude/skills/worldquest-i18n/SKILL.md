---
name: worldquest-i18n
description: Add, change or translate any user-facing string in WorldQuest. Use whenever writing copy, adding a label, editing a message, adding a locale, or fixing a hardcoded string. Enforces ICU, translator notes, and the no-concatenation rule.
---

# Working with strings

Spec: [`docs/engineering/localization.md`](../../docs/engineering/localization.md) ·
Voice: [`docs/design/voice-and-tone.md`](../../docs/design/voice-and-tone.md).

**No user-facing string is ever a literal.** CI fails on one.

## Adding a string

1. Pick a key: `namespace:screen.element[.variant]` — **semantic, never literal**.
   `lesson:feedback.correct.title`, not `lesson:perfect_exclamation`. The English copy
   will change; the key must not.
2. Add it to `packages/i18n/locales/en/<namespace>.json`.
3. Add a `__note` with translator context.
4. Add the Swedish value, or mark it for translation.
5. `pnpm i18n:types` regenerates the typed key union.

```json
{
  "home:quest.continue": "Continue",
  "home:quest.continue__note":
    "Button label. Verb, imperative — resumes an in-progress lesson. Max 12 chars."
}
```

`__note` is **required** for: any single word, anything under 15 characters, anything
with a placeholder, and anything ambiguous between noun and verb.

## Never concatenate

```tsx
❌  <Text>{t('lesson:youFound')} {country.name}</Text>
❌  <Text>{count} {t('explore:countries')}</Text>
✅  <Text>{t('lesson:youFound', { country: country.name })}</Text>
✅  <Text>{t('explore:countriesLearned', { count })}</Text>
```

Word order differs by language. A concatenated sentence cannot be fixed by a
translator. **The unit of translation is a whole sentence** — never a reusable
fragment, which cannot be conjugated or declined.

## Plurals via ICU, always

```json
"explore:countriesLearned":
  "{count, plural, =0 {No countries yet} one {# country} other {# countries}}"
```

`if (n === 1)` is wrong in most of the world. Swedish, German and Polish have forms
English doesn't.

## Numbers, dates, lists

Always `Intl` via `packages/i18n/src/format.ts`. Never manual formatting — Swedish uses
a space as a thousands separator and sorts å/ä/ö *after* z.

## Copy rules (they apply to accessibility labels too)

- Second person, present tense, active
- Buttons ≤ 3 words · headlines ≤ 8 · body ≤ 2 sentences
- **Never shame.** Not for a wrong answer, a broken streak, or an absence.
- Every message offers a way forward
- Banned: "Oops!", "Uh oh!", "Don't lose your streak!", "You're falling behind", and
  any sentence whose emotional job is anxiety

Wrong-answer formula: *state the truth · name the right answer · one memorable hook ·
move on.* No exclamation mark, no sad emoji, no "but".

## Layout

German and Finnish run ~40 % longer. Buttons size to content with a minimum width and
**never truncate a label**. Test with the pseudo-locale:

```bash
pnpm i18n:pseudo     # inflates strings 40% and adds accents
```

## RTL readiness (plumbing now, locales later)

Use `start`/`end`, never `left`/`right`. Direction-indicating icons mirror.
**Flags, maps, the globe and photographs never mirror.**

## Content strings are different

Country and city names live in the **content packs** (`{ "en": "Japan", "sv": "Japan" }`),
not in locale files — a country name is a fact, sourced from a canonical multilingual
list, never machine-translated.

## CI fails on

A `t()` key missing from `en` · a shipped locale missing a key · a placeholder in `en`
absent from a translation · a raw user-facing string literal in JSX · a required
`__note` that's missing.
