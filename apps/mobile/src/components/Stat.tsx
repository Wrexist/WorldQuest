import { useTheme } from '@worldquest/design'
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
import { DaylightIllustration } from './DaylightIllustration.js'
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

export type StatProps = Omit<StatChipProps, 'icon'> & { prominent?: boolean }

export function Stat({ kind, prominent = false, ...rest }: StatProps) {
  const { colors } = useTheme()
  const size = prominent ? 28 : SIZE
  return (
    <StatChip
      kind={kind}
      icon={kind === 'coin' || kind === 'hearts' || kind === 'gem' ? <DaylightIllustration name={kind === 'coin' ? 'coins' : kind === 'hearts' ? 'heart' : 'gem'} size={size + 2} active={false} /> : <Icon name={ICONS[kind]} size={size} color={chipTint(kind, rest.dim, colors)} />}
      {...rest}
    />
  )
}
