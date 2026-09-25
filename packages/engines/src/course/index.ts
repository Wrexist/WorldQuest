/**
 * The course engine — a finite path of units and nodes over a pack's facts.
 *
 * The logic lives in `path.ts` so the coverage gate measures it (`src/**\/index.ts` is
 * excluded there); this file is the surface.
 *
 * Spec: docs/product/launch-brief.md (first week), docs/systems/content-pipeline.md
 * (course packs).
 */

export * from './path.js'
