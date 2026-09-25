import { describe, expect, it } from 'vitest'
import { seededRng, type Rng } from '../shared/index.js'
import {
  MAX_NODE_LESSONS,
  courseStanding,
  creditLesson,
  nodeStanding,
  parseCourse,
  reviewFocus,
  validateCourse,
  type Course,
  type CourseCatalogue,
  type CourseProgress,
} from './path.js'

/**
 * A two-unit course in the pack's own shape. Deliberately NOT geography: this package
 * must not know what a flag is, so its tests prove the rules hold for any subject.
 */
const PACK = {
  packId: 'courses.stars',
  version: '1.0.0',
  titleKey: 'course:stars.title',
  items: [
    {
      id: 'unit.stars.bright',
      titleKey: 'course:stars.unit.bright.title',
      objectiveKey: 'course:stars.unit.bright.objective',
      nodes: [
        {
          id: 'node.stars.names',
          kind: 'lesson',
          objectiveKey: 'course:stars.node.names',
          focus: { entities: ['A', 'B', 'C'], attributes: ['name'] },
          lessons: 2,
        },
        {
          id: 'node.stars.colours',
          kind: 'lesson',
          objectiveKey: 'course:stars.node.colours',
          focus: { entities: ['A', 'B', 'C'], attributes: ['colour'] },
          lessons: 1,
        },
      ],
    },
    {
      id: 'unit.stars.more',
      titleKey: 'course:stars.unit.more.title',
      objectiveKey: 'course:stars.unit.more.objective',
      nodes: [
        {
          id: 'node.stars.new',
          kind: 'lesson',
          objectiveKey: 'course:stars.node.new',
          focus: { entities: ['D', 'E'], attributes: ['name', 'colour'] },
          lessons: 2,
        },
        {
          id: 'node.stars.check',
          kind: 'check',
          objectiveKey: 'course:stars.node.check',
          focus: { entities: ['A', 'B', 'C', 'D', 'E'], attributes: ['name', 'colour'] },
          lessons: 1,
        },
      ],
    },
  ],
}

const parsed = parseCourse(PACK)
if (!parsed.ok) throw new Error(parsed.error.message)
const COURSE: Course = parsed.value

const stateOf = (progress: CourseProgress) =>
  courseStanding(COURSE, progress).units.flatMap((u) => u.nodes.map((n) => [n.node.id, n.state]))

