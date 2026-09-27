import { z } from 'zod'
import { composeLesson, seededRng, handleFor, type ChallengeQuestion, type FriendChallenge, type ChallengeResponse } from '@worldquest/engines'
import { ApiError } from './contracts'
import { hashToken } from './auth'
import { authBudget } from './account-policy'
import { learningContent } from './learning-content'

const id=z.string().uuid(), inviteCode=z.string().regex(/^[a-f0-9]{24}$/)
export const challengeActionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),inviteCode,locale:z.enum(['en','sv'])}).strict(),
  z.object({action:z.literal('join'),inviteCode}).strict(),
  ...(['start','hide','block','cancel'] as const).map(action=>z.object({action:z.literal(action),id}).strict()),
  z.object({action:z.literal('submit'),id,answers:z.array(z.string().uuid()).length(10)}).strict(),
  z.object({action:z.literal('report'),id,reason:z.enum(['unwanted','cheating','other'])}).strict(),
])
const policy=`SELECT 1 FROM accounts a JOIN identities i ON i.account_id=a.id
 JOIN auth_user u ON u.id=i.subject_id JOIN sessions s ON s.account_id=a.id
 WHERE a.id=? AND a.audience='eligible' AND a.deleted_at IS NULL AND u.email_verified=1
 AND s.token_hash=? AND s.expires_at>? AND NOT EXISTS
 (SELECT 1 FROM social_restrictions r WHERE r.account_id=a.id AND r.restricted_until>?)`
export async function challengesEligible(db:D1Database,owner:string,session:string,now:number) {
  return Boolean(await db.prepare(policy).bind(owner,session,now,now).first())
}
const noBlock=`NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
 (b.account_id=c.creator AND b.target_id=c.guest) OR (b.account_id=c.guest AND b.target_id=c.creator))`
const openMember=`SELECT 1 FROM friend_challenges c WHERE c.id=? AND (c.creator=? OR c.guest=?)
 AND c.closed=0 AND c.expires_at>? AND ${noBlock}
 AND NOT EXISTS (SELECT 1 FROM challenge_hides h WHERE h.challenge_id=c.id AND h.account_id=?)`
