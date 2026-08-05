/**
 * The balance table's documentation is part of the balance table.
 *
 * Rule 4 of this repo is "economy numbers live in the balance table — never invent an XP
 * or coin value, read `docs/systems/xp-economy.md`". That instruction sends every author
 * and every agent to the DOC, so the doc is not a description of the source of truth, it
 * is the interface to it. A number that is wrong there is wrong in the only place most
 * people will look.
 *
 * It had drifted. The excerpt in §5 read `levels: { base: 50, exponent: 1.55 }` while the
 * code said 1.9 — and 1.55 is not a stale value that happened to be close, it is the
 * value the SAME DOCUMENT rejects by name two paragraphs above: "A shallower curve (1.55)
 * puts level 100 inside the first year and leaves Alex nothing to chase." The prose and
 * the table disagreed about the curve the prose was arguing for.
 *
 * `hearts` had the same shape of problem from the other direction: `regenMinutes: 45`
 * and `childRegenMinutes: 22` survived in the doc after being deleted from the code as
 * incoherent with `resetPerLesson`.
 *
 * So this reads the fenced block out of the markdown and checks every number in it
 * against `BALANCE`. Not a lint of prose — the surrounding narrative is free to explain,
 * qualify and argue. Only the literal `key: number` pairs inside the code fence, which
 * claim to be the table itself.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BALANCE } from './balance.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const DOC = join(repoRoot, 'docs', 'systems', 'xp-economy.md')

/** The one fenced block that claims to be `BALANCE` itself. */
function balanceExcerpt(markdown: string): string {
  const fences = markdown.match(/```ts\n([\s\S]*?)```/g) ?? []
  const block = fences.find((f) => f.includes('export const BALANCE'))
  if (!block) throw new Error('no BALANCE excerpt found in xp-economy.md')
  return block
}

/**
 * `section.key: number` pairs, with comment lines dropped first.
 *
 * Sectioned, not flat. `correctAnswer` is 10 under `xp` and 5 under `coins`, and so are
 * `perfectLesson`, `dailyQuest`, `dailyChallenge` and `collectionComplete` — five keys
 * that exist twice with different values. A flat map silently let one overwrite the
 * other and reported five failures against a doc that was right, which is a fair
 * reminder that a parity check is only as true as its key.
 *
 * Comments in the excerpt explain why a value is ABSENT, and name the values they are
 * explaining — `regenMinutes: 45` appears in exactly such a comment. Reading those as
 * claims would fail the test for saying the right thing.
 */
function numbersIn(block: string): Map<string, number> {
  const out = new Map<string, number>()
  let section = ''
  for (const line of block.split('\n')) {
    const code = line.replace(/\/\/.*$/, '')
    if (code.trim().startsWith('*') || code.trim().startsWith('//')) continue

    // A top-level key opening an object — two spaces of indent inside `BALANCE`.
    const opens = /^ {2}([A-Za-z][A-Za-z0-9_]*)\s*:\s*\{/.exec(code)
    if (opens) section = opens[1]!

    for (const [, key, value] of code.matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*:\s*(-?[\d._]+)\b/g)) {
      out.set(`${section}.${key!}`, Number(value!.replace(/_/g, '')))
    }
  }
  return out
}

/** Every numeric leaf of BALANCE, keyed by its top-level section. */
function flatten(
  value: unknown,
  section = '',
  into = new Map<string, number>(),
): Map<string, number> {
  if (typeof value !== 'object' || value === null) return into
  for (const [key, child] of Object.entries(value)) {
    const path = section === '' ? key : section
    if (typeof child === 'number') into.set(`${path}.${key}`, child)
    else flatten(child, path, into)
  }
  return into
}

describe('the documented balance table matches the real one', () => {
  const documented = numbersIn(balanceExcerpt(readFileSync(DOC, 'utf8')))
  const actual = flatten(BALANCE)

  it('finds the excerpt and reads numbers out of it', () => {
    // A parser that silently matches nothing would make every assertion below vacuous —
    // the same failure the region-tag validator had, caught the same way.
    expect(documented.size).toBeGreaterThan(15)
    expect(documented.get('xp.correctAnswer')).toBe(BALANCE.xp.correctAnswer)
  })

  it.each([...documented])('%s is %d in the doc and in the code', (key, value) => {
    // Milestone keys are numeric ('7', '30'), so they never reach here as identifiers;
    // anything named in the excerpt that BALANCE does not have is itself the bug.
    expect(actual.has(key), `${key} is documented but not in BALANCE`).toBe(true)
    expect(actual.get(key), `${key} disagrees with BALANCE`).toBe(value)
  })
})
