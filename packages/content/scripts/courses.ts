/**
 * The course check — is every course pack a path a learner can actually walk?
 *
 * Called by `validate.ts` (section 13) with the real packs, and by
 * `src/courses.test.ts` with fixtures, which is why it is a module rather than more of
 * that script: a validator nobody has seen fail is a validator nobody knows works.
 *
 * ## What it asks, and how
 *
 * The rules themselves are the engine's (`validateCourse`); this file answers the
 * questions that rule set asks of the content, and it answers them with the REAL lesson
 * composer rather than a count of facts:
 *
 * - Does this entity exist? — the entity pack.
 * - Is there a quizzable fact for this entity and attribute? — the built index, which
 *   holds only facts some template can ask.
 * - How many questions can one lesson on this step hold? — `composeLesson`, from an
 *   empty memory, in every shipped language, with and without a screen reader, over a
 *   handful of seeds, at both the smallest and the largest lesson a device asks for.
 *   The fewest wins. That is the question the D1 Worker answers when it refuses a focus
 *   with `FOCUS_TOO_NARROW`, asked here first so the answer is a red CI run rather than
 *   an empty lesson on somebody's phone.
 *
 * And three the engine cannot ask because it never sees files: every copy key the
 * course names exists in every shipped locale, unit and node ids carry the course's own
 * slug (so two courses can never share a node id, which is a save-data key), and the
 * pack parses at all.
 */

import {
  MAX_LESSON_ITEMS,
  MIN_LESSON_ITEMS,
  buildIndex,
  composeLesson,
  focusFilter,
  parseCourse,
  seededRng,
  validateCourse,
  type Course,
  type CourseCatalogue,
  type CourseFocus,
  type Entity,
  type Fact,
  type Template,
} from '@worldquest/engines'

export type CourseCheckInput = {
  /** Every pack whose kind is `course`, already read from disk. */
  readonly courses: readonly { readonly file: string; readonly pack: unknown }[]
  readonly entities: readonly Entity[]
  readonly facts: readonly Fact[]
  readonly templates: readonly Template[]
  /** locale → key → value, from `packages/i18n/locales`. */
  readonly strings: Readonly<Record<string, Readonly<Record<string, string>>>>
}

export type CourseCheckProblem = { readonly file: string; readonly message: string }

/** Enough seeds that a distractor draw which fails one time in a few is seen. */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

/** What a device can put on screen — the same list `apps/mobile/src/lib/content.ts` passes. */
const MODALITIES: readonly Template['modality'][] = ['text', 'image', 'map']

/** A catalogue over the real content, answered by the real composer. */
export function catalogueFor(
  input: Pick<CourseCheckInput, 'entities' | 'facts' | 'templates'>,
  locales: readonly string[],
): CourseCatalogue {
  const index = buildIndex({ entities: [...input.entities], facts: [...input.facts], templates: [...input.templates] })
  const askable = new Set<string>()
  for (const factId of index.itemsByFact.keys()) {
    const fact = index.facts.get(factId)
    if (fact !== undefined) askable.add(`${fact.entity}\u0000${fact.attribute}`)
  }

  const questionsFor = (focus: CourseFocus): number => {
    const topicFilter = focusFilter(index, focus)
    let fewest = Number.POSITIVE_INFINITY
    for (const locale of locales) {
      for (const screenReaderOnly of [false, true]) {
        for (const count of [MIN_LESSON_ITEMS, MAX_LESSON_ITEMS]) {
          for (const seed of SEEDS) {
            const questions = composeLesson({
              index,
              memory: [],
              now: 0,
              rng: seededRng(seed),
              locale,
              count,
              modalities: MODALITIES,
              screenReaderOnly,
              ...(topicFilter ? { topicFilter } : {}),
              entityIsGiven: focus.entities.length === 1,
            })
            fewest = Math.min(fewest, questions.length)
          }
        }
      }
    }
    return Number.isFinite(fewest) ? fewest : 0
  }

  return {
    hasEntity: (id) => index.entities.has(id),
    hasFact: (entity, attribute) => askable.has(`${entity}\u0000${attribute}`),
    questionsFor,
  }
}

/** Every copy key a course names, for the locale check. */
function keysOf(course: Course): readonly string[] {
  return [
    course.titleKey,
    ...course.units.flatMap((unit) => [unit.titleKey, unit.objectiveKey, ...unit.nodes.map((n) => n.objectiveKey)]),
  ]
}

export function checkCourses(input: CourseCheckInput): readonly CourseCheckProblem[] {
  const problems: CourseCheckProblem[] = []
  const shippedLocales = Object.keys(input.strings)

  for (const { file, pack } of input.courses) {
    const report = (message: string) => problems.push({ file, message })
    const parsed = parseCourse(pack)
    if (!parsed.ok) {
      report(`does not parse as a course: ${parsed.error.message}`)
      continue
    }
    const course = parsed.value

    // `courses.first-week` → `first-week`, which every unit and node id must carry.
    const slug = course.id.startsWith('courses.') ? course.id.slice('courses.'.length) : null
    if (slug === null) report(`packId "${course.id}" should be courses.<slug>`)
    for (const unit of course.units) {
      if (slug !== null && !unit.id.startsWith(`unit.${slug}.`)) {
        report(`${unit.id}: a unit id carries its course's slug — expected unit.${slug}.<name>`)
      }
      for (const node of unit.nodes) {
        if (slug !== null && !node.id.startsWith(`node.${slug}.`)) {
          report(`${node.id}: a node id carries its course's slug — expected node.${slug}.<name>`)
        }
      }
    }

    // The copy, in every language the course and the app both ship. A key that exists in
    // English only is a Swedish learner reading a raw key on the screen every session
    // starts from.
    const packLocales = Array.isArray((pack as { locales?: unknown }).locales)
      ? ((pack as { locales: unknown[] }).locales.filter((l) => typeof l === 'string') as string[])
      : shippedLocales
    const locales = packLocales.filter((l) => shippedLocales.includes(l))
    for (const key of keysOf(course)) {
      for (const locale of locales) {
        if (input.strings[locale]?.[key] === undefined) report(`${key} is missing from the ${locale} locale`)
      }
    }

    const catalogue = catalogueFor(input, locales.length > 0 ? locales : ['en'])
    for (const problem of validateCourse(course, catalogue, MIN_LESSON_ITEMS)) {
      report(`${problem.at}: ${problem.message}`)
    }
  }

  return problems
}
