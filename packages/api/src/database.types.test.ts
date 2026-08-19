/**
 * Does the generated types file still describe the database the migrations build?
 *
 * ## The failure this was written for
 *
 * `database.types.ts` opens with "GENERATED FILE — do not hand-edit", and it had been
 * hand-edited: `repair_streak` inserted between `purchase_item` and `record_lesson`
 * rather than after `record_subscription_event`, and `pin_daily_quest` collapsed onto one
 * line. Both are what happens when somebody adds a migration, cannot run `pnpm db:types`
 * — it needs Docker and the full Supabase stack, which no environment this repo has been
 * developed in has had — and types the new function in by hand so the call site compiles.
 *
 * The `database` CI job caught it, which is the system working. But it caught it at the
 * end of a three-minute job that pulls containers, on a push, after `pnpm verify` had
 * already said yes locally — and the header's promise ("editing this by hand makes the
 * types describe a database that does not exist") was being kept by nothing a developer
 * could run.
 *
 * ## What can be checked without Docker
 *
 * Not the types themselves — deriving a TypeScript signature from PL/pgSQL is
 * reimplementing the generator, and a second implementation that disagrees is worse than
 * none. But the two properties that were actually violated need no database at all:
 *
 *   1. the SET of things typed matches the set the migrations create, and
 *   2. the file is in the ORDER the generator emits.
 *
 * A function added to a migration and forgotten here fails (1). A function typed by hand
 * fails (2), because a person inserts it where it reads well and the generator sorts.
 *
 * This does not replace the `database` job, and it is worth being exact about the gap.
 * That failure had two halves; this catches one. The misplaced `repair_streak` fails the
 * ordering test below. The reflowed `pin_daily_quest` — same content, one line where the
 * generator wraps to four — does not, and cannot: knowing where the generator breaks a
 * line means running it. That job builds the real schema and diffs the real output, and
 * it remains the only thing that can say this file is byte-correct. This is the part that
 * runs in a second, in `pnpm verify`, before the push.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../../..')
const MIGRATIONS = join(ROOT, 'supabase/migrations')
const TYPES = readFileSync(join(ROOT, 'packages/api/src/database.types.ts'), 'utf8')

const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ file: f, text: readFileSync(join(MIGRATIONS, f), 'utf8') }))

/**
 * The `public` schema's block.
 *
 * By `\n  public: {`, not `public: {` — the file also contains `graphql_public: {`, which
 * the looser search finds first and which has one function called `graphql`. The first
 * version of this read that block and cheerfully reported eight functions missing.
 */
const publicSchema = TYPES.slice(TYPES.indexOf('\n  public: {'))

const section = (name: string): string => {
  const start = publicSchema.indexOf(`    ${name}: {`)
  expect(start, `${name} section`).toBeGreaterThan(-1)
  return publicSchema.slice(start, publicSchema.indexOf('\n    }', start))
}

/** The keys at one indent inside a section, in the order they appear. */
const keysOf = (block: string): readonly string[] =>
  [...block.matchAll(/^ {6}([a-z_0-9]+):/gm)].map((m) => m[1] as string)

describe('the tables the migrations create', () => {
  it('are exactly the tables the types describe', () => {
    const created = new Set<string>()
    for (const { text } of sql) {
      for (const m of text.matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_0-9]+)/gi,
      )) {
        created.add(m[1] as string)
      }
      for (const m of text.matchAll(
        /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_0-9]+)/gi,
      )) {
        created.delete(m[1] as string)
      }
    }
    // Loud if the regex ever stops finding anything, so a parser that quietly matches
    // nothing cannot pass this by comparing two empty sets.
    expect(created.size).toBeGreaterThan(15)
    expect([...created].sort()).toEqual([...new Set(keysOf(section('Tables')))].sort())
  })
})

describe('the functions the migrations create', () => {
  /**
   * Every function the generator would list: `public`, and not returning `trigger`.
   *
   * A trigger function is not callable over PostgREST and the generator leaves it out —
   * which is also why `check:sql` exists to revoke EXECUTE on them separately.
   */
  const callable = (): ReadonlySet<string> => {
    const created = new Set<string>()
    for (const { file, text } of sql) {
      for (const m of text.matchAll(
        /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)\s*\([\s\S]*?\)\s*returns\s+([a-z_0-9 ]+)/gi,
      )) {
        const [, name, returns] = m as unknown as [string, string, string]
        if (!/^trigger/i.test(returns.trim())) created.add(name)
      }
      /**
       * A `drop function` that names an argument list drops ONE OVERLOAD, not the name.
       *
       * Every drop in this repo is of that shape, and each is immediately paired with a
       * `create or replace` of the new signature — `record_lesson` is created at the top
       * of `20260818120000_pay_achievements.sql` and its old four-argument overload
       * dropped at the bottom. Replaying drops by name would delete the function this
       * whole migration exists to add.
       *
       * A bare `drop function foo;` genuinely removes it. None exist, so rather than
       * guess at the semantics, fail and make somebody decide.
       */
      for (const m of text.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?([^;(]+)(\(?)/gi)) {
        expect(
          (m[2] as string).trim(),
          `${file}: \`drop function ${(m[1] as string).trim()}\` names no arguments — that ` +
            `removes every overload, which this check assumes never happens`,
        ).toBe('(')
      }
    }
    return created
  }

  it('are exactly the functions the types describe', () => {
    // The gap this closes runs the other way from the ordering test below: a migration
    // that adds an RPC and a types file nobody regenerated means the call site does not
    // compile, which is loud — unless somebody reaches for `as any`, which is banned but
    // is exactly the pressure this produces.
    const created = callable()
    expect(created.size).toBeGreaterThan(5)
    expect([...created].sort()).toEqual([...keysOf(section('Functions'))].sort())
  })
})

describe('the file is in the order the generator emits', () => {
  // The half that catches a hand-edit rather than an omission. A person inserts a new
  // function where it reads well — `repair_streak` after `purchase_item`, next to the
  // other things a user does — and the generator sorts. Both were true here, and the
  // difference was invisible until CI built a database.
  for (const name of ['Tables', 'Views', 'Functions', 'Enums', 'CompositeTypes']) {
    it(`emits ${name} in sorted order`, () => {
      const start = publicSchema.indexOf(`    ${name}: {`)
      if (start === -1) return // not every schema has every section
      const keys = keysOf(section(name))
      expect(keys).toEqual([...keys].sort())
    })
  }

  it('still carries the do-not-hand-edit header', () => {
    // The header is applied by `scripts/db-types.cjs`, not by the Supabase CLI. If it is
    // missing, the file did not come from `pnpm db:types` — which is the only claim the
    // two tests above are making about where it came from.
    expect(TYPES.startsWith('/**\n * GENERATED FILE — do not hand-edit.')).toBe(true)
  })
})
