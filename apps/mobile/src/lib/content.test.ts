/**
 * What this app is actually willing to ask a user.
 *
 * The bug behind this file: the geography pack ships `tpl.flag-to-country.mc4` —
 * "Which country's flag is this?", modality `image` — and there was not one flag file
 * in this repo. `pickItemForFact` chooses uniformly among a fact's templates, so
 * roughly one flag question in three was that question: a prompt about a picture that
 * was never drawn, above four country names, and a heart lost for guessing wrong.
 *
 * Nothing on screen could have caught it. The prompt rendered, the options rendered,
 * every state was correct — the only thing missing was the part no component was ever
 * asked to draw. So the assertion lives at the seam where the app declares what it can
 * present, and it is written against the real packs rather than a fixture, because a
 * fixture would go on passing the day someone adds a second image template.
 *
 * **The flags have now landed**, so these no longer assert "never an image". They
 * assert the thing that was actually true underneath all along, and still is: a
 * question is only asked if every part of it can be drawn. That reads differently now
 * — an image question must carry an asset the bundle really has — and it is the same
 * invariant. The narrowing was one way to satisfy it; shipping the artwork is the
 * other, and this file should hold either.
 */

import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'
import { useContent } from './content.js'
import { flagSource } from './flags.js'
import { mapSource } from './maps.js'

const PACK_DIR = join(import.meta.dirname, '../../../../packages/content/packs/geography')

/**
 * Fact packs the app deliberately does not load.
 *
 * One entry, and it is a policy decision rather than an oversight: the sensitive
 * examples are the worked cases `docs/systems/content-pipeline.md` refers to — South
 * Africa's three capitals, Zimbabwe's currency — carried as `quizzable: false` until a
 * human decides how to present them. They exist to be read by an author, not asked of a
 * user.
 */
const EXCLUDED_PACKS = ['facts.sensitive-examples.v1.json']

describe('the lesson this app composes', () => {
  it('never asks a question it has no way to present', () => {
    const { result } = renderHook(() => useContent())
    const questions = result.current.index!.compose({ count: 40 })

    expect(questions.length).toBeGreaterThan(0)
    for (const question of questions) {
      // Modality is a promise about presentation. Text we can always draw; an image or
      // a map only if the bundle really holds that file. `audio` we cannot draw at all,
      // and a template using it must not reach a user until it can be.
      //
      // `map` was on the forbidden side of this line until the location FACTS were
      // wired. That read as a deliberate narrowing and was not: `LessonScreen` has drawn
      // a map-modality prompt at full width, labelled, with a screen-reader sibling swap
      // for as long as `PRESENTABLE` has listed `'map'`. What was missing was
      // `facts.locations.v1.json`, which nothing imported — so no map question could be
      // composed, this assertion never met one, and it went on claiming a renderer that
      // existed did not.
      expect(['text', 'image', 'map'], question.item.templateId).toContain(question.modality)

      if (question.modality === 'map') {
        // The same assertion as the flag one below, for the same reason: a prompt that
        // says "which country is this?" over a map that resolves to nothing is a
        // question with no question in it.
        expect(question.locator, question.item.templateId).toBeDefined()
        expect(
          mapSource(question.locator!.path),
          `${question.item.templateId} → ${question.locator!.path}`,
        ).toBeDefined()
      }

      if (question.modality === 'image') {
        // The exact failure this file was written for, in its current form. A prompt
        // that says "which flag is this?" and resolves to nothing is the same bug
        // whether the cause is a missing renderer or a missing file.
        expect(question.promptAsset, question.item.templateId).toBeDefined()
        expect(
          flagSource(question.promptAsset),
          `${question.item.templateId} → ${question.promptAsset}`,
        ).toBeDefined()
      }
    }
  })

  it('asks about flags by sight now that we have them', () => {
    // The picture question is the mockup's lesson screen and was filtered out of every
    // lesson for the whole life of the project. Asserting it comes back is the point of
    // the change; asserting only "some flag question exists" would still pass if it
    // silently stayed filtered.
    const { result } = renderHook(() => useContent())
    const questions = result.current.index!.compose({ count: 120 })
    const flagQuestions = questions.filter((q) => q.item.factId.endsWith('.flag'))

    expect(flagQuestions.length).toBeGreaterThan(0)
    expect(flagQuestions.some((q) => q.item.templateId === 'tpl.flag-to-country.mc4')).toBe(true)
  })

  it('still asks about flags in words too, for anyone who cannot see one', () => {
    // `tpl.flag-describe.mc4` tests the same fact in prose. It is what a screen-reader
    // user gets instead of the picture (accessibility.md §8), and it must not be
    // crowded out now that its sibling is selectable again — the two share the fact.
    const { result } = renderHook(() => useContent())
    const questions = result.current.index!.compose({ count: 120 })
    const flagQuestions = questions.filter((q) => q.item.factId.endsWith('.flag'))

    expect(flagQuestions.some((q) => q.item.templateId === 'tpl.flag-describe.mc4')).toBe(true)
  })

  it('ships a flag for every country the pack claims one for', () => {
    // The pack declares `assets.flag.path` per country and `pnpm build:flags` writes
    // those files. Nothing else checks the two agree at runtime, and the symptom of a
    // disagreement is a placeholder where a flag should be — which looks like a design
    // choice rather than a bug.
    const pack = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '../../../../packages/content/packs/geography/entities.countries.v1.json'),
        'utf8',
      ),
    ) as { items: readonly { id: string; assets?: { flag?: { path: string } } }[] }

    const claimed = pack.items.filter((item) => item.assets?.flag !== undefined)
    expect(claimed.length).toBeGreaterThan(0)

    const missing = claimed
      .filter((item) => flagSource(item.assets!.flag!.path) === undefined)
      .map((item) => `${item.id} → ${item.assets!.flag!.path}`)
    expect(missing).toEqual([])
  })

  it('loads every fact pack the packs directory ships', () => {
    // The bug this closes cost the app a quarter of its content, silently, for months.
    //
    // `pnpm content:validate` walks the packs DIRECTORY and reported 260 facts. The app
    // builds its index from a HAND-WRITTEN list of imports in `content.ts`, and that
    // list was missing `facts.locations.v1.json` — so the app loaded 195 facts, both
    // location templates had nothing to attach to, and no gate compared the two numbers
    // because no gate knew there were two.
    //
    // Asserted against the filesystem rather than a list, so a pack added tomorrow is
    // covered by this test on the day it lands rather than on the day someone remembers.
    const shipped = readdirSync(PACK_DIR).filter(
      (file) => file.startsWith('facts.') && file.endsWith('.json'),
    )
    const source = readFileSync(join(import.meta.dirname, 'content.ts'), 'utf8')

    const missing = shipped.filter(
      (file) => !EXCLUDED_PACKS.includes(file) && !source.includes(file),
    )
    expect(missing, 'fact packs that ship but are never imported').toEqual([])
    // And the exclusions are real files, so a rename cannot leave a stale waiver behind
    // that quietly excuses a pack nobody meant to exclude.
    expect(EXCLUDED_PACKS.filter((file) => !shipped.includes(file))).toEqual([])
  })

  it('asks in the user’s language, not in English', () => {
    // Was a hardcoded `locale: 'en'`. A Swedish user got Swedish chrome around
    // English answer options, with the correct answer sitting there as a foreign
    // word. The packs carry the translations; this is what asks for them.
    const source = readFileSync(join(import.meta.dirname, 'content.ts'), 'utf8')
    expect(source).toMatch(/locale: currentLocale\(\)/)
    expect(source).not.toMatch(/locale: '[a-z]{2}'/)
  })
})
