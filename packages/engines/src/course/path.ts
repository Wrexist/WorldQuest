/**
 * A course: a finite, ordered path through a pack's facts.
 *
 * ## What this is for
 *
 * The launch brief specifies one first-week course — "Connect familiar flags to
 * countries", then "Locate the same countries by region", and so on to a closing check —
 * and until now the only structure a learner met was the daily quest, which is composed
 * fresh every day and therefore cannot carry a sequence. A course is the sequence:
 * units, each an ordered run of nodes, each node a lesson focus and the number of
 * finished lessons that completes it.
 *
 * The course itself is DATA (`packages/content/packs/courses/`). This file only answers
 * questions about it: which node is done, which one is next, which are still closed,
 * and what a finished course offers instead of new content.
 *
 * ## Nothing here knows what geography is
 *
 * A node's focus names entity ids and attribute names, which are opaque strings to this
 * package — the same contract `LessonFocus` keeps. An astronomy course would name
 * constellations and `brightest-star` and nothing below would change.
 *
 * `CourseFocus` is declared here rather than imported as `LessonFocus` from the lesson
 * engine: rule 6 in `packages/engines/CLAUDE.md` is that engines never import each
 * other, and `quests/play.ts` records why a type-only import breaks it too. It stays
 * structurally assignable to `LessonFocus`, which is all a host needs.
 *
 * ## The rules the code enforces
 *
 * - **Exactly one current node until the course is finished.** The current node is the
 *   first node, in path order, that is not done. Everything before it is done by
 *   construction; everything after it that is not done is locked.
 * - **Done stays done.** A node is done when enough lessons were finished for it, and
 *   that is never taken back — not by a course update inserting a node earlier in the
 *   path, which is why a done node may sit after the current one. Losing finished work
 *   to an edit we made would be exactly the punishment rule 7 forbids.
 * - **Only an open node earns credit.** A lesson finished from a locked node — a
 *   hand-written link, a stale screen — counts for nothing, so the path can only be
 *   walked in order.
 * - **The course ends.** After the last node there is no "next node"; the next step is
 *   review of what the course taught (L15). It does not pretend new content exists.
 *
 * Pure: the course and the progress come in as arguments, and every function returns a
 * value rather than mutating one.
 */

import { err, ok, type AppError, type Result } from '../shared/index.js'

/** What a node asks about. Assignable to the lesson engine's `LessonFocus`. */
export type CourseFocus = {
  readonly entities: readonly string[]
  readonly attributes: readonly string[]
}

/**
 * `lesson` teaches; `check` asks again what earlier nodes taught, due work first.
 *
 * The distinction is for the path and for the validator, not for the lesson composer:
 * both are a lesson focus, and the composer already serves due facts first whatever the
 * focus is.
 */
export type CourseNodeKind = 'lesson' | 'check'

export type CourseNode = {
  /** Permanent. It ships in save data — renaming one is a migration. */
  readonly id: string
  readonly kind: CourseNodeKind
  /** i18n key: what this node practises, as one whole sentence. */
  readonly objectiveKey: string
  readonly focus: CourseFocus
  /** How many FINISHED lessons complete this node. */
  readonly lessons: number
}

export type CourseUnit = {
  readonly id: string
  readonly titleKey: string
  /** i18n key: what the unit as a whole is for, as one whole sentence. */
  readonly objectiveKey: string
  readonly nodes: readonly CourseNode[]
}

export type Course = {
  readonly id: string
  readonly version: string
  readonly titleKey: string
  readonly units: readonly CourseUnit[]
}

/**
 * Finished lessons per node id — the only thing about a course a device stores.
 *
 * A plain record so it survives JSON. Values that are not a positive finite number are
 * read as zero (`finishedFor`), so a corrupt entry costs that node its count, never a
 * crash on the screen that draws the path.
 */
export type CourseProgress = Readonly<Record<string, number>>

export type NodeState = 'done' | 'current' | 'locked'

export type NodeStanding = {
  readonly node: CourseNode
  readonly unitId: string
  /** 0-based position in the whole course: path order, and screen-reader order. */
  readonly position: number
  readonly state: NodeState
  /** Finished lessons that count towards this node, never above `node.lessons`. */
  readonly finished: number
}

export type UnitStanding = {
  readonly unit: CourseUnit
  /** 0-based. "Unit 1" is position 0. */
  readonly position: number
  /** `current` when the unit holds the current node; `done` when every node is. */
  readonly state: NodeState
  readonly nodes: readonly NodeStanding[]
  readonly done: number
}

