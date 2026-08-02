/**
 * Print every question a pack can generate, as a user would read it.
 *
 * `pnpm content:preview` has been in this package's CLAUDE.md and in package.json
 * since the beginning, and the script did not exist. That matters more than a missing
 * convenience: the documented authoring workflow is "add a fact, then READ the
 * generated questions", and the class of bug it catches cannot be caught any other
 * way.
 *
 * The bug that motivates it, from this repo's own history: a template whose hint read
 * "Stockholm is Stockholm." Every schema check passed. Every test passed. It was only
 * visible to someone reading the output.
 *
 * Prompts are resolved through the real i18n catalogue, so a template pointing at a
 * key nobody wrote shows up here as the key itself.
 *
 * Run: pnpm content:preview [packId | subject] [--quiet]
 *
 * `--quiet` prints only the problems and the summary. That is the mode CI runs,
 * because at 600 countries the full listing is twenty thousand lines of log that
 * nobody reads — and a check nobody reads is a check that has stopped working.
 * A human running this should NOT pass it: reading the questions is the point.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildIndex,
  buildQuestion,
  isSelfAnswering,
  namesAnswer,
  seededRng,
  type Entity,
  type Fact,
  type Template,
} from '@worldquest/engines'
import { tContent } from '@worldquest/i18n'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packsDir = join(root, 'packs')
const args = process.argv.slice(2)
const quiet = args.includes('--quiet')
const filter = args.find((arg) => !arg.startsWith('--'))

/** Suppressed by `--quiet`. Problems and totals use `console.log` directly. */
const show = (line = ''): void => {
  if (!quiet) console.log(line)
}

type Pack = { packId: string; subject: string; kind: string; items: unknown[] }

const packs: Pack[] = []
for (const subject of readdirSync(packsDir)) {
  for (const file of readdirSync(join(packsDir, subject))) {
    if (!file.endsWith('.json')) continue
    packs.push(JSON.parse(readFileSync(join(packsDir, subject, file), 'utf8')) as Pack)
  }
}

const matching = packs.filter(
  (pack) =>
    filter === undefined || pack.packId.includes(filter) || pack.subject.includes(filter),
)

if (matching.length === 0) {
  console.error(`No pack matches "${filter}". Available:`)
  for (const pack of packs) console.error(`  ${pack.packId}`)
  process.exit(1)
}

const pick = <T>(kind: string): T[] =>
  matching.filter((pack) => pack.kind === kind).flatMap((pack) => pack.items as T[])

const entities = pick<Entity>('entities')
const facts = pick<Fact>('facts')
const templates = pick<Template>('templates')

if (templates.length === 0) {
  console.error('No templates in the selection — nothing to generate. Widen the filter.')
  process.exit(1)
}

const index = buildIndex({ entities, facts, templates })

// Seeded, so two runs produce the same distractors and a diff of the output is a
// diff of the CONTENT rather than of the shuffle.
const rng = seededRng(1)
const locale = process.env['LOCALE'] ?? 'en'

show(`\nContent preview — ${locale}\n`)
show(`  packs      ${matching.length}`)
show(`  entities   ${entities.length}`)
show(`  facts      ${facts.length}`)
show(`  templates  ${templates.length}`)
show(`  items      ${index.items.length}\n`)

/** A question that reads wrongly. A defect — someone has to fix it. */
let unreadable = 0
/**
 * A question the engine declined to build, almost always for want of distractors.
 *
 * NOT a defect: refusing to ask "What is the capital of Japan?" with one option is
 * the engine being right. It is a COVERAGE signal — it says this subregion needs more
 * countries before its facts are teachable — so it reports without failing the run.
 */
const uncovered: string[] = []
/**
 * A question the engine refuses because its prompt would contain its own answer.
 *
 * Permanent and correct, not a gap. Reported separately so nobody tries to fix it by
 * authoring more countries — the other template for the same fact still works.
 */
const selfAnswering: string[] = []

for (const item of index.items) {
  const question = buildQuestion(index, item, locale, rng)
  if (question === null) {
    // Two very different reasons, and telling an author to add countries when the
    // real cause is "Guatemala City is the capital of which country?" wastes a day.
    if (isSelfAnswering(index, item, locale)) selfAnswering.push(item.id)
    else uncovered.push(`${item.factId} × ${item.templateId}`)
    continue
  }

  // `tContent`: the key comes from a pack, so it is validated here rather than by
  // the compiler. A missing entry prints as the key, which is the point.
  const prompt = tContent(question.promptKey, question.promptParams)
  const correct = question.options.find((option) => option.isCorrect)

  show(`  ${item.templateId}`)
  show(`    ${prompt}`)
  for (const option of question.options) {
    show(`      ${option.isCorrect ? '✓' : ' '} ${option.label}`)
  }
  if (question.hint !== undefined) {
    show(`    hint: ${correct?.label} is ${question.hint}.`)
  }

  // The exact bug this script exists for. A hint or a prompt that restates its own
  // answer teaches nothing, and it is invisible to every other check we run.
  //
  // Reported with the item id rather than relying on the block above, so `--quiet`
  // still says which question is broken.
  const complain = (problem: string): void => {
    console.log(`  ⚠  ${item.id}`)
    console.log(`     ${problem}`)
    console.log(`     ${prompt}  →  ${correct?.label ?? '(no answer)'}`)
    unreadable++
  }

  if (correct !== undefined && question.hint === correct.label) {
    complain('the hint repeats the answer')
  }
  // `namesAnswer`, not `includes` — the same rule the engine applies, from the same
  // function. When this script kept its own copy they disagreed the moment the engine
  // moved to word boundaries, and CI went red on a question that was perfectly fine.
  //
  // Broader than the engine's check on purpose: this reads the RENDERED prompt, so it
  // also catches a catalogue string that gives the answer away in its own literal text.
  if (correct !== undefined && namesAnswer(prompt, correct.label)) {
    complain('the prompt names the answer')
  }
  if (prompt.includes(question.promptKey)) {
    complain('the prompt key has no entry in the catalogue')
  }
  show()
}

if (selfAnswering.length > 0) {
  // Not a gap and not fixable — the prompt names the answer. Listed so it reads as a
  // decision rather than an omission.
  console.log(`  ${selfAnswering.length} item(s) would give the answer away, and are skipped:`)
  for (const item of selfAnswering) show(`    · ${item}`)
  console.log()
}

if (uncovered.length > 0) {
  // Coverage, not a defect — so it never fails the run. `pnpm content:stats` groups
  // the same items by subregion, which is the form you can act on.
  console.log(`  ${uncovered.length} item(s) have too few distractors to ask about yet.`)
  for (const item of uncovered) show(`    · ${item}`)
  show(`  Add more entities to those subregions.`)
  console.log()
}

if (unreadable > 0) {
  console.error(`✗ ${unreadable} question(s) READ wrongly — fix before shipping\n`)
  process.exit(1)
}
console.log(`✓ every generated question reads correctly\n`)
