import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFileSync, readdirSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { weekEnd, podiumCoins } from '@worldquest/engines'
import { closeLeague, fetchLeague } from './src/leagues'
import { createWorker } from './src/index'
import { setLeagueOptOut } from './src/leagues'
import { hashToken } from './src/auth'

type Guest = { userId: string; token: string; expiresAt: number }
let script: string
let mf: Miniflare
let db: D1Database
beforeAll(async () => {
  const result = await build({ entryPoints: ['src/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'] })
  script = result.outputFiles[0]!.text
})
beforeEach(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-09-13',
    compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { API_ENABLED: 'true', LEAGUES_ENABLED: 'true' } }))
  db = await mf.getD1Database('DB') as unknown as D1Database
  // Statements contain no triggers or semicolons within literals. Run the real migration.
  for (const file of readdirSync('migrations').sort()) {
    const sql = readFileSync(`migrations/${file}`, 'utf8').replace(/--[^\n]*/g, '')
    await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)))
  }
})
afterEach(async () => { await mf.dispose() })
async function call(path: string, token?: string, body?: unknown) {
  return mf.dispatchFetch(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
async function guest(): Promise<Guest> {
  const response = await call('/v1/auth/guest', undefined, {})
  expect(response.status).toBe(201)
  return await response.json() as Guest
}
async function verified() {
  const user = await guest()
  await db.batch([
    db.prepare("UPDATE accounts SET audience='eligible' WHERE id=?").bind(user.userId),
    db.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,1,0,0)')
      .bind(user.userId, 'Private real name', `${user.userId}@example.test`),
    db.prepare('INSERT INTO identities(subject_id,account_id,linked_at) VALUES (?,?,0)').bind(user.userId,user.userId),
  ])
  return user
}
async function join(user: Guest) {
  expect((await call('/v1/league/preference', user.token, { optedOut: false })).status).toBe(200)
  const response = await call('/v1/league', user.token)
  expect(response.status).toBe(200)
  return response.json() as Promise<{ members: { handle: string; weeklyXp: number; isYou: boolean }[]; division: number }>
}
describe('real D1 leagues', () => {
  it('keeps rollout closed and rechecks a revoked session inside writes', async () => {
    const a=await verified()
    const worker=createWorker()
    const response=await worker.fetch(new Request('http://localhost/v1/league', {headers:{Authorization:`Bearer ${a.token}`}}),{DB:db,API_ENABLED:'true',LEAGUES_ENABLED:'false'})
    expect(response.status).toBe(503)
    await db.prepare('DELETE FROM sessions WHERE account_id=?').bind(a.userId).run()
    await expect(setLeagueOptOut(db,a.userId,await hashToken(a.token),false,Date.now())).rejects.toThrow()
    expect(await db.prepare('SELECT COUNT(*) AS n FROM league_preferences').first()).toEqual({n:0})
    expect(await db.prepare('SELECT COUNT(*) AS n FROM transaction_guards').first()).toEqual({n:0})
  })
  it('requires verified eligible accounts, explicit consent, and strict input', async () => {
    const guestUser = await guest()
    expect(await (await call('/v1/features',guestUser.token)).json()).toEqual([])
    expect((await call('/v1/league',guestUser.token)).status).toBe(403)
    const adult = await verified()
    expect(await (await call('/v1/league',adult.token)).json()).toBeNull()
    expect(await (await call('/v1/league/preference',adult.token)).json()).toEqual({ optedOut: true })
    expect((await call('/v1/league/preference',adult.token,{ optedOut:false, xp:999 })).status).toBe(400)
    await db.prepare("UPDATE accounts SET audience='protected' WHERE id=?").bind(adult.userId).run()
    expect((await call('/v1/league/preference',adult.token,{ optedOut:false })).status).toBe(403)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM league_members').first()).toEqual({ n:0 })
  })
  it('uses only this week’s confirmed awards and exposes no account identifiers', async () => {
    const a=await verified(), b=await verified()
    await join(a); await join(b)
    const prepared=await (await call('/v1/lessons/prepare', a.token,{lessonId:'real',locale:'en',count:5})).json() as {questions: { options:{id:string;isCorrect:boolean}[] }[]}
    const answers=prepared.questions.map((q,slot)=>({slot,chosenOptionId:q.options.find(o=>o.isCorrect)!.id,elapsedMs:9000}))
    const input={lessonId:'real',answers}
    const receipt=await (await call('/v1/lessons/submit',a.token,input)).json() as {xpAwarded:number}
    expect(receipt.xpAwarded).toBeGreaterThan(0)
    await call('/v1/lessons/submit',a.token,input)
    await db.prepare('INSERT INTO ledger(account_id,lesson_id,xp,coins,earned_at) VALUES (?, ?,99999,0,0)').bind(a.userId,'historic').run()
    const board=await join(b)
    expect(board.members).toHaveLength(2)
    expect(board.members.find(m=>!m.isYou)?.weeklyXp).toBe(receipt.xpAwarded)
    const serialized=JSON.stringify(board)
    expect(serialized).not.toContain(a.userId)
    expect(serialized).not.toContain('example.test')
    expect(serialized).not.toContain('Private real name')
    expect(Object.keys(board.members[0]!).sort()).toEqual(['handle','isYou','weeklyXp'])
  })
  it('joins idempotently and freezes promotions and podium coins exactly once', async () => {
    const a=await verified()
    await call('/v1/league/preference',a.token,{optedOut:false})
    const responses=await Promise.all(Array.from({length:4},()=>call('/v1/league',a.token)))
    expect(responses.map(r=>r.status)).toEqual([200,200,200,200])
    expect(await db.prepare('SELECT COUNT(*) AS n FROM league_members').first()).toEqual({n:1})
    const now=Date.now()
    await db.prepare('INSERT INTO ledger(account_id,lesson_id,xp,coins,earned_at) VALUES (?, ?,50,0,?)').bind(a.userId,'week-xp',now).run()
    const member=await db.prepare('SELECT * FROM league_members WHERE account_id=?').bind(a.userId).first<Parameters<typeof closeLeague>[1]>()
    await Promise.all([closeLeague(db,member!,weekEnd(now)),closeLeague(db,member!,weekEnd(now))])
    expect(await db.prepare('SELECT coins FROM accounts WHERE id=?').bind(a.userId).first()).toEqual({coins:podiumCoins(1)})
    expect(await db.prepare("SELECT COUNT(*) AS n,SUM(coins) AS coins FROM ledger WHERE account_id=? AND lesson_id LIKE 'league:%'").bind(a.userId).first())
      .toEqual({n:1,coins:podiumCoins(1)})
    const board=await fetchLeague(db,a.userId,await hashToken(a.token),weekEnd(now)+100)
    expect(board?.division).toBe(2)
    expect(board?.members[0]?.weeklyXp).toBe(0)
    await closeLeague(db,member!,weekEnd(now))
    expect(await db.prepare('SELECT coins FROM accounts WHERE id=?').bind(a.userId).first()).toEqual({coins:podiumCoins(1)})
    expect(await db.prepare('SELECT COUNT(*) AS n FROM transaction_guards').first()).toEqual({n:0})
  })
  it('keeps cohorts bounded and respects opt-out at the next week', async () => {
    const users=[]
    for(let i=0;i<31;i++) { const user=await verified(); users.push(user); await join(user) }
    const rows=await db.prepare('SELECT CAST(slot/30 AS INTEGER) AS cohort,COUNT(*) AS n FROM league_members GROUP BY cohort ORDER BY cohort').all()
    expect(rows.results).toEqual([{cohort:0,n:30},{cohort:1,n:1}])
    const a=users[0]!
    await call('/v1/league/preference',a.token,{optedOut:true})
    expect(await fetchLeague(db,a.userId,await hashToken(a.token),weekEnd(Date.now())+100)).toBeNull()
    // Inactivity never creates a promotion or podium payment.
    expect(await db.prepare('SELECT next_rank,coins FROM league_results WHERE account_id=?').bind(a.userId).first()).toEqual({next_rank:0,coins:0})
  },60000)
  it('erases league records with the account and rejects revoked-session writes', async () => {
    const a=await verified(); await join(a)
    await db.prepare('DELETE FROM sessions WHERE account_id=?').bind(a.userId).run()
    expect((await call('/v1/league/preference',a.token,{optedOut:true})).status).toBe(401)
    // Exercise the same FK cascade used by the account deletion transaction.
    await db.prepare('DELETE FROM identities WHERE account_id=?').bind(a.userId).run()
    await db.prepare('DELETE FROM accounts WHERE id=?').bind(a.userId).run()
    expect(await db.prepare('SELECT COUNT(*) AS n FROM league_members').first()).toEqual({n:0})
    expect(await db.prepare('SELECT COUNT(*) AS n FROM league_preferences').first()).toEqual({n:0})
  })
})
