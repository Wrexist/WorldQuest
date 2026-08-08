/**
 * Paused — the lesson state the machine has had since it was written, with no way in.
 *
 * Two things were missing, and the second is the serious one:
 *
 * 1. `PAUSE` and `RESUME` existed in the machine and nothing ever sent them.
 * 2. **There was no close button.** The catalogue lists one first among the runner's
 *    controls (screen-catalog.md §5) and it had never been built, so a user who
 *    started a lesson could not leave it except by answering ten questions. The route
 *    also sets `gestureEnabled: false` — correctly, so a stray swipe cannot discard
 *    answers — which means the only exits were finishing or killing the app. For a
 *    ten-year-old asked to come to dinner, killing the app was the exit.
 *
 * ## Leaving is safe, and the copy has to say so
 *
 * `ABANDON` keeps every answer already given and still submits them. So there is no
 * "you will lose your progress" warning here, because there is no progress to lose —
 * inventing that threat to keep someone in a lesson is the exact dark pattern this
 * product refuses. The confirm exists to stop an *accidental* exit, not to argue with
 * a deliberate one.
 *
 * Resume is the primary action because that is what most taps of a close button
 * actually want. Leaving is one tap away and never buried.
 *
 * It REPLACES the runner rather than covering it. An overlay hid the question from
 * sight while leaving it in the accessibility tree, which is a free look at a
 * scheduled item for exactly the users who cannot see that it is covered.
 */

import { StyleSheet, Text, View } from 'react-native'
import { Button, Card, colors, space, text } from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'

export type PausedProps = {
  /** How many questions have been answered so far — what "kept" concretely means. */
  readonly answered: number
  readonly onResume: () => void
  /** Ends the lesson here. Every answer already given is kept and submitted. */
  readonly onFinish: () => void
}

export function Paused({ answered, onResume, onFinish }: PausedProps) {
  const t = useT()

  return (
    <View style={styles.backdrop}>
      <Card level={3} style={styles.card}>
        {/* Atlas sitting on a rock with his hat on one knee. The brief for this one
            warns it "is the one most likely to go wrong: the brief is a break, not a
            [punishment]" — which is this screen exactly. A pause must not look like a
            penalty, and the picture says so before the copy is read. */}
        <View style={styles.art}>
          <Art name="atlas/resting" size={120} />
        </View>
        <Text style={styles.title} role="heading">
          {t('lesson:paused.title')}
        </Text>

        {/* Names the number rather than saying "your progress is safe" — a count is
            something a user can check against what they remember doing, and a vague
            reassurance is what an app says when it is about to lose something. */}
        <Text style={styles.body}>
          {answered > 0 ? t('lesson:paused.kept', { count: answered }) : t('lesson:paused.body')}
        </Text>

        {/* One invitation and one exit, not two invitations. These were primary green
            and secondary blue — both solid, both the same weight, both leaning forward
            — so a card whose whole job is "take your time" opened with two equally
            confident buttons. `tertiary` is the outlined skin: still obviously
            pressable, no longer competing. Not `ghost`, which is for the actions we
            offer without inviting; stopping a lesson is a real choice and a user who
            needs it has to be able to find it. */}
        <Button label={t('lesson:paused.resume')} onPress={onResume} />
        <Button label={t('lesson:paused.finish')} variant="tertiary" onPress={onFinish} />
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  // Centred without `alignItems` on the card, which would shrink both buttons.
  art: { alignSelf: 'center' },
  // A full screen, not an overlay. The first version absolutely-filled over the
  // question, which hid it from sight and left it in the accessibility tree — so a
  // screen-reader user could still swipe to the item the scheduler was about to
  // score. "Covered" has to mean not rendered, or it only covers it for some users.
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[5],
  },
  card: { gap: space[3], width: '100%' },
  title: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  body: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
})
