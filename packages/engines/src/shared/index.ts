/**
 * Shared ports for the WorldQuest engines.
 *
 * Everything in `packages/engines` is pure: no React, no network, no `Date.now()`,
 * no `Math.random()`. Time and randomness enter through these interfaces, which is
 * what lets the identical module run in the app (optimistic UI) and in the
 * `submit-lesson` edge function (authoritative grading) and agree exactly.
 *
 * See docs/engineering/architecture.md and docs/systems/learning-engine.md.
 */

/** Injected clock. Never call Date.now() inside an engine. */
export type Clock = { now(): number }

/** Injected, seedable RNG. Never call Math.random() inside an engine. */
export type Rng = { next(): number }

/**
 * mulberry32 — small, fast, and deterministic given a seed.
 * Determinism matters twice here: lesson composition must be reproducible for
 * friend challenges (both players get the same questions), and every engine test
 * asserts that the same seed produces the same output.
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

/** Fisher–Yates using an injected Rng. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Expected failures are values, not exceptions. Throw only for programmer error.
 * See PROJECT.md §5.1.
 */
export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export type AppError = {
  code: string
  message: string
  cause?: unknown
}

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const MS_PER_DAY = 86_400_000

export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n))
