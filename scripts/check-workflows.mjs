#!/usr/bin/env node
/**
 * Every GitHub Actions workflow parses, and names its triggers and its jobs.
 *
 * GitHub says nothing about a broken workflow until it is pushed, and then only as a
 * failed run blaming "a workflow file issue", on every push, even for a workflow that
 * only runs by hand. `eas-testflight.yml` sat like that from 3d9164c on: a `"\n"` inside
 * a node one-liner had become a real line break, which ended its `run: |` block at
 * column 0, so the one workflow that puts the app on TestFlight (runbook step 6) could
 * not be started at all. Nothing local ever read the file. This does, in `pnpm verify`.
 *
 * YAML 1.2, as GitHub reads it: `on` is a key here, not the boolean YAML 1.1 made it.
 *
 * Usage: node scripts/check-workflows.mjs [dir]   (defaults to .github/workflows)
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument } from 'yaml'

const dir = process.argv[2] ?? join('.github', 'workflows')
const files = readdirSync(dir)
  .filter((file) => /\.ya?ml$/.test(file))
  .sort()

const problems = []
for (const file of files) {
  const doc = parseDocument(readFileSync(join(dir, file), 'utf8'))
  if (doc.errors.length > 0) {
    const [first] = doc.errors
    const line = first.linePos?.[0]?.line
    problems.push(`${file}${line === undefined ? '' : `:${line}`}: ${first.message.split('\n')[0]}`)
    continue
  }
  const workflow = doc.toJS()
  const missing = ['on', 'jobs'].filter(
    (key) => workflow === null || typeof workflow !== 'object' || !(key in workflow),
  )
  if (missing.length > 0) {
    problems.push(`${file}: parses, but has no ${missing.map((key) => `"${key}"`).join(' or ')}, so GitHub cannot run it`)
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`)
  console.error(`\n✗ ${problems.length} of ${files.length} workflow(s) would fail on GitHub before any step ran.`)
  process.exit(1)
}
console.log(`✓ ${files.length} workflows parse as YAML and name their triggers and jobs`)
