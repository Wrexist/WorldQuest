import { z } from 'zod'

export const submissionSchema = z.object({
  lessonId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  answers: z.array(z.object({
    slot: z.number().int().min(0).max(19),
    chosenOptionId: z.string().max(160).nullable(),
    elapsedMs: z.number().finite().min(0).max(60_000),
  }).strict()).min(5).max(20),
}).strict().superRefine(({ answers }, ctx) => {
  if (new Set(answers.map(a => a.slot)).size !== answers.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate slots' })
  }
})

export const ticketSchema = z.array(z.object({
  itemId: z.string(), factId: z.string(), templateId: z.string(),
  options: z.array(z.string()), correctOptionId: z.string(),
})).min(5).max(20)

export type Submission = z.infer<typeof submissionSchema>
export interface Receipt {
  lessonId: string; revision: number; xpAwarded: number; coinsAwarded: number
  xpTotal: number; coinBalance: number; correct: number; reviews: number
  /** XP from today's quest, and the slot keys it came from — the celebration list. */
  questXpAwarded: number; questSlots: string[]
}
export interface Account {
  id: string; audience: 'unknown' | 'protected' | 'eligible'; deleted_at: number | null
  revision: number; xp: number; coins: number; day: string; daily_xp: number; lessons_today: number
}
export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number,
    readonly retryContext?: { challengeId: string; expiresAt: number; resendAt?: number }) { super(code) }
}
export interface Env { DB: D1Database; API_ENABLED: string; AUTH_SECRET?: string }
