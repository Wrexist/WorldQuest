# ADR 0009 — i18next + ICU, from commit one

**Status:** Accepted **Date:** 2026-07-31

## Context

The founder is Swedish; the market is global; the brief is explicit that translation
must be designed in from the first commit. Retrofitting i18n means touching every
screen, component and test in the product.

## Decision

**i18next** with **ICU MessageFormat**, English and Swedish from v1.0, typed keys
generated from the English locale, and CI checks that fail on a hardcoded user-facing
string or a missing key.

Content strings (country and city names) are translated in the **content packs**, not
the locale files — a country name is a fact, not copy.

## Alternatives considered

| Option | Why not |
|---|---|
| **Ship English, add i18n later** | The single most expensive shortcut available. Rejected explicitly by the brief, and correctly. |
| **`react-intl` / FormatJS** | Very good ICU support; i18next has the better React Native story and namespace-based lazy loading, which matters for bundle size. |
| **Custom `t()` over JSON** | Trivial to start, then you reimplement plurals, gender, interpolation and fallbacks — badly. |
| **Machine translation, unreviewed** | A learning app that speaks broken Swedish loses Swedish users permanently, and they never tell you why. |

## Consequences

**Buys us:** correct plurals and gender in languages that need them; RTL readiness;
typo-proof keys; new locales become a translation job, not an engineering project.

**Costs us:** every string needs a key and a translator note; CI enforcement that
occasionally feels pedantic; layouts must tolerate ~40 % expansion.

**Why Swedish second:** small, testable, and it breaks naive implementations early
(two grammatical genders, compound words, and å/ä/ö sorting after z).

## Reconsider when

Never for the approach. The translation *platform* can change freely — locale files
are portable.
