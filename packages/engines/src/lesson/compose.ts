/**
 * Lesson composition: memory state + content index → a queue of questions.
 *
 * This is where the learning engine and the content engine meet. It is the only
 * layer that knows both what the user remembers and what can be asked, which is why
 * it is also the layer that marks a question as new (heart accounting depends on it).
 *
 * Pure and deterministic given a seed.
 */

import { shuffle, type Rng } from '../shared/index.js'
import { selectItems, lessonLength } from '../learning/selection.js'
import { experienceFrom } from '../learning/ramp.js'
import { shapeLesson } from './shape.js'
import { pairUp } from './pairs.js'
import type { FactId, MemoryState } from '../learning/types.js'
import {
  buildQuestion,
  itemsForFact,
  type ContentIndex,
  type Question,
  type Template,
} from '../content/index.js'

export type ComposeInput = {
  readonly index: ContentIndex
  readonly memory: readonly MemoryState[]
  readonly now: number
  readonly rng: Rng
  readonly locale: string
  /** Median answer time, used to size the lesson. */
  readonly medianItemMs?: number
  /** Explicit count overrides the size calculation (quests, challenges). */
  readonly count?: number
  readonly topicFilter?: (factId: FactId) => boolean
  /** Selects screen-reader-safe templates. Same facts, same progress. */
  readonly screenReaderOnly?: boolean
  /**
   * What the host can actually put on screen. Omitted means "everything".
   *
   * A template's modality is a promise about presentation: `image` means the prompt
   * is a picture, and a host that cannot show that picture asks "Which country's
   * flag is this?" beside four country names and no flag — a question with no
   * answerable content, served to a child who then loses a heart on it.
   *
   * Nothing is lost by narrowing it. Every fact is reachable through more than one
   * template, and the siblings test the SAME fact — so the user's `user_facts` row
   * comes out identical either way. That is the same argument
   * `docs/design/accessibility.md` §8 makes for screen-reader templates, and it is
   * the reason both filters live here rather than in the UI: a question the host
   * cannot present should never enter the queue, not be skipped once it has.
   */
  readonly modalities?: readonly Template['modality'][]
  readonly catchUpMode?: boolean
  /**
   * True when this lesson is about ONE entity, so the entity is not askable.
   *
   * Set by the caller because only the caller knows the scope: `?entity=SE` from the
   * country page is a lesson about Sweden, and in it "which country is this the flag
   * of?" has one answer the user already has. See `itemsForFact`, which orders the
   * revealing templates last rather than removing them.
   */
  readonly entityIsGiven?: boolean
  /** Prefer presentations at most this hard (`difficultyRamp().maxModifier`). */
  readonly maxModifier?: number
  /**
   * Offer unseen facts of at least this authored difficulty first (`difficultyRamp().introduceFrom`).
   * An ordering, never a filter: the easier ones follow, so a learner who has earned a lot of
   * XP is not starved of the basics they skipped, only not served them first.
   */
  readonly introduceFrom?: number
  /**
   * Leave the questions in the order selection returned them. Shaping (`shapeLesson`) is the
   * default; this is for the callers that need the raw order — a test of selection itself, or
   * a quest that has already decided its sequence.
   */
  readonly unshaped?: boolean
  /**
   * Allow one "match the pairs" board in the lesson (`lesson/pairs.ts`). On by default, and
   * only ever used at the gentle end of the ramp; a caller that cannot draw a board passes false.
   */
  readonly pairs?: boolean
  /**
   * `tap`: a map drill, answered by tapping the place on a map (`Template.input`). Only facts
   * that CAN be asked that way are chosen, and only that way of asking is used — a drill that
   * slipped in a flag question would be a different game halfway through. No pairs board.
   * Screen-reader lessons get the same facts spoken (see `itemsForFact`).
   */
  readonly input?: 'tap'
}

