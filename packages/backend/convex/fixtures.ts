/** Admin-only synthetic setup. Never expose these functions to the mobile client. */
import { v } from 'convex/values'
import { buildIndex, buildQuestion, seededRng, type Fact, type Template } from '@worldquest/engines'
import entities from '../../content/packs/geography/entities.countries.v1.json'
import facts from '../../content/packs/geography/facts.capitals.v1.json'
import templates from '../../content/packs/geography/templates.v1.json'
import { internalMutation } from './_generated/server'
import { submission, submitTransaction } from './proof'

const index = buildIndex({
  entities: entities.items.map(({ id, type, names, region, subregion }) => ({ id, type, names, region, subregion })),
  facts: facts.items as Fact[], templates: templates.items as Template[],
})
export const seed = internalMutation({ args: { owner: v.string(), lessonIds: v.array(v.string()) }, handler: async (ctx, args) => {
  const existing = await ctx.db.query('accounts').withIndex('by_owner', q => q.eq('owner', args.owner)).unique()
  if (existing) throw new Error('Use a fresh synthetic owner for each run')
  await ctx.db.insert('accounts', { owner: args.owner, audience: 'unknown', revision: 0,
    xp: 0, coins: 0, day: '', dailyXp: 0, lessonsToday: 0 })
  const seen = new Set<string>()
  const slots = []
  for (const item of index.items) {
    if (seen.has(item.factId)) continue
    const question = buildQuestion(index, item, 'en', seededRng(1))
    if (!question) continue
    seen.add(item.factId)
    slots.push({ itemId: item.id, factId: item.factId, templateId: item.templateId,
      options: question.options.map(o => o.id), correctOptionId: question.options.find(o => o.isCorrect)!.id })
    if (slots.length === 5) break
  }
  if (slots.length !== 5) throw new Error('Content cannot form the proof lesson')
  for (const lessonId of args.lessonIds) await ctx.db.insert('tickets', { owner: args.owner, lessonId, slots })
  return slots.map((slot, i) => ({ slot: i, chosenOptionId: slot.correctOptionId, elapsedMs: 8000 }))
} })
export const failAfterWrite = internalMutation({ args: submission, handler: (ctx, args) => submitTransaction(ctx, args, true) })
