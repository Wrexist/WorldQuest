/**
 * The first-week course, from its content pack.
 *
 * Imported statically, like the achievement catalogue and the shop: a course is a few
 * hundred bytes of JSON that ship in the binary, and the path is the first thing Home
 * draws — a fetch in front of it would put a spinner where the one primary action goes,
 * and a first launch on a plane would have no path at all.
 *
 * ## Parsed, not cast
 *
 * A JSON import is a boundary (`PROJECT.md §5.1`), and `pnpm content:validate` is a CI
 * gate, not a runtime one: a build made from a bad commit would ship a pack the
 * validator never saw. So the engine parses it, and a failure is a value the path can
 * render as its error state — "the course didn't load, lessons still work" — rather
 * than a crash on the screen every session starts from.
 */

import { parseCourse, type Course } from '@worldquest/engines'
import pack from '../../../../../packages/content/packs/courses/first-week.v1.json'
import { reportCrash } from '../../lib/reporting.js'

export type LoadedCourse = { readonly ok: true; readonly course: Course } | { readonly ok: false }

/** Parsed once, at import. The pack cannot change while the app is running. */
const loaded: LoadedCourse = (() => {
  const result = parseCourse(pack)
  if (result.ok) return { ok: true, course: result.value }
  // By code, never by message: the message names pack fields, which are ours, but the
  // crash channel's rule is that nothing descriptive leaves the device at all.
  reportCrash({ domain: 'content', name: result.error.code, isFatal: false })
  return { ok: false }
})()

/** The course the path draws. See the header for why this can be a failure. */
export function loadCourse(): LoadedCourse {
  return loaded
}
