/**
 * Edge function bundler.
 *
 * The whole point of `submit-lesson` is that it runs the SAME grading code as the
 * client. That means it imports from `packages/engines`, which a deployed Deno
 * function cannot reach — so this script vendors those modules into the deploy
 * payload rather than letting anyone copy-paste them (a copy is exactly the drift
 * the architecture exists to prevent).
 *
 * Two rewrites are needed:
 *   1. `../../../packages/engines/src/x` → `./_engines/x`
 *   2. `./y.js` → `./y.ts`   — TypeScript's NodeNext style, which Deno cannot resolve
 *
 * Run: pnpm edge:build   (or import buildFunction from a deploy script)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const enginesSrc = join(here, '..', '..', 'packages', 'engines', 'src')

export type DeployFile = { name: string; content: string }

/** Engine modules the function actually needs. Keep this list minimal. */
const ENGINE_MODULES = [
  'shared/index.ts',
  'learning/types.ts',
  'learning/fsrs.ts',
  'xp/balance.ts',
  'grading/index.ts',
  'time/index.ts',
]

/**
 * `grading` imports AnsweredItem from `lesson/machine`, which drags in the whole
 * state machine and `content/types` for a single type. Types are erased at
 * runtime, so the bundle substitutes a local declaration instead — 11KB of dead
 * weight removed from every cold start.
 *
 * The shape is asserted against the real one in build.test.ts, so this cannot
 * silently drift from the module it stands in for.
 */
const ANSWERED_ITEM_SHIM = `/** Structural stand-in for lesson/machine.ts — see build.ts. */
export type AnsweredItem = {
  readonly itemId: string
  readonly factId: string
  readonly templateId: string
  readonly chosenOptionId: string | null
  readonly wasCorrect: boolean
  readonly elapsedMs: number
  readonly answeredAt: number
}
`

/** Deno resolves real paths; TS's `.js` extension convention has to go. */
const rewriteImports = (code: string): string =>
  code.replace(/(from\s+['"])(\.[^'"]*?)\.js(['"])/g, '$1$2.ts$3')

export function buildFunction(name: string): DeployFile[] {
  const entrypoint = readFileSync(join(here, name, 'index.ts'), 'utf8')

  const files: DeployFile[] = [
    {
      name: 'index.ts',
      content: rewriteImports(
        entrypoint.replace(/\.\.\/\.\.\/\.\.\/packages\/engines\/src\//g, './_engines/'),
      ),
    },
  ]

  for (const module of ENGINE_MODULES) {
    const source = readFileSync(join(enginesSrc, module), 'utf8')
    files.push({ name: `_engines/${module}`, content: rewriteImports(source) })
  }

  files.push({ name: '_engines/lesson/machine.ts', content: ANSWERED_ITEM_SHIM })

  // Deno needs to know these are ES modules with the same strictness we use.
  files.push({
    name: 'deno.json',
    content: JSON.stringify(
      { compilerOptions: { strict: true, lib: ['deno.window', 'esnext'] } },
      null,
      2,
    ),
  })

  return files
}

/**
 * Assert the bundle is self-contained before anyone deploys it.
 *
 * Checks imports specifically, not raw text — doc comments legitimately mention
 * `packages/engines`, and a substring search would flag those forever.
 */
export function verifyBundle(files: DeployFile[]): string[] {
  const problems: string[] = []
  for (const file of files) {
    for (const match of file.content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = match[1]!
      if (spec.startsWith('.') && !spec.endsWith('.ts')) {
        problems.push(`${file.name}: unresolvable import "${spec}"`)
      }
      if (spec.includes('packages/engines')) {
        problems.push(`${file.name}: escaped the bundle via "${spec}"`)
      }
    }
  }
  return problems
}

// Allow `tsx supabase/functions/build.ts submit-lesson` for inspection.
if (process.argv[2]) {
  const built = buildFunction(process.argv[2])
  const problems = verifyBundle(built)
  console.log(`Built "${process.argv[2]}" — ${built.length} files:`)
  for (const f of built) console.log(`  ${f.name.padEnd(28)} ${f.content.length} bytes`)
  if (problems.length) {
    console.error('\n✗ bundle is not self-contained:')
    for (const p of problems) console.error('  ' + p)
    process.exit(1)
  }
  console.log('\n✓ bundle is self-contained')
}
