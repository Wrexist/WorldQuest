/**
 * What this app is actually willing to ask a user.
 *
 * The bug behind this file: the geography pack ships `tpl.flag-to-country.mc4` —
 * "Which country's flag is this?", modality `image` — and there is not one flag file
 * in this repo. `pickItemForFact` chooses uniformly among a fact's templates, so
 * roughly one flag question in three was that question: a prompt about a picture that
 * was never drawn, above four country names, and a heart lost for guessing wrong.
 *
 * Nothing on screen could have caught it. The prompt rendered, the options rendered,
 * every state was correct — the only thing missing was the part no component was ever
 * asked to draw. So the assertion lives at the seam where the app declares what it can
 * present, and it is written against the real packs rather than a fixture, because a
 * fixture would go on passing the day someone adds a second image template.
 */

import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useContent } from './content.js'

describe('the lesson this app composes', () => {
  it('never asks a question it has no way to present', () => {
    const { result } = renderHook(() => useContent())
    const questions = result.current.index!.compose({ count: 40 })

    expect(questions.length).toBeGreaterThan(0)
    for (const question of questions) {
      expect(question.modality, question.item.templateId).toBe('text')
      // Belt and braces: an image question that slipped through would carry the asset
      // it expects a renderer to draw, and there is no renderer.
      expect(question.promptAsset).toBeUndefined()
    }
  })

  it('still asks about flags — through the template that uses words', () => {
    // The narrowing must not quietly drop a subject. `tpl.flag-describe.mc4` tests
    // the same fact in prose, which is the sibling docs/design/accessibility.md §8
    // already relies on for screen-reader users, reused here for the same reason.
    const { result } = renderHook(() => useContent())
    const questions = result.current.index!.compose({ count: 60 })
    const flagQuestions = questions.filter((q) => q.item.factId.endsWith('.flag'))

    expect(flagQuestions.length).toBeGreaterThan(0)
    for (const question of flagQuestions) {
      expect(question.item.templateId).not.toBe('tpl.flag-to-country.mc4')
    }
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
