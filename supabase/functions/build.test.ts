/**
 * Guards on the edge-function bundle.
 *
 * The deployed function must run the SAME grading code as the client. These tests
 * assert the bundle is self-contained and that the one place we substitute a local
 * declaration cannot drift from the module it stands in for.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