type Row={id:string;creator:string;guest:string|null;locale:'en'|'sv';expires_at:number;questions:string;answers:string;closed:number}
type Play={account_id:string;started_at:number;finished_at:number|null;score:number|null;payload:string|null}
async function transact(db:D1Database,owner:string,session:string,now:number,statements:D1PreparedStatement[],challengeId?:string) {
  const guard=crypto.randomUUID()
  const condition=challengeId ? ` AND EXISTS (${openMember})` : ''
  const values=challengeId ? [guard,owner,session,now,now,challengeId,owner,owner,now,owner] : [guard,owner,session,now,now]
  try { await db.batch([
    db.prepare(`INSERT INTO transaction_guards(id,valid) VALUES (?,CASE WHEN EXISTS (${policy})${condition} THEN 1 ELSE 0 END)`).bind(...values),
    ...statements,db.prepare('DELETE FROM transaction_guards WHERE id=?').bind(guard),
  ]) } catch(error) {
    if(error instanceof Error && error.message.includes('wq_revision_guard'))throw new ApiError('CHALLENGE_UNAVAILABLE',409)
    throw error
  }
}
async function read(db:D1Database,owner:string,challengeId:string) {
  const row=await db.prepare('SELECT * FROM friend_challenges WHERE id=? AND (creator=? OR guest=?)').bind(challengeId,owner,owner).first<Row>()
  if(!row)throw new ApiError('NOT_FOUND',404)
  return row
}
async function present(db:D1Database,row:Row,owner:string,now:number,supplied?:{plays:Play[];blocked:boolean}):Promise<FriendChallenge> {
  const plays=supplied?.plays??(await db.prepare('SELECT * FROM challenge_plays WHERE challenge_id=?').bind(row.id).all<Play>()).results
  const yours=plays.find(p=>p.account_id===owner),theirs=plays.find(p=>p.account_id!==owner)
  const blocked=supplied?.blocked??Boolean(await db.prepare(`SELECT 1 FROM friend_challenges c WHERE c.id=? AND NOT (${noBlock})`).bind(row.id).first())
  const finished=yours?.finished_at!=null && theirs?.finished_at!=null && !blocked
  const expired=row.expires_at<=now || row.closed===1
  const reveal=(finished||expired)&&!blocked
  const elapsed=(p:Play)=>p.finished_at! - p.started_at
  let outcome:'won'|'lost'|'draw'|'unplayed'='unplayed'
  if(reveal && yours?.score!=null && theirs?.score!=null) {
    const diff=yours.score-theirs.score || elapsed(theirs)-elapsed(yours)
    outcome=diff>0?'won':diff<0?'lost':'draw'
  }
  const peer=row.creator===owner?row.guest:row.creator
  return {id:row.id,locale:row.locale,expiresAt:row.expires_at,isCreator:row.creator===owner,
    canCancel:row.creator===owner && row.guest===null && plays.length===0 && !expired && !blocked,
    peer:peer&&!blocked?handleFor(peer):null, submitted:yours?.finished_at!=null,
    state:finished?'complete':expired?'expired':yours?.finished_at!=null||blocked?'waiting':'ready',
    result:reveal?{yours:yours?.score??null,theirs:theirs?.score??null,outcome}:null}
}
export async function listChallenges(db:D1Database,owner:string,now:number):Promise<ChallengeResponse> {
  const rows=await db.prepare(`SELECT c.* FROM friend_challenges c WHERE (c.creator=? OR c.guest=?)
    AND NOT EXISTS (SELECT 1 FROM challenge_hides h WHERE h.challenge_id=c.id AND h.account_id=?)
    ORDER BY c.created_at DESC LIMIT 30`).bind(owner,owner,owner).all<Row>()
  if(rows.results.length===0)return {challenges:[]}
  const plays=await db.prepare('SELECT * FROM challenge_plays WHERE challenge_id IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(rows.results.map(r=>r.id))).all<Play&{challenge_id:string}>()
  const blocks=await db.prepare('SELECT account_id,target_id FROM social_blocks WHERE account_id=? OR target_id=?').bind(owner,owner).all<{account_id:string;target_id:string}>()
  const blockedPeers=new Set(blocks.results.map(b=>b.account_id===owner?b.target_id:b.account_id))
  return {challenges:await Promise.all(rows.results.map(row=>present(db,row,owner,now,{
    plays:plays.results.filter(p=>p.challenge_id===row.id),blocked:blockedPeers.has((row.creator===owner?row.guest:row.creator)??''),
  })))}
}
export async function challengeAction(db:D1Database,owner:string,session:string,input:z.infer<typeof challengeActionSchema>,now:number):Promise<ChallengeResponse> {
  await authBudget(db,`challenge:${owner}`,120,now)
  let challengeId:string
  let questions:ChallengeQuestion[]|undefined
  if(input.action==='create') {
    const hash=await hashToken(input.inviteCode)
    const existing=await db.prepare('SELECT id,creator,locale FROM friend_challenges WHERE invite_hash=?').bind(hash).first<{id:string;creator:string;locale:string}>()
    if(existing) {
      if(existing.creator!==owner||existing.locale!==input.locale)throw new ApiError('IDEMPOTENCY_CONFLICT',409)
      challengeId=existing.id
    } else {
      const composed=composeLesson({index:learningContent,memory:[],now,locale:input.locale,
        rng:seededRng(crypto.getRandomValues(new Uint32Array(1))[0]!),count:10,screenReaderOnly:true,modalities:['text']})
      if(composed.length!==10)throw new ApiError('CONTENT_UNAVAILABLE',503)
      const correct:string[]=[]
      questions=composed.map(q=>({promptKey:q.promptKey,promptParams:q.promptParams,options:q.options.map(o=>{
        const optionId=crypto.randomUUID();if(o.isCorrect)correct.push(optionId)
        return {id:optionId,label:o.label}
      })}))
      if(correct.length!==10)throw new ApiError('CONTENT_UNAVAILABLE',503)
      challengeId=crypto.randomUUID()
      await transact(db,owner,session,now,[db.prepare(`INSERT INTO friend_challenges
        (id,invite_hash,creator,locale,created_at,expires_at,questions,answers)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM friend_challenges c WHERE creator=?
        AND closed=0 AND expires_at>? AND (SELECT COUNT(*) FROM challenge_plays p WHERE p.challenge_id=c.id AND p.finished_at IS NOT NULL)<2)<3
        ON CONFLICT(invite_hash) DO NOTHING`).bind(challengeId,hash,owner,input.locale,now,now+48*3600000,JSON.stringify(questions),JSON.stringify(correct),owner,now)])
      const stored=await db.prepare('SELECT id,creator FROM friend_challenges WHERE invite_hash=?').bind(hash).first<{id:string;creator:string}>()
      if(!stored)throw new ApiError('CHALLENGE_LIMIT',429)
      if(stored.creator!==owner)throw new ApiError('CHALLENGE_UNAVAILABLE',409)
      challengeId=stored.id
    }
    questions=undefined // Starting, not creating, begins the timer and reveals the quiz.
  } else if(input.action==='join') {
    const hash=await hashToken(input.inviteCode)
    await transact(db,owner,session,now,[db.prepare(`UPDATE friend_challenges AS c SET guest=? WHERE invite_hash=?
      AND creator<>? AND (guest IS NULL OR guest=?) AND closed=0 AND expires_at>?
      AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.account_id=c.creator AND b.target_id=?) OR (b.account_id=? AND b.target_id=c.creator))
      AND NOT EXISTS (SELECT 1 FROM social_restrictions r WHERE r.account_id=c.creator AND r.restricted_until>?)
      AND (SELECT COUNT(*) FROM friend_challenges f WHERE f.creator=c.creator AND f.guest=? AND f.expires_at>? AND f.closed=0 AND f.id<>c.id
        AND (SELECT COUNT(*) FROM challenge_plays p WHERE p.challenge_id=f.id AND p.finished_at IS NOT NULL)<2)<3`)
      .bind(owner,hash,owner,owner,now,owner,owner,now,owner,now)])
    const joined=await db.prepare('SELECT id FROM friend_challenges WHERE invite_hash=? AND guest=? AND closed=0 AND expires_at>?').bind(hash,owner,now).first<{id:string}>()
    if(!joined)throw new ApiError('CHALLENGE_UNAVAILABLE',409)
    challengeId=joined.id
  } else {
    challengeId=input.id
    const row=await read(db,owner,challengeId)
    const peer=row.creator===owner?row.guest:row.creator
    if(input.action==='start') {
      await transact(db,owner,session,now,[db.prepare('INSERT OR IGNORE INTO challenge_plays(challenge_id,account_id,started_at) VALUES (?,?,?)').bind(challengeId,owner,now)],challengeId)
      const play=await db.prepare('SELECT finished_at FROM challenge_plays WHERE challenge_id=? AND account_id=?').bind(challengeId,owner).first<{finished_at:number|null}>()
      if(play?.finished_at==null)questions=JSON.parse(row.questions) as ChallengeQuestion[]
    } else if(input.action==='submit') {
      const quiz=JSON.parse(row.questions) as ChallengeQuestion[], correct=JSON.parse(row.answers) as string[]
      if(!input.answers.every((answer,i)=>quiz[i]!.options.some(o=>o.id===answer)))throw new ApiError('INVALID_ANSWERS',400)
      const payload=JSON.stringify(input.answers)
      const prior=await db.prepare('SELECT payload FROM challenge_plays WHERE challenge_id=? AND account_id=?').bind(challengeId,owner).first<{payload:string|null}>()
      if(prior?.payload && prior.payload!==payload)throw new ApiError('IDEMPOTENCY_CONFLICT',409)
      if(!prior)throw new ApiError('CHALLENGE_NOT_STARTED',409)
      if(!prior.payload)await transact(db,owner,session,now,[db.prepare(`UPDATE challenge_plays SET payload=?,score=?,finished_at=?
        WHERE challenge_id=? AND account_id=? AND finished_at IS NULL`).bind(payload,input.answers.filter((answer,i)=>answer===correct[i]).length,now,challengeId,owner)],challengeId)
      const saved=await db.prepare('SELECT payload FROM challenge_plays WHERE challenge_id=? AND account_id=?').bind(challengeId,owner).first<{payload:string}>()
      if(saved?.payload!==payload)throw new ApiError('IDEMPOTENCY_CONFLICT',409)
    } else if(input.action==='cancel') {
      if(row.creator!==owner)throw new ApiError('NOT_FOUND',404)
      // Check at write time: joining or starting may race the earlier membership read.
      await transact(db,owner,session,now,[db.prepare(`UPDATE friend_challenges SET closed=1
        WHERE id=? AND creator=? AND guest IS NULL
        AND NOT EXISTS (SELECT 1 FROM challenge_plays WHERE challenge_id=?)`)
        .bind(challengeId,owner,challengeId)])
      if(!(await read(db,owner,challengeId)).closed)throw new ApiError('CHALLENGE_UNAVAILABLE',409)
    } else {
      if((input.action==='block'||input.action==='report')&&!peer)throw new ApiError('NOT_FOUND',404)
      const statements:D1PreparedStatement[]=[]
      if(input.action==='block')statements.push(db.prepare('INSERT OR IGNORE INTO social_blocks(account_id,target_id) VALUES (?,?)').bind(owner,peer))
      if(input.action==='report')statements.push(db.prepare(`INSERT OR IGNORE INTO social_reports(challenge_id,account_id,target_id,reason,created_at) VALUES (?,?,?,?,?)`).bind(challengeId,owner,peer,input.reason,now))
      if(input.action!=='report')statements.push(db.prepare('INSERT OR IGNORE INTO challenge_hides(challenge_id,account_id) VALUES (?,?)').bind(challengeId,owner))
      await transact(db,owner,session,now,statements)
    }
  }
  const active=await present(db,await read(db,owner,challengeId),owner,now)
  return {...await listChallenges(db,owner,now),active,...(questions?{questions}:{})}
}
