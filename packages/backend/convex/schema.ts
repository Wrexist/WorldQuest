import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const memory = v.object({
  factId: v.string(), stability: v.number(), difficulty: v.number(), reps: v.number(),
  lapses: v.number(), lastReviewAt: v.union(v.number(), v.null()), dueAt: v.number(), suspended: v.boolean(),
})
export const slot = v.object({
  itemId: v.string(), factId: v.string(), templateId: v.string(),
  options: v.array(v.string()), correctOptionId: v.string(),
})
export const receipt = v.object({
  lessonId: v.string(), revision: v.number(), xpAwarded: v.number(), coinsAwarded: v.number(),
  xpTotal: v.number(), coinBalance: v.number(), correct: v.number(), reviews: v.number(),
})

export default defineSchema({
  accounts: defineTable({
    owner: v.string(), audience: v.literal('unknown'), revision: v.number(),
    xp: v.number(), coins: v.number(), day: v.string(), dailyXp: v.number(), lessonsToday: v.number(),
  }).index('by_owner', ['owner']),
  tickets: defineTable({ owner: v.string(), lessonId: v.string(), slots: v.array(slot) })
    .index('by_owner_lesson', ['owner', 'lessonId']),
  receipts: defineTable({ owner: v.string(), lessonId: v.string(), payload: v.string(), result: receipt })
    .index('by_owner_lesson', ['owner', 'lessonId']),
  memories: defineTable({ owner: v.string(), factId: v.string(), state: memory, revision: v.number() })
    .index('by_owner_fact', ['owner', 'factId']),
  reviews: defineTable({
    owner: v.string(), lessonId: v.string(), factId: v.string(), revision: v.number(),
    rating: v.number(), reviewedAt: v.number(),
  }).index('by_owner', ['owner']),
  ledger: defineTable({ owner: v.string(), lessonId: v.string(), xp: v.number(), coins: v.number() })
    .index('by_owner', ['owner']),
})