/**
 * The one recommendation.
 *
 * A node while the course has one left; review once it has none. Review carries the
 * focus of everything the course taught, which a valid course's closing check already
 * covers (`validateCourse` holds that line).
 */
export type CourseNext =
  | { readonly kind: 'node'; readonly node: CourseNode; readonly unitId: string }
  | { readonly kind: 'review'; readonly focus: CourseFocus }

export type CourseStanding = {
  readonly units: readonly UnitStanding[]
  readonly next: CourseNext
  readonly complete: boolean
  /** Nodes done, out of `total`. */
  readonly done: number
  readonly total: number
}

// ── reading a course pack ─────────────────────────────────────────────────────

const KINDS: readonly CourseNodeKind[] = ['lesson', 'check']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const isTextList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.length > 0 && value.every(isText)

const problem = (message: string): Result<never, AppError> =>
  err({ code: 'COURSE_INVALID', message })

/**
 * A course pack, checked, as a `Course`. `COURSE_INVALID` otherwise, naming the field.
 *
 * Takes the pack's own shape — `packId`, `version`, `titleKey` and `items`, one unit per
 * item — so the host hands over the imported JSON and nothing else. The pack schema in
 * `packages/content` says the same thing for authors; this is the runtime half, because
 * a JSON import is a boundary and `PROJECT.md §5.1` parses every boundary.
 *
 * Structure only, plus the one semantic rule the state below depends on: ids are
 * unique. Two nodes sharing an id would share their progress, and "which node is
 * current" would have two answers. Whether the focus names real content is the
 * validator's question (`validateCourse`), because only the host knows the content.
 */
export function parseCourse(raw: unknown): Result<Course, AppError> {
  if (!isRecord(raw)) return problem('a course pack is an object')
  const { packId, version, titleKey, items } = raw
  if (!isText(packId)) return problem('packId is missing')
  if (!isText(version)) return problem('version is missing')
  if (!isText(titleKey)) return problem('titleKey is missing')
  if (!Array.isArray(items) || items.length === 0) return problem('a course needs at least one unit')

  const seen = new Set<string>()
  const units: CourseUnit[] = []
  for (const [u, rawUnit] of items.entries()) {
    if (!isRecord(rawUnit)) return problem(`unit ${u} is not an object`)
    const { id, titleKey: unitTitle, objectiveKey: unitObjective, nodes: rawNodes } = rawUnit
    if (!isText(id)) return problem(`unit ${u} has no id`)
    if (seen.has(id)) return problem(`id "${id}" is used twice`)
    seen.add(id)
    if (!isText(unitTitle)) return problem(`${id} has no titleKey`)
    if (!isText(unitObjective)) return problem(`${id} has no objectiveKey`)
    if (!Array.isArray(rawNodes) || rawNodes.length === 0) return problem(`${id} has no nodes`)

    const nodes: CourseNode[] = []
    for (const [n, rawNode] of rawNodes.entries()) {
      if (!isRecord(rawNode)) return problem(`${id} node ${n} is not an object`)
      const { id: nodeId, kind, objectiveKey, focus, lessons } = rawNode
      if (!isText(nodeId)) return problem(`${id} node ${n} has no id`)
      if (seen.has(nodeId)) return problem(`id "${nodeId}" is used twice`)
      seen.add(nodeId)
      if (typeof kind !== 'string' || !KINDS.includes(kind as CourseNodeKind)) {
        return problem(`${nodeId} has an unknown kind`)
      }
      if (!isText(objectiveKey)) return problem(`${nodeId} has no objectiveKey`)
      // Both lists are required and neither may be empty. An empty list means "these,
      // of which there are none" to the lesson filter and composes nothing; an ABSENT
      // one means "everything", which is not a course step, it is the whole app.
      if (!isRecord(focus) || !isTextList(focus.entities) || !isTextList(focus.attributes)) {
        return problem(`${nodeId} needs a focus with entities and attributes`)
      }
      if (typeof lessons !== 'number' || !Number.isInteger(lessons) || lessons < 1) {
        return problem(`${nodeId} needs a whole number of lessons, at least one`)
      }
      nodes.push({
        id: nodeId,
        kind: kind as CourseNodeKind,
        objectiveKey,
        focus: { entities: [...focus.entities], attributes: [...focus.attributes] },
        lessons,
      })
    }
    units.push({ id, titleKey: unitTitle, objectiveKey: unitObjective, nodes })
  }

  return ok({ id: packId, version, titleKey, units })
}

// ── where a learner stands ────────────────────────────────────────────────────

