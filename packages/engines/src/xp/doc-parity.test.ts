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
 * Every `path: number` in the excerpt, keyed by its full nesting path.
 *
 * FULL paths, not `section.key`. Two earlier versions of this got the key wrong in
 * opposite directions, which is worth recording because the failure mode is the same
 * both times — a parity check with the wrong key is a parity check that passes:
 *
 *   · flat (`correctAnswer`) conflated `xp` with `coins`, which define five of the same
 *     names at different values, and reported five failures against a correct doc;
 *   · two-level (`xp.correctAnswer`) fixed that and silently dropped `streakMilestones`
 *     entirely, because its keys are NUMERIC — `7`, `30`, `100`, `365` — and the
 *     identifier pattern skipped them. The four milestone rewards, which are among the
 *     largest single payouts in the economy, were documented and unchecked.
 *
 * Comments in the excerpt explain why a value is ABSENT and name the values they are
 * explaining — `regenMinutes: 45` appears in exactly such a comment. Reading those as
 * claims would fail the test for saying the right thing.
 */
function numbersIn(block: string): Map<string, number> {
  const out = new Map<string, number>()
  const path: string[] = []
  for (const line of block.split('\n')) {
    const code = line.replace(/\/\/.*$/, '')
    if (code.trim().startsWith('*') || code.trim().startsWith('//')) continue

    // Scanned IN ORDER, one token at a time: `key: {` opens a level, `key: 123` records
    // a value at the current path, `}` closes one.
    //
    // The order is the whole point, and the version before this got it wrong in a way
    // worth keeping a note about. It handled a line as three separate passes — find the
    // one opening key, then all the pairs, then count the closing braces — which is
    // correct for at most one object per line. Given
    //
    //   avatarItem: { min: 300, max: 2000 }, pet: { min: 1500, max: 5000 },
    //
    // it pushed `avatarItem`, filed all four numbers under it so `pet`'s values
    // overwrote `avatarItem`'s, then popped twice and lost the enclosing `prices`
    // entirely — so the six keys after it were recorded at the top level, unprefixed,
    // and reported as documented-but-absent. A formatting choice in a markdown file
    // silently changed what the parity check was comparing.
    for (const match of code.matchAll(
      /([A-Za-z0-9_]+)\s*:\s*(?:(\{)|(-?[\d._]+)\b)|(\})/g,
    )) {
      const [, key, opens, value, closes] = match
      if (opens !== undefined) path.push(key!)
      else if (value !== undefined) out.set([...path, key!].join('.'), Number(value.replace(/_/g, '')))
      else if (closes !== undefined && path.length > 0) path.pop()
    }
  }
  return out
}

/** Every numeric leaf of BALANCE, keyed by its full path. */
function flatten(
  value: unknown,
  path = '',
  into = new Map<string, number>(),
): Map<string, number> {
  if (typeof value !== 'object' || value === null) return into
  for (const [key, child] of Object.entries(value)) {
    const here = path === '' ? key : `${path}.${key}`
    if (typeof child === 'number') into.set(here, child)
    else flatten(child, here, into)
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
    // The milestones specifically: numeric keys are the ones a naive identifier
    // pattern drops, and they are four of the biggest payouts in the table.
    expect(documented.get('xp.streakMilestones.365')).toBe(BALANCE.xp.streakMilestones[365])
    expect(documented.get('xp.correctAnswer')).toBe(BALANCE.xp.correctAnswer)
  })

  it('documents every number in the table, not just the ones already written down', () => {
    // The other direction, and the one that decays. Checking documented → BALANCE catches
    // a doc that went stale; it says nothing about a reward number ADDED to the code with
    // no entry here, which is the more likely way the two drift — nobody forgets to edit
    // the code.
    //
    // It found 23 of them the first time it ran, in a document headed "single source of
    // truth": every price, every anti-cheat threshold, both achievement tier tables, and
    // `dailyQuestTask` — the per-slot quest reward whose own comment in balance.ts says
    // it was "previously absent from this table, so the quest engine had nothing to
    // read". `coins` was elided as `{ /* … */ }` and had been excluded here to match,
    // which is the same hole with a comment in front of it: an author sent to this doc by
    // rule 4 would have found no coin value at all and no sign that any were missing.
    const undocumented = [...actual.keys()].filter((key) => !documented.has(key))
    expect(undocumented, 'in BALANCE, missing from the §5 excerpt').toEqual([])
  })

  it.each([...documented])('%s is %d in the doc and in the code', (key, value) => {
    // Milestone keys are numeric ('7', '30'), so they never reach here as identifiers;
    // anything named in the excerpt that BALANCE does not have is itself the bug.
    expect(actual.has(key), `${key} is documented but not in BALANCE`).toBe(true)
    expect(actual.get(key), `${key} disagrees with BALANCE`).toBe(value)
  })
})
