/**
 * A stat chip with its icon already attached.
 *
 * `StatChip` lives in `packages/design` and takes the picture as a node, because the
 * artwork is an app asset and the dependency rule runs one way. That leaves one
 * question — which icon goes with which kind — and this is the single place that
 * answers it. Fourteen call sites each choosing for themselves is fourteen chances
 * to put a flame on the coin counter.
 *
 * The tint comes from `chipTint`, the same function the chip uses for its border and
 * its number, so the icon can never be a different colour from the value beside it.
 */

import { StatChip, chipTint, type ChipKind, type StatChipProps } from '@worldquest/design'
import { Icon } from './Icon.js'
import type { IconName } from '../lib/icons.generated.js'

const ICONS: Record<ChipKind, IconName> = {
  xp: 'xp',
  coin: 'coins',
  streak: 'streak',
  hearts: 'heart',
  gem: 'gem',
}

/** Matches the 16pt glyph the chips used to draw, at the chip's own optical size. */
const SIZE = 18

export type StatProps = Omit<StatChipProps, 'icon'>

export function Stat({ kind, ...rest }: StatProps) {
  return (
    <StatChip
      kind={kind}
      icon={<Icon name={ICONS[kind]} size={SIZE} color={chipTint(kind)} />}
      {...rest}
    />
  )
}
