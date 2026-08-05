/**
 * Welcome back — hidden screen H2, for a user returning after a week or more.
 *
 * ## The one thing this screen exists to say
 *
 * *Your progress is still here.* That is the fear a returning user arrives with, and
 * it is the reason they hesitate to open the app at all: some part of them expects to
 * find the streak gone, the numbers reset, and a month of work wasted. Saying it
 * plainly, with the counts beside it, is the whole job.
 *
 * ## What it must never do
 *
 * No guilt. Not "you haven't practised in 12 days", not "your streak is at risk", not
 * a red number. The headline is that the world missed *them*, which is about us, not
 * about their failure — and the copy rules say so
 * ([`docs/design/voice-and-tone.md`](../../../../docs/design/voice-and-tone.md)).
 *
 * Due facts are "ready for review", never "overdue". The scheduler slipping is the
 * scheduler's business; a user who lived their life for two weeks has done nothing
 * wrong.
 *
 * And there is a way out that is not a lesson. Someone who opens the app to look
 * around must be able to look around; trapping them behind a study session is how a
 * returning user becomes a former user.
 *
 * Purely presentational.
 */

import { StyleSheet, Text, View } from 'react-native'
import { Button, Card, colors, space, text } from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'

export type WelcomeBackScreenProps = {
  /** Days since the last completed lesson. */
  readonly daysAway: number
  readonly factsLearned: number
  readonly countriesMet: number
  readonly dueCount: number
  readonly onStart: () => void
  readonly onDismiss: () => void
}

export function WelcomeBackScreen({
  daysAway,
  factsLearned,
  countriesMet,
  dueCount,
  onStart,
  onDismiss,
}: WelcomeBackScreenProps) {
  const t = useT()

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        {/* Atlas waving with both arms, from a low angle. The brief for this frame is
            specifically "greeting someone returning after a long time — warm, glad, NO
            SADNESS", which is the whole argument of this screen: a user who has been
            away is being welcomed, not reproached for the gap. */}
        <Art name="atlas/waving-back" size={160} />
        <Text style={styles.title} role="heading" aria-level={1}>
          {t('welcome:title')}
        </Text>
        <Text style={styles.body}>{t('welcome:body', { days: daysAway })}</Text>
      </View>

      {/* The counts, right under the promise. "Everything you learned is still here"
          is a sentence; these are the evidence, and evidence is what settles a fear. */}
      <Card level={2} style={styles.card}>
        <Text style={styles.cardTitle}>{t('welcome:kept.title')}</Text>
        <Text style={styles.kept}>{t('welcome:kept.facts', { count: factsLearned })}</Text>
        <Text style={styles.kept}>{t('welcome:kept.countries', { count: countriesMet })}</Text>
      </Card>

      <Text style={styles.due}>
        {/* "Ready for review", never "overdue". A user who lived their life for two
            weeks has done nothing wrong, and a scheduler is not a debt collector. */}
        {dueCount > 0 ? t('welcome:due.some', { count: dueCount }) : t('welcome:due.none')}
      </Text>

      <View style={styles.actions}>
        <Button label={t('welcome:start')} onPress={onStart} />
        {/* A way out that is not a lesson. Someone who opened the app to look around
            must be able to look around. */}
        <Button variant="ghost" label={t('welcome:later')} onPress={onDismiss} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.canvas, padding: space[4], gap: space[3] },
  hero: { alignItems: 'center', gap: space[2], paddingTop: space[6] },
  title: { ...text('h1'), color: colors.text.primary, textAlign: 'center' },
  body: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  card: { padding: space[4], gap: space[1] },
  cardTitle: { ...text('overline'), color: colors.text.tertiary },
  kept: { ...text('h3', { numeric: true }), color: colors.text.primary },
  due: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  actions: { marginTop: 'auto', gap: space[2] },
})
