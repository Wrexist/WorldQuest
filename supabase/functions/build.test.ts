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
    // 44 000 against ~42 600 today, and the headroom is calibrated rather than guessed:
    // every engine module this function might plausibly acquire next is bigger than it.
    // `selection` is 4.0 KB of code, `progression` 4.9, `lesson/machine` 5.7,
    // `content/index` 9.6. So vendoring any one of them fails this, which is precisely
    // the event worth stopping — while renaming a symbol or writing a paragraph does not.
    //
    // 40 000 → 44 000, deliberately, and this is the record of why. The function acquired
    // `quests/progress.ts` and the code that pays a daily quest: the reward the balance
    // table has funded since the quest engine was written and which nothing has ever
    // paid. This test failed on that change, which is the test working — a budget is
    // raised with a reason attached or it is not a budget.
    //
    // Only the PROGRESS half was vendored. `quests/index.ts` composes a quest and needs
    // the content types to do it, and that is exactly the acquisition this number exists
    // to refuse; the file was split so the server could take the half it runs. See
    // `packages/engines/src/quests/progress.ts`.
    //
    // 44 000 → 56 000, and this is the biggest single acquisition this function will
    // make: `achievements/index.ts` (7.1 KB of code), its types (2.4 KB) and `xp/level.ts`
    // (1.4 KB), for the last reward in the balance table nothing paid. Thirty achievements
    // could unlock and no XP or coins ever moved.
    //
    // The alternative was a `claim_achievement` endpoint at a tenth the size, which is
    // exactly the thing `achievements.md §5` exists to forbid: it hands the client the
    // decision. Paying more cold start to keep the server deciding is the trade this
    // budget is for — it is here to make an acquisition VISIBLE and argued, not to make
    // the cheap wrong answer win.
    //
    // The headroom is deliberately small again. Nothing else in the engines is under
    // 1.4 KB, so the next module to arrive still fails this.
    //
    // `_content/` is excluded, and the exclusion is the point rather than an escape. Those
    // files are generated DATA — the fact→entity answer key and the entity→facts index —
    // and the question this budget asks is "is the dependency graph growing quietly?" A
    // data table is not a dependency; it grows with the country count, which is the thing
    // the product is supposed to do. Counting it here made adding `entity_mastered`
    // support look like the function had acquired an engine.
    //
    // It is not unbounded: a cold start parses every byte, so the raw budget below is what
    // bounds it, and 195 countries would put `answers.ts` near 40 KB — visible there,
    // where the cost actually lands.
    const code = files
      .filter((f) => !f.name.startsWith('_content/'))
      .reduce((sum, f) => sum + stripComments(f.content).length, 0)
    expect(code).toBeLessThan(62_000)
  })

  it('keeps the answer key proportionate to the content', () => {
    // Roughly 210 facts and 65 entities today. Per-entry rather than absolute, so the
    // budget scales with the pack instead of being re-argued every time a country lands —
    // and still fails on a generator that starts emitting whole fact objects.
    //
    // Scoped to `answers.ts`, which it always meant: it divided EVERY generated file by
    // the number of entries in this one, so the achievement catalogue — which scales with
    // the number of achievements and not with the number of facts — inflated a ratio that
    // is about facts. A denominator that does not describe the numerator is a budget that
    // fails for the wrong reason and then gets raised for the wrong reason.
    const answers = byName.get('_content/answers.ts')!
    const entries = (answers.match(/":/g) ?? []).length
    expect(entries).toBeGreaterThan(200)
    expect(answers.length / entries).toBeLessThan(60)
  })

  it('projects the achievement catalogue rather than shipping the pack', () => {
    // The pack is 18 KB and most of it is for a screen — copy keys, categories, `hidden`,
    // `showProgress`, `ceiling`, and a `$comment` on nearly every entry. The evaluator
    // reads an id, a rule and a list of thresholds, and this asserts the projection stayed
    // a projection rather than quietly becoming a copy of the file.
    const catalogue = byName.get('_content/achievements.ts')!
    expect(catalogue.length).toBeLessThan(12_000)
    expect(catalogue).not.toMatch(/"category"|"showProgress"|"\$comment"|nameKey/)
    // Every achievement in the pack, though — a projection that dropped rows would pay
    // nothing for them and look exactly like a catalogue that never had them.
    const pack = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', '..', 'packages', 'content', 'packs', 'achievements', 'core.v1.json'),
        'utf8',
      ),
    ) as { items: { id: string }[] }
    for (const item of pack.items) expect(catalogue).toContain(`"${item.id}"`)
  })

  it('stays small enough to cold-start quickly', () => {
    // Loose, and it is meant to be. What actually keeps this function cheap is the
    // assertion above and the one before it — no state machine, no content engine, no
    // `selection`, and `AnsweredItem` as a shim rather than an import.
    //
    // 120 000 → 130 000 alongside the code budget above, for the same change and with the
    // same argument: raw bytes include the reasoning, and this repo's convention is that
    // the reasoning is the part worth keeping.
    //
    // 130 000 → 165 000 for the achievement evaluator and its catalogue. The catalogue is
    // a build-time PROJECTION of the pack — id, rule and thresholds, dropping the copy
    // keys, categories and per-entry commentary a screen needs and an evaluator does not —
    // which is 8 KB against the pack's 18, and it is emitted on one line for the same
    // reason: fifteen of these rules are sets over member lists of up to 54 country codes,
    // and pretty-printing gave each code its own line.
    const total = files.reduce((sum, f) => sum + f.content.length, 0)
    expect(total).toBeLessThan(175_000)
  })

  it('never accepts a client-supplied reward value', () => {
    // The single most important property of this endpoint. If a field named for a
    // reward is ever read off the request body, this fails.
    const entry = byName.get('index.ts')!
    for (const forbidden of ['body.xp', 'body.coins', 'body.xpAwarded', 'body.mastery', 'body.streak']) {
      expect(entry, `entrypoint reads ${forbidden} from the request`).not.toContain(forbidden)
    }
  })

  it('vendors the real quest progress module, not a copy', () => {
    // Same anti-drift rule as the grader and the balance table: the device advances the
    // quest with `applyQuestEvent` and the server pays for it with the same function, so
    // a second implementation would be two answers to "did they finish it".
    const vendored = byName.get('_engines/quests/progress.ts')
    expect(vendored).toBeDefined()
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', 'packages', 'engines', 'src', 'quests', 'progress.ts'),
      'utf8',
    )
    expect(vendored).toBe(source.replace(/(from\s+['"])(\.[^'"]*?)\.js(['"])/g, '$1$2.ts$3'))
  })

  it('vendors the real achievement engine, not a copy', () => {
    // Thirty rules. A server-side reimplementation would not throw when it drifted from
    // the client's — it would award the wrong thing, quietly, for everyone.
    const vendored = byName.get('_engines/achievements/index.ts')
    expect(vendored).toBeDefined()
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', 'packages', 'engines', 'src', 'achievements', 'index.ts'),
      'utf8',
    )
    expect(vendored).toBe(source.replace(/(from\s+['"])(\.[^'"]*?)\.js(['"])/g, '$1$2.ts$3'))
  })

  it('does not vendor quest GENERATION, which needs the content engine', () => {
    // The split exists for this budget. Composing a quest reads a `ContentIndex`; paying
    // for one reads the pinned tasks and the day's evidence. Vendoring generation to
    // reach `applyQuestEvent` would drag the content types in behind it.
    expect(files.map((f) => f.name)).not.toContain('_engines/quests/index.ts')
    expect(files.map((f) => f.name)).not.toContain('_engines/content/types.ts')
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

  it('checks the lesson kind before it reaches a database enum', () => {
    // Not a security hole — Postgres refuses an unknown enum value — but the refusal
    // arrives as a 500, which the client's queue treats as retryable. So a lesson with a
    // bad `kind` burned five attempts and PARKED: work the user actually did, held for
    // ever, over a string. A 400 parks it immediately and says why.
    expect(index).toMatch(/'lesson', 'quest', 'review', 'challenge', 'event'/)
  })

  it('scores the quest from its own grading, never from the payload', () => {
    // The first version of `evaluateQuest` took `body` and read `answer.wasCorrect` off
    // it — the client's field, the one this whole file exists to ignore. It would have
    // been ignored for the lesson's XP and believed for the quest's, which is 100 XP and
    // 25 coins a day for anyone who edited a boolean.
    expect(index).toMatch(/evaluateQuest\([\s\S]{0,400}retimed\.answers,/)
    expect(index).not.toMatch(/for \(const answer of body\.answers\)/)
  })

  it('decides the quest date itself, and only COMPARES the one it was sent', () => {
    // The date is the primary key of the row recording what has been paid, so a caller
    // that could choose it could collect a daily quest once per date it invented. The
    // client sends the day it composed for anyway, because a lesson spanning local
    // midnight arrives carrying yesterday's tasks — but the only thing that field can do
    // is get its own quest declined.
    expect(index).toMatch(/const date = new Intl\.DateTimeFormat\('en-CA', \{ timeZone \}\)/)
    expect(index).toMatch(/if \(quest\.date !== date\) return null/)
    // Never on the right-hand side of anything that reaches the database.
    expect(index).not.toMatch(/p_date: quest\.date|p_quest_date: quest\.date/)
  })

  it('takes the achievement tier rewards from the balance table, not the request', () => {
    expect(index).toMatch(/BALANCE\.xp\.achievementByTier/)
    expect(index).toMatch(/BALANCE\.coins\.achievementByTier/)
    // Nothing about an achievement may arrive on the wire. A `claim_achievement` shape —
    // the client naming a tier it says it earned — is the one thing `achievements.md §5`
    // exists to forbid, and this is what stops it being added by accident.
    expect(index).not.toMatch(/body\.achievement|body\.unlock|body\.tier/)
  })

  it('emits the continent event from an ANSWER, never from a navigation', () => {
    // `region_started` was fired by opening a continent page: invisible to a server, and
    // six taps for a gold tier the moment gold started paying. It is derived here from the
    // regions of the entities this lesson answered correctly.
    expect(index).toMatch(/REGION_BY_ENTITY/)
    expect(index).toMatch(/if \(!answer\.wasCorrect\) continue/)
  })

  it('takes the quest rates from the balance table, not the request', () => {
    expect(index).toMatch(/p_quest_task_xp: TASK_XP/)
    expect(index).toMatch(/p_quest_bonus_xp: COMPLETION_BONUS/)
    expect(index).toMatch(/p_quest_bonus_coins: BALANCE\.coins\.dailyQuest/)
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
