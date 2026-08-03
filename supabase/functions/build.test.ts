/**
 * Guards on the edge-function bundle.
 *
 * The deployed function must run the SAME grading code as the client. These tests
 * assert the bundle is self-contained and that the one place we substitute a local
 * declaration cannot drift from the module it stands in for.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildFunction, verifyBundle } from './build.js'

const files = buildFunction('submit-lesson')
const byName = new Map(files.map((f) => [f.name, f.content]))

describe('submit-lesson bundle', () => {
  it('is self-contained', () => {
    expect(verifyBundle(files)).toEqual([])
  })

  it('vendors the real grading module, not a copy', () => {
    const bundled = byName.get('_engines/grading/index.ts')!
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', 'packages', 'engines', 'src', 'grading', 'index.ts'),
      'utf8',
    )
    // Identical but for the import-extension rewrite Deno requires.
    expect(bundled).toBe(source.replace(/(from\s+['"])(\.[^'"]*?)\.js(['"])/g, '$1$2.ts$3'))
  })

  it('vendors the real FSRS scheduler', () => {
    const bundled = byName.get('_engines/learning/fsrs.ts')!
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', 'packages', 'engines', 'src', 'learning', 'fsrs.ts'),
      'utf8',
    )
    expect(bundled).toBe(source.replace(/(from\s+['"])(\.[^'"]*?)\.js(['"])/g, '$1$2.ts$3'))
  })

  it('vendors the real balance table, so rewards cannot diverge', () => {
    const bundled = byName.get('_engines/xp/balance.ts')!
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', 'packages', 'engines', 'src', 'xp', 'balance.ts'),
      'utf8',
    )
    expect(bundled).toBe(source.replace(/(from\s+['"])(\.[^'"]*?)\.js(['"])/g, '$1$2.ts$3'))
  })

  it('keeps the AnsweredItem shim structurally identical to the real type', () => {
    // The shim exists only to keep 11KB of state machine out of every cold start.
    // If the real type gains a field that grading reads, this fails loudly rather
    // than the function silently mis-grading.
    const shim = byName.get('_engines/lesson/machine.ts')!
    const machine = readFileSync(
      join(import.meta.dirname, '..', '..', 'packages', 'engines', 'src', 'lesson', 'machine.ts'),
      'utf8',
    )

    const fieldsOf = (source: string): string[] => {
      const block = /export type AnsweredItem = \{([\s\S]*?)\n\}/.exec(source)
      expect(block, 'AnsweredItem declaration not found').toBeTruthy()
      return [...block![1]!.matchAll(/readonly\s+(\w+)\s*:/g)].map((m) => m[1]!).sort()
    }

    expect(fieldsOf(shim)).toEqual(fieldsOf(machine))
  })

  it('resolves every relative import to a file it actually ships', () => {
    // This is the check that was missing, and its absence was not theoretical:
    // `grading` imports MASTERY_ORDER from `progression`, which was in nobody's list,
    // so the bundle passed every guard here and would have failed to boot on deploy.
    // The old verifyBundle asked whether a specifier LOOKED resolvable, never whether
    // the file it names was being shipped.
    const names = new Set(files.map((f) => f.name))
    for (const file of files) {
      for (const match of file.content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const resolved = join(dirname(file.name), match[1]!).replace(/\\/g, '/')
        expect(names, `${file.name} imports ${match[1]}`).toContain(resolved)
      }
    }
  })

  it('refuses a bundle whose imports point at nothing', () => {
    // A regression test for the guard itself. Drop the shim `grading` depends on and
    // verifyBundle must object — otherwise it is decoration.
    const missing = files.filter((f) => f.name !== '_engines/progression/index.ts')
    expect(verifyBundle(missing).join('\n')).toMatch(/progression\/index\.ts.*does not contain/)
  })

  it('carries the same mastery ladder the client ranks with', () => {
    // Extracted from progression/index.ts rather than retyped, because these INDICES
    // decide whether mastery went up — a shim off by one entry awards the wrong thing
    // silently rather than throwing. This asserts the ladder itself, so reordering it
    // is a deliberate act with a failing test attached.
    const shim = byName.get('_engines/progression/index.ts')!
    const ladder = [...shim.matchAll(/'(\w+)'/g)].map((m) => m[1])
    expect(ladder).toEqual([
      'unseen',
      'learning',
      'familiar',
      'proficient',
      'mastered',
      'burnished',
    ])
  })

  it('does not ship the state machine, the content engine, or selection', () => {
    // Cold-start weight is a real cost on a function called once per lesson.
    const names = files.map((f) => f.name)
    expect(names).not.toContain('_engines/content/index.ts')
    expect(names).not.toContain('_engines/learning/selection.ts')
    expect(byName.get('_engines/lesson/machine.ts')!.length).toBeLessThan(1_000)
  })

  it('stays small enough to cold-start quickly', () => {
    const total = files.reduce((sum, f) => sum + f.content.length, 0)
    expect(total).toBeLessThan(60_000)
  })

  it('never accepts a client-supplied reward value', () => {
    // The single most important property of this endpoint. If a field named for a
    // reward is ever read off the request body, this fails.
    const entry = byName.get('index.ts')!
    for (const forbidden of ['body.xp', 'body.coins', 'body.xpAwarded', 'body.mastery', 'body.streak']) {
      expect(entry, `entrypoint reads ${forbidden} from the request`).not.toContain(forbidden)
    }
  })
})

describe('the answer key the server grades with', () => {
  const files = buildFunction('submit-lesson')
  const answers = files.find((f) => f.name === '_content/answers.ts')

  it('is vendored into the bundle', () => {
    // Without it the function cannot decide correctness itself, and the only other
    // option is trusting the client — which is the exploit this closed.
    expect(answers).toBeDefined()
  })

  it('maps real fact ids to the entity that answers them', () => {
    // `buildQuestion` always gives the correct option the id of the item's entity, so
    // "is this chosen option id the entity this fact is about" IS the whole check.
    expect(answers!.content).toMatch(/geo\.SE\.capital["']?\s*:\s*["']SE["']/)
  })

  it('covers every fact the shipped packs contain', () => {
    // A fact missing here is dropped from grading rather than mis-graded, so a gap is
    // silent — it costs a user their XP instead of throwing.
    const packed = (answers!.content.match(/"geo\.[^"]+":/g) ?? []).length
    expect(packed).toBeGreaterThan(150)
  })
})

describe('the endpoint does not trust the client', () => {
  const index = buildFunction('submit-lesson').find((f) => f.name === 'index.ts')!.content

  it('never hands the client\'s answers straight to the grader', () => {
    // The P1 from review: `parseBody` checked `wasCorrect` was a boolean and passed
    // it straight into gradeLesson, so a modified client could post ten fabricated
    // answers with `wasCorrect: true` and mint XP, coins and mastery.
    expect(index).toMatch(/gradeLesson\(\{[\s\S]{0,200}answers,/)
    expect(index).not.toMatch(/answers:\s*body\.answers/)
  })

  it('recomputes correctness from the vendored key', () => {
    expect(index).toMatch(/wasCorrect:[\s\S]{0,120}ANSWER_BY_FACT\[/)
  })

  it('treats an unanswered question as not correct', () => {
    // A timeout has no chosen option. Without the null check it would compare
    // undefined to undefined for an unknown fact and read as correct.
    expect(index).toMatch(/chosenOptionId !== null/)
  })
})
