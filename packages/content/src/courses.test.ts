import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ajvModule from 'ajv/dist/2020.js'
import ajvFormatsModule from 'ajv-formats'
import type { Entity, Fact, Template } from '@worldquest/engines'
import { checkCourses, type CourseCheckInput } from '../scripts/courses.js'

const root = join(import.meta.dirname, '..')
const packsDir = join(root, 'packs')
const localesDir = join(root, '..', 'i18n', 'locales')

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.json') ? [full] : []
  })

type Pack = { kind?: string; items?: unknown[]; [key: string]: unknown }
const packs = walk(packsDir).map((file) => ({ file, pack: JSON.parse(readFileSync(file, 'utf8')) as Pack }))
const itemsOf = (kind: string) => packs.filter((p) => p.pack.kind === kind).flatMap((p) => p.pack.items ?? [])

const strings: Record<string, Record<string, string>> = {}
for (const locale of readdirSync(localesDir)) {
  strings[locale] = Object.assign(
    {},
    ...readdirSync(join(localesDir, locale))
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(localesDir, locale, f), 'utf8')) as Record<string, string>),
  )
}

const shipped = packs.find((p) => p.pack.kind === 'course' && p.pack.packId === 'courses.first-week')
if (shipped === undefined) throw new Error('the first-week course pack is missing')
/** A deep copy to edit, so no test can reach another through the shared object. */
const firstWeek = (): Pack => JSON.parse(JSON.stringify(shipped.pack)) as Pack

type Unit = { id: string; nodes: { id: string; objectiveKey: string; focus: { entities: string[]; attributes: string[] } }[] }
const units = (pack: Pack) => pack.items as Unit[]

const check = (pack: unknown, overrides: Partial<CourseCheckInput> = {}) =>
  checkCourses({
    courses: [{ file: 'first-week.v1.json', pack }],
    entities: itemsOf('entities') as Entity[],
    facts: itemsOf('facts') as Fact[],
    templates: itemsOf('templates') as Template[],
    strings,
    ...overrides,
  }).map((p) => p.message)

describe('the first-week course', () => {
  it('is a path every learner can walk: real ids, full lessons, every key in both languages', () => {
    expect(check(shipped.pack)).toEqual([])
  })

  it('follows the launch brief: flags, places, capitals, six new countries, then all twelve, then a check', () => {
    const steps = units(shipped.pack).flatMap((u) => u.nodes)
    expect(steps.map((n) => n.focus.attributes.join('+'))).toEqual([
      'flag',
      'location',
      'capital',
      'flag+location',
      'capital',
      'flag+location+capital',
      'flag+location+capital',
    ])
    const twelve = ['SE', 'NO', 'US', 'JP', 'BR', 'KE', 'CA', 'MX', 'FR', 'DE', 'IN', 'AU']
    expect(steps.at(-1)!.focus.entities).toEqual(twelve)
    // No new countries: every one of the twelve is a brief candidate, and nothing else.
    expect(new Set(steps.flatMap((n) => n.focus.entities))).toEqual(new Set(twelve))
  })
})

describe('the course check refuses', () => {
  it("the brief's day 1 as written — four flags cannot fill a five-question lesson", () => {
    const pack = firstWeek()
    units(pack)[0]!.nodes[0]!.focus.entities = ['SE', 'NO', 'US', 'JP']
    expect(check(pack)).toContain(
      'node.first-week.flags: can fill only 4 question(s); a lesson needs 5, so this step would open on an empty lesson',
    )
  })

  it('an entity no pack defines', () => {
    const pack = firstWeek()
    units(pack)[0]!.nodes[1]!.focus.entities.push('ZZ')
    expect(check(pack)).toContain('node.first-week.locations: names entity "ZZ", which no pack defines')
  })

  it('an attribute nothing can ask about', () => {
    const pack = firstWeek()
    units(pack)[0]!.nodes[2]!.focus.attributes = ['capital', 'anthem']
    expect(check(pack)).toContain('node.first-week.capitals: has no quizzable fact for SE × anthem')
  })

  it('a country whose fact is held back for review — quizzable is false, so it teaches nothing', () => {
    // `facts.sensitive-examples` holds facts deliberately unquizzable until a human signs
    // off. A course step must not route around that by naming the entity.
    const held = (itemsOf('facts') as Fact[]).find((f) => f.quizzable === false)
    expect(held).toBeDefined()
    const pack = firstWeek()
    units(pack)[1]!.nodes[1]!.focus.entities.push(held!.entity)
    units(pack)[1]!.nodes[1]!.focus.attributes = [held!.attribute]
    expect(check(pack).some((m) => m.includes(`${held!.entity} × ${held!.attribute}`))).toBe(true)
  })

  it('a key missing from a shipped locale', () => {
    const { sv, ...rest } = strings
    const { ['course:firstWeek.node.mixed']: _dropped, ...svWithout } = sv!
    expect(check(shipped.pack, { strings: { ...rest, sv: svWithout } })).toEqual([
      'course:firstWeek.node.mixed is missing from the sv locale',
    ])
  })

  it('a node id without its course slug, since node ids are save-data keys', () => {
    const pack = firstWeek()
    units(pack)[0]!.nodes[0]!.id = 'node.other.flags'
    expect(check(pack)).toContain('node.other.flags: a node id carries its course\'s slug — expected node.first-week.<name>')
  })

  it('a pack that does not parse as a course at all', () => {
    const pack = firstWeek()
    units(pack)[0]!.nodes = []
    expect(check(pack)).toEqual(['does not parse as a course: unit.first-week.first-countries has no nodes'])
  })
})

describe('the pack schema', () => {
  type Validate = ((data: unknown) => boolean) & { errors?: { instancePath: string; message?: string }[] | null }
  type AjvCtor = new (opts: { allErrors?: boolean; strict?: boolean }) => { compile: (schema: unknown) => Validate }
  const interop = <T>(mod: unknown): T => ((mod as { default?: unknown }).default ?? mod) as T
  const ajv = new (interop<AjvCtor>(ajvModule))({ allErrors: true, strict: false })
  interop<(a: unknown) => void>(ajvFormatsModule)(ajv)
  const validate = ajv.compile(JSON.parse(readFileSync(join(root, 'schema', 'pack.schema.json'), 'utf8')))
  const strip = (pack: Pack): Pack => {
    const { $schema: _schema, $comment: _comment, ...rest } = pack
    return rest
  }

  it('accepts the shipped course', () => {
    expect(validate(strip(firstWeek()))).toBe(true)
  })

  it('requires a course to be named', () => {
    const { titleKey: _title, ...unnamed } = strip(firstWeek())
    expect(validate(unnamed)).toBe(false)
  })

  it('keeps course fields out of every other pack', () => {
    const titles = packs.find((p) => p.pack.kind === 'cosmetics')!
    expect(validate({ ...strip(titles.pack), titleKey: 'course:firstWeek.title' })).toBe(false)
  })

  it('refuses a step with no lessons, or a focus with nothing in it', () => {
    const noLessons = strip(firstWeek())
    ;(units(noLessons)[0]!.nodes[0] as { lessons?: number }).lessons = 0
    expect(validate(noLessons)).toBe(false)
    const empty = strip(firstWeek())
    units(empty)[0]!.nodes[0]!.focus.entities = []
    expect(validate(empty)).toBe(false)
  })

  it('refuses copy written into the pack instead of a key', () => {
    const pack = strip(firstWeek())
    units(pack)[0]!.nodes[0]!.objectiveKey = 'Match six flags'
    expect(validate(pack)).toBe(false)
  })
})
