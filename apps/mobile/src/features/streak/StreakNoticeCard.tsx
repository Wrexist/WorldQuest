/**
 * The streak card on Home: a freeze that did its job, or a streak that can come back.
 *
 * What to say is decided in `streakNotice.ts`; this draws it. A card rather than a
 * popup, as the owner asked — news about the streak, sitting under the day's quest, that
 * the learner can act on or wave away. It never interrupts anything.
 *
 * ## What it will not say
 *
 * No countdown: the repair window is stated in hours on the streak screen, where the
 * decision is made, and not ticked at anyone from Home. No loss words: the freeze card
 * says what the freeze DID, never what would have happened without it; the repair card
 * says what can be done and what it costs. Coins only ever come from lessons, and the
 * button opens the streak screen — it buys nothing itself.
 *
 * ## States
 *
 * Hidden is the normal state: `streakNotice` returns null unless one of the two things
 * is true today, and a dismissed card never comes back. Offline changes nothing here —
 * the card is local, and the streak screen it opens already says that buying a repair
 * needs a connection.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Button, Card, colors, layout, space, text } from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { Icon } from '../../components/Icon.js'
import type { StreakNotice } from './streakNotice.js'

export type StreakNoticeCardProps = {
  readonly notice: StreakNotice
  /** Hides this card for good. */
  readonly onDismiss: () => void
  /** Opens the streak screen, where a repair is bought. Absent draws no button. */
  readonly onOpenStreak?: (() => void) | undefined
}

/** The same size as the globe on Home's world card: a mark, not a hero. */
const ART = 56

export function StreakNoticeCard({ notice, onDismiss, onOpenStreak }: StreakNoticeCardProps) {
  const t = useT()

  const title =
    notice.kind === 'freeze'
      ? t('home:streakNotice.freeze.title', { count: notice.streak })
      : t('home:streakNotice.repair.title', { count: notice.streak })
  const body =
    notice.kind === 'freeze'
      ? t('home:streakNotice.freeze.body')
      : t('home:streakNotice.repair.body', { price: notice.price })

  return (
    <Card level={2} style={styles.card} testID={`streak-notice-${notice.kind}`}>
      <View style={styles.row}>
        {/* The freeze, or the flame — the same art the streak screen draws for each.
            Decorative: the heading says it. */}
        <View pointerEvents="none">
          <Art
            name={notice.kind === 'freeze' ? 'rewards/streak-freeze' : 'rewards/streak-flame'}
            size={ART}
          />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} role="heading" aria-level={2}>
            {title}
          </Text>
          <Text style={styles.body}>{body}</Text>
        </View>
        {/* The X: a universally understood control, so an icon alone is allowed — with
            the ACTION as its name, and a 44pt target around an 18pt glyph. */}
        <Pressable
          role="button"
          aria-label={t('home:streakNotice.dismiss')}
          onPress={onDismiss}
          hitSlop={space[1]}
          style={styles.close}
          testID="streak-notice-dismiss"
        >
          <Icon name="close" size={18} color={colors.text.secondary} />
        </Pressable>
      </View>

      {/* Secondary, never green: the quest card above owns this screen's one primary. */}
      {notice.kind === 'repair' && onOpenStreak !== undefined && (
        <Button
          label={t('home:streakNotice.repair.cta')}
          variant="secondary"
          onPress={onOpenStreak}
          testID="streak-notice-open"
        />
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  // Takes whatever the art and the X leave, and wraps — at 200 % text this is several
  // lines, never a clipped one.
  text: { flex: 1, gap: space[1] },
  title: { ...text('h3'), color: colors.text.primary },
  body: { ...text('body'), color: colors.text.secondary },
  close: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    // Into the card's padding, so the glyph lines up with the text's top edge while the
    // target keeps its full size. `End`, so it moves with the reading direction.
    marginEnd: -space[2],
    marginTop: -space[2],
  },
})
