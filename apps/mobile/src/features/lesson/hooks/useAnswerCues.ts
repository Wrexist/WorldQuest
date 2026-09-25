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
import { deriveRating, type LessonState } from '@worldquest/engines'
import { hapticCorrect, hapticWrong } from '../../../lib/haptics.js'
import { soundCorrect, soundWrong } from '../../../lib/sound.js'
import { track } from '../../../lib/analytics.js'

export function useAnswerCues(state: LessonState, itemMs: number): void {
  const announced = useRef(state.answers.length)

  useEffect(() => {
    const count = state.answers.length
    if (count <= announced.current) {
      announced.current = count
      return
    }
    announced.current = count

    const answer = state.answers[count - 1]
    if (answer === undefined || answer.chosenOptionId === null) return

    // `impactMedium` for a wrong answer, never the error pattern — see lib/haptics.ts.
    // Both are no-ops when their Settings toggle is off.
    if (answer.wasCorrect) {
      hapticCorrect()
      soundCorrect()
    } else {
      hapticWrong()
      soundWrong()
    }

    // The richest event we have, and the one that sets lesson length honestly:
    // accuracy by POSITION is a measurement, not a guess.
    track('question_answered', {
      lesson_id: state.lessonId,
      template_id: answer.templateId,
      fact_id: answer.factId,
      correct: answer.wasCorrect,
      elapsed_ms: answer.elapsedMs,
      rating: deriveRating(answer.wasCorrect, answer.elapsedMs, itemMs),
      position: state.index,
    })
  }, [state.answers, state.lessonId, state.index, itemMs])
}