/**
 * Finished lessons recorded for a node, read defensively.
 *
 * Own properties only — a node id of `constructor` must not find `Object.prototype`'s —
 * and anything that is not a positive finite number is zero. Floored, because half a
 * lesson is not a thing that can have happened.
 */
function finishedFor(progress: CourseProgress, nodeId: string): number {
  if (!Object.prototype.hasOwnProperty.call(progress, nodeId)) return 0
  const value = progress[nodeId]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** Every node, in path order, with the id of the unit it belongs to. */
function nodesInOrder(course: Course): readonly { readonly node: CourseNode; readonly unitId: string }[] {
  return course.units.flatMap((unit) => unit.nodes.map((node) => ({ node, unitId: unit.id })))
}

/**
 * The whole path, standing: every node's state, every unit's, and the one next step.
 *
 * See the header for the three rules. The current node is found in a single pass —
 * the first node, in order, that is not done — which is what makes "exactly one" true
 * by construction rather than by a check that could be forgotten.
 */
export function courseStanding(course: Course, progress: CourseProgress): CourseStanding {
  const ordered = nodesInOrder(course)
  const isDone = ordered.map(({ node }) => finishedFor(progress, node.id) >= node.lessons)
  const currentAt = isDone.indexOf(false)

  const standings: NodeStanding[] = ordered.map(({ node, unitId }, position) => ({
    node,
    unitId,
    position,
    state: isDone[position] ? 'done' : position === currentAt ? 'current' : 'locked',
    finished: Math.min(finishedFor(progress, node.id), node.lessons),
  }))

  const units: UnitStanding[] = course.units.map((unit, position) => {
    const nodes = standings.filter((s) => s.unitId === unit.id)
    const done = nodes.filter((s) => s.state === 'done').length
    const state: NodeState = nodes.some((s) => s.state === 'current')
      ? 'current'
      : done === nodes.length
        ? 'done'
        : 'locked'
    return { unit, position, state, nodes, done }
  })

  const current = currentAt === -1 ? undefined : standings[currentAt]
  const next: CourseNext =
    current === undefined
      ? { kind: 'review', focus: reviewFocus(course) }
      : { kind: 'node', node: current.node, unitId: current.unitId }

  return {
    units,
    next,
    complete: current === undefined,
    done: isDone.filter(Boolean).length,
    total: ordered.length,
  }
}

/** A node by id, with its state. `undefined` for an id this course does not have. */
export function nodeStanding(standing: CourseStanding, nodeId: string): NodeStanding | undefined {
  for (const unit of standing.units) {
    const found = unit.nodes.find((s) => s.node.id === nodeId)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * The progress after one more finished lesson on `nodeId`.
 *
 * Returns the SAME object when nothing changes — an unknown id or a locked node — so a
 * caller can skip a storage write by comparing references. A done node still counts:
 * practising it again is real work, and keeping the count costs one number.
 */
export function creditLesson(course: Course, progress: CourseProgress, nodeId: string): CourseProgress {
  const found = nodeStanding(courseStanding(course, progress), nodeId)
  if (found === undefined || found.state === 'locked') return progress
  return { ...progress, [nodeId]: finishedFor(progress, nodeId) + 1 }
}

/**
 * Everything the course taught, as one focus — what "keep reviewing" plays.
 *
 * A union of entities and a union of attributes, in first-seen order. That is a cross
 * product, so for an arbitrary course it could reach an entity-attribute pair no node
 * taught; for a valid course it cannot, because `validateCourse` requires the closing
 * check to cover every entity and attribute before it — and the check is the last node.
 */
export function reviewFocus(course: Course): CourseFocus {
  const entities = new Set<string>()
  const attributes = new Set<string>()
  for (const { node } of nodesInOrder(course)) {
    for (const entity of node.focus.entities) entities.add(entity)
    for (const attribute of node.focus.attributes) attributes.add(attribute)
  }
  return { entities: [...entities], attributes: [...attributes] }
}

// ── is this course one a learner can actually walk ────────────────────────────

/**
 * What the host knows about its content, asked as questions rather than handed over.
 *
 * A port, so this package still never sees a pack: the content validator answers from
 * the real packs through the real lesson composer, and the tests answer from a fixture.
 */
export type CourseCatalogue = {
  /** Whether the content defines this entity at all. */
  readonly hasEntity: (entityId: string) => boolean
  /** Whether a QUIZZABLE fact exists for this entity and attribute. */
  readonly hasFact: (entityId: string, attribute: string) => boolean
  /**
   * The fewest questions one lesson on this focus can hold, across every presentation
   * the host serves (with and without a screen reader). A node that can only ever be a
   * four-question lesson is refused by a backend with a five-question floor.
   */
  readonly questionsFor: (focus: CourseFocus) => number
}

export type CourseProblem = {
  /** The unit or node id the problem is about, or the course id. */
  readonly at: string
  readonly message: string
}

/**
 * The most lessons a single node may ask for.
 *
 * A node is a step on a daily path, sized in the brief to a five-minute session; ten
 * finished lessons on one step is a week on one flag set, which is a course that has
 * stopped moving.
 */
export const MAX_NODE_LESSONS = 10

/** `namespace:screen.element` — the i18n key shape `pnpm i18n:check` enforces. */
const KEY = /^[a-z][a-zA-Z0-9]*:[a-zA-Z0-9_.]+$/

/**
 * Every reason this course cannot be walked, or an empty list.
 *
 * `minQuestions` is passed in rather than imported from the learning engine (rule 6):
 * the host knows the floor its backend enforces, which is `MIN_LESSON_ITEMS`.
 *
 * What is checked, and the failure each rule is for:
 *
 * - every entity exists and every entity × attribute has a quizzable fact — a node
 *   naming content the packs do not have teaches nothing and says it teaches something;
 * - every node can fill a lesson under every presentation — otherwise the step is an
 *   empty-state screen on the release backend, or only for screen-reader users;
 * - a check node closes its unit, the course closes with one, and it covers everything
 *   taught before it — a check that skips half the course is not a check;
 * - lessons are whole, positive and bounded, and keys are keys.
 */
export function validateCourse(
  course: Course,
  catalogue: CourseCatalogue,
  minQuestions: number,
): readonly CourseProblem[] {
  const problems: CourseProblem[] = []
  const report = (at: string, message: string) => problems.push({ at, message })

  if (!KEY.test(course.titleKey)) report(course.id, `titleKey "${course.titleKey}" is not an i18n key`)

  const ordered = nodesInOrder(course)
  const taughtEntities = new Set<string>()
  const taughtAttributes = new Set<string>()

  for (const unit of course.units) {
    if (!KEY.test(unit.titleKey)) report(unit.id, `titleKey "${unit.titleKey}" is not an i18n key`)
    if (!KEY.test(unit.objectiveKey)) report(unit.id, `objectiveKey "${unit.objectiveKey}" is not an i18n key`)

    for (const [index, node] of unit.nodes.entries()) {
      const { entities, attributes } = node.focus
      if (!KEY.test(node.objectiveKey)) report(node.id, `objectiveKey "${node.objectiveKey}" is not an i18n key`)
      if (node.lessons > MAX_NODE_LESSONS) {
        report(node.id, `asks for ${node.lessons} lessons; a step is at most ${MAX_NODE_LESSONS}`)
      }
      if (new Set(entities).size !== entities.length) report(node.id, 'names an entity twice')
      if (new Set(attributes).size !== attributes.length) report(node.id, 'names an attribute twice')

      const unknown = entities.filter((entity) => !catalogue.hasEntity(entity))
      for (const entity of unknown) report(node.id, `names entity "${entity}", which no pack defines`)
      for (const entity of entities.filter((e) => !unknown.includes(e))) {
        for (const attribute of attributes) {
          if (!catalogue.hasFact(entity, attribute)) {
            report(node.id, `has no quizzable fact for ${entity} × ${attribute}`)
          }
        }
      }

      if (unknown.length === 0) {
        const questions = catalogue.questionsFor(node.focus)
        if (questions < minQuestions) {
          report(
            node.id,
            `can fill only ${questions} question(s); a lesson needs ${minQuestions}, ` +
              `so this step would open on an empty lesson`,
          )
        }
      }

      if (node.kind === 'check') {
        if (index !== unit.nodes.length - 1) report(node.id, 'is a check but does not close its unit')
        const missed = [
          ...[...taughtEntities].filter((e) => !entities.includes(e)),
          ...[...taughtAttributes].filter((a) => !attributes.includes(a)),
        ]
        if (missed.length > 0) {
          report(node.id, `is a check that skips what came before it: ${missed.join(', ')}`)
        }
      }

      for (const entity of entities) taughtEntities.add(entity)
      for (const attribute of attributes) taughtAttributes.add(attribute)
    }
  }

  const last = ordered[ordered.length - 1]
  if (last !== undefined && last.node.kind !== 'check') {
    report(last.node.id, 'is the last step and is not a check; a course closes with one')
  }

  return problems
}
