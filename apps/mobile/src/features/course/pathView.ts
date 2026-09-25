/**
 * The course path, as Home draws it — keys, counts and glyphs, no layout.
 *
 * A pure function from the engine's standing to what the screen needs, so the screen
 * stays presentational (it can be mounted by a component test and by the screenshot
 * renderer with a literal) and the one decision with some judgement in it — which glyph
 * a step carries — is tested here rather than read out of JSX.
 *
 * The copy keys stay plain strings: they come from the course pack, not from source, so
 * the screen reads them with `tContent` and `pnpm content:validate` is what proves each
 * one exists in every shipped locale — the same contract a question template's prompt
 * key already has.
 */

import type { CourseNode, CourseNodeKind, NodeState } from '@worldquest/engines'
import type { IconName } from '../../lib/icons.generated.js'
import { ATTRIBUTE_ICON } from '../../lib/attributeIcons.js'
import type { CoursePath } from './useCoursePath.js'

export type PathNodeView = {
  readonly id: string
  readonly kind: CourseNodeKind
  readonly state: NodeState
  /** What the step is about; a done step draws a tick instead (see `PathNode`). */
  readonly icon: IconName
  /** A course-pack key; its `{count}` is `count` below. */
  readonly objectiveKey: string
  /** How many entities the step covers, read from the pack — never typed into copy. */
  readonly count: number
  /** 1-based, across the whole course — path order and screen-reader order. */
  readonly position: number
  readonly finished: number
  readonly lessons: number
}

export type PathUnitView = {
  readonly id: string
  /** 1-based: "Unit 1". */
  readonly number: number
  readonly titleKey: string
  readonly objectiveKey: string
  readonly state: NodeState
  readonly done: number
  readonly nodes: readonly PathNodeView[]
}

export type CoursePathView =
  | {
      readonly status: 'ready'
      readonly courseId: string
      readonly titleKey: string
      readonly units: readonly PathUnitView[]
      /** Steps in the whole course, for "Step 3 of 7". */
      readonly total: number
      readonly complete: boolean
    }
  | { readonly status: 'error' }

/**
 * A step's glyph: the shared attribute mark when it practises one thing, a globe when it
 * mixes several, a trophy for a check.
 *
 * The attribute marks are `lib/attributeIcons.ts` — the same ones the country page puts
 * beside its Flag and Capital rows, so a flag step looks like the flag row it teaches.
 */
export function nodeIcon(node: Pick<CourseNode, 'kind' | 'focus'>): IconName {
  if (node.kind === 'check') return 'trophy'
  const [only, ...rest] = node.focus.attributes
  if (only !== undefined && rest.length === 0) return ATTRIBUTE_ICON[only] ?? 'star'
  return 'globe'
}

export function toPathView(path: CoursePath): CoursePathView {
  if (path.status === 'error') return { status: 'error' }
  const { course, standing } = path
  return {
    status: 'ready',
    courseId: course.id,
    titleKey: course.titleKey,
    total: standing.total,
    complete: standing.complete,
    units: standing.units.map((unit) => ({
      id: unit.unit.id,
      number: unit.position + 1,
      titleKey: unit.unit.titleKey,
      objectiveKey: unit.unit.objectiveKey,
      state: unit.state,
      done: unit.done,
      nodes: unit.nodes.map((step) => ({
        id: step.node.id,
        kind: step.node.kind,
        state: step.state,
        icon: nodeIcon(step.node),
        objectiveKey: step.node.objectiveKey,
        count: step.node.focus.entities.length,
        position: step.position + 1,
        finished: step.finished,
        lessons: step.node.lessons,
      })),
    })),
  }
}
