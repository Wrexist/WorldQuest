import { authenticate, createGuest } from './auth'
import { ApiError, submissionSchema, type Clock, type Env } from './contracts'
import { submitLesson } from './lessons'
import { z } from 'zod'
import { recordAudience } from './account-policy'
import { requestCode, resendCode, verifyCode } from './email-challenges'
import { deleteAccount, finishIdentity } from './identity'
import type { MailDelivery } from './email-provider'
import { resendMail } from './mail-resend'
import { deletionCompleted, pruneDeletionReceipts } from './deletion-receipts'
import { renewSession, revokeSessionFamily, pruneSessionRotations } from './session-renewal'
import { prepareLesson, prepareLessonSchema } from './lesson-tickets'
import { learningState, learningHistory } from './learning-state'
import { setTimeZone } from './time-zone'
import { todayQuest } from './quest-state'
import { progress, spend, spendSchema, type SpendKind } from './economy'
import { fileReport, reportSchema } from './reports'

const codeRequest = z.object({ email: z.string().trim().toLowerCase().email().max(254),
  purpose: z.enum(['link', 'login', 'delete']), locale: z.enum(['en', 'sv']) }).strict()
const challengeId = z.string().regex(/^[a-f0-9]{64}$/)
const verification = z.object({ challengeId, code: z.string().regex(/^\d{8}$/) }).strict()
const unavailableMail: MailDelivery = { send: async () => { throw new ApiError('EMAIL_UNAVAILABLE', 503) } }

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
async function body(request: Request): Promise<unknown> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ApiError('JSON_REQUIRED', 415)
  // Bound the stream itself; Content-Length can be absent or dishonest.
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError('INVALID_BODY', 400)
  let size = 0
  let text = ''
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 16_384) { await reader.cancel(); throw new ApiError('BODY_TOO_LARGE', 413) }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    try { return JSON.parse(text) as unknown } catch { throw new ApiError('INVALID_BODY', 400) }
  } finally { reader.releaseLock() }
}

/**
 * The mail port for a request: an injected one (tests), else Resend when both its secret
 * and sender are configured, else none — the app then shows its delivery-failure state.
 */
