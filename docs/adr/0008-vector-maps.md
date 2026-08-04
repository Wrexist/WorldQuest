# ADR 0008 — Vector SVG maps, not raster tiles

**Status:** Accepted **Date:** 2026-07-31

## Context

Maps are the hero of the product: a tappable globe, continent views, and
"tap the country" questions. They must work offline, be themeable (including a
high-contrast mode and seasonal event themes), and run at 60 fps on mid-tier Android.

## Decision

**Vector geometry rendered with `react-native-svg`** (with Skia as an escape hatch for
the globe if profiling demands it), from simplified Natural Earth data, shipped with
the app. Multiple simplification levels per zoom.

## Alternatives considered

| Option | Why not |
|---|---|
| **Mapbox / Google Maps SDK** | Beautiful and powerful, but online-dependent, per-request cost at our scale, hard to theme, and enormously more map than we need — we don't want streets or search, we want country shapes. |
| **Pre-rendered raster tiles** | Offline-able, but large, not themeable, not crisply scalable, and hit-testing a country becomes a colour-lookup hack. |
| **Static PNG per continent** | Cheapest, but no interaction, no theming, and it looks it. |
| **WebView + Leaflet/D3** | Poor performance, awkward gestures, an extra runtime to debug. |

## Consequences

**Buys us:** fully offline maps; theming for free (fills are design tokens, which is
what makes a seasonal event theme possible); precise per-country hit testing; tiny
asset size; crisp at any zoom.

**Costs us:** geometry preparation and simplification tooling; SVG path count is a
performance constraint (mitigated by per-zoom simplification); the globe projection is
custom work rather than a library call.

**Licensing:** Natural Earth is public domain — deliberately chosen over
OSM-derived data to avoid ODbL attribution obligations. Confirm before shipping.

## Reconsider when

A feature needs real geographic detail (streets, satellite imagery, GeoGuessr-style
street view). That would be a different product surface and could use a map SDK
alongside these vectors.
