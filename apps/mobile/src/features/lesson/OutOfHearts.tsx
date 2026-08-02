/**
 * Out of hearts — a listed lesson state (screen-catalog.md §5) that had no UI.
 *
 * The engine has set `outOfHearts` since the machine was written and nothing ever
 * rendered it, so the lesson simply carried on at zero hearts and the whole mechanic
 * was decorative.
 *
 * ## The one sentence that matters
 *
 * **The next lesson starts fresh.** Hearts reset per lesson (`resetPerLesson` in the
 * balance table), so this is never a lockout — but a ten-year-old who has just been
 * stopped mid-lesson does not know that, and the difference between "I ran out" and
 * "I am locked out of the app" is the difference between trying again and closing it.
 * Everything else here is secondary to saying that plainly, and it is said BEFORE any
 * offer to spend coins.
 *
 * ## What it must never be
 *
 * **No countdown.** Hearts do regenerate on a timer elsewhere, but showing "45:00"
 * here would be both a lie — the next lesson does not wait for it — and exactly the
 * pressure this product refuses to apply to a child.
 *
 * **No way to buy coins.** Coins come from lessons, never from money, and the moment a
 * user most wants coins is the moment that promise is most tempting to break.
 *
 * **No retry of the missed question.** `REVIVE` resumes at the NEXT item, because
 * paying to re-answer the item you just missed is paying for the answer — and this
 * economy never sells an advantage at learning (xp-economy.md).
 *
 * A separate file rather than a branch inside `LessonScreen` so it can be tested
 * directly: reaching this state through the real runner would mean answering five
 * review items wrongly, and `newItemsCostHearts` is false, so a cold-memory test can
 * never get here at all.
 */

import { StyleSheet, Text } from 'react-native'
import { Button, Card, colors, space, text } from '@worldquest/design'
import { BALANCE } from '@worldquest/engines'
import { useT } from '../../lib/i18n.js'

export type OutOfHeartsProps = {
  /** The user's coin balance. Server-authoritative; passed down from the route. */
  readonly coins: number
  /** Spend coins and resume at the next question. */
  readonly onRevive: () => void
  /** End the lesson here, keeping every answer already given. */
  readonly onFinish: () => void
}

export function OutOfHearts({ coins, onRevive, onFinish }: OutOfHeartsProps) {
  const t = useT()
  const price = BALANCE.prices.heartRefill
  const canAfford = coins >= price

  return (
    <Card level={2} style={styles.card}>
      <Text style={styles.title} role="heading">
        {t('lesson:hearts.out.title')}
      </Text>
      {/* The reassurance, before the offer. A user who reads only the first two lines
          has still been told the thing that stops them worrying. */}
      <Text style={styles.body}>{t('lesson:hearts.out.body')}</Text>

      {canAfford ? (
        <Button
          label={t('lesson:hearts.out.revive', { price })}
          variant="secondary"
          onPress={onRevive}
        />
      ) : (
        // The gap, stated once, ending on the reassurance rather than the shortfall.
        // No store link, no second ask.
        <Text style={styles.note}>
          {t('lesson:hearts.out.cantAfford', { short: price - coins })}
        </Text>
      )}

      {/* Always present, and never framed as giving up. The lesson is graded on what
          was answered, so stopping here costs the user nothing they earned. */}
      <Button label={t('lesson:hearts.out.finish')} onPress={onFinish} />
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space[3], width: '100%' },
  title: { ...text('h3'), color: colors.text.primary, textAlign: 'center' },
  body: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  note: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