function mailFor(env: Env, injected: MailDelivery | undefined): MailDelivery {
  if (injected) return injected
  if (env.RESEND_API_KEY && env.MAIL_FROM) return resendMail({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
  return unavailableMail
}

export function createWorker(mail?: MailDelivery, clock: Clock = Date.now) { return {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await pruneDeletionReceipts(env.DB, clock())
    await pruneSessionRotations(env.DB, clock())
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const path = new URL(request.url).pathname
      // HEAD as well as GET: the app's connectivity probe (NetInfo) asks with HEAD, and a
      // HEAD that fell through to authentication answered 401, which the app read as "no
      // network" — every D1 build would have believed itself offline for good.
      if (path === '/health' && request.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
      if (request.method === 'GET' && path === '/health') return json({ service: 'worldquest', backend: 'cloudflare-d1', apiEnabled: env.API_ENABLED === 'true' })
      // No externally usable app API until rate limiting, recovery and native acceptance pass.
      if (env.API_ENABLED !== 'true') throw new ApiError('API_NOT_READY', 503)
      if (request.method === 'POST' && path === '/v1/auth/guest') {
        const input = await body(request)
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 0) throw new ApiError('INVALID_BODY', 400)
        return json(await createGuest(env.DB, clock()), 201)
      }
      if (request.method === 'POST' && path === '/v1/auth/renew') {
        const parsed = z.object({ replacement: challengeId }).strict().safeParse(await body(request))
        if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
        return json(await renewSession(env.DB, request, parsed.data.replacement, clock()))
      }
      if (request.method === 'POST' && path === '/v1/auth/logout') {
        if (!z.object({}).strict().safeParse(await body(request)).success) throw new ApiError('INVALID_BODY', 400)
        return json(await revokeSessionFamily(env.DB, request, clock()))
      }
      // Deletion removes authentication too. Recognize only the exact completed
      // operation before normal auth, so a lost response can be acknowledged.
      let deletionBody: unknown
      if (request.method === 'POST' && (path === '/v1/account/delete' || path === '/v1/auth/email/verify')) {
        deletionBody = await body(request)
        const parsed = path === '/v1/account/delete'
          ? z.object({}).strict().safeParse(deletionBody) : verification.safeParse(deletionBody)
        if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
        const id = 'challengeId' in parsed.data && typeof parsed.data.challengeId === 'string' ? parsed.data.challengeId : null
        if (await deletionCompleted(env.DB, request, id, clock())) return json({ deleted: true })
      }
      const { account, tokenHash } = await authenticate(env.DB, request, clock())
      const now = clock()
      if (request.method === 'POST' && path === '/v1/account/audience') {
        const input = z.object({ birthYear: z.number().int() }).strict().safeParse(await body(request))
        if (!input.success) throw new ApiError('INVALID_BODY', 400)
        return json(await recordAudience(env.DB, account.id, tokenHash, input.data.birthYear, now))
      }
      if (request.method === 'POST' && path.startsWith('/v1/auth/email/')) {
        if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new ApiError('EMAIL_UNAVAILABLE', 503)
        if (account.audience !== 'eligible') throw new ApiError('ACCOUNT_PROTECTED', 403)
        const input = path === '/v1/auth/email/verify' ? deletionBody : await body(request)
        if (path === '/v1/auth/email/request') {
          const parsed = codeRequest.safeParse(input)
          if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
          return json(await requestCode(env.DB, env.AUTH_SECRET, mailFor(env, mail), account.id, tokenHash, parsed.data, now), 202)
        }
        if (path === '/v1/auth/email/resend') {
          const parsed = z.object({ challengeId }).strict().safeParse(input)
          if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
          return json(await resendCode(env.DB, env.AUTH_SECRET, mailFor(env, mail), account.id, tokenHash, parsed.data.challengeId, now), 202)
        }
        if (path === '/v1/auth/email/verify') {
          const parsed = verification.safeParse(input)
          if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
          const verified = await verifyCode(env.DB, env.AUTH_SECRET, account.id, tokenHash, parsed.data.challengeId, parsed.data.code, now)
          return json(verified.challenge.purpose === 'delete'
            ? await deleteAccount(env.DB, account.id, tokenHash, clock(), verified.challenge)
            : await finishIdentity(env.DB, verified.challenge, verified.subject, clock()))
        }
        throw new ApiError('NOT_FOUND', 404)
      }
      if (request.method === 'POST' && path === '/v1/account/delete') {
        const input = z.object({}).strict().safeParse(deletionBody)
        if (!input.success) throw new ApiError('INVALID_BODY', 400)
        return json(await deleteAccount(env.DB, account.id, tokenHash, now))
      }
      if (request.method === 'POST' && path === '/v1/account/time-zone') {
        const input = z.object({ timeZone: z.string().min(1).max(64) }).strict().safeParse(await body(request))
        if (!input.success) throw new ApiError('INVALID_BODY', 400)
        return json(await setTimeZone(env.DB, account.id, tokenHash, input.data.timeZone, now))
      }
      if (request.method === 'GET' && path === '/v1/account') {
        const identity = await env.DB.prepare(`SELECT u.email FROM identities i JOIN auth_user u ON u.id=i.subject_id WHERE i.account_id=?`)
          .bind(account.id).first<{ email: string }>()
        return json({ userId: account.id, audience: account.audience, email: identity?.email ?? null, revision: account.revision,
          xp: account.xp, coins: account.coins, timeZone: account.time_zone,
          streak: { current: account.streak_current, longest: account.streak_longest, lastActiveDate: account.streak_last_day, freezesHeld: account.freezes_held } })
      }
      if (request.method === 'POST' && path === '/v1/lessons/submit') {
        const parsed = submissionSchema.safeParse(await body(request))
        if (!parsed.success) throw new ApiError('INVALID_SUBMISSION', 400)
        return json(await submitLesson(env.DB, account.id, tokenHash, parsed.data, clock))
      }
      if (request.method === 'POST' && path === '/v1/lessons/prepare') {
        const parsed = prepareLessonSchema.safeParse(await body(request))
        if (!parsed.success) throw new ApiError('INVALID_LESSON_REQUEST', 400)
        return json(await prepareLesson(env.DB, account.id, tokenHash, parsed.data))
      }
      const spends: Record<string, SpendKind> = { '/v1/shop/freeze': 'freeze', '/v1/streak/repair': 'repair',
        '/v1/lessons/continue': 'continue', '/v1/shop/item': 'item' }
      if (request.method === 'POST' && spends[path]) {
        const parsed = spendSchema.safeParse(await body(request))
        if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
        return json(await spend(env.DB, account.id, tokenHash, spends[path]!, parsed.data, clock))
      }
      if (request.method === 'GET' && path === '/v1/progress') return json(await progress(env.DB, account.id, tokenHash, now))
      if (request.method === 'POST' && path === '/v1/reports') {
        const parsed = reportSchema.safeParse(await body(request))
        if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
        return json(await fileReport(env.DB, account.id, tokenHash, parsed.data, now), 202)
      }
      if (request.method === 'GET' && path === '/v1/quest/today') return json(await todayQuest(env.DB, account.id, tokenHash, now))
      if (request.method === 'GET' && path === '/v1/learning/state') return json(await learningState(env.DB, account.id, tokenHash))
      if (request.method === 'GET' && path === '/v1/learning/history') {
        const params = new URL(request.url).searchParams
        const parsed = z.object({ revision: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
          slot: z.coerce.number().int().min(-1).max(19).default(-1),
          through: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional() }).strict().safeParse(Object.fromEntries(params))
        if (!parsed.success) throw new ApiError('INVALID_CURSOR', 400)
        return json(await learningHistory(env.DB, account.id, tokenHash, parsed.data))
      }
      throw new ApiError('NOT_FOUND', 404)
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.code, ...error.retryContext }, error.status)
      // Do not expose SQL, tokens, answer payloads or account identifiers in logs/errors.
      return json({ error: 'SERVICE_UNAVAILABLE' }, 503)
    }
  },
} }
export default createWorker()
