/**
 * The achievement catalogue, plus this user's progress against it.
 *
 * Definitions come from the content pack — a JSON file, shipped in the binary, so
 * adding an achievement is a content release. Progress comes from the server, because
 * achievements award XP and coins and a client that could unlock them could mint
 * currency (ADR 0006). Until that table exists, everything reads as locked, which is
 * the truth rather than a placeholder.
 */

import { useMemo } from 'react'
import { emptyProgress, type AchievementDef, type AchievementProgress } from '@worldquest/engines'
import type { AchievementRow } from './AchievementsScreen.js'

import pack from '../../../../../packages/content/packs/achievements/core.v1.json'

/**
 * The pack's `items` are achievement definitions by construction — the schema union
 * in `packages/content/schema/pack.schema.json` admits nothing else into a pack whose
 * `kind` is `achievements`, and `pnpm content:validate` runs in CI.
 */
export const CATALOGUE: readonly AchievementDef[] = pack.items as unknown as AchievementDef[]

/**
 * `ach.flags.collector` → `achievements:flags.collector.name`.
 *
 * The copy convention, in the module that owns the catalogue rather than in a screen.
 * `AchievementsScreen` had it as a local const, and the lesson summary needs the same
 * derivation — two copies of a key-building rule is one copy and one future mismatch.
 */
export const achievementNameKey = (id: string): string =>
  `achievements:${id.slice('ach.'.length)}.name`

export function useAchievements(
  progressById: ReadonlyMap<string, AchievementProgress> = new Map(),
): readonly AchievementRow[] {
  return useMemo(
    () =>
      CATALOGUE.map((def) => ({
        def,
        progress: progressById.get(def.id) ?? emptyProgress(def.id),
      })),
    [progressById],
  )
}