describe('parseCourse', () => {
  it('reads a course pack into units and nodes, in order', () => {
    expect(COURSE.id).toBe('courses.stars')
    expect(COURSE.units.map((u) => u.id)).toEqual(['unit.stars.bright', 'unit.stars.more'])
    expect(COURSE.units[1]!.nodes[1]).toEqual({
      id: 'node.stars.check',
      kind: 'check',
      objectiveKey: 'course:stars.node.check',
      focus: { entities: ['A', 'B', 'C', 'D', 'E'], attributes: ['name', 'colour'] },
      lessons: 1,
    })
  })

  it('ignores authoring comments', () => {
    const withComment = { ...PACK, $comment: 'why this course exists', $schema: '../x.json' }
    expect(parseCourse(withComment).ok).toBe(true)
  })

  const broken: [string, unknown][] = [
    ['not an object', 'course'],
    ['no packId', { ...PACK, packId: '' }],
    ['no version', { ...PACK, version: undefined }],
    ['no title', { ...PACK, titleKey: 3 }],
    ['no units', { ...PACK, items: [] }],
    ['a unit that is not an object', { ...PACK, items: [null] }],
    ['a unit with no id', { ...PACK, items: [{ ...PACK.items[0], id: '' }] }],
    ['a unit with no title', { ...PACK, items: [{ ...PACK.items[0], titleKey: undefined }] }],
    ['a unit with no objective', { ...PACK, items: [{ ...PACK.items[0], objectiveKey: undefined }] }],
    ['a unit with no nodes', { ...PACK, items: [{ ...PACK.items[0], nodes: [] }] }],
    ['a node that is not an object', { ...PACK, items: [{ ...PACK.items[0], nodes: ['x'] }] }],
    ['a node with no id', { ...PACK, items: [{ ...PACK.items[0], nodes: [{ ...PACK.items[0]!.nodes[0], id: 7 }] }] }],
    ['an unknown kind', { ...PACK, items: [{ ...PACK.items[0], nodes: [{ ...PACK.items[0]!.nodes[0], kind: 'boss' }] }] }],
    ['no objective', { ...PACK, items: [{ ...PACK.items[0], nodes: [{ ...PACK.items[0]!.nodes[0], objectiveKey: '' }] }] }],
    ['no focus', { ...PACK, items: [{ ...PACK.items[0], nodes: [{ ...PACK.items[0]!.nodes[0], focus: undefined }] }] }],
    [
      'an empty entity list, which would compose nothing',
      { ...PACK, items: [{ ...PACK.items[0], nodes: [{ ...PACK.items[0]!.nodes[0], focus: { entities: [], attributes: ['name'] } }] }] },
    ],
    [
      'an absent attribute list, which would mean everything',
      { ...PACK, items: [{ ...PACK.items[0], nodes: [{ ...PACK.items[0]!.nodes[0], focus: { entities: ['A'] } }] }] },
    ],
    ['zero lessons', { ...PACK, items: [{ ...PACK.items[0], nodes: [{ ...PACK.items[0]!.nodes[0], lessons: 0 }] }] }],
    ['half a lesson', { ...PACK, items: [{ ...PACK.items[0], nodes: [{ ...PACK.items[0]!.nodes[0], lessons: 1.5 }] }] }],
    [
      'a node id used twice',
      { ...PACK, items: [{ ...PACK.items[0], nodes: [PACK.items[0]!.nodes[0], PACK.items[0]!.nodes[0]] }] },
    ],
    ['a unit id used twice', { ...PACK, items: [PACK.items[0], PACK.items[0]] }],
  ]
  for (const [name, raw] of broken) {
    it(`refuses ${name}`, () => {
      const result = parseCourse(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('COURSE_INVALID')
    })
  }
})

describe('courseStanding', () => {
  it('opens a new learner on the first node, with everything after it locked', () => {
    const standing = courseStanding(COURSE, {})
    expect(stateOf({})).toEqual([
      ['node.stars.names', 'current'],
      ['node.stars.colours', 'locked'],
      ['node.stars.new', 'locked'],
      ['node.stars.check', 'locked'],
    ])
    expect(standing.next).toMatchObject({ kind: 'node', node: { id: 'node.stars.names' }, unitId: 'unit.stars.bright' })
    expect(standing.complete).toBe(false)
    expect(standing.done).toBe(0)
    expect(standing.total).toBe(4)
    expect(standing.units.map((u) => u.state)).toEqual(['current', 'locked'])
  })

  it('keeps a half-finished node current, counting what is finished', () => {
    const standing = courseStanding(COURSE, { 'node.stars.names': 1 })
    const names = nodeStanding(standing, 'node.stars.names')
    expect(names).toMatchObject({ state: 'current', finished: 1, position: 0 })
  })

  it('moves on when a node has its lessons, across a unit boundary', () => {
    expect(stateOf({ 'node.stars.names': 2, 'node.stars.colours': 1 })).toEqual([
      ['node.stars.names', 'done'],
      ['node.stars.colours', 'done'],
      ['node.stars.new', 'current'],
      ['node.stars.check', 'locked'],
    ])
    const standing = courseStanding(COURSE, { 'node.stars.names': 2, 'node.stars.colours': 1 })
    expect(standing.units.map((u) => [u.state, u.done])).toEqual([
      ['done', 2],
      ['current', 0],
    ])
  })

  it('caps what it shows at the node\'s own count, so practice never reads as 5 of 2', () => {
    const standing = courseStanding(COURSE, { 'node.stars.names': 5 })
    expect(nodeStanding(standing, 'node.stars.names')?.finished).toBe(2)
  })

  it('ends: after the last node the next step is review, not another node', () => {
    const all = { 'node.stars.names': 2, 'node.stars.colours': 1, 'node.stars.new': 2, 'node.stars.check': 1 }
    const standing = courseStanding(COURSE, all)
    expect(standing.complete).toBe(true)
    expect(standing.done).toBe(4)
    expect(standing.next).toEqual({
      kind: 'review',
      focus: { entities: ['A', 'B', 'C', 'D', 'E'], attributes: ['name', 'colour'] },
    })
    expect(standing.units.every((u) => u.state === 'done')).toBe(true)
  })

  it('keeps a done node done when an earlier node is still open', () => {
    // A course update may insert a step before one a learner already finished. The
    // finished one stays finished — losing work to an edit we made is a punishment —
    // and the new step becomes the current one.
    expect(stateOf({ 'node.stars.names': 2, 'node.stars.new': 2 })).toEqual([
      ['node.stars.names', 'done'],
      ['node.stars.colours', 'current'],
      ['node.stars.new', 'done'],
      ['node.stars.check', 'locked'],
    ])
  })

  it('reads corrupt progress as zero rather than failing', () => {
    const garbage = {
      'node.stars.names': Number.NaN,
      'node.stars.colours': -3,
      'node.stars.new': Number.POSITIVE_INFINITY,
      'node.stars.check': '1' as unknown as number,
      'node.gone': 9,
    }
    expect(courseStanding(COURSE, garbage).next).toMatchObject({ kind: 'node', node: { id: 'node.stars.names' } })
  })

  it('never finds a node on the object prototype, and never counts half a lesson', () => {
    // Node ids are pack data. One that happens to be `constructor` or `toString` must not
    // read Object.prototype's member as a count of finished lessons.
    const odd = parseCourse({
      ...PACK,
      items: [{ ...PACK.items[0], nodes: [{ ...PACK.items[0]!.nodes[0], id: 'constructor', lessons: 1 },
        { ...PACK.items[0]!.nodes[1], id: 'toString', lessons: 3 }] }],
    })
    if (!odd.ok) throw new Error(odd.error.message)
    const fresh = courseStanding(odd.value, {})
    expect(nodeStanding(fresh, 'constructor')).toMatchObject({ state: 'current', finished: 0 })
    expect(nodeStanding(fresh, 'toString')).toMatchObject({ state: 'locked', finished: 0 })
    const partial = courseStanding(odd.value, { constructor: 1, toString: 2.9 })
    expect(nodeStanding(partial, 'toString')).toMatchObject({ state: 'current', finished: 2 })
  })

  it('answers undefined for a node the course does not have', () => {
    expect(nodeStanding(courseStanding(COURSE, {}), 'node.elsewhere')).toBeUndefined()
  })
})

describe('creditLesson', () => {
  it('counts a finished lesson on the current node', () => {
    expect(creditLesson(COURSE, {}, 'node.stars.names')).toEqual({ 'node.stars.names': 1 })
  })

  it('counts practice on a done node, which changes nothing about the path', () => {
    const before = { 'node.stars.names': 2 }
    const after = creditLesson(COURSE, before, 'node.stars.names')
    expect(after).toEqual({ 'node.stars.names': 3 })
    expect(stateOf(after)).toEqual(stateOf(before))
  })

  it('gives nothing to a locked node, returning the same object', () => {
    const before = { 'node.stars.names': 1 }
    expect(creditLesson(COURSE, before, 'node.stars.check')).toBe(before)
  })

  it('gives nothing to an id the course does not have', () => {
    const before = {}
    expect(creditLesson(COURSE, before, 'node.elsewhere')).toBe(before)
  })

  it('repairs a corrupt count as it adds to it', () => {
    expect(creditLesson(COURSE, { 'node.stars.names': -4 }, 'node.stars.names')).toEqual({ 'node.stars.names': 1 })
  })
})

describe('reviewFocus', () => {
  it('is everything the course taught, in first-seen order', () => {
    expect(reviewFocus(COURSE)).toEqual({ entities: ['A', 'B', 'C', 'D', 'E'], attributes: ['name', 'colour'] })
  })
})

describe('validateCourse', () => {
  const FACTS = new Set(['A.name', 'B.name', 'C.name', 'D.name', 'E.name', 'A.colour', 'B.colour', 'C.colour', 'D.colour', 'E.colour'])
  const catalogue = (overrides: Partial<CourseCatalogue> = {}): CourseCatalogue => ({
    hasEntity: (id) => ['A', 'B', 'C', 'D', 'E'].includes(id),
    hasFact: (entity, attribute) => FACTS.has(`${entity}.${attribute}`),
    // One question per entity-attribute pair — the composer's rule for one lesson.
    questionsFor: (focus) => focus.entities.length * focus.attributes.length,
    ...overrides,
  })
  const withNode = (unit: number, node: number, change: Record<string, unknown>): Course => {
    const units = COURSE.units.map((u, ui) =>
      ui !== unit ? u : { ...u, nodes: u.nodes.map((n, ni) => (ni !== node ? n : { ...n, ...change })) },
    )
    return { ...COURSE, units }
  }

  it('accepts a course every learner can walk', () => {
    expect(validateCourse(COURSE, catalogue(), 2)).toEqual([])
  })

  it('refuses an entity no pack defines', () => {
    const course = withNode(0, 0, { focus: { entities: ['A', 'Z'], attributes: ['name'] } })
    expect(validateCourse(course, catalogue(), 1)).toContainEqual({
      at: 'node.stars.names',
      message: 'names entity "Z", which no pack defines',
    })
  })

  it('refuses an attribute the entity has no quizzable fact for', () => {
    const course = withNode(0, 0, { focus: { entities: ['A'], attributes: ['name', 'mass'] } })
    expect(validateCourse(course, catalogue(), 1).map((p) => p.message)).toContain('has no quizzable fact for A × mass')
  })

  it('refuses a step too narrow to fill a lesson', () => {
    const problems = validateCourse(COURSE, catalogue(), 4)
    // `names` holds three questions and `colours` three: both would open empty.
    expect(problems.map((p) => p.at)).toEqual(['node.stars.names', 'node.stars.colours'])
    expect(problems[0]!.message).toMatch(/only 3 question\(s\); a lesson needs 4/)
  })

  it('asks the catalogue for the narrowest presentation, and believes it', () => {
    // A screen-reader lesson one question shorter is still a lesson that must fill.
    const problems = validateCourse(COURSE, catalogue({ questionsFor: () => 1 }), 2)
    expect(problems).toHaveLength(4)
  })

  it('refuses a check that is not the last step of its unit', () => {
    const units = [
      { ...COURSE.units[0]!, nodes: [COURSE.units[1]!.nodes[1]!, ...COURSE.units[0]!.nodes] },
      COURSE.units[1]!,
    ]
    const problems = validateCourse({ ...COURSE, units }, catalogue(), 1)
    expect(problems).toContainEqual({ at: 'node.stars.check', message: 'is a check but does not close its unit' })
  })

  it('refuses a course that does not close with a check', () => {
    const course = withNode(1, 1, { kind: 'lesson' })
    expect(validateCourse(course, catalogue(), 1)).toContainEqual({
      at: 'node.stars.check',
      message: 'is the last step and is not a check; a course closes with one',
    })
  })

  it('refuses a check that skips what came before it', () => {
    const course = withNode(1, 1, { focus: { entities: ['D', 'E'], attributes: ['name'] } })
    const problems = validateCourse(course, catalogue(), 1)
    expect(problems).toContainEqual({
      at: 'node.stars.check',
      message: 'is a check that skips what came before it: A, B, C, colour',
    })
  })

  it('refuses a step that never ends', () => {
    const course = withNode(0, 0, { lessons: MAX_NODE_LESSONS + 1 })
    expect(validateCourse(course, catalogue(), 1).map((p) => p.message)).toContain(
      `asks for ${MAX_NODE_LESSONS + 1} lessons; a step is at most ${MAX_NODE_LESSONS}`,
    )
  })

  it('refuses the same entity or attribute twice in one focus', () => {
    const course = withNode(0, 0, { focus: { entities: ['A', 'A'], attributes: ['name', 'name'] } })
    const messages = validateCourse(course, catalogue(), 1).map((p) => p.message)
    expect(messages).toContain('names an entity twice')
    expect(messages).toContain('names an attribute twice')
  })

  it('refuses copy that is not an i18n key', () => {
    // Words where a key belongs would reach the screen in English for everybody.
    const withCopy = withNode(0, 1, { objectiveKey: 'Learn the colours' })
    const [first, second] = withCopy.units
    const course: Course = {
      ...withCopy,
      titleKey: 'Stars',
      units: [{ ...first!, titleKey: 'Bright stars', objectiveKey: 'x' }, second!],
    }
    expect(validateCourse(course, catalogue(), 1).map((p) => p.at)).toEqual([
      'courses.stars',
      'unit.stars.bright',
      'unit.stars.bright',
      'node.stars.colours',
    ])
  })
})

// ── properties, over thousands of generated courses and progress maps ─────────

/** A random valid-shaped course: 1–4 units of 1–5 nodes, each asking for 1–3 lessons. */
function randomCourse(rng: Rng): Course {
  const int = (lo: number, hi: number) => lo + Math.floor(rng.next() * (hi - lo + 1))
  let n = 0
  const units = Array.from({ length: int(1, 4) }, (_, u) => ({
    id: `unit.gen.${u}`,
    titleKey: `course:gen.unit${u}`,
    objectiveKey: `course:gen.unit${u}.objective`,
    nodes: Array.from({ length: int(1, 5) }, () => {
      const id = `node.gen.${n++}`
      return {
        id,
        kind: 'lesson' as const,
        objectiveKey: `course:gen.${id}`,
        focus: { entities: ['A'], attributes: ['x'] },
        lessons: int(1, 3),
      }
    }),
  }))
  return { id: 'courses.gen', version: '1.0.0', titleKey: 'course:gen.title', units }
}

/** Progress as storage might really hold it: some real counts, some junk, some strays. */
function randomProgress(rng: Rng, course: Course): CourseProgress {
  const progress: Record<string, number> = {}
  for (const unit of course.units) {
    for (const node of unit.nodes) {
      const roll = rng.next()
      if (roll < 0.4) continue
      if (roll < 0.9) progress[node.id] = Math.floor(rng.next() * 5)
      else progress[node.id] = [-1, Number.NaN, 0.5, 1e9][Math.floor(rng.next() * 4)]!
    }
  }
  if (rng.next() < 0.2) progress['node.stray'] = 3
  return progress
}

describe('course properties', () => {
  const rng = seededRng(20260925)
  const CASES = 2000

  it('has exactly one current node until the course is complete, and none after', () => {
    for (let i = 0; i < CASES; i++) {
      const course = randomCourse(rng)
      const standing = courseStanding(course, randomProgress(rng, course))
      const nodes = standing.units.flatMap((u) => u.nodes)
      const current = nodes.filter((s) => s.state === 'current')
      expect(current.length).toBe(standing.complete ? 0 : 1)
      expect(standing.complete).toBe(nodes.every((s) => s.state === 'done'))
      expect(standing.done + current.length + nodes.filter((s) => s.state === 'locked').length).toBe(standing.total)
      if (standing.complete) {
        expect(standing.next.kind).toBe('review')
      } else {
        expect(standing.next).toMatchObject({ kind: 'node', node: { id: current[0]!.node.id } })
        // Everything before the current node is done; nothing locked comes before it.
        expect(nodes.slice(0, current[0]!.position).every((s) => s.state === 'done')).toBe(true)
      }
      // Path order is position order.
      expect(nodes.map((s) => s.position)).toEqual(nodes.map((_, p) => p))
    }
  })

  it('only ever moves forward: finishing the current node opens a later one', () => {
    for (let i = 0; i < CASES; i++) {
      const course = randomCourse(rng)
      let progress = randomProgress(rng, course)
      let standing = courseStanding(course, progress)
      let guard = 0
      while (standing.next.kind === 'node' && guard++ < 100) {
        const { node } = standing.next
        const at = nodeStanding(standing, node.id)!.position
        const doneBefore = standing.done
        for (let k = 0; k < node.lessons; k++) progress = creditLesson(course, progress, node.id)
        standing = courseStanding(course, progress)
        expect(nodeStanding(standing, node.id)!.state).toBe('done')
        expect(standing.done).toBeGreaterThan(doneBefore)
        if (standing.next.kind === 'node') {
          expect(nodeStanding(standing, standing.next.node.id)!.position).toBeGreaterThan(at)
        }
      }
      expect(standing.complete).toBe(true)
    }
  })

  it('never lets a locked node earn anything', () => {
    for (let i = 0; i < CASES; i++) {
      const course = randomCourse(rng)
      const progress = randomProgress(rng, course)
      const standing = courseStanding(course, progress)
      for (const locked of standing.units.flatMap((u) => u.nodes).filter((s) => s.state === 'locked')) {
        expect(creditLesson(course, progress, locked.node.id)).toBe(progress)
      }
    }
  })
})
