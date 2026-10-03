/** Explicit-target guest check. No saved credentials, email, submissions or rewards. */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createD1AuthClient, type AuthFetch } from '../packages/api/src/d1-auth.js'
import { createD1LearningClient } from '../packages/api/src/d1-learning.js'
import { parseCourse } from '../packages/engines/src/course/path.js'
import { difficultyRamp } from '../packages/engines/src/learning/ramp.js'

class GuestSmokeError extends Error {}

export async function smokeHostedGuest(target: string, transport: AuthFetch = fetch) {
  let endpoint: string
  try {
    const url = new URL(target)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error()
    endpoint = url.origin
  } catch { throw new GuestSmokeError('Provide one explicit HTTPS API origin without credentials, path, query or fragment.') }
  const course = parseCourse(JSON.parse(readFileSync(new URL('../packages/content/packs/courses/first-week.v1.json', import.meta.url), 'utf8')))
  const first = course.ok ? course.value.units[0]?.nodes[0] : undefined
  if (!first) throw new GuestSmokeError('The shipped introductory course is invalid.')
  const ramp = difficultyRamp('new', { practised: 0, accuracy: null, xp: 0 })
  const memory = new Map<string, string>()
  // Reject redirects before sending this newly created identity to another origin.
  const request: AuthFetch = (url, init) => transport(url, { ...init, redirect: 'error' })
  const auth = createD1AuthClient({ baseURL: endpoint, fetch: request,
    storage: { getItem: async key => memory.get(key) ?? null,
      setItem: async (key, value) => { memory.set(key, value) },
      removeItem: async key => { memory.delete(key) } },
    clearCredentials: async () => { memory.clear() },
  })
  let created = false
  let stage = 'health'
  let count = 0
  try {
    const response = await request(`${endpoint}/health`, { method: 'GET', signal: AbortSignal.timeout(10_000) })
    const health = await response.json() as { service?: unknown; backend?: unknown; apiEnabled?: unknown }
    if (!response.ok || health?.service !== 'worldquest' || health.backend !== 'cloudflare-d1' || health.apiEnabled !== true) throw new Error()
    stage = 'guest creation'
    const session = await auth.startGuest()
    created = true
    stage = 'synthetic audience declaration'
    if (await auth.recordAudience(new Date().getUTCFullYear() - 30) !== 'eligible') throw new Error()
    stage = 'issued beginner lesson validation'
    const learning = createD1LearningClient({ auth, owner: session.userId, isCurrent: () => true, fetch: request })
    const lesson = await learning.prepare({ lessonId: `hosted-smoke-${randomUUID()}`, locale: 'sv', count: 5, screenReader: false,
      focus: { entities: [...first.focus.entities], attributes: [...first.focus.attributes] }, node: first.id,
      maxModifier: ramp.maxModifier, introduceFrom: ramp.introduceFrom })
    count = lesson.questions.length
    if (count !== 5 || lesson.questions.some(question => question.typed || question.group || !question.isNew)) throw new Error()
  } catch {
    // Never print upstream response bodies, bearer tokens, account ids or errors.
    throw new GuestSmokeError(`Guest smoke failed during ${stage}.${stage === 'guest creation' ? ' If the response was lost, server-side creation and cleanup cannot be confirmed.' : ''}`)
  } finally {
    try {
      if (created) {
        try { await auth.deleteGuest() }
        catch { throw new GuestSmokeError(`Temporary guest cleanup failed after ${stage}; deletion was not confirmed.`) }
      }
    } finally { memory.clear() }
  }
  return { questions: count, deleted: true as const }
}

async function main() {
  try {
    if (process.argv.length !== 3) throw new GuestSmokeError('Usage: pnpm exec tsx scripts/smoke-hosted-guest.ts https://YOUR-API-ORIGIN')
    const result = await smokeHostedGuest(process.argv[2]!)
    console.log(`Guest smoke passed: ${result.questions} issued Swedish beginner questions validated; temporary guest deleted. No email or lesson submission.`)
  } catch (error) {
    console.error(error instanceof GuestSmokeError ? error.message : 'Guest smoke failed before completion; no sensitive error details were logged.')
    process.exitCode = 1
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
