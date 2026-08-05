/**
 * Guards on the edge-function bundle.
 *
 * The deployed function must run the SAME grading code as the client. These tests
 * assert the bundle is self-contained and that the one place we substitute a local
 * declaration cannot drift from the module it stands in for.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

  it('resolves every relative import to a file it actually ships', () => {
    // This is the check that was missing, and its absence was not theoretical:
    // `grading` imports MASTERY_ORDER from `progression`, which was in nobody's list,
    // so the bundle passed every guard here and would have failed to boot on deploy.
    // The old verifyBundle asked whether a specifier LOOKED resolvable, never whether
    // the file it names was being shipped.
    const names = new Set(files.map((f) => f.name))
    for (const file of files) {
      for (const match of file.content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const resolved = join(dirname(file.name), match[1]!).replace(/\\/g, '/')
        expect(names, `${file.name} imports ${match[1]}`).toContain(resolved)
      }
    }
  })

  it('refuses a bundle whose imports point at nothing', () => {
    // A regression test for the guard itself. Drop the shim `grading` depends on and
    // verifyBundle must object — otherwise it is decoration.
    const missing = files.filter((f) => f.name !== '_engines/progression/index.ts')
    expect(verifyBundle(missing).join('\n')).toMatch(/progression\/index\.ts.*does not contain/)
  })

  it('carries the same mastery ladder the client ranks with', () => {
    // Extracted from progression/index.ts rather than retyped, because these INDICES
    // decide whether mastery went up — a shim off by one entry awards the wrong thing
    // silently rather than throwing. This asserts the ladder itself, so reordering it
    // is a deliberate act with a failing test attached.
    const shim = byName.get('_engines/progression/index.ts')!
    const ladder = [...shim.matchAll(/'(\w+)'/g)].map((m) => m[1])
    expect(ladder).toEqual([
      'unseen',
      'learning',
      'familiar',
      'proficient',
      'mastered',
      'burnished',
    ])
  })

  it('does not ship the state machine, the content engine, or selection', () => {
    // Cold-start weight is a real cost on a function called once per lesson.
    const names = files.map((f) => f.name)
    expect(names).not.toContain('_engines/content/index.ts')
    expect(names).not.toContain('_engines/learning/selection.ts')
    expect(byName.get('_engines/lesson/machine.ts')!.length).toBeLessThan(1_000)
  })

  /**
   * The budget is two numbers now, because it was measuring two things and reporting one.
   *
   * It counted raw source bytes and failed three times in one afternoon — every time on a
   * change that added no runtime work at all, only the explanation of why the runtime work
   * was needed. In a repo whose whole convention is that comments carry the reasoning,
   * a single ceiling on source bytes is a ceiling on documentation, and the pressure it
   * applies is "explain this less". That is exactly backwards on the function that grades
   * every lesson.
   *
   * So: CODE bytes carry the tight budget, because "is the dependency graph growing
   * quietly?" is a question about code. Raw bytes keep a loose one, because a cold start
   * really does lex every byte and an unbounded file is still a cost.
   *
   * The stripper is deliberately crude and lives only here. It cannot affect what ships —
   * the vendored modules stay byte-identical to their sources, which is the anti-drift
   * guarantee three tests above depend on — and if it miscounts a few bytes inside a
   * string literal, the budget is a few bytes off. That is the right blast radius for a
   * regex pretending to be a parser.
   */
  const stripComments = (code: string): string =>
    code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\n{2,}/g, '\n')

  it('does not grow its code graph quietly', () => {
    // 40 000 against ~37 500 today, and the 2.5 KB of headroom is calibrated rather than
    // guessed: every engine module this function might plausibly acquire next is bigger
    // than that. `selection` is 4.0 KB of code, `progression` 4.9, `lesson/machine` 5.7,
    // `content/index` 9.6. So vendoring any one of them fails this, which is precisely
    // the event worth stopping — while renaming a symbol or writing a paragraph does not.
    const code = files.reduce((sum, f) => sum + stripComments(f.content).length, 0)
    expect(code).toBeLessThan(40_000)
  })

  it('stays small enough to cold-start quickly', () => {
    // Loose, and it is meant to be. What actually keeps this function cheap is the
    // assertion above and the one before it — no state machine, no content engine, no
    // `selection`, and `AnsweredItem` as a shim rather than an import.
    const total = files.reduce((sum, f) => sum + f.content.length, 0)
    expect(total).toBeLessThan(120_000)
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

describe('the answer key the server grades with', () => {
  const files = buildFunction('submit-lesson')
  const answers = files.find((f) => f.name === '_content/answers.ts')

  it('is vendored into the bundle', () => {
    // Without it the function cannot decide correctness itself, and the only other
    // option is trusting the client — which is the exploit this closed.
    expect(answers).toBeDefined()
  })

  it('maps real fact ids to the entity that answers them', () => {
    // `buildQuestion` always gives the correct option the id of the item's entity, so
    // "is this chosen option id the entity this fact is about" IS the whole check.
    expect(answers!.content).toMatch(/geo\.SE\.capital["']?\s*:\s*["']SE["']/)
  })

  it('covers every fact the shipped packs contain', () => {
    // A fact missing here is dropped from grading rather than mis-graded, so a gap is
    // silent — it costs a user their XP instead of throwing.
    const packed = (answers!.content.match(/"geo\.[^"]+":/g) ?? []).length
    expect(packed).toBeGreaterThan(150)
  })
})

describe('the endpoint does not trust the client', () => {
  const index = buildFunction('submit-lesson').find((f) => f.name === 'index.ts')!.content

  it('never hands the client\'s answers straight to the grader', () => {
    // The P1 from review: `parseBody` checked `wasCorrect` was a boolean and passed
    // it straight into gradeLesson, so a modified client could post ten fabricated
    // answers with `wasCorrect: true` and mint XP, coins and mastery.
    expect(index).toMatch(/gradeLesson\(\{[\s\S]{0,200}answers,/)
    expect(index).not.toMatch(/answers:\s*body\.answers/)
  })

  it('recomputes correctness from the vendored key', () => {
    expect(index).toMatch(/wasCorrect:[\s\S]{0,120}ANSWER_BY_FACT\[/)
  })

  it('treats an unanswered question as not correct', () => {
    // A timeout has no chosen option. Without the null check it would compare
    // undefined to undefined for an unknown fact and read as correct.
    expect(index).toMatch(/chosenOptionId !== null/)
  })
})

describe('store-notifications bundle', () => {
  const noteFiles = buildFunction('store-notifications')
  const noteByName = new Map(noteFiles.map((f) => [f.name, f.content]))

  it('is self-contained', () => {
    expect(verifyBundle(noteFiles)).toEqual([])
  })

  it('vendors the real entitlement decision, not a copy', () => {
    // The same rule as the grader, for the same reason and with a price attached: a
    // hand-copied `applyStoreNotification` that drifted would decide entitlement
    // differently on the server than the client displays, and one of those two answers
    // is somebody paying for something they cannot see.
    const bundled = noteByName.get('_engines/entitlements/store.ts')!
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', 'packages', 'engines', 'src', 'entitlements', 'store.ts'),
      'utf8',
    )
    expect(bundled).toBe(source.replace(/(from\s+['"])(\.[^'"]*?)\.js(['"])/g, '$1$2.ts$3'))
  })

  it('ships every verification layer, so none can be skipped by omission', () => {
    // A bundle missing `apple-verify.ts` fails to boot, loudly. A bundle missing a layer
    // the entrypoint imports only conditionally would not — which is why the list is
    // asserted rather than assumed.
    for (const name of [
      '_shared/apple-jws.ts',
      '_shared/apple-notification.ts',
      '_shared/apple-verify.ts',
      '_shared/store-verification.ts',
      '_shared/store-notifications.ts',
    ]) {
      expect(noteByName.has(name)).toBe(true)
    }
  })

  it('does not drag the grader or the content engine into a webhook', () => {
    // Different function, different cold start. Vendoring by habit is a latency budget
    // spent parsing code this function never calls.
    for (const name of noteByName.keys()) {
      expect(name).not.toMatch(/grading|content|learning|lesson/)
    }
  })

  it('pins nothing — the root fingerprint is configuration, never a literal', () => {
    // A fact about Apple's CA that we cannot source. Inventing one fails in the worst
    // direction available: it either rejects every real notification or accepts a chain
    // it should not. `docs/systems/monetization.md` records why it is still missing.
    const entry = noteByName.get('index.ts')!
    expect(entry).toMatch(/Deno\.env\.get\('APPLE_ROOT_FINGERPRINT'\)/)
    // A SHA-256 fingerprint is 32 colon-separated hex pairs. None may appear in source.
    expect(entry).not.toMatch(/(?:[0-9A-F]{2}:){10}/i)
  })

  it('refuses to serve at all when the pin or the bundle id is missing', () => {
    // Not "skip that check". A verifier short one check says yes more often than it should.
    const entry = noteByName.get('index.ts')!
    expect(entry).toMatch(/if \(!rootFingerprint \|\| !bundleId\) return null/)
  })
})

describe('a bundle nobody declared', () => {
  it('is an error rather than an empty one', () => {
    // The failure this prevents: a new function deploys with no engine modules, boots,
    // and fails on its first request instead of at build time.
    expect(() => buildFunction('does-not-exist')).toThrow(/no bundle spec/)
  })
})
