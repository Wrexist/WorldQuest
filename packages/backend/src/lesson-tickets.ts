import { composeLesson, focusFilter, seededRng, type LessonFocus, type MemoryState, type Question } from '@worldquest/engines'
import { z } from 'zod'
import { ApiError } from './contracts'
import { learningContent } from './learning-content'

/**
 * What the learner asked to practise: a country, a region, an attribute, the quest's
 * exact facts or a difficulty band. The engines' `LessonFocus`, bounded. Each field only
 * ever removes facts; the server still chooses which of them are due.
 */
const focusSchema = z.object({
  factIds: z.array(z.string().regex(/^[a-zA-Z0-9._-]{1,120}$/)).max(60).optional(),
  attributes: z.array(z.string().regex(/^[a-z-]{1,40}$/)).max(12).optional(),
  entities: z.array(z.string().regex(/^[A-Z]{2}$/)).max(300).optional(),
  difficulty: z.object({ min: z.number().int().min(1).max(5).optional(), max: z.number().int().min(1).max(5).optional() }).strict().optional(),
}).strict()
export const prepareLessonSchema = z.object({ lessonId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  locale: z.enum(['en', 'sv']), count: z.number().int().min(5).max(20).default(10),
  screenReader: z.boolean().default(false), focus: focusSchema.optional() }).strict()
type Input = z.infer<typeof prepareLessonSchema>
/** Parsed focus, with absent fields absent rather than `undefined` (exact optional types). */
function lessonFocus(f: z.infer<typeof focusSchema>): LessonFocus {
  const d = f.difficulty
  return { ...(f.factIds ? { factIds: f.factIds } : {}), ...(f.attributes ? { attributes: f.attributes } : {}),
    ...(f.entities ? { entities: f.entities } : {}),
    ...(d ? { difficulty: { ...(d.min === undefined ? {} : { min: d.min }), ...(d.max === undefined ? {} : { max: d.max }) } } : {}) }
}
type Ticket = { request_json: string | null; questions_json: string | null; issued_at: number | null }
function response(lessonId: string, row: Ticket) {
  if (!row.questions_json || !row.request_json || row.issued_at === null) throw new ApiError('INVALID_TICKET', 409)
  return { lessonId, issuedAt: row.issued_at, questions: JSON.parse(row.questions_json) as Question[], request: prepareLessonSchema.parse(JSON.parse(row.request_json)) }
}

/** The caller chooses presentation preferences, never facts, answers, or reward rules. */
export async function prepareLesson(db: D1Database, owner: string, tokenHash: string, input: Input) {
  const request = JSON.stringify(input)
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now()
    const read = await db.batch<Record<string, unknown>>([
      db.prepare(`SELECT a.revision FROM accounts a JOIN sessions s ON s.account_id=a.id
        WHERE a.id=? AND a.deleted_at IS NULL AND s.token_hash=? AND s.expires_at>?`).bind(owner, tokenHash, now),
      db.prepare('SELECT request_json,questions_json,issued_at FROM tickets WHERE account_id=? AND lesson_id=?').bind(owner, input.lessonId),
      db.prepare(`SELECT state FROM memories WHERE account_id=? AND fact_id IN (SELECT value FROM json_each(?))`)
        .bind(owner, JSON.stringify([...learningContent.facts.keys()])),
      db.prepare(`SELECT count(*) AS count FROM tickets t WHERE account_id=? AND NOT EXISTS
        (SELECT 1 FROM receipts r WHERE r.account_id=t.account_id AND r.lesson_id=t.lesson_id)`).bind(owner),
    ])
    const account = read[0]?.results[0]
    if (!account || typeof account.revision !== 'number') throw new ApiError('SESSION_EXPIRED', 401)
    const prior = read[1]?.results[0] as Ticket | undefined
    if (prior) {
      if (prior.request_json !== request) throw new ApiError('IDEMPOTENCY_CONFLICT', 409)
      return response(input.lessonId, prior)
    }
    if (Number(read[3]?.results[0]?.count ?? 0) >= 20) throw new ApiError('TICKET_LIMIT', 429)
    const memory = (read[2]?.results ?? []).map(row => JSON.parse(String(row.state)) as MemoryState)
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!
    const topicFilter = input.focus ? focusFilter(learningContent, lessonFocus(input.focus)) : undefined
    const base = { index: learningContent, memory, now, locale: input.locale, screenReaderOnly: input.screenReader,
      modalities: ['text', 'image', 'map'] as ('text' | 'image' | 'map')[] }
    let questions = composeLesson({ ...base, rng: seededRng(seed), count: input.count,
      ...(topicFilter ? { topicFilter } : {}),
      // One entity in focus means the entity is not the question (the app's own rule).
      entityIsGiven: input.focus?.entities?.length === 1 })
    /**
     * Exact facts alone are STEERING, not a boundary: they are what "play today's quest"
     * sends, and a quest with two facts left must still give a full lesson. Those facts
     * come first; the rest of the lesson is composed as usual from everything else.
     * A chosen country, attribute or band stays a boundary.
     */
    const steering = input.focus !== undefined && Object.keys(input.focus).every(key => key === 'factIds')
    if (steering && questions.length < input.count) {
      const taken = new Set(questions.map(q => q.item.factId))
      questions = [...questions, ...composeLesson({ ...base, rng: seededRng(seed ^ 0x9e3779b9), count: input.count - questions.length,
        topicFilter: id => !taken.has(id) })]
    }
    // A focus narrower than one lesson is the caller's choice, not an outage.
    if (questions.length < 5) throw input.focus && !steering ? new ApiError('FOCUS_TOO_NARROW', 409) : new ApiError('CONTENT_UNAVAILABLE', 503)
    const slots = questions.map(q => {
      const correct = q.options.filter(option => option.isCorrect)
      if (correct.length !== 1) throw new ApiError('CONTENT_UNAVAILABLE', 503)
      return { itemId: q.item.id, factId: q.item.factId, templateId: q.item.templateId,
        options: q.options.map(o => o.id), correctOptionId: correct[0]!.id }
    })
    const guard = crypto.randomUUID()
    try {
      await db.batch([
        db.prepare(`INSERT INTO transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS (
          SELECT 1 FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE a.id=? AND a.revision=?
          AND a.deleted_at IS NULL AND s.token_hash=? AND s.expires_at>?) AND
          (SELECT count(*) FROM tickets t WHERE account_id=? AND NOT EXISTS
           (SELECT 1 FROM receipts r WHERE r.account_id=t.account_id AND r.lesson_id=t.lesson_id))<20 THEN 1 ELSE 0 END`)
          .bind(guard, owner, account.revision, tokenHash, Date.now(), owner),
        db.prepare(`INSERT INTO tickets(account_id,lesson_id,slots,request_json,questions_json,issued_at) VALUES (?,?,?,?,?,?)
          ON CONFLICT(account_id,lesson_id) DO NOTHING`).bind(owner, input.lessonId, JSON.stringify(slots), request, JSON.stringify(questions), now),
        db.prepare('DELETE FROM transaction_guards WHERE id=?').bind(guard),
      ])
      // Concurrent identical requests return the persisted winner's presentation.
      const stored = await db.prepare('SELECT request_json,questions_json,issued_at FROM tickets WHERE account_id=? AND lesson_id=?')
        .bind(owner, input.lessonId).first<Ticket>()
      if (!stored || stored.request_json !== request) throw new ApiError('IDEMPOTENCY_CONFLICT', 409)
      return response(input.lessonId, stored)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('wq_revision_guard')) throw error
    }
  }
  throw new ApiError('RETRY_LATER', 503)
}
