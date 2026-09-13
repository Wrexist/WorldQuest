import { authenticate, createGuest } from './auth'
import { ApiError, submissionSchema, type Env } from './contracts'
import { submitLesson } from './lessons'

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

export default {
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
      const { account, tokenHash } = await authenticate(env.DB, request, Date.now())
      if (request.method === 'GET' && path === '/v1/account') {
        return json({ userId: account.id, audience: account.audience, revision: account.revision, xp: account.xp, coins: account.coins })
      }
      if (request.method === 'POST' && path === '/v1/auth/logout') {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
        return json({ signedOut: true })
      }
      if (request.method === 'POST' && path === '/v1/lessons/submit') {
        const parsed = submissionSchema.safeParse(await body(request))
        if (!parsed.success) throw new ApiError('INVALID_SUBMISSION', 400)
        return json(await submitLesson(env.DB, account.id, tokenHash, parsed.data))
      }
      throw new ApiError('NOT_FOUND', 404)
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.code }, error.status)
      // Do not expose SQL, tokens, answer payloads or account identifiers in logs/errors.
      return json({ error: 'SERVICE_UNAVAILABLE' }, 503)
    }
  },
}