export function composeLesson(input: ComposeInput): readonly Question[] {
  const {
    index,
    memory,
    now,
    rng,
    locale,
    medianItemMs = 8_000,
    screenReaderOnly,
    modalities,
    catchUpMode,
    entityIsGiven,
    maxModifier,
    introduceFrom,
    unshaped,
    input: answerBy,
  } = input
  const pairs = answerBy === 'tap' ? false : (input.pairs ?? true)
  const topicFilter = answerBy === 'tap' ? tapFilter(index, input.topicFilter) : input.topicFilter

  const seen = new Set(memory.map((m) => m.factId))
  const quizzableFacts = [...index.itemsByFact.keys()]

  /**
   * A fact is "new" when the user has no memory state for it at all.
   *
   * Sorted easiest-first, which is the order `selectItems` documents as its input and
   * simply trusted. It used to arrive in index insertion order — meaning the order the
   * pack files happened to be listed in the host's import statement — and `selectItems`
   * takes the HEAD of this list, so a user with an empty memory got the first N facts
   * of whichever pack was imported first and nothing else.
   *
   * Every user's memory is empty on day one, so the effect was total: capitals were
   * imported first, so a new user's lesson was capitals, and no flag or currency
   * question could appear until all sixty-five capitals had been seen. Three attributes
   * were authored, sourced and tested; one was reachable. The import order in one file
   * was deciding the curriculum.
   *
   * Ties are shuffled rather than left in pack order, because difficulty alone would
   * still hand out every difficulty-2 capital before the first difficulty-2 flag — the
   * same starvation on a smaller scale.
   */
  /**
   * Depth before breadth: among new facts of the same difficulty, the ones about a country the
   * learner has already STARTED come first.
   *
   * Knowing France's capital makes France's flag easier to hold than an unrelated country's
   * flag — there is somewhere to attach it — and a learner who meets one fact each about forty
   * countries has forty things they half know and none they know. Duolingo's path does this by
   * teaching a theme together; this does it with no authored order, because it falls out of
   * what the learner has already touched. A country whose facts are ALL seen is finished, not
   * started, so it does not pull; and it only breaks ties within a difficulty, so a beginner
   * is never held at one country while easier ones wait.
   */
  const factsPerEntity = factsPerEntityOf(index, quizzableFacts)
  const seenPerEntity = new Map<string, number>()
  for (const id of seen) {
    const entity = index.facts.get(id)?.entity
    if (entity !== undefined) seenPerEntity.set(entity, (seenPerEntity.get(entity) ?? 0) + 1)
  }
  const inProgress = (id: FactId): boolean => {
    const entity = index.facts.get(id)?.entity
    if (entity === undefined) return false
    const done = seenPerEntity.get(entity) ?? 0
    return done > 0 && done < (factsPerEntity.get(entity) ?? 0)
  }

  // Shuffled whole and narrowed after, not narrowed first: the shuffle draws from `rng` once
  // per fact, so shuffling the topic alone would hand every later draw in the lesson a
  // different stream than it had, and the same seed would compose a different lesson.
  // `selectItems` drops what is out of topic anyway; sorting 6,700 facts to throw 6,600 away
  // was most of what a topic-bound lesson cost, and a course check composes two thousand.
  const unseen = shuffle(
    quizzableFacts.filter((id) => !seen.has(id)),
    rng,
  )
  const newFactIds = (topicFilter ? unseen.filter(topicFilter) : unseen).sort((a, b) => {
    const da = index.facts.get(a)?.difficulty ?? 3
    const db = index.facts.get(b)?.difficulty ?? 3
    if (introduceFrom !== undefined) {
      const ra = da >= introduceFrom ? 0 : 1
      const rb = db >= introduceFrom ? 0 : 1
      if (ra !== rb) return ra - rb
    }
    if (da !== db) return da - db
    return Number(!inProgress(a)) - Number(!inProgress(b))
  })

  const count = input.count ?? lessonLength(medianItemMs)

  // Read once, from the memory this lesson is composed from, so the Worker and the app —
  // which compose from the same memory — pace identically.
  const experience = experienceFrom(memory)
  const recentAccuracy = experience.reviews >= RECENT_ACCURACY_MIN_REVIEWS ? experience.accuracy : null

  const chosen = selectItems({
    candidates: memory,
    newFactIds,
    count,
    now,
    rng,
    recentAccuracy,
    ...(topicFilter ? { topicFilter } : {}),
    ...(catchUpMode !== undefined ? { catchUpMode } : {}),
  })

  /**
   * Whether a TYPED way of asking may be used for this fact in this lesson.
   *
   * Typing is recall, the hardest way to be asked, so three things must hold: the learner has
   * met the fact more than once (nobody can type what they were never shown, and a first
   * miss on a new fact costs no heart for exactly that reason), it is not a leech they are
   * resting from, and the ramp has taken them to the top of the way-of-asking dial. A lesson
   * composed with no ramp at all never types — the plain default stays plain.
   */
  const memoryByFact = new Map(memory.map((m) => [m.factId, m] as const))
  const typedAllowed = (templateId: string, factId: FactId): boolean => {
    if (index.templates.get(templateId)?.input !== 'typed') return true
    const state = memoryByFact.get(factId)
    return state !== undefined && state.reps >= 2 && !state.suspended && (maxModifier ?? 0) >= 2
  }

  const questions: Question[] = []
  for (const factId of chosen) {
    /**
     * Try every presentation this fact has, not only the first one drawn.
     *
     * This took a single pick and dropped the fact when it produced no question, which
     * conflates two different situations: a fact that CANNOT be asked, and a fact whose
     * randomly-chosen template happens to name its own answer while another template
     * for the same fact is perfectly askable. `geo.MX.capital` is the second — with a
     * screen reader it has two safe presentations and only `tpl.capital.mc4` can be
     * asked, so half the time a blind user's lesson was one question shorter than
     * everyone else's, at random, with nothing anywhere reporting it.
     *
     * A fact with no plausible distractors is still skipped rather than asked badly.
     */
    for (const item of itemsForFact(index, factId, rng, {
      ...(screenReaderOnly !== undefined ? { screenReaderOnly } : {}),
      ...(modalities !== undefined ? { modalities } : {}),
      ...(entityIsGiven !== undefined ? { deprioritizeEntityAnswers: entityIsGiven } : {}),
      ...(maxModifier !== undefined ? { preferModifierAtMost: maxModifier } : {}),
      ...(answerBy !== undefined ? { input: answerBy } : {}),
    })) {
      if (!typedAllowed(item.templateId, factId)) continue
      const question = buildQuestion(index, item, locale, rng, { isNew: !seen.has(factId) })
      if (question) {
        questions.push(question)
        break
      }
    }
  }

  if (unshaped === true) return questions
  const attributeOf = (question: Question): string | undefined => index.facts.get(question.item.factId)?.attribute
  const shaped = shapeLesson(questions, { memory: new Map(memory.map((m) => [m.factId, m] as const)), now, attributeOf })
  // Matching is the gentle exercise: at the top of the ramp the learner is asked to TYPE instead.
  return pairs && (maxModifier ?? 0) <= 1 ? pairUp(shaped, { index, rng, attributeOf }) : shaped
}

