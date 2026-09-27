import { COHORT_SIZE, PROMOTED, RELEGATED, handleFor, podiumCoins, rankFromIndex, weekStart, weekEnd, weekId } from '@worldquest/engines'
import { ApiError } from './contracts'

// Rechecked inside every mutation transaction, not just by the HTTP router.
const eligible = `SELECT 1 FROM accounts a JOIN identities i ON i.account_id=a.id
  JOIN auth_user u ON u.id=i.subject_id JOIN sessions s ON s.account_id=a.id
  WHERE a.id=? AND a.audience='eligible' AND a.deleted_at IS NULL
  AND u.email_verified=1 AND s.token_hash=? AND s.expires_at>?`
export async function leagueEligible(db: D1Database, owner: string, session: string, now: number) {
  return Boolean(await db.prepare(eligible).bind(owner, session, now).first())
}
const guard = (db: D1Database, id: string, owner: string, session: string, now: number) =>
  db.prepare(`INSERT INTO transaction_guards(id,valid) VALUES (?,CASE WHEN EXISTS (${eligible}) THEN 1 ELSE 0 END)`)
    .bind(id, owner, session, now)
export async function leagueOptOut(db: D1Database, owner: string) {
  const p = await db.prepare('SELECT opted_out FROM league_preferences WHERE account_id=?').bind(owner).first<{ opted_out: number }>()
  return p?.opted_out !== 0
}
export async function setLeagueOptOut(db: D1Database, owner: string, session: string, out: boolean, now: number) {
  const id = crypto.randomUUID()
  await db.batch([guard(db, id, owner, session, now),
    db.prepare(`INSERT INTO league_preferences(account_id,opted_out) VALUES (?,?)
      ON CONFLICT(account_id) DO UPDATE SET opted_out=excluded.opted_out`).bind(owner, out ? 1 : 0),
    db.prepare('DELETE FROM transaction_guards WHERE id=?').bind(id)])
  return { optedOut: out }
}
type Member = { account_id: string; week: number; rank: number; band: number; slot: number; handle: string }

/** Freeze a whole cohort in one SQLite transaction. Repeated/concurrent closes pay once.
 * Old ledger rows are deliberately excluded: no invented historical timestamps.
 * Opt-out affects the next placement; an existing week finishes as stated in Settings.
 */
export async function closeLeague(db: D1Database, member: Member, now: number) {
  if (weekEnd(member.week) > now) return
  const { week, rank, band } = member
  const cohort = Math.floor(member.slot / COHORT_SIZE)
  await db.batch([
    db.prepare(`INSERT INTO league_results(account_id,week,next_rank,coins)
      WITH scores AS (
        SELECT m.account_id,m.handle,COALESCE(SUM(l.xp),0) AS xp
        FROM league_members m LEFT JOIN ledger l ON l.account_id=m.account_id AND l.earned_at>=? AND l.earned_at<?
        WHERE m.week=? AND m.rank=? AND m.band=? AND m.slot>=? AND m.slot<?
        GROUP BY m.account_id,m.handle
      ), active AS (
        SELECT account_id,ROW_NUMBER() OVER(ORDER BY xp DESC,handle ASC) AS pos,COUNT(*) OVER() AS size
        FROM scores WHERE xp>0
      ) SELECT s.account_id,?,CASE WHEN a.pos<=? THEN MIN(20,?+1)
        WHEN a.pos>a.size-? THEN MAX(0,?-1) ELSE ? END,
        CASE a.pos WHEN 1 THEN ? WHEN 2 THEN ? WHEN 3 THEN ? ELSE 0 END
      FROM scores s LEFT JOIN active a ON a.account_id=s.account_id
      WHERE NOT EXISTS (SELECT 1 FROM league_closures WHERE week=? AND rank=? AND band=? AND cohort=?)
      ON CONFLICT(account_id,week) DO NOTHING`)
      .bind(week, weekEnd(week), week, rank, band, cohort * COHORT_SIZE, (cohort + 1) * COHORT_SIZE,
        week, PROMOTED, rank, RELEGATED, rank, rank, podiumCoins(1), podiumCoins(2), podiumCoins(3), week, rank, band, cohort),
    db.prepare('INSERT OR IGNORE INTO league_closures(week,rank,band,cohort) VALUES (?,?,?,?)').bind(week, rank, band, cohort),
    // Colon is outside the client lesson-id alphabet: learners cannot reserve a reward id.
    db.prepare(`INSERT INTO ledger(account_id,lesson_id,xp,coins,earned_at)
      SELECT account_id,'league:' || week,0,coins,? FROM league_results WHERE paid=0 AND coins>0`)
      .bind(now),
    db.prepare(`UPDATE accounts SET coins=coins+(SELECT SUM(r.coins) FROM league_results r WHERE r.account_id=accounts.id AND r.paid=0),
      revision=revision+1 WHERE id IN (SELECT account_id FROM league_results WHERE paid=0)`),
    db.prepare('UPDATE league_results SET paid=1 WHERE paid=0'),
  ])
}

