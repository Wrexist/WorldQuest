/**
 * Does `database.types.ts` describe the database the migrations actually build?
 *
 * ## Why this is not just `pnpm db:types`
 *
 * It is, when Docker exists: CI regenerates the file and fails on any difference, which is
 * the stronger check because it catches formatting and ordering too. This is for the
 * environments where the generator cannot run at all — the ones where the file therefore
 * gets HAND-EDITED, which its own header calls "strictly worse than having no types at
 * all, because every call site then compiles against a fiction".
 *
 * Three tables and four function signatures were added to that file by hand during this
 * branch, for exactly that reason. This is what turned "the shape looks right" into a
 * comparison against a real schema.
 *
 * Names and nullability of columns, and the existence of functions. Not types: the
 * generator's mapping from Postgres to TypeScript is its own business, and duplicating it
 * here would be a second opinion about `numeric`.
 *
 * Run by `scripts/db/pg-harness.sh`, against the cluster it just built.
 */

import { readFileSync } from 'node:fs'

const [typesPath, columnsPath, functionsPath] = process.argv.slice(2)
const src = readFileSync(typesPath, 'utf8')

const publicBlock = src.slice(src.indexOf('  public: {'))
const declared = new Map()

/** Every `Row: { ... }` under a named key, in Tables and in Views alike. */
for (const match of publicBlock.matchAll(/\n {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/g)) {
  const columns = new Set()
  for (const line of match[2].split('\n')) {
    const column = /^\s+(\w+)\??:/.exec(line)
    if (column) columns.add(column[1])
  }
  declared.set(match[1], columns)
}

const real = new Map()
for (const line of readFileSync(columnsPath, 'utf8').split('\n')) {
  if (line.trim() === '') continue
  const [relation, column] = line.split('|')
  if (!real.has(relation)) real.set(relation, new Set())
  real.get(relation).add(column)
}

const problems = []
for (const [relation, columns] of declared) {
  if (!real.has(relation)) {
    problems.push(`${relation}: declared, and no such relation exists`)
    continue
  }
  const actual = real.get(relation)
  const missing = [...actual].filter((c) => !columns.has(c))
  const invented = [...columns].filter((c) => !actual.has(c))
  if (missing.length > 0) problems.push(`${relation}: types are missing ${missing.join(', ')}`)
  if (invented.length > 0) problems.push(`${relation}: types invent ${invented.join(', ')}`)
}
// The other direction is a warning, not a failure: a table the app has no reason to read
// is a table the generator would still emit, so it is worth SAYING and not worth failing.
const undeclared = [...real.keys()].filter((r) => !declared.has(r))

const realFunctions = new Set(
  readFileSync(functionsPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.split('|')[0]),
)
const functionsBlock = publicBlock.slice(publicBlock.indexOf('    Functions: {'))
for (const match of functionsBlock.matchAll(/\n {6}(\w+): \{\s*\n? *Args:/g)) {
  if (!realFunctions.has(match[1])) problems.push(`${match[1]}(): declared, and no such function exists`)
}

console.log(`  relations declared ${declared.size}, in the database ${real.size}`)
if (undeclared.length > 0) console.log(`  not declared (fine unless the app reads it): ${undeclared.join(', ')}`)

if (problems.length > 0) {
  console.error('\n✗ database.types.ts describes a database that does not exist:')
  for (const problem of problems) console.error(`    ${problem}`)
  process.exit(1)
}
console.log('  ✓ every declared relation, column and function exists')