/**
 * The facts a map drill can ask: those with a tap way of asking, inside whatever else the
 * caller narrowed to. Without it a drill over Europe would select capitals and flags too,
 * find no tap template for them, and come out a third of its length.
 */
function tapFilter(index: ContentIndex, narrower: ((factId: FactId) => boolean) | undefined): (factId: FactId) => boolean {
  return (factId) =>
    (narrower === undefined || narrower(factId)) &&
    (index.itemsByFact.get(factId) ?? []).some((item) => index.templates.get(item.templateId)?.input === 'tap')
}

/** Accuracy is not read before this many reviews: three lucky answers are not a trend. */
const RECENT_ACCURACY_MIN_REVIEWS = 20
/** How many askable facts each entity has: a property of the index, not of any one lesson. */
const factsPerEntityCache = new WeakMap<object, Map<string, number>>()
function factsPerEntityOf(index: ContentIndex, quizzableFacts: readonly FactId[]): Map<string, number> {
  const held = factsPerEntityCache.get(index)
  if (held !== undefined) return held
  const counts = new Map<string, number>()
  for (const id of quizzableFacts) {
    const entity = index.facts.get(id)?.entity
    if (entity !== undefined) counts.set(entity, (counts.get(entity) ?? 0) + 1)
  }
  factsPerEntityCache.set(index, counts)
  return counts
}

