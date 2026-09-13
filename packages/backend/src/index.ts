import { authenticate, createGuest } from './auth'
import { ApiError, submissionSchema, type Env } from './contracts'
import { submitLesson } from './lessons'
import { z } from 'zod'
import { recordAudience } from './account-policy'
import { requestCode, resendCode, verifyCode } from './email-challenges'
import { deleteAccount, finishIdentity } from './identity'
import type { MailDelivery } from './email-provider'
import { deletionCompleted, pruneDeletionReceipts } from './deletion-receipts'
import { renewSession, revokeSessionFamily, pruneSessionRotations } from './session-renewal'

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

export function createWorker(mail: MailDelivery = unavailableMail) { return {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await pruneDeletionReceipts(env.DB, Date.now())
    await pruneSessionRotations(env.DB, Date.now())
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const path = new URL(request.url).pathname
      if (request.method === 'GET' && path === '/health') return json({ service: 'worldquest', backend: 'cloudflare-d1', apiEnabled: env.API_ENABLED === 'true' })
      // No externally usable app API until rate limiting, recovery and native acceptance pass.
      if (env.API_ENABLED !== 'true') throw new ApiError('API_NOT_READY', 503)
      if (request.method === 'POST' && path === '/v1/auth/guest') {
        const input = await body(request)
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 0) throw new ApiError('INVALID_BODY', 400)
        return json(await createGuest(env.DB, Date.now()), 201)
      }
      if (request.method === 'POST' && path === '/v1/auth/renew') {
        const parsed = z.object({ replacement: challengeId }).strict().safeParse(await body(request))
        if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
        return json(await renewSession(env.DB, request, parsed.data.replacement, Date.now()))
      }
      if (request.method === 'POST' && path === '/v1/auth/logout') {
        if (!z.object({}).strict().safeParse(await body(request)).success) throw new ApiError('INVALID_BODY', 400)
        return json(await revokeSessionFamily(env.DB, request, Date.now()))
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
        if (await deletionCompleted(env.DB, request, id, Date.now())) return json({ deleted: true })
      }
      const { account, tokenHash } = await authenticate(env.DB, request, Date.now())
      const now = Date.now()
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
          return json(await requestCode(env.DB, env.AUTH_SECRET, mail, account.id, tokenHash, parsed.data, now), 202)
        }
        if (path === '/v1/auth/email/resend') {
          const parsed = z.object({ challengeId }).strict().safeParse(input)
          if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
          return json(await resendCode(env.DB, env.AUTH_SECRET, mail, account.id, tokenHash, parsed.data.challengeId, now), 202)
        }
        if (path === '/v1/auth/email/verify') {
          const parsed = verification.safeParse(input)
          if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
          const verified = await verifyCode(env.DB, env.AUTH_SECRET, account.id, tokenHash, parsed.data.challengeId, parsed.data.code, now)
          return json(verified.challenge.purpose === 'delete'
            ? await deleteAccount(env.DB, account.id, tokenHash, Date.now(), verified.challenge)
            : await finishIdentity(env.DB, verified.challenge, verified.subject, Date.now()))
        }
        throw new ApiError('NOT_FOUND', 404)
      }
      if (request.method === 'POST' && path === '/v1/account/delete') {
        const input = z.object({}).strict().safeParse(deletionBody)
        if (!input.success) throw new ApiError('INVALID_BODY', 400)
        return json(await deleteAccount(env.DB, account.id, tokenHash, now))
      }
      if (request.method === 'GET' && path === '/v1/account') {
        const identity = await env.DB.prepare(`SELECT u.email FROM identities i JOIN auth_user u ON u.id=i.subject_id WHERE i.account_id=?`)
          .bind(account.id).first<{ email: string }>()
        return json({ userId: account.id, audience: account.audience, email: identity?.email ?? null, revision: account.revision, xp: account.xp, coins: account.coins })
      }
      if (request.method === 'POST' && path === '/v1/lessons/submit') {
        const parsed = submissionSchema.safeParse(await body(request))
        if (!parsed.success) throw new ApiError('INVALID_SUBMISSION', 400)
        return json(await submitLesson(env.DB, account.id, tokenHash, parsed.data))
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
