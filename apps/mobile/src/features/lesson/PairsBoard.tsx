/**
 * "Match the pairs": four things on the left, their four partners on the right, and the
 * learner joins them.
 *
 * Presentational and local. The board keeps its own taps — which card is picked, which pairs are
 * made — and says nothing to the lesson machine until the last pair is placed, when it hands over
 * ONE thing: for each left-hand card, the first partner the learner tried for it. That first try
 * is the answer, as in every other question here; finding the right partner on the third go is
 * learning, not evidence of knowing, and it is recorded as the miss it was.
 *
 * ## Calm, as everywhere
 *
 * A wrong pairing is a muted card for as long as it takes to try something else — no shake, no
 * red, no buzzer — and the learner simply goes on. A made pair is the same ticked card the
 * ordinary options use, and locks. Neither is colour alone: the tick is an icon, the label says
 * "matched", and the haptic for a pair is the light selection tick.
 *
 * ## Why a tap on either side first
 *
 * Nobody agrees which side to start from, and a board that insists on left-then-right makes the
 * learner who started on the right wonder why nothing happened. A pairing is two taps, one on
 * each side, in either order; two on the same side just moves the pick.
 *
 * ## What leaves the board
 *
 * The first partner tried for each card, keyed by the question's item id — never the taps, the
 * times between them, or how many wrong goes there were. The lesson's clock covers the board as
 * one sitting.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AnswerOption, createThemeStyles, motion, space, text } from '@worldquest/design'
import type { Question } from '@worldquest/engines'
import { Icon } from '../../components/Icon.js'
import { hapticSelect } from '../../lib/haptics.js'
import { soundTap } from '../../lib/sound.js'
import { useT } from '../../lib/i18n.js'

type Side = 'left' | 'right'

export function PairsBoard({
  members,
  onDone,
}: {
  /** The board's questions, in position order. */
  readonly members: readonly Question[]
  /** Once every pair is made: item id → the first partner the learner tried for it. */
  readonly onDone: (choices: Record<string, string>) => void
}) {
  const { colors, styles } = useThemeValues()
  const t = useT()

  // The cards. Left: one per question, named by what it asks about. Right: the shared options.
  const left = useMemo(
    () => members.map((q) => ({ id: q.item.id, label: String(q.promptParams['entityName'] ?? ''), partner: q.item.entityId })),
    [members],
  )
  const right = useMemo(() => members[0]!.options.map((o) => ({ id: o.id, label: o.label })), [members])

  const [pickedLeft, setPickedLeft] = useState<string | null>(null)
  const [pickedRight, setPickedRight] = useState<string | null>(null)
  const [made, setMade] = useState<ReadonlySet<string>>(new Set())
  const [firstTry, setFirstTry] = useState<Readonly<Record<string, string>>>({})
  // The last pairing that did not fit, shown muted until the next tap.
  const [missed, setMissed] = useState<{ source: string; target: string } | null>(null)

  // A pairing that did not fit is shown muted, and the two cards are inert while it is (the
  // option primitive does not take presses in its feedback states). So it must not last: it
  // clears by itself after a beat, and on the very next tap anywhere else.
  useEffect(() => {
    if (missed === null) return
    const timer = setTimeout(() => setMissed(null), motion.celebrate.duration)
    return () => clearTimeout(timer)
  }, [missed])

  const pair = useCallback(
    (leftId: string, rightId: string) => {
      const card = left.find((l) => l.id === leftId)!
      const tried = firstTry[leftId] === undefined ? { ...firstTry, [leftId]: rightId } : firstTry
      setFirstTry(tried)
      setPickedLeft(null)
      setPickedRight(null)
      if (rightId === card.partner) {
        const next = new Set(made).add(leftId)
        setMade(next)
        setMissed(null)
        if (next.size === left.length) onDone(tried)
      } else {
        setMissed({ source: leftId, target: rightId })
      }
    },
    [firstTry, left, made, onDone],
  )

  const tap = (side: Side, id: string) => {
    // Heard as well as felt, like the cards in Duolingo's matching round. The tap sound,
    // not the answer chime: picking a card is not yet an answer.
    hapticSelect()
    soundTap()
    setMissed(null)
    if (side === 'left') {
      if (pickedRight !== null) return pair(id, pickedRight)
      setPickedLeft(pickedLeft === id ? null : id)
    } else {
      if (pickedLeft !== null) return pair(pickedLeft, id)
      setPickedRight(pickedRight === id ? null : id)
    }
  }

  // The mark on a card, by what happened to it. A made pair gets the tick the ordinary options
  // use. A pairing that did not fit gets a plain cross in the muted text colour: the primitive's
  // own fallback is an arrow that means "the right answer is over there", and on a board there
  // is no "there" — two cards that did not belong together point nowhere.
  const markFor = (state: string) =>
    state === 'correct' ? (
      <Icon name="check" size={20} color={colors.feedback.correct} />
    ) : state === 'wrong' ? (
      <Icon name="close" size={20} color={colors.text.secondary} />
    ) : undefined

  const rightMade = new Set(left.filter((l) => made.has(l.id)).map((l) => l.partner))
  const partnerLabel = (leftId: string): string => {
    const partner = left.find((l) => l.id === leftId)?.partner
    return right.find((r) => r.id === partner)?.label ?? ''
  }

  return (
    <View style={styles.board} testID="pairs-board">
      <Text style={styles.title} role="heading">
        {t('lesson:pairs.title')}
      </Text>
      <Text style={styles.hint}>{t('lesson:pairs.hint')}</Text>
      <View style={styles.columns}>
        <View style={styles.column}>
          {left.map((card) => {
            const done = made.has(card.id)
            const state = done ? 'correct' : missed?.source === card.id ? 'wrong' : pickedLeft === card.id ? 'selected' : 'idle'
            return (
              <AnswerOption
                key={card.id}
                label={card.label}
                state={state}
                style={styles.cell}
                mark={markFor(state)}
                accessibilityLabel={done ? t('lesson:pairs.matched', { first: card.label, second: partnerLabel(card.id) }) : undefined}
                onPress={() => {
                  if (!done) tap('left', card.id)
                }}
                testID="pairs-left"
              />
            )
          })}
        </View>
        <View style={styles.column}>
          {right.map((card) => {
            const done = rightMade.has(card.id)
            const state = done ? 'correct' : missed?.target === card.id ? 'wrong' : pickedRight === card.id ? 'selected' : 'idle'
            return (
              <AnswerOption
                key={card.id}
                label={card.label}
                state={state}
                style={styles.cell}
                mark={markFor(state)}
                onPress={() => {
                  if (!done) tap('right', card.id)
                }}
                testID="pairs-right"
              />
            )
          })}
        </View>
      </View>
    </View>
  )
}

const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
    board: { alignSelf: 'stretch', gap: space[3] },
    title: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
    hint: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
    columns: { flexDirection: 'row', gap: space[3] },
    column: { flex: 1, gap: space[3] },
    // The cards stretch to their column; `AnswerOption` is `alignSelf: stretch` by default and
    // a caller's style lands last, so this only sets what the column needs.
    cell: { alignSelf: 'stretch' },
  })
  return { colors, styles }
})
