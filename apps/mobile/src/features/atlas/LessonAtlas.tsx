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

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ContentIndex, Question } from '@worldquest/engines'
import { useT } from '../../lib/i18n.js'
import { WorldAtlasView, type AtlasStatus } from './WorldAtlasView.js'
import { AtlasFallbackView } from './AtlasFallbackView.js'
import { buildLessonScene, lessonAtlasPolicy } from './scene/lessonScene.js'
import { buildLocateScene } from './scene/locateScene.js'
import { isAtlasRegion, REGION_KEY } from './regions.js'
import type { AtlasEvent, AtlasSceneSpec } from './scene/types.js'
import { useAtlasNames } from './useAtlasNames.js'
import { useAtlasEnabled } from './atlasAvailability.js'

/**
 * Once the renderer has failed in this run, later questions go straight to the fallback
 * rather than failing again on every map question: a shader that does not compile on
 * this GPU will not compile on the next question either.
 */
let failedThisRun = false

const NO_MISSES: readonly string[] = []

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
  /**
   * A map drill only (`question.tap`): the country picked but not yet checked, the ones
   * already tried, and where a tap on the map goes. In a drill `answered` means the question
   * is OVER — found, or out of tries — not merely graded. Every other map selects nothing.
   */
  readonly selectedOptionId?: string | null
  readonly misses?: readonly string[]
  readonly onSelectCountry?: ((countryId: string) => void) | undefined
  /** Points of the map's bottom edge the answer sheet covers, so the reveal centres above it. */
  readonly coveredBottom?: number
  /** The renderer failed or is off: a drill cannot be answered without it. */
  readonly onUnavailable?: (() => void) | undefined
}

/** Whether a question shows a map at all in this phase — the layout asks before reserving room. */
export function lessonShowsAtlas(question: Question, index: ContentIndex | null | undefined, answered: boolean): boolean {
  const policy = lessonAtlasPolicy({
    attribute: index?.templates.get(question.item.templateId)?.attribute,
    modality: question.modality,
    hasLocator: question.locator !== undefined,
    hasPromptAsset: question.promptAsset !== undefined,
    tap: question.tap === true,
  })
  return policy !== null && (answered || policy.beforeAnswer)
}

export function LessonAtlas({
  question, sceneKey, index, selected, answered, chosenOptionId, width, height, testID, onGestureActiveChange,
  selectedOptionId = null, misses = NO_MISSES, onSelectCountry, coveredBottom = 0, onUnavailable,
}: LessonAtlasProps) {
  const t = useT()
  const names = useAtlasNames(index)
  const enabled = useAtlasEnabled()
  const [status, setStatus] = useState<AtlasStatus>(failedThisRun ? 'error' : 'loading')
  const attribute = index?.templates.get(question.item.templateId)?.attribute
  const tap = question.tap === true

  const spec = useMemo<AtlasSceneSpec | null>(() => {
    if (tap) {
      return buildLocateScene({
        sceneKey,
        entityId: question.item.entityId,
        optionIds: question.options.map((option) => option.id),
        phase: answered ? 'revealed' : selectedOptionId !== null ? 'selected' : 'question',
        selectedId: answered ? null : selectedOptionId,
        misses,
        // The ticket's own labels first: they are what the server localised for this lesson.
        countryName: (id) => question.options.find((option) => option.id === id)?.label ?? names.countryName(id),
        regionName: (region) => (isAtlasRegion(region) ? t(REGION_KEY[region]) : undefined),
        t: t as never,
      })
    }
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
  }, [tap, attribute, question, sceneKey, answered, selected, selectedOptionId, misses, chosenOptionId, names, t])

  const unavailable = spec !== null && (!enabled || status === 'error')
  // Said once per question, from an effect: the drill decides what a missing map means.
  useEffect(() => {
    if (unavailable && tap) onUnavailable?.()
  }, [unavailable, tap, onUnavailable, sceneKey])

  // Only the current question's taps, only before it is graded.
  const onEvent = useCallback((event: AtlasEvent) => {
    if (event.type === 'countrySelected' && event.sceneKey === sceneKey && !answered) onSelectCountry?.(event.countryId)
  }, [sceneKey, answered, onSelectCountry])

  if (spec === null) return null

  if (unavailable) {
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
      // A drill is played on the map, so it gets the gesture-free zoom and recentre a
      // small country needs (WCAG 2.5.1), and its reveal centres above the answer sheet.
      {...(tap ? {
        onEvent,
        controls: true,
        insets: { top: 0, bottom: answered ? coveredBottom : 0, minX: 0, maxX: 0 },
      } : {})}
      {...(testID !== undefined ? { testID } : {})}
    />
  )
}
