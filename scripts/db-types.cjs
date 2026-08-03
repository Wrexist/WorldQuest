/**
 * Generate `packages/api/src/database.types.ts`.
 *
 * ## Why this is a script and not one line in package.json
 *
 * It was one line:
 *
 *     supabase gen types typescript --local > packages/api/src/database.types.ts
 *
 * and CI ran that same line and then `git diff --exit-code` on the result. That check
 * could never pass. The committed file carries a twelve-line "GENERATED — do not
 * hand-edit" header that the generator does not emit, and every string literal in it is
 * single-quoted where the generator emits double quotes. Both were applied by hand,
 * once, by someone making a generated file look like the rest of the repo — so the
 * freshness check compared a decorated file against an undecorated one and would have
 * reported the types stale on every run, for ever, no matter how fresh they were.
 *
 * Nobody found out because the `database` job had never got as far as that step.
 *
 * The fix is to put the decoration IN the generator, so there is one command, it is the
 * one humans run and the one CI runs, and its output is exactly what is committed.
 *
 * ## The quote conversion, and its guard
 *
 * Postgres identifiers and enum values could in principle contain an apostrophe, and
 * flipping `"` to `'` around one would produce a file that does not parse — or worse,
 * one that parses differently. None in this schema do. Rather than rely on that staying
 * true, the conversion refuses to run when it finds one, because a loud failure at
 * generation time is recoverable and a silently mangled type file is not.
 *
 * Run: pnpm db:types   (needs a running local stack — `pnpm db:start`)
 */

const { execFileSync } = require('node:child_process')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'packages', 'api', 'src', 'database.types.ts')

/**
 * `--local`, not `--project-id`.
 *
 * The migrations in this repo are the source of truth, and CI diffs this file against a
 * stack built from them. Generating from the hosted project instead produces whatever
 * happens to be deployed there — which today is one migration behind — and that is how a
 * types file starts describing a schema nobody can reproduce.
 *
 * The two sources do not merely differ in content; they differ in SHAPE, and the
 * committed file was originally generated from the hosted project:
 *
 *   - hosted emits `__InternalSupabase: { PostgrestVersion }`; local does not
 *   - local emits the whole `graphql_public` schema (pg_graphql is enabled in the local
 *     stack); hosted did not
 *
 * Neither difference touches a table, so nothing was ever wrong at a call site — but it
 * is the reason the first honest run of this check still reported a diff after the
 * tables themselves matched exactly. One source, and it has to be the one CI builds.
 */
const generate = () => {
  try {
    return execFileSync('supabase', ['gen', 'types', 'typescript', '--local'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch (error) {
    console.error(
      '✗ could not run `supabase gen types typescript --local`.\n' +
        '  This needs the Supabase CLI and a running local stack: `pnpm db:start`.\n' +
        `  ${error.message}`,
    )
    process.exit(1)
  }
}

/** Double-quoted literals → single, refusing anything that would be mangled. */
function toSingleQuotes(source) {
  const risky = source.match(/"[^"\n]*'[^"\n]*"/g)
  if (risky !== null) {
    console.error(
      '✗ a generated string literal contains an apostrophe:\n' +
        risky.map((r) => `    ${r}`).join('\n') +
        '\n  Converting it to single quotes would corrupt the file. Either quote it\n' +
        '  properly here or drop the conversion and commit the generator\'s own style.',
    )
    process.exit(1)
  }
  return source.replace(/"([^"\n]*)"/g, "'$1'")
}

const HEADER = `/**
 * GENERATED FILE — do not hand-edit.
 *
 * Source: the local stack built from \`supabase/migrations\`, which is the source of
 * truth. NOT the hosted project — see the note in this script.
 * Regenerate: \`pnpm db:types\` (needs the Supabase CLI and \`pnpm db:start\`).
 *
 * Editing this by hand makes the types describe a database that does not exist, which
 * is strictly worse than having no types at all — every call site then compiles
 * against a fiction. The \`database\` CI job regenerates it and fails on any difference,
 * which is the only thing making that sentence true rather than a request.
 */

`

/**
 * Exactly one trailing newline, whatever the CLI and the shell between them produced.
 *
 * The failing CI diff was quote style plus one blank line at the end of the file, and a
 * check that fails on a blank line is a check people learn to re-run rather than read.
 * Normalising here means the committed bytes cannot depend on how the output was piped.
 */
const normalised = toSingleQuotes(generate()).replace(/\n*$/, '\n')

writeFileSync(OUT, HEADER + normalised)
console.log('✓ wrote packages/api/src/database.types.ts')
