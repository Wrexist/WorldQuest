# ADR 0001 — Expo + React Native + TypeScript

**Status:** Accepted **Date:** 2026-07-31

## Context

WorldQuest must ship on iOS and Android with a small team, a motion-heavy design, and
live-ops that needs to change content and configuration without a store review. It
also needs a web presence later (country pages for SEO, a teacher dashboard).

## Decision

**Expo (React Native) with TypeScript**, `expo-router` for navigation, Reanimated 3
for animation, EAS for builds and OTA updates.

## Alternatives considered

| Option | Why not |
|---|---|
| **Native Swift + Kotlin** | Best possible feel, but two codebases and two of every bug for a small team. Not affordable at this scope. |
| **Flutter** | Genuinely good for animated UI, and a real contender. Rejected because Dart isolates the engines from the rest of our TypeScript (edge functions, content tooling, web), which directly undermines the platform thesis. |
| **React Native without Expo** | More native control, but we lose OTA updates and EAS. OTA is how live-ops ships without a review cycle — that's a product capability, not a convenience. |
| **PWA / web-first** | No push reliability, poor offline story, no store presence. Our audience is on app stores. |

## Consequences

**Buys us:** one language across app, server, content tooling and tests; one codebase
for two platforms; OTA content and copy updates; a fast dev loop; the engines are
importable everywhere.

**Costs us:** the JS thread is a real constraint (mitigated: all animation on
Reanimated's UI thread, every list virtualised); a heavier binary than native; some
platform APIs need config plugins; a dependency on Expo's release cadence.

## Reconsider when

- A core feature genuinely requires a native module Expo cannot support via a config
  plugin.
- Performance budgets fail on mid-tier Android after real optimisation effort.
- The team grows past ~10 engineers with dedicated iOS and Android specialists.
