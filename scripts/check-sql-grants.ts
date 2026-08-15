/**
 * Every trigger function is revoked from the API roles.
 *
 * ## Why this is a script and not a database test
 *
 * `supabase/tests/rls.test.sql` already asserts this, and asserts it better — it asks a
 * real Postgres which functions `anon` and `authenticated` may execute, which is the
 * only answer that counts. It has caught this exact defect twice:
 *
 *   # Failed test 17: "no trigger function is callable over the REST API"
 *   #     Unexpected records:
 *   #         (clear_streak_break_on_activity)
 *   #         (league_member_is_not_a_child)
 *
 * Both times it caught it in CI, because running it needs Docker and a local Postgres,
 * and neither is available in every environment this repo is written in. So the feedback
 * arrived a push later — and in the leagues case, on a migration whose whole risk was
 * that its RLS could not be proven locally.
 *
 * This is the cheap half, available everywhere: read the migrations as text, find every
 * function that returns `trigger`, and check that some migration revokes it from `anon`
 * and `authenticated`. It cannot see a grant made any other way and it is not a
 * replacement for the SQL test. It is the thing that fails in five milliseconds on the
 * machine where the mistake is being made.
 *
 * PostgreSQL grants EXECUTE on a new function to `public` by default and PostgREST
 * publishes anything in the `public` schema a role may execute — so the default is
 * permissive, and the omission is invisible in review. That combination is why this
 * needs a machine to remember it.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const DIR = join(ROOT, 'supabase/migrations')

const files = readdirSync(DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()
const sql = files.map((name) => readFileSync(join(DIR, name), 'utf8')).join('\n')

/**
 * Comments stripped first.
 *
 * Every one of these migrations explains the rule at length in its header, quoting the
 * function name and the revoke it needs — so a check that reads comments finds its own
 * documentation and reports the file as compliant. The repo has already shipped that
 * false positive once, in `pnpm reachability`, where a prose use of a word marked an
 * export wired.
 */
const code = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '')

/** `create [or replace] function public.foo() returns trigger` — the name is what we want. */
const declared = new Set<string>()
for (const match of code.matchAll(
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\([^)]*\)\s*returns\s+trigger/gi,
)) {
  declared.add(match[1]!.toLowerCase())
}

const ROLES = ['anon', 'authenticated'] as const

const missing: { readonly name: string; readonly roles: readonly string[] }[] = []
for (const name of [...declared].sort()) {
  const unrevoked = ROLES.filter(
    (role) =>
      !new RegExp(
        String.raw`revoke\s+(?:all|execute)[\s\S]{0,80}?on\s+function\s+(?:public\.)?${name}\s*\([^)]*\)\s+from\s+${role}\b`,
        'i',
      ).test(code),
  )
  if (unrevoked.length > 0) missing.push({ name, roles: unrevoked })
}

console.log('\nTrigger function grants\n')
console.log(`  migrations        ${files.length}`)
console.log(`  trigger functions ${declared.size}`)

if (missing.length > 0) {
  console.log('')
  for (const { name, roles } of missing) {
    console.log(`  ✗ ${name}  — not revoked from ${roles.join(', ')}`)
  }
  console.log(
    `\n✗ ${missing.length} trigger function(s) reachable at /rest/v1/rpc/<name>.\n` +
      '  A trigger function is invoked by the trigger machinery as the owner and needs no\n' +
      '  grant. Add a forward-only migration:\n\n' +
      '    revoke all on function public.<name>() from public;\n' +
      '    revoke all on function public.<name>() from anon;\n' +
      '    revoke all on function public.<name>() from authenticated;\n',
  )
  process.exit(1)
}

console.log('\n✓ every trigger function is revoked from anon and authenticated.')
console.log('  Text-level only — `supabase test db` asks a real Postgres, and still should.')
