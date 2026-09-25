/**
 * The banner at the top of each unit: which unit, what it is for, and how far along.
 *
 * The donor's unit banner is "SECTION 1, UNIT 1" over the unit's topic, in a block of
 * the unit's colour. The shape is taken — a small label, the title, one objective line —
 * and the colour block is not: on this canvas a card is a lit surface and colour is
 * rationed to meaning (green is the primary action a few points below), which is the
 * same call graft four made for Home's quest card.
 *
 * One heading per unit, and it carries the label and the title together ("Unit 1: First
 * countries"), so a screen-reader user moving by heading lands on each unit in path
 * order and hears which one it is in a single stop.
 *
 * Atlas stands in the CURRENT unit's banner, cut by the card's edge the way he was on
 * the quest card this path replaces as Home's primary — one mascot on the screen, beside
 * the part of the path you are on.
 */

import { StyleSheet, Text, View } from 'react-native'
import { Card, ProgressBar, colors, space, text } from '@worldquest/design'
import { tContent, useT } from '../../../lib/i18n.js'
import { Art } from '../../../components/Art.js'
import type { PathUnitView } from '../pathView.js'

/**
 * Atlas in the banner. Smaller than the 132 he had on the quest card: that card was the
 * whole primary action, and this banner is a label above it — he accompanies the path
 * rather than presenting it.
 */
const BANNER_ART = 88

export type UnitHeaderProps = {
  readonly unit: PathUnitView
  readonly withAtlas: boolean
}

export function UnitHeader({ unit, withAtlas }: UnitHeaderProps) {
  const t = useT()
  const title = tContent(unit.titleKey)
  const count = t('home:path.unit.progress', { done: unit.done, total: unit.nodes.length })

  return (
    <Card level={unit.state === 'current' ? 2 : 1} style={styles.card} testID="path-unit">
      <View style={styles.body}>
        <View style={styles.words}>
          <View accessible role="heading" aria-label={t('home:path.unit.heading', { number: unit.number, title })}>
            <Text style={styles.label}>{t('home:path.unit', { number: unit.number })}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          <Text style={styles.objective}>{tContent(unit.objectiveKey)}</Text>
        </View>
        {withAtlas && (
          // Decorative: the words beside him already say everything he could.
          <View style={styles.art} pointerEvents="none" aria-hidden>
            <Art name="atlas/explorer" size={BANNER_ART} />
          </View>
        )}
      </View>
      <ProgressBar
        current={unit.done}
        total={Math.max(1, unit.nodes.length)}
        tone="progress"
        showCount={false}
        label={count}
        valueText={count}
      />
    </Card>
  )
}

const styles = StyleSheet.create({
  // Clipped so Atlas stops at the card's rounded edge — the frame is a window onto him,
  // which is the mechanic the quest card measured and kept.
  card: { gap: space[3], overflow: 'hidden' },
  body: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  words: { flex: 1, gap: space[1] },
  label: { ...text('overline'), color: colors.text.secondary },
  title: { ...text('h3'), color: colors.text.primary },
  objective: { ...text('body'), color: colors.text.secondary },
  // Bleeds past the card's end edge and a little below its row, as on the quest card.
  // `End`, not `Right`: the whole card mirrors in RTL and he belongs to whichever side
  // the words are not on.
  art: { marginEnd: -space[4], marginVertical: -space[2] },
})
