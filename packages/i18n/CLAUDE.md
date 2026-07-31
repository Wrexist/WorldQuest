# `packages/i18n`

`locales/<lang>/<namespace>.json`. `src/keys.ts` is **generated** from `en/` — a typo
in a `t()` call is a type error.

- Keys are `namespace:screen.element`, **semantic never literal**, and permanent.
- **Never concatenate.** `t('lesson:youFound', { country })`, not `t('...') + name`.
- Plurals via **ICU**, never `if (n === 1)` — Swedish and German need forms English
  doesn't have.
- Every short or ambiguous string needs a `__note` for the translator.
- Country and city names live in the **content packs**, not here — a country name is
  a fact, not copy.

```bash
pnpm i18n:check · pnpm i18n:types · pnpm i18n:pseudo
```

Spec: [`../../docs/engineering/localization.md`](../../docs/engineering/localization.md)
