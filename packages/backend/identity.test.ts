import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readdirSync, readFileSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import type { VerificationMail } from './src/email-provider'
import { pruneDeletionReceipts } from './src/deletion-receipts'
import { createD1AuthClient, type AuthFetch } from '../api/src/d1-auth'

type Session = { userId: string; token: string; expiresAt: number }
let script: string, mf: Miniflare, db: D1Database
let mail: VerificationMail[] = [], failDelivery = false
beforeAll(async () => {
  const result = await build({ stdin: { contents: `import { createWorker } from './src/index';
    export default {fetch(request,env) {return createWorker({send: async message => {
      const result = await env.MAILBOX.fetch('https://mailbox.invalid', {method:'POST',body:JSON.stringify(message)});
      if (!result.ok) throw new Error('Delivery unavailable');
    }}).fetch(request,env)}};`, resolveDir: process.cwd() }, bundle: true, write: false,
    format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'] })
  script = result.outputFiles[0]!.text
})
beforeEach(async () => {
  mail = []; failDelivery = false
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-09-13',
    compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { API_ENABLED: 'true', AUTH_SECRET: 'synthetic-only-auth-secret-for-local-workerd-tests' },
    serviceBindings: { MAILBOX: async request => {
      if (failDelivery) return new Response(null, { status: 503 })
      mail.push(await request.json() as VerificationMail)
      return new Response(null, { status: 204 })
    } } }))
  db = await mf.getD1Database('DB') as unknown as D1Database
  for (const file of readdirSync('migrations').sort()) {
    const sql = readFileSync(`migrations/${file}`, 'utf8').replace(/--[^\n]*/g, '')
    await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)))
  }
})
afterEach(async () => { await mf.dispose() })
async function call(path: string, token?: string, body?: unknown) {
  const r = await mf.dispatchFetch(`http://localhost${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  // Consume immediately; concurrent workerd responses must not hold a body open.
  return { status: r.status, body: await r.json() as Record<string, unknown> }
}
async function guest(eligible = true): Promise<Session> {
  const r = await call('/v1/auth/guest', undefined, {})
  expect(r.status).toBe(201)
  const s = r.body as unknown as Session
  if (eligible) expect((await call('/v1/account/audience', s.token, { birthYear: 2000 })).status).toBe(200)
  return s
}
async function request(s: Session, purpose = 'link', email = 'learner@example.invalid') {
  const r = await call('/v1/auth/email/request', s.token, { email, purpose, locale: 'sv' })
  expect(r.status).toBe(202)
  return r.body.challengeId as string
}
async function verify(s: Session, id: string, code = mail.at(-1)!.code) {
  return call('/v1/auth/email/verify', s.token, { challengeId: id, code })
}
async function link(s: Session): Promise<Session> {
  const id = await request(s), r = await verify(s, id)
  expect(r).toMatchObject({ status: 200, body: { userId: s.userId } })
  return r.body as unknown as Session
}
async function expireChallenge() { await db.prepare('UPDATE email_challenges SET expires_at=0').run() }

describe('D1 account gateway with real Better Auth and synthetic delivery', () => {
  it('links a guest without changing owner or rewards, then recovers on a second installation', async () => {
    const original = await guest()
    await db.prepare('UPDATE accounts SET xp=42,coins=7 WHERE id=?').bind(original.userId).run()
    const linked = await link(original)
    expect(mail).toMatchObject([{ locale: 'sv', purpose: 'link' }])
    expect((await call('/v1/account', original.token)).status).toBe(401)
    expect((await call('/v1/account', linked.token)).body).toMatchObject({ userId: original.userId, xp: 42, coins: 7 })
    await expireChallenge()
    const second = await guest(), id = await request(second, 'login'), recovered = await verify(second, id)
    expect(recovered).toMatchObject({ status: 200, body: { userId: original.userId } })
    expect((await call('/v1/account', recovered.body.token as string)).body).toMatchObject({ xp: 42, coins: 7 })
    expect((await call('/v1/account', second.token)).status).toBe(401)
    expect((await db.prepare('SELECT * FROM identities').all()).results).toHaveLength(1)
    const stored = JSON.stringify((await db.prepare('SELECT * FROM sessions').all()).results)
    expect(stored).not.toContain(linked.token)
    expect(stored).not.toContain(recovered.body.token as string)
    expect((await db.prepare('SELECT * FROM auth_session').all()).results).toHaveLength(0)
    expect((await db.prepare('SELECT * FROM auth_account').all()).results).toHaveLength(0)
  })
  it('protects unknown/young accounts and never accepts client role promotion', async () => {
    const s = await guest(false)
    expect((await call('/v1/auth/email/request', s.token, { email: 'child@example.invalid', purpose: 'link', locale: 'en' })).status).toBe(403)
    expect((await call('/v1/account/audience', s.token, { birthYear: 2000, audience: 'eligible' })).status).toBe(400)
    expect((await call('/v1/account/audience', s.token, { birthYear: 2016 })).body).toEqual({ audience: 'protected' })
    expect((await call('/v1/account/audience', s.token, { birthYear: 2000 })).status).toBe(409)
    expect(mail).toHaveLength(0)
    expect((await db.prepare('SELECT * FROM auth_user').all()).results).toHaveLength(0)
  })
  it('rejects another session, wrong codes, exhausted attempts and replay', async () => {
    const a = await guest(), b = await guest(), id = await request(a), code = mail[0]!.code
    expect((await verify(b, id, code)).status).toBe(400)
    const stored = JSON.stringify((await db.prepare('SELECT * FROM auth_verification').all()).results)
    expect(stored).not.toContain(code)
    const wrong = code === '00000000' ? '11111111' : '00000000'
    for (let i = 0; i < 3; i++) expect((await verify(a, id, wrong)).status).toBe(400)
    expect((await verify(a, id, code)).status).toBe(400)
    expect((await db.prepare('SELECT * FROM identities').all()).results).toHaveLength(0)
  })
  it('consumes a correct code only once under concurrency', async () => {
    const s = await guest(), id = await request(s), code = mail[0]!.code
    const results = await Promise.all([verify(s, id, code), verify(s, id, code)])
    expect(results.filter(r => r.status === 200)).toHaveLength(1)
    expect((await db.prepare('SELECT * FROM identities').all()).results).toHaveLength(1)
    expect((await verify(s, id, code)).status).toBe(401)
  })
  it('does not attach an existing email to another progress owner', async () => {
    const original = await guest(), linked = await link(original)
    await expireChallenge()
    const other = await guest(), id = await request(other), r = await verify(other, id)
    expect(r.status).toBe(409)
    expect((await call('/v1/account', linked.token)).body.userId).toBe(original.userId)
    expect((await call('/v1/account', other.token)).body.userId).toBe(other.userId)
  })
  it('requires fresh mailbox proof to erase a linked account and revokes every session', async () => {
    const original = await guest(), linked = await link(original)
    expect((await call('/v1/account/delete', linked.token, {})).status).toBe(403)
    await expireChallenge()
    const id = await request(linked, 'delete')
    expect(await verify(linked, id)).toEqual({ status: 200, body: { deleted: true } })
    expect((await call('/v1/account', linked.token)).status).toBe(401)
    for (const table of ['accounts','identities','sessions','email_challenges','auth_user','auth_verification']) {
      expect((await db.prepare(`SELECT * FROM ${table}`).all()).results).toHaveLength(0)
    }
  })
  it('deletes protected guests without collecting an email', async () => {
    const s = await guest(false)
    expect((await call('/v1/account/delete', s.token, {})).status).toBe(200)
    expect((await call('/v1/account', s.token)).status).toBe(401)
    expect(mail).toHaveLength(0)
  })
  it('fails delivery visibly and bounds resend instead of acknowledging success', async () => {
    const s = await guest(); failDelivery = true
    const failed = await call('/v1/auth/email/request', s.token, { email: 'learner@example.invalid', purpose: 'link', locale: 'en' })
    expect(failed.status).toBe(503)
    const id = failed.body.challengeId as string
    expect((await call('/v1/auth/email/resend', s.token, { challengeId: id })).status).toBe(429)
    await db.prepare('UPDATE email_challenges SET sent_at=0').run(); failDelivery = false
    expect((await call('/v1/auth/email/resend', s.token, { challengeId: id })).status).toBe(202)
    expect((await verify(s, id)).status).toBe(200)
  })
  it('binds a code to its challenge and rejects expired codes', async () => {
    const a = await guest(), oldId = await request(a), oldCode = mail[0]!.code
    await expireChallenge()
    expect((await verify(a, oldId, oldCode)).status).toBe(400)
    const b = await guest(), newId = await request(b, 'login')
    expect((await verify(b, newId, oldCode)).status).toBe(400)
    expect((await db.prepare('SELECT * FROM identities').all()).results).toHaveLength(0)
  })
  it('rolls back deletion on a database failure and permits retry of the proven grant', async () => {
    const s = await link(await guest())
    await expireChallenge()
    const id = await request(s, 'delete'), code = mail.at(-1)!.code
    await db.prepare(`CREATE TRIGGER fail_delete BEFORE DELETE ON accounts BEGIN SELECT RAISE(ABORT,'injected'); END`).run()
    expect((await verify(s, id, code)).status).toBe(503)
    expect((await call('/v1/account', s.token)).status).toBe(200)
    expect((await db.prepare('SELECT * FROM identities').all()).results).toHaveLength(1)
    expect((await db.prepare('SELECT * FROM auth_user').all()).results).toHaveLength(1)
    expect((await db.prepare('SELECT * FROM deletion_receipts').all()).results).toHaveLength(0)
    await db.prepare('DROP TRIGGER fail_delete').run()
    expect((await verify(s, id, code)).body).toEqual({ deleted: true })
  })
  it('rolls back a failed link without changing owners and retries safely', async () => {
    const s = await guest(), id = await request(s), code = mail.at(-1)!.code
    await db.prepare(`CREATE TRIGGER fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'injected'); END`).run()
    expect((await verify(s, id, code)).status).toBe(503)
    expect((await call('/v1/account', s.token)).status).toBe(200)
    expect((await db.prepare('SELECT * FROM identities').all()).results).toHaveLength(0)
    await db.prepare('DROP TRIGGER fail_session').run()
    expect((await verify(s, id, code)).body.userId).toBe(s.userId)
  })
  it('erases abandoned unlinked verification data on guest deletion', async () => {
    const s = await guest(); await request(s)
    expect((await call('/v1/account/delete', s.token, {})).status).toBe(200)
    for (const table of ['auth_user','auth_verification','email_challenges','auth_budgets']) {
      expect((await db.prepare(`SELECT * FROM ${table}`).all()).results).toHaveLength(0)
    }
  })
  it('confirms a lost guest deletion response only to the deleting session', async () => {
    const s = await guest(), other = await guest()
    expect((await call('/v1/account/delete', s.token, {})).body).toEqual({ deleted: true })
    expect(await call('/v1/account/delete', s.token, {})).toEqual({ status: 200, body: { deleted: true } })
    expect((await call('/v1/account', s.token)).status).toBe(401)
    expect((await call('/v1/account', other.token)).body.userId).toBe(other.userId)
    expect((await call('/v1/account/delete', 'f'.repeat(64), {})).status).toBe(401)
    expect((await call('/v1/auth/email/verify', s.token, { challengeId: 'e'.repeat(64), code: '12345678' })).status).toBe(401)
    const records = (await db.prepare('SELECT * FROM deletion_receipts').all()).results
    expect(records).toHaveLength(1)
    expect(JSON.stringify(records)).not.toContain(s.token)
    expect(JSON.stringify(records)).not.toContain(s.userId)
    await db.prepare('UPDATE deletion_receipts SET expires_at=0').run()
    expect((await call('/v1/account/delete', s.token, {})).status).toBe(401)
    await pruneDeletionReceipts(db, Date.now())
    expect((await db.prepare('SELECT * FROM deletion_receipts').all()).results).toHaveLength(0)
  })
  it('recovers a lost linked-deletion response after client restart against real D1', async () => {
    const values = new Map<string, string>()
    let loseDeletionResponse = true
    const transport: AuthFetch = async (url, init) => {
      const token = new Headers(init.headers).get('Authorization')?.slice(7)
      const input: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      const r = await call(new URL(url).pathname, token, input)
      if (r.body.deleted === true && loseDeletionResponse) {
        loseDeletionResponse = false
        throw new Error('response lost after committed deletion')
      }
      return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body }
    }
    const client = () => createD1AuthClient({ baseURL: 'https://test.invalid', fetch: transport,
      storage: { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value) }, removeItem: async key => { values.delete(key) } },
      clearCredentials: async () => { values.clear() } })
    const a = client()
    await a.startGuest(); await a.recordAudience(2000)
    await a.requestEmail('learner@example.invalid', 'link', 'sv'); await a.verifyEmail(mail.at(-1)!.code)
    const linked = await a.restore()
    const challenge = await a.requestEmail('learner@example.invalid', 'delete', 'en'), code = mail.at(-1)!.code
    await expect(a.verifyEmail(code)).rejects.toThrow('response lost')
    expect(await client().restore()).toEqual(linked)
    expect((await db.prepare('SELECT * FROM accounts').all()).results).toHaveLength(0)
    expect((await call('/v1/account/delete', linked!.token, {})).status).toBe(401)
    expect((await call('/v1/auth/email/verify', linked!.token, { challengeId: 'f'.repeat(64), code })).status).toBe(401)
    expect((await call('/v1/auth/email/verify', 'f'.repeat(64), { challengeId: challenge.challengeId, code })).status).toBe(401)
    expect(await client().verifyEmail(code)).toEqual({ deleted: true })
    expect(await client().restore()).toBeNull()
    expect((await db.prepare('SELECT * FROM identities').all()).results).toHaveLength(0)
    const replacement = await link(await guest())
    expect((await verify(linked!, challenge.challengeId, code)).body).toEqual({ deleted: true })
    expect((await call('/v1/account', replacement.token)).body.userId).toBe(replacement.userId)
  })
  it('bounds expiry cleanup and preserves usable deletion receipts', async () => {
    const now = Date.now()
    // Seed in one SQLite statement instead of paying 1,001 worker RPC round trips.
    await db.prepare(`WITH RECURSIVE rows(i) AS (
      VALUES(0) UNION ALL SELECT i+1 FROM rows WHERE i<1000
    ) INSERT INTO deletion_receipts(token_hash,expires_at) SELECT 'expired-' || i, ? FROM rows`)
      .bind(now - 1).run()
    await db.prepare('INSERT INTO deletion_receipts(token_hash,expires_at) VALUES (?,?)').bind('live', now + 1000).run()
    await pruneDeletionReceipts(db, now)
    expect((await db.prepare('SELECT * FROM deletion_receipts').all()).results).toHaveLength(2)
    await pruneDeletionReceipts(db, now)
    expect((await db.prepare('SELECT token_hash FROM deletion_receipts').all()).results).toEqual([{ token_hash: 'live' }])
  })
})
