/**
 * A lesson started from the course path, to and from its URL.
 *
 * ## Why the URL names the node and not the focus
 *
 * `/lesson?node=node.first-week.flags` rather than `/lesson?entity=SE,NO,…&attr=flag`.
 * The lesson has to know WHICH step it is for — only a finished lesson started from a
 * node counts towards that node — and a URL carrying both a node and a focus could
 * disagree with itself: a hand-edited link would play Canada and credit Sweden's step.
 * Naming the node and resolving its focus from the course here leaves one source of
 * truth, the pack.
 *
 * The rest of the focus machinery is reused unchanged: the resolved focus is handed to
 * `useLessonFocus` as the same `entity`/`attr` strings the country page sends, so a
 * course step composes, is offered offline and is graded exactly like any other
 * focused lesson.
 *
 * ## Explicit, and implied
 *
 * A step is the learner's own next task — the one button Home shows them — so it is an
 * EXPLICIT focus: on a D1 build an offline start plays that step's saved ticket or says
 * it needs a connection, and never quietly plays some other saved lesson in its place.
 *
 * Review is the other way round. A finished course's "keep reviewing" is the app's
 * suggestion over everything the course taught, and any saved lesson is fair review on
 * a plane — so it is implied, like the daily quest.
 */

import { reviewFocus, type Course, type CourseFocus } from '@worldquest/engines'

/** Where a course step's lesson lives. */
export function nodeLessonHref(nodeId: string): string {
  return `/lesson?${new URLSearchParams({ node: nodeId }).toString()}`
}

/** Where a finished course's review lives. */
export function reviewLessonHref(courseId: string): string {
  return `/lesson?${new URLSearchParams({ review: courseId }).toString()}`
}

/** The focus as the URL params `useLessonFocus` already reads. */
const asParams = (focus: CourseFocus) => ({
  entity: focus.entities.join(','),
  attr: focus.attributes.join(','),
})

export type CourseLesson =
  | {
      readonly kind: 'node'
      readonly nodeId: string
      readonly params: { readonly entity: string; readonly attr: string }
      readonly explicit: true
    }
  | {
      readonly kind: 'review'
      readonly params: { readonly entity: string; readonly attr: string }
      readonly explicit: false
    }

/**
 * What a lesson URL's course params ask for, or `undefined` for an ordinary lesson.
 *
 * A node or course id this build does not know is `undefined` too — an old link, a
 * course retired in an update — and the lesson falls back to its own params, which is
 * the widening direction `focusParams.ts` already chooses for a bad link.
 */
export function courseLesson(
  course: Course | null,
  params: { readonly node?: string | undefined; readonly review?: string | undefined },
): CourseLesson | undefined {
  if (course === null) return undefined
  if (params.node !== undefined) {
    for (const unit of course.units) {
      const node = unit.nodes.find((n) => n.id === params.node)
      if (node !== undefined) return { kind: 'node', nodeId: node.id, params: asParams(node.focus), explicit: true }
    }
    return undefined
  }
  if (params.review !== undefined && params.review === course.id) {
    return { kind: 'review', params: asParams(reviewFocus(course)), explicit: false }
  }
  return undefined
}
