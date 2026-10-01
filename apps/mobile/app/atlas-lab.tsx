/**
 * `/atlas-lab` — the 3D atlas renderer proof. Development tooling only (ADR 0017).
 *
 * A production export without EXPO_PUBLIC_ATLAS_LAB=1 renders a redirect here, and the
 * lab itself is not in that bundle at all: the `require` sits behind a condition Metro
 * constant-folds at build time (`__DEV__` and the inlined env var), so the dependency is
 * never collected. That is ~4 KB of a bundle with no headroom to spare.
 */

import type { ComponentType } from 'react'
import { Redirect } from 'expo-router'

const Lab: ComponentType | null =
  __DEV__ || process.env.EXPO_PUBLIC_ATLAS_LAB === '1'
    ? (require('../src/features/atlas/AtlasLab') as typeof import('../src/features/atlas/AtlasLab.js')).AtlasLab
    : null

export default function AtlasLabRoute() {
  if (Lab === null) return <Redirect href="/" />
  return <Lab />
}
