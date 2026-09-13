/** Isolated transaction proof. No production auth, ticket issuance or offline protocol. */
import { ConvexError, v } from 'convex/values'
import { gradeLesson, masteryOf, type MemoryState } from '@worldquest/engines'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

export const submission = {
  lessonId: v.string(),
  answers: v.array(v.object({ slot: v.number(), chosenOptionId: v.union(v.string(), v.null()), elapsedMs: v.number() })),
}
type Submission = {
  lessonId: string
  answers: { slot: number; chosenOptionId: string | null; elapsedMs: number }[]
}
export async function ownerOf(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new ConvexError('AUTH_REQUIRED')
  return identity.tokenIdentifier
}

export async function submitTransaction(ctx: MutationCtx, args: Submission, injectFailure = false) {
  const owner = await ownerOf(ctx)
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(args.lessonId) || args.answers.length < 5 || args.answers.length > 20) {
    throw new ConvexError('INVALID_SUBMISSION')
  }
  const slots = new Set<number>()
  for (const answer of args.answers) {
    if (!Number.isSafeInteger(answer.slot) || answer.slot < 0 || slots.has(answer.slot) ||
        !Number.isFinite(answer.elapsedMs) || answer.elapsedMs < 0 || answer.elapsedMs > 60_000 ||
        (answer.chosenOptionId !== null && answer.chosenOptionId.length > 160)) {
      throw new ConvexError('INVALID_SUBMISSION')
    }
    slots.add(answer.slot)
  }
  const ordered = [...args.answers].sort((a, b) => a.slot - b.slot)
  const payload = JSON.stringify(ordered.map(a => [a.slot, a.chosenOptionId, a.elapsedMs]))
  const prior = await ctx.db.query('receipts').withIndex('by_owner_lesson', q =>
    q.eq('owner', owner).eq('lessonId', args.lessonId)).unique()
  if (prior) {
    if (prior.payload !== payload) throw new ConvexError('IDEMPOTENCY_CONFLICT')
    return prior.result
  }
  const ticket = await ctx.db.query('tickets').withIndex('by_owner_lesson', q =>
    q.eq('owner', owner).eq('lessonId', args.lessonId)).unique()
  if (!ticket || ticket.slots.length !== ordered.length) throw new ConvexError('INVALID_TICKET')
  const account = await ctx.db.query('accounts').withIndex('by_owner', q => q.eq('owner', owner)).unique()
  if (!account) throw new ConvexError('ACCOUNT_NOT_READY')
  const now = Date.now()
  const memory = new Map<string, MemoryState>()
  const existing = new Map<string, Doc<'memories'> | null>()
  const answers = []
  for (let i = 0; i < ordered.length; i++) {
    const answer = ordered[i]!
    const slot = ticket.slots[i]!
    if (answer.slot !== i || (answer.chosenOptionId !== null && !slot.options.includes(answer.chosenOptionId))) {
      throw new ConvexError('INVALID_SLOT')
    }
    const row = await ctx.db.query('memories').withIndex('by_owner_fact', q =>
      q.eq('owner', owner).eq('factId', slot.factId)).unique()
    if (row) memory.set(slot.factId, row.state)
    existing.set(slot.factId, row)
    answers.push({ itemId: slot.itemId, factId: slot.factId, templateId: slot.templateId,
      chosenOptionId: answer.chosenOptionId, elapsedMs: answer.elapsedMs,
      wasCorrect: answer.chosenOptionId === slot.correctOptionId, answeredAt: now })
  }
  // UTC and arrival order are explicit proof limits; travel/offline replay need their own protocol.
  const day = new Date(now).toISOString().slice(0, 10)
  const sameDay = account.day === day
  const graded = gradeLesson({ lessonId: args.lessonId, answers, memory, now,
    xpEarnedToday: sameDay ? account.dailyXp : 0,
    isFirstLessonOfDay: !sameDay || account.lessonsToday === 0,
    masteredBefore: new Set([...memory].filter(([, state]) =>
      ['mastered', 'burnished'].includes(masteryOf(state, now))).map(([id]) => id)),
  })
  const revision = account.revision + 1
  const result = { lessonId: args.lessonId, revision, xpAwarded: graded.xpAwarded,
    coinsAwarded: graded.coinsAwarded, xpTotal: account.xp + graded.xpAwarded,
    coinBalance: account.coins + graded.coinsAwarded, correct: graded.correct, reviews: graded.reviews.length }
  await ctx.db.insert('ledger', { owner, lessonId: args.lessonId, xp: graded.xpAwarded, coins: graded.coinsAwarded })
  if (injectFailure) throw new ConvexError('INJECTED_WRITE_FAILURE')
  for (const review of graded.reviews) {
    await ctx.db.insert('reviews', { owner, lessonId: args.lessonId, factId: review.factId,
      revision, rating: review.rating, reviewedAt: now })
  }
  for (const [factId, state] of graded.updatedMemory) {
    const row = existing.get(factId)
    if (row) await ctx.db.patch(row._id, { state, revision })
    else await ctx.db.insert('memories', { owner, factId, state, revision })
  }
  await ctx.db.patch(account._id, { revision, xp: result.xpTotal, coins: result.coinBalance,
    day, dailyXp: (sameDay ? account.dailyXp : 0) + graded.xpAwarded,
    lessonsToday: (sameDay ? account.lessonsToday : 0) + 1 })
  await ctx.db.insert('receipts', { owner, lessonId: args.lessonId, payload, result })
  return result
}

export const submit = mutation({ args: submission, handler: (ctx, args) => submitTransaction(ctx, args) })
export const snapshot = query({ args: {}, handler: async ctx => {
  const owner = await ownerOf(ctx)
  const account = await ctx.db.query('accounts').withIndex('by_owner', q => q.eq('owner', owner)).unique()
  const ledger = await ctx.db.query('ledger').withIndex('by_owner', q => q.eq('owner', owner)).collect()
  const reviews = await ctx.db.query('reviews').withIndex('by_owner', q => q.eq('owner', owner)).collect()
  const memories = await ctx.db.query('memories').withIndex('by_owner_fact', q => q.eq('owner', owner)).collect()
  return { account, ledger, reviews, memories }
} })
