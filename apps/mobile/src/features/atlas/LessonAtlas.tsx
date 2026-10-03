/**
 * The atlas inside a lesson: the question's picture slot, driven by the disclosure policy.
 *
 * The lesson owns the question, the selection and the grade; this turns them into a
 * scene (`buildLessonScene`) and hands the scene to the globe — or, when the globe is
 * off or has failed, to the flat fallback with the very same scene. A renderer failure
 * changes the picture only: the options, the answer and the progress are the lesson's
 * and never pass through here.
 *
 * Kept at one position in the lesson's tree so consecutive map questions reuse one GL
 * context: the next question uploads new highlights and moves the camera.
 */

import { useMemo, useState } from 'react'
import type { ContentIndex, Question } from '@worldquest/engines'
import { useT } from '../../lib/i18n.js'
import { WorldAtlasView, type AtlasStatus } from './WorldAtlasView.js'
import { AtlasFallbackView } from './AtlasFallbackView.js'
import { buildLessonScene, lessonAtlasPolicy } from './scene/lessonScene.js'
import { useAtlasNames } from './useAtlasNames.js'
import { useAtlasEnabled } from './atlasAvailability.js'

/**
 * Once the renderer has failed in this run, later questions go straight to the fallback
 * rather than failing again on every map question: a shader that does not compile on
 * this GPU will not compile on the next question either.
 */
let failedThisRun = false

export function __resetLessonAtlasFailure(): void {
  failedThisRun = false
}

export type LessonAtlasProps = {
  readonly question: Question
  readonly onGestureActiveChange?: ((active: boolean) => void) | undefined
  /** `${lessonId}:${index}` — events and camera moves for an old question are dropped. */
  readonly sceneKey: string
  readonly index: ContentIndex | null | undefined
  readonly selected: boolean
  readonly answered: boolean
  readonly chosenOptionId: string | null
  readonly width: number
  readonly height: number
  readonly testID?: string
}

/** Whether a question shows a map at all in this phase — the layout asks before reserving room. */
export function lessonShowsAtlas(question: Question, index: ContentIndex | null | undefined, answered: boolean): boolean {
  const policy = lessonAtlasPolicy({
    attribute: index?.templates.get(question.item.templateId)?.attribute,
    modality: question.modality,
    hasLocator: question.locator !== undefined,
    hasPromptAsset: question.promptAsset !== undefined,
  })
  return policy !== null && (answered || policy.beforeAnswer)
}

export function LessonAtlas({ question, sceneKey, index, selected, answered, chosenOptionId, width, height, testID, onGestureActiveChange }: LessonAtlasProps) {
  const t = useT()
  const names = useAtlasNames(index)
  const enabled = useAtlasEnabled()
  const [status, setStatus] = useState<AtlasStatus>(failedThisRun ? 'error' : 'loading')
  const attribute = index?.templates.get(question.item.templateId)?.attribute

  const spec = useMemo(() => {
    const policy = lessonAtlasPolicy({
      attribute,
      modality: question.modality,
      hasLocator: question.locator !== undefined,
      hasPromptAsset: question.promptAsset !== undefined,
    })
    if (policy === null) return null
    return buildLessonScene({
      sceneKey,
      policy,
      entityId: question.item.entityId,
      factId: question.item.factId,
      phase: answered ? 'revealed' : selected ? 'selected' : 'question',
      chosenOptionId: answered ? chosenOptionId : null,
      countryName: names.countryName,
      factValueName: names.factValueName,
      t: t as never,
    })
  }, [attribute, question, sceneKey, answered, selected, chosenOptionId, names, t])

  if (spec === null) return null

  if (!enabled || status === 'error') {
    return <AtlasFallbackView spec={spec} locator={question.locator} width={Math.min(width, height * (4 / 3))} />
  }

  return (
    <WorldAtlasView
      spec={spec}
      onGestureActiveChange={onGestureActiveChange}
      onStatusChange={(next) => {
        if (next === 'error') failedThisRun = true
        setStatus(next)
      }}
      style={{ width, height }}
      quality="high"
      {...(testID !== undefined ? { testID } : {})}
    />
  )
}
