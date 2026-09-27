import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFileSync, readdirSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createWorker } from './src/index'

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
    compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { API_ENABLED: 'true', LEAGUES_ENABLED: 'true', CHALLENGES_ENABLED: 'true' } }))
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
import type { ChallengeResponse } from '@worldquest/engines'
const code=(n:number)=>n.toString(16).padStart(24,'0')
async function actAs(user:Guest,body:unknown) {
 const r=await call('/v1/challenges',user.token,body)
 expect(r.status).toBe(200)
 return await r.json() as ChallengeResponse
}
async function create(user:Guest,n=1){return (await actAs(user,{action:'create',inviteCode:code(n),locale:'en'})).active!}
async function correct(id:string){const r=await db.prepare('SELECT answers FROM friend_challenges WHERE id=?').bind(id).first<{answers:string}>();return JSON.parse(r!.answers) as string[]}
it('denies guests, protected accounts, suspended accounts and closed rollout',async()=>{
 const g=await guest(),a=await verified()
 expect((await call('/v1/challenges',g.token)).status).toBe(403)
 await db.prepare("UPDATE accounts SET audience='protected' WHERE id=?").bind(a.userId).run()
 expect((await call('/v1/challenges',a.token)).status).toBe(403)
 const b=await verified()
 await db.prepare('INSERT INTO social_restrictions(account_id,restricted_until) VALUES (?,?)').bind(b.userId,Date.now()+3600000).run()
 expect((await call('/v1/challenges',b.token)).status).toBe(403)
 const r=await createWorker().fetch(new Request('http://localhost/v1/challenges',{headers:{Authorization:`Bearer ${g.token}`}}),{DB:db,API_ENABLED:'true'})
 expect(r.status).toBe(503)
})
it('gives both players the same safe quiz, hides results and never grants XP or coins',async()=>{
 const a=await verified(),b=await verified(),c=await create(a)
 await actAs(b,{action:'join',inviteCode:code(1)})
 const one=await actAs(a,{action:'start',id:c.id}),two=await actAs(b,{action:'start',id:c.id})
 expect(one.questions).toHaveLength(10);expect(one.questions).toEqual(two.questions)
 expect(JSON.stringify(one.questions)).not.toMatch(/isCorrect|correctOptionId|factId|hint|revealAsset/)
 const answers=await correct(c.id)
 const first=await actAs(a,{action:'submit',id:c.id,answers})
 expect(first.active?.result).toBeNull();expect(first.active?.state).toBe('waiting')
 const otherAnswers=two.questions!.map((q,i)=>q.options.find(o=>o.id!==answers[i])!.id)
 const second=await actAs(b,{action:'submit',id:c.id,answers:otherAnswers})
 expect(second.active?.result).toEqual({yours:0,theirs:10,outcome:'lost'})
 await actAs(b,{action:'submit',id:c.id,answers:otherAnswers})
 expect((await call('/v1/challenges',b.token,{action:'submit',id:c.id,answers})).status).toBe(409)
 expect((await db.prepare('SELECT xp,coins FROM accounts').all()).results).toEqual([{xp:0,coins:0},{xp:0,coins:0}])
 expect(await db.prepare('SELECT COUNT(*) AS n FROM ledger').first()).toEqual({n:0})
 expect(JSON.stringify(second)).not.toContain(a.userId)
})
it('reserves one invite recipient under concurrency and hides quizzes from outsiders',async()=>{
 const a=await verified(),b=await verified(),d=await verified(),c=await create(a)
 const results=await Promise.all([b,d].map(user=>call('/v1/challenges',user.token,{action:'join',inviteCode:code(1)})))
 expect(results.map(r=>r.status).sort()).toEqual([200,409])
 const outsider=results[0]!.status===200?d:b
 expect((await call('/v1/challenges',outsider.token,{action:'start',id:c.id})).status).toBe(404)
 expect((await call('/v1/challenges',a.token,{action:'join',inviteCode:code(1)})).status).toBe(409)
})
it('caps invitations, handles create retries and expires unplayed challenges',async()=>{
 const a=await verified(),c=await create(a)
 expect((await create(a)).id).toBe(c.id)
 await create(a,2);await create(a,3)
 expect((await call('/v1/challenges',a.token,{action:'create',inviteCode:code(4),locale:'en'})).status).toBe(429)
 await db.prepare('UPDATE friend_challenges SET expires_at=0 WHERE id=?').bind(c.id).run()
 expect((await call('/v1/challenges',a.token,{action:'start',id:c.id})).status).toBe(409)
 const list=await (await call('/v1/challenges',a.token)).json() as ChallengeResponse
 expect(list.challenges.find(x=>x.id===c.id)?.result?.outcome).toBe('unplayed')
})
it('silently hides, queues reports once, and blocks future interactions in both directions',async()=>{
 const a=await verified(),b=await verified(),c=await create(a)
 await actAs(b,{action:'join',inviteCode:code(1)})
 await actAs(b,{action:'report',id:c.id,reason:'unwanted'})
 await actAs(b,{action:'report',id:c.id,reason:'unwanted'})
 expect(await db.prepare('SELECT COUNT(*) AS n FROM social_reports').first()).toEqual({n:1})
 await actAs(b,{action:'hide',id:c.id})
 const yours=await (await call('/v1/challenges',b.token)).json() as ChallengeResponse
 expect(yours.challenges).toHaveLength(0)
 const theirs=await (await call('/v1/challenges',a.token)).json() as ChallengeResponse
 expect(JSON.stringify(theirs)).not.toMatch(/declin|hidden|report/)
 await actAs(b,{action:'block',id:c.id})
 expect((await call('/v1/challenges',a.token,{action:'start',id:c.id})).status).toBe(409)
 await create(a,2)
 expect((await call('/v1/challenges',b.token,{action:'join',inviteCode:code(2)})).status).toBe(409)
 // Account deletion cascades remove both sides of private interaction data.
 await db.prepare('DELETE FROM sessions WHERE account_id=?').bind(b.userId).run()
 await db.prepare('DELETE FROM identities WHERE account_id=?').bind(b.userId).run()
 await db.prepare('DELETE FROM accounts WHERE id=?').bind(b.userId).run()
 for(const table of ['social_reports','social_blocks','challenge_hides','challenge_plays'])expect(await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).toEqual({n:0})
})