/** Bounded hourly sweep also settles rewards for learners who do not reopen the app. */
export async function settleLeagues(db: D1Database, now: number) {
  const pending = await db.prepare(`SELECT m.* FROM league_members m
    WHERE m.week<? AND NOT EXISTS (SELECT 1 FROM league_closures c
      WHERE c.week=m.week AND c.rank=m.rank AND c.band=m.band AND c.cohort=CAST(m.slot/? AS INTEGER))
    GROUP BY m.week,m.rank,m.band,CAST(m.slot/? AS INTEGER) ORDER BY m.week LIMIT 10`)
    .bind(weekStart(now), COHORT_SIZE, COHORT_SIZE).all<Member>()
  for (const member of pending.results) await closeLeague(db, member, now)
}

/** Placement uses server activity and at most thirty real learners. No synthetic rows. */
export async function fetchLeague(db: D1Database, owner: string, session: string, now: number) {
  const week = weekStart(now)
  const previous = await db.prepare('SELECT * FROM league_members WHERE account_id=? AND week<? ORDER BY week DESC LIMIT 1')
    .bind(owner, week).first<Member>()
  if (previous) await closeLeague(db, previous, now)
  let member = await db.prepare('SELECT * FROM league_members WHERE account_id=? AND week=?').bind(owner, week).first<Member>()
  if (!member && !await leagueOptOut(db, owner)) {
    const result = await db.prepare('SELECT next_rank FROM league_results WHERE account_id=? ORDER BY week DESC LIMIT 1')
      .bind(owner).first<{ next_rank: number }>()
    const rank = result?.next_rank ?? 0
    // Recent active days, not an invented XP threshold or a client-reported skill level.
    const activity = await db.prepare('SELECT COUNT(DISTINCT CAST(earned_at/86400000 AS INTEGER)) AS days FROM ledger WHERE account_id=? AND earned_at>=? AND earned_at<?')
      .bind(owner, week - 7 * 86400000, week).first<{ days: number }>()
    const band = activity?.days ?? 0
    // Curated handles can collide. Retry with deterministic salt, never accept free text.
    for (let salt = 0; salt < 20 && !member; salt++) {
      const id = crypto.randomUUID()
      try {
        await db.batch([guard(db, id, owner, session, now),
          db.prepare(`INSERT INTO league_members(account_id,week,rank,band,slot,handle)
            SELECT ?,?,?,?,COALESCE(MAX(slot)+1,0),? FROM league_members WHERE week=? AND rank=? AND band=?
            HAVING EXISTS (SELECT 1 FROM league_preferences WHERE account_id=? AND opted_out=0)
            ON CONFLICT(account_id,week) DO NOTHING`)
            .bind(owner, week, rank, band, handleFor(owner, salt), week, rank, band, owner),
          db.prepare('DELETE FROM transaction_guards WHERE id=?').bind(id)])
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('league_members.week, league_members.handle')) throw error
      }
      member = await db.prepare('SELECT * FROM league_members WHERE account_id=? AND week=?').bind(owner, week).first<Member>()
      if (await leagueOptOut(db, owner)) break
    }
    if (!member && !await leagueOptOut(db, owner)) throw new ApiError('SERVICE_UNAVAILABLE', 503)
  }
  if (!member) return null
  const start = Math.floor(member.slot / COHORT_SIZE) * COHORT_SIZE
  const rows = await db.prepare(`SELECT m.handle,COALESCE(SUM(l.xp),0) AS weeklyXp,m.account_id=? AS isYou
    FROM league_members m JOIN accounts a ON a.id=m.account_id
    JOIN identities i ON i.account_id=a.id JOIN auth_user u ON u.id=i.subject_id
    LEFT JOIN ledger l ON l.account_id=m.account_id AND l.earned_at>=? AND l.earned_at<?
    WHERE m.week=? AND m.rank=? AND m.band=? AND m.slot>=? AND m.slot<?
      AND a.deleted_at IS NULL AND a.audience='eligible' AND u.email_verified=1
    GROUP BY m.account_id,m.handle HAVING weeklyXp>0 OR isYou=1
    ORDER BY weeklyXp DESC,m.handle ASC`).bind(owner, week, weekEnd(now), week, member.rank, member.band, start, start + COHORT_SIZE)
    .all<{ handle: string; weeklyXp: number; isYou: number }>()
  return { weekId: weekId(now), ...rankFromIndex(member.rank),
    members: rows.results.map(r => ({ ...r, isYou: r.isYou === 1 })) }
}
