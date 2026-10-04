/**
 * What happens the moment an answer is graded: the haptic, the sound, the event.
 *
 * These used to fire from the answer option's `onPress`, when a tap WAS the answer. With
 * select-then-check a tap is only a selection, and an answer can now be graded by two
 * things the options never see — the Check button, and the speed round's clock submitting
 * whatever was selected when it ran out. Firing from the graded answer covers both with
 * one rule, and reads the machine's own `elapsedMs` instead of a second clock read that
 * could disagree with it.
 *
 * In an effect, keyed on the answer count, because the reducer has to have run for the
 * answer to exist — and guarded by a ref so a StrictMode double-invoke or an unrelated
 * re-render cannot buzz twice for one answer.
 *
 * A timeout with nothing selected stays silent, as it always was: the clock running out
 * is not something the user did, and a haptic for it would read as a reprimand.
 */

import { useEffect, useRef } from 'react'
import { answerCount, deriveRating, inReview, lastAnswerOf, type LessonState } from '@worldquest/engines'
import { hapticCorrect, hapticWrong } from '../../../lib/haptics.js'
import { soundCorrect, soundWrong } from '../../../lib/sound.js'
import { track } from '../../../lib/analytics.js'

export function useAnswerCues(state: LessonState, itemMs: number, restoredAnswers = 0): void {
  // Every answer gets its cue, the review round's included.
  const announced = useRef(answerCount(state))

  useEffect(() => {
    // Recovery is not another answer: no repeated haptic, sound or analytics event.
    announced.current = Math.max(announced.current, restoredAnswers)
    const count = answerCount(state)
    if (count <= announced.current) {
      announced.current = count
      return
    }
    // More than one answer can land at once: a matching board is four. Each is an event of its
    // own — accuracy by question is what the lesson-length measurement reads — but the learner
    // gets ONE cue for the moment, and it is the gentler true one: a haptic and a sound for a
    // right answer only if every answer in it was right.
    const added = count - announced.current
    announced.current = count

    const log = inReview(state) ? state.reviewed : state.answers
    const fresh = log.slice(Math.max(0, log.length - added))
    const answer = lastAnswerOf(state)
    if (answer === undefined || answer.chosenOptionId === null) return

    // `impactMedium` for a wrong answer, never the error pattern — see lib/haptics.ts.
    // Both are no-ops when their Settings toggle is off.
    if (fresh.every((f) => f.wasCorrect)) {
      hapticCorrect()
      soundCorrect()
    } else {
      hapticWrong()
      soundWrong()
    }

    // The richest event we have, and the one that sets lesson length honestly:
    // accuracy by POSITION is a measurement, not a guess. Not for a review answer: it
    // is the same question again seconds later, and counting it would skew both.
    if (inReview(state)) return
    fresh.forEach((one, i) => {
      track('question_answered', {
        lesson_id: state.lessonId,
        template_id: one.templateId,
        fact_id: one.factId,
        correct: one.wasCorrect,
        elapsed_ms: one.elapsedMs,
        rating: deriveRating(one.wasCorrect, one.elapsedMs, itemMs),
        position: state.index - (fresh.length - 1 - i),
      })
    })
  }, [state, itemMs, restoredAnswers])
}
