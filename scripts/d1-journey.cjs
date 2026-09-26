#!/usr/bin/env node
/**
 * The main app, built for the D1 Worker, driven through a real journey against a real
 * local Worker. `pnpm e2e:d1`.
 *
 * ## Why this exists
 *
 * The Worker is proved by `packages/backend/proof.test.ts` and the app's D1 modules by
 * their unit tests, but neither runs the SHIPPED app code against the SHIPPED Worker:
 * issued lessons, the durable D1 queue, receipts driving the celebrations, the server's
 * quest on the Quests tab, and an offline lesson from a pre-fetched ticket that syncs
 * when the connection returns, then keeping it: an email linked on this phone and
 * signed into on a second one that has never run the app (U04). This is that journey
 * (E10/E11 in the execution plan), in the web export of the real bundle, with every
 * claim checked against the database.
 *
 * ## How it is wired
 *
 * The web export is built with `EXPO_PUBLIC_BACKEND=d1` pointing at this script's own
 * origin. The static server proxies `/v1/*` and `/health` to the Worker running
 * in-process on workerd (Miniflare, the same runtime the backend proofs use) with a
 * fresh local D1 and every migration applied. Same origin, so no CORS; nothing leaves
 * the machine; no account, token or cloud resource is involved.
 *
 * Web keeps credentials in memory for the page's lifetime (credentials.ts), so the
 * journey navigates inside the app and never reloads after onboarding.
 *
 * ## Email, without sending any
 *
 * The Worker runs with its real Resend adapter switched on (a local secret and sender),
 * and Miniflare's outbound service stands in for Resend: it keeps each message and
 * answers as Resend would. The journey reads the code out of the email the learner
 * would have received, so linking and signing in are driven exactly as a person would
 * drive them, and nothing leaves the machine.
 *
 * Flags: `--no-export` reuses the last D1 export (it is slow and the bundle has to be
 * rebuilt only when app code changed).
 */

const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const { spawnSync } = require('node:child_process')
const { createRequire } = require('node:module')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { browserContext } = require('./lib/browser-harness.cjs')

// Miniflare and esbuild are the backend package's own dependencies.
const backendRequire = createRequire(path.resolve(__dirname, '../packages/backend/package.json'))
const { Miniflare, convertV4MiniflareOptions } = backendRequire('miniflare')
const { build } = backendRequire('esbuild')

const PORT = Number(process.env.WQ_D1_PORT ?? 4174)
const REPO = path.resolve(__dirname, '..')
const ROOT = path.join(REPO, 'node_modules', '.cache', 'wq-web-d1')
const SHOTS = path.join(REPO, 'node_modules', '.cache', 'wq-d1-shots')
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wav': 'audio/wav',
}

/** Every email the Worker sent, captured where Resend would have received it. */
const mails = []

/** The eight digits in the newest email to `address` sent after `since`, or null. */
function codeFor(address, since) {
  const mail = mails.filter((m) => m.at >= since && m.body.to?.[0] === address).at(-1)
  const found = mail?.body.text?.match(/\b(\d{4}) (\d{4})\b/)
  return found ? found[1] + found[2] : null
}

const steps = []
const step = (name, ok, detail = '') => {
  steps.push({ name, ok })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? '  — ' + detail : ''}`)
}

function exportBundle() {
  console.log('Exporting the web bundle as a D1 build…')
  // `EXPO_PUBLIC_*` values are inlined at transform time, and Metro's transform cache
  // lives in the OS temp directory by default, shared with the ordinary (legacy) web
  // export. A private temp directory gives this build its own cache, so neither can
  // serve the other a module with the wrong backend baked in, and nothing else's cache
  // is cleared from under it.
  const tmp = path.join(REPO, 'node_modules', '.cache', 'wq-d1-tmp')
  fs.mkdirSync(tmp, { recursive: true })
  const result = spawnSync('pnpm', ['--filter', '@worldquest/mobile', 'exec', 'expo', 'export', '--platform', 'web',
    '--output-dir', '../../node_modules/.cache/wq-web-d1'], {
    cwd: REPO, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp,
      EXPO_PUBLIC_BACKEND: 'd1', EXPO_PUBLIC_D1_URL: `http://localhost:${PORT}` },
  })
  if (result.status !== 0) throw new Error(`expo export failed with ${result.status ?? result.error}`)
}

async function startWorker() {
  const bundled = await build({ entryPoints: [path.join(REPO, 'packages/backend/src/index.ts')], bundle: true, write: false,
    format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'] })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundled.outputFiles[0].text,
    compatibilityDate: '2026-09-13', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'],
    // Local stand-ins, not credentials: the Worker turns real mail on only when a Resend
    // key and a sender are both set, and signs codes with a secret of 32+ characters.
    bindings: { API_ENABLED: 'true', AUTH_SECRET: 'journey-local-signing-secret-not-a-real-one',
      RESEND_API_KEY: 're_journey_local', MAIL_FROM: 'WorldQuest <journey@example.invalid>' },
    // Resend, played locally: keep the message, answer the way Resend does. Anything
    // else the Worker tries to reach is refused, so an unexpected call fails loudly.
    outboundService: async (request) => {
      if (new URL(request.url).hostname !== 'api.resend.com') return new Response('blocked in the journey', { status: 502 })
      mails.push({ at: Date.now(), body: await request.json() })
      return new Response(JSON.stringify({ id: `journey-${mails.length}` }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } }))
  const db = await mf.getD1Database('DB')
  const dir = path.join(REPO, 'packages/backend/migrations')
  for (const file of fs.readdirSync(dir).sort()) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '')
    await db.batch(sql.split(';').map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)))
  }
  return { mf, db }
}

function serve(mf) {
  return http.createServer((req, res) => {
    const url = req.url ?? '/'
    const pathname = decodeURIComponent(url.split('?')[0])
    if (pathname.startsWith('/v1/') || pathname === '/health') {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', async () => {
        try {
          const headers = {}
          for (const name of ['authorization', 'content-type']) if (req.headers[name]) headers[name] = req.headers[name]
          const body = chunks.length ? Buffer.concat(chunks) : undefined
          const r = await mf.dispatchFetch(`http://localhost${url}`, { method: req.method, headers, ...(body ? { body } : {}) })
          res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' })
          res.end(Buffer.from(await r.arrayBuffer()))
        } catch (error) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'PROXY_FAILED', detail: String(error) }))
        }
      })
      return
    }
    let file = path.join(ROOT, pathname)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const asHtml = path.join(ROOT, pathname + '.html')
      file = fs.existsSync(asHtml) ? asHtml : path.join(ROOT, 'index.html')
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
}

/** The quest as the server will pay it, from its own row: done tasks out of five. */
function questDone(row) {
  const quest = JSON.parse(row.quest), credited = new Set(JSON.parse(row.credited))
  return quest.tasks.filter((t) => t.slot === 'perform'
    ? row.perform_done === 1
    : t.factIds.filter((id) => credited.has(id)).length >= t.target).length
}

async function waitFor(check, ms) {
  const until = Date.now() + ms
  for (;;) {
    const value = await check()
    if (value || Date.now() > until) return value
    await new Promise((r) => setTimeout(r, 250))
  }
}

;(async () => {
  if (!process.argv.includes('--no-export')) exportBundle()
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) throw new Error(`No D1 export at ${ROOT}; run without --no-export`)
  fs.mkdirSync(SHOTS, { recursive: true })
  const { mf, db } = await startWorker()
  const server = serve(mf)
  await new Promise((resolve) => server.listen(PORT, resolve))
  const browser = await chromium.launch(launchOptions())
  const context = await browser.newContext({ ...browserContext, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const errors = []
  let offline = false
  page.on('pageerror', (e) => errors.push(String(e)))
  // `--debug` prints every request the app makes to the Worker, and the page's console,
  // so a failed journey says where it went wrong rather than only that it did.
  if (process.argv.includes('--debug')) {
    page.on('response', (r) => {
      const u = new URL(r.url())
      if (u.pathname.startsWith('/v1/') || u.pathname === '/health') console.log(`    [net] ${r.request().method()} ${u.pathname} → ${r.status()}`)
    })
    page.on('requestfailed', (r) => console.log(`    [net] ${r.method()} ${r.url()} failed: ${r.failure()?.errorText}`))
    page.on('console', (m) => console.log(`    [console.${m.type()}] ${m.text().slice(0, 300)}`))
  }
  page.on('console', (m) => {
    // A failed request while the test holds the page offline is the point, not a fault.
    if (m.type() === 'error' && !(offline && /fetch|network|ERR_INTERNET_DISCONNECTED/i.test(m.text()))) errors.push('console: ' + m.text())
  })
  const body = () => page.evaluate(() => document.body.innerText)
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
  const one = async (sql, ...binds) => db.prepare(sql).bind(...binds).first()

  try {
    // ── onboarding, as a new adult learner ────────────────────────────────────
    // A walk any phone can take, at any age: the child's phone below takes it too.
    const onboard = async (on, age) => {
      await on.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
      await on.waitForTimeout(1500)
      await on.getByRole('button', { name: 'Get started' }).first().click()
      await on.waitForTimeout(400)
      const language = on.getByRole('radio', { name: 'English' }).first()
      if ((await language.count()) > 0) { await language.click(); await on.waitForTimeout(700) }
      for (let i = 0; i < 2; i++) { await on.getByText('Next', { exact: true }).first().click(); await on.waitForTimeout(400) }
      await on.getByText('Continue', { exact: true }).first().click()
      await on.waitForTimeout(600)
      await on.getByRole('radio', { name: String(new Date().getFullYear() - age) }).click()
      await on.waitForTimeout(300)
      await on.getByText('Continue', { exact: true }).first().click()
      await on.waitForTimeout(600)
      await on.getByText('Continue', { exact: true }).first().click()
      await on.waitForTimeout(600)
      await on.getByRole('radio', { name: 'Europe' }).first().click()
      await on.waitForTimeout(700)
      await on.getByText('Continue', { exact: true }).first().click()
      await on.waitForTimeout(600)
      await on.getByText('Continue', { exact: true }).first().click()
      await on.waitForTimeout(600)
      await on.getByText('Start learning', { exact: true }).first().click()
    }
    await onboard(page, 30)

    // ── the first lesson: issued by the Worker ────────────────────────────────
    const issued = await waitFor(async () => (await page.getByTestId('answer-option').count()) > 0, 20000)
    const guest = await one('SELECT id FROM accounts')
    const ticket = guest && await one('SELECT count(*) AS n FROM tickets WHERE account_id = ?', guest.id)
    step('the taster lesson is one the Worker issued', issued && ticket?.n >= 1, `${ticket?.n ?? 0} ticket(s) for one guest`)
    await shot('lesson-issued')

    let reported = false
    const playLesson = async (report = false, on = page) => {
      // Up to 45: twenty questions at most, then the review round re-asks each miss.
      for (let i = 0; i < 45; i++) {
        const options = await on.getByTestId('answer-option').all()
        if (options.length === 0) break
        await on.waitForTimeout(600) // credible think time; faster answers are discarded
        await options[0].click()
        await on.waitForTimeout(200)
        await on.getByRole('button', { name: 'Check' }).first().click()
        await on.waitForTimeout(300)
        // "Report a problem" from the answer sheet, once, on the first question.
        if (report && i === 0) {
          await page.getByText('Report a problem', { exact: true }).first().click()
          await page.waitForTimeout(400)
          await page.getByLabel('The answer is wrong').click()
          await page.getByText('Send report', { exact: true }).click()
          reported = await waitFor(async () => (await page.getByText('Thank you', { exact: true }).count()) > 0, 5000)
          await shot('report-sent')
          await page.getByText('Continue', { exact: true }).first().click()
          await page.waitForTimeout(400)
        }
        // Out of hearts: an account with history gets reviews, and a wrong review costs a
        // heart (a new fact never does), so always tapping the first option can run out.
        const finish = on.getByRole('button', { name: 'Finish here' })
        if (await finish.count()) { await finish.first().click(); await on.waitForTimeout(400); break }
        const next = on.getByRole('button', { name: 'Continue' })
        if (await next.count()) await next.first().click()
        await on.waitForTimeout(250)
      }
      return waitFor(async () => (await on.getByTestId('summary-continue').count()) > 0, 8000)
    }
    // Whatever beats a lesson earned, walked until the tab bar: the streak beat, badge
    // cards, a finished quest. Each is left by its own visible onward button.
    const walkHome = async (on) => {
      for (let i = 0; i < 8; i++) {
        if ((await on.getByRole('tab', { name: 'Home' }).count()) > 0) return true
        for (const onward of await on.getByRole('button', { name: /^(Continue|Nice)$/ }).all()) {
          if (await onward.isVisible()) { await onward.click(); break }
        }
        await on.waitForTimeout(1200)
      }
      return (await on.getByRole('tab', { name: 'Home' }).count()) > 0
    }

    step('the lesson reaches its summary', await playLesson(true))
    const report = await one('SELECT reason FROM reports WHERE account_id = ?', guest.id)
    step('a problem reported from the answer sheet reaches triage, as a reason only', reported && report?.reason === 'wrong')
    await shot('summary')
    const receipt = await waitFor(async () => (await one('SELECT count(*) AS n FROM receipts WHERE account_id = ?', guest.id))?.n === 1, 10000)
    step('the answers reach the Worker and are graded there', receipt)
    const account = await one('SELECT xp, coins, streak_current AS streak, lessons_today AS lessons FROM accounts WHERE id = ?', guest.id)
    step('the server paid XP and started the streak', account.xp > 0 && account.streak === 1 && account.lessons === 1,
      `xp ${account.xp}, streak ${account.streak}`)

    await page.getByTestId('summary-continue').click()
    const beat = await waitFor(async () => (await page.getByTestId('streak-extended').count()) > 0, 5000)
    step('the streak beat follows the day\'s first lesson', beat)
    await shot('streak-extended')
    if (beat) await page.getByTestId('streak-extended').getByText('Continue', { exact: true }).click()
    await page.waitForTimeout(1500)
    // The rest of the after-lesson chain, whichever beats this lesson earned: badge
    // cards and, for a guest adult, the create-profile ask. Walked until the tab bar.
    const asked = { profile: false, badges: 0 }
    for (let i = 0; i < 8; i++) {
      if ((await page.getByRole('tab', { name: 'Home' }).count()) > 0) break
      if ((await page.getByTestId('achievement-continue').count()) > 0) {
        asked.badges++
        await page.getByTestId('achievement-continue').click()
      } else if ((await page.getByTestId('create-profile-later').count()) > 0) {
        asked.profile = true
        await shot('create-profile')
        await page.getByTestId('create-profile-later').click()
      }
      await page.waitForTimeout(1200)
    }
    step('the after-lesson chain ends on Home', (await page.getByRole('tab', { name: 'Home' }).count()) > 0,
      `${asked.badges} badge card(s)${asked.profile ? ', the profile ask' : ''}`)

    // ── the course path is Home's primary action ──────────────────────────────
    // Laid-out steps only: expo-router keeps Home mounted, at zero size, under a lesson.
    const pathSteps = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="path-node-"]'))
      .filter((el) => el.getBoundingClientRect().height > 0)
      .map((el) => ({ state: (el.getAttribute('data-testid') ?? '').slice('path-node-'.length), label: el.getAttribute('aria-label') ?? '' })))
    await waitFor(async () => (await pathSteps()).length > 0, 5000)
    const firstPath = await pathSteps()
    step('Home shows the course path with one current step, the first',
      firstPath.length === 7 && firstPath.filter((s) => s.state === 'current').length === 1 && firstPath[0]?.state === 'current',
      firstPath.map((s) => s.state[0]).join(''))
    await shot('home-path')

    const prefetched = await waitFor(async () => {
      const row = await one(`SELECT count(*) AS n FROM tickets t WHERE account_id = ? AND NOT EXISTS
        (SELECT 1 FROM receipts r WHERE r.account_id = t.account_id AND r.lesson_id = t.lesson_id)`, guest.id)
      return row.n >= 3 ? row.n : 0
    }, 15000)
    step('lessons are saved ahead for an offline start', prefetched >= 3, `${prefetched} unanswered ticket(s)`)
    // The current step is an explicit focus — no other saved lesson may stand in for it
    // offline — so Home keeps one ticket issued for exactly that step. The Worker stores
    // the request as it parsed it: attributes before entities.
    const STEP_ONE_FOCUS = '"focus":{"attributes":["flag"],"entities":["SE","NO","US","JP","BR","KE"]}'
    const stepSaved = await waitFor(async () => (await one(`SELECT count(*) AS n FROM tickets t WHERE account_id = ?
      AND instr(request_json, ?) > 0 AND NOT EXISTS
      (SELECT 1 FROM receipts r WHERE r.account_id = t.account_id AND r.lesson_id = t.lesson_id)`, guest.id, STEP_ONE_FOCUS)).n >= 1, 15000)
    step('and the current step\'s own lesson is saved ahead too', stepSaved)

    // ── the Quests tab shows the server's quest ───────────────────────────────
    await page.getByRole('tab', { name: /Quests/ }).first().click()
    await page.waitForTimeout(2000)
    const questRow = await one('SELECT quest, credited, perform_done FROM quest_days WHERE account_id = ?', guest.id)
    const shown = ((await body()).match(/(\d) of 5 done/) ?? [])[1]
    const expected = questRow ? questDone(questRow) : -1
    step('the Quests tab shows the quest the server pays', questRow !== null && shown !== undefined && Number(shown) === expected,
      `screen ${shown ?? '?'} of 5, server ${expected} of 5`)
    await shot('quests')

    // ── an offline lesson from a pre-fetched ticket, synced on reconnect ──────
    await page.getByRole('tab', { name: /Home/ }).first().click()
    await page.waitForTimeout(1200)
    if (process.argv.includes('--debug')) {
      const queues = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('d1.lessons.v1')).map((k) => {
        const v = JSON.parse(localStorage.getItem(k) ?? 'null')
        return { key: k.slice(0, 120), tickets: v?.tickets?.map((t) => ({ locale: t.request.locale, sr: t.request.screenReader, focus: t.request.focus ?? null })), preparing: v?.preparing ?? null }
      }))
      console.log('    [debug] local D1 queues:', JSON.stringify(queues))
    }
    offline = true
    await context.setOffline(true)
    await page.waitForTimeout(1500)
    // Home's one primary action — the course path's current step — on a plane.
    await page.getByTestId('path-node-current').first().click()
    const offlineStart = await waitFor(async () => (await page.getByTestId('answer-option').count()) > 0, 10000)
    step('a lesson starts offline from a saved ticket', offlineStart, new URL(page.url()).pathname + new URL(page.url()).search.slice(0, 40))
    await shot('lesson-offline')
    step('the offline lesson reaches its summary', offlineStart && await playLesson())
    const stillOne = (await one('SELECT count(*) AS n FROM receipts WHERE account_id = ?', guest.id)).n === 1
    step('nothing reached the Worker while offline', stillOne)
    await page.getByTestId('summary-continue').click()
    await page.waitForTimeout(2500)
    // A finished lesson counts towards the step it was started from, offline too: the step
    // needs two, so it stays current, one lesson on.
    const afterOffline = await pathSteps()
    step('finishing it offline moves the path on: the step is one lesson from done',
      afterOffline[0]?.state === 'current' && /Lesson 2 of 2/.test(afterOffline[0]?.label ?? ''),
      afterOffline[0]?.label ?? 'no path')

    // Its saved ticket is spent, and two unfocused ones are still saved. The step must NOT
    // quietly play one of those under its own name: it says it needs a connection, and
    // offers the way back.
    await page.getByTestId('path-node-current').first().click()
    const refused = await waitFor(async () => (await page.getByTestId('lesson-offline-start').count()) > 0, 10000)
    step('with its own lesson spent, the step says it needs a connection rather than playing another',
      refused && (await page.getByTestId('answer-option').count()) === 0)
    await shot('lesson-offline-start')
    if (refused) await page.getByTestId('lesson-leave').click()
    await page.waitForTimeout(1200)
    step('and its way back leads Home', new URL(page.url()).pathname === '/' && (await pathSteps()).length > 0,
      new URL(page.url()).pathname)

    await context.setOffline(false)
    offline = false
    const synced = await waitFor(async () => (await one('SELECT count(*) AS n FROM receipts WHERE account_id = ?', guest.id)).n === 2, 30000)
    step('the offline lesson syncs once the connection returns', synced)
    // Graded by the Worker as the lesson it issued for the step — not a stand-in.
    const graded = await one(`SELECT count(*) AS n FROM receipts r JOIN tickets t ON t.account_id = r.account_id
      AND t.lesson_id = r.lesson_id WHERE r.account_id = ? AND instr(t.request_json, ?) > 0`, guest.id, STEP_ONE_FOCUS)
    step('and the lesson the Worker graded was the step\'s own', graded?.n === 1, `${graded?.n ?? 0} graded for the step`)
    const after = await one('SELECT xp, streak_current AS streak, lessons_today AS lessons FROM accounts WHERE id = ?', guest.id)
    step('a second lesson the same day keeps the streak at one day', after.streak === 1 && after.lessons === 2 && after.xp > account.xp,
      `xp ${account.xp} → ${after.xp}, lessons ${after.lessons}`)
    const ledger = await one('SELECT sum(xp) AS xp, sum(coins) AS coins FROM ledger WHERE account_id = ?', guest.id)
    const wallet = await one('SELECT xp, coins FROM accounts WHERE id = ?', guest.id)
    step('every XP and coin on the account is in the ledger', ledger.xp === wallet.xp && ledger.coins === wallet.coins)
    await shot('home-after')

    // ── keeping it: link an email here (U04) ──────────────────────────────────
    const EMAIL = 'journey.learner@example.invalid'
    await page.getByRole('tab', { name: /Profile/ }).first().click()
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: 'Create an account' }).first().click()
    await page.waitForTimeout(1500)
    // "Create an account" opens on the address itself now; the hub's "Link your email"
    // is only there if it did not.
    const hubLink = page.getByRole('button', { name: 'Link your email' })
    const openedOnHub = (await hubLink.count()) > 0
    if (openedOnHub) { await hubLink.first().click(); await page.waitForTimeout(800) }
    step('"Create an account" opens on the email, not on a menu', !openedOnHub)
    // Whatever the screens ask, answered as this learner, and recorded: onboarding took
    // the birth year already, so the account flow asking it again is a finding (S02).
    const seenLinking = []
    let since = Date.now()
    let linkCode = null
    for (let i = 0; i < 6; i++) {
      const heading = ((await page.getByRole('heading').allTextContents()).map((h) => h.trim()).filter(Boolean).at(-1)) ?? ''
      seenLinking.push(heading)
      if (heading === 'Your year of birth') {
        await page.getByLabel('Birth year').fill(String(new Date().getFullYear() - 30))
        await page.getByRole('button', { name: 'Continue' }).first().click()
      } else if ((await page.getByLabel('Eight-digit code').count()) > 0) {
        linkCode = await waitFor(async () => codeFor(EMAIL, since), 10000)
        break
      } else if ((await page.getByLabel('Email').count()) > 0) {
        since = Date.now()
        await page.getByLabel('Email').fill(EMAIL)
        await page.getByRole('button', { name: 'Send me a code' }).click()
      } else break
      await page.waitForTimeout(1500)
    }
    step('linking an email does not ask the birth year onboarding already took',
      !seenLinking.includes('Your year of birth'), seenLinking.join(' → '))
    step('a verification email goes out through the Resend adapter, code inside', linkCode !== null,
      mails.length > 0 ? `"${mails.at(-1).body.subject}"` : 'no email was sent')
    await page.getByLabel('Eight-digit code').fill(linkCode ?? '')
    await page.getByRole('button', { name: 'Confirm' }).click()
    const linked = await waitFor(async () => (await page.getByText('Your email is linked').count()) > 0, 10000)
    const identity = await one(`SELECT i.account_id AS account FROM identities i
      JOIN auth_user u ON u.id = i.subject_id WHERE u.email = ?`, EMAIL)
    step('the guest links that email with the code from it', linked && identity?.account === guest.id)
    await shot('linked')
    await page.getByRole('button', { name: 'Continue' }).first().click()
    await page.waitForTimeout(1500)

    // ── a second phone: sign in, and it is all there ──────────────────────────
    //
    // A fresh browser context is a phone that has never run the app. The learner does
    // what a returning learner does: "I already have an account", then whatever the
    // screens ask, answered as that person. The screens seen are recorded, so a detour
    // (a guest account to create first, a birth year asked again) is visible in the
    // output rather than silently absorbed.
    const second = await browser.newContext({ ...browserContext, viewport: { width: 390, height: 844 } })
    const phone = await second.newPage()
    phone.on('pageerror', (e) => errors.push('second phone: ' + String(e)))
    phone.on('console', (m) => { if (m.type() === 'error') errors.push('second phone console: ' + m.text()) })
    if (process.argv.includes('--debug')) {
      phone.on('response', (r) => {
        const u = new URL(r.url())
        if (u.pathname.startsWith('/v1/') || u.pathname === '/health') console.log(`    [phone net] ${r.request().method()} ${u.pathname} → ${r.status()}`)
      })
      phone.on('console', (m) => console.log(`    [phone console.${m.type()}] ${m.text().slice(0, 200)}`))
    }
    await phone.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await phone.waitForTimeout(1500)
    await phone.getByRole('button', { name: 'I already have an account' }).first().click()
    await phone.waitForTimeout(1500)
    step('"I already have an account" opens sign-in on a new phone', new URL(phone.url()).pathname === '/account',
      new URL(phone.url()).pathname)
    const signIn = async () => {
    const seen = []
    let welcomed = false
    for (let i = 0; i < 10 && !welcomed; i++) {
      const heading = ((await phone.getByRole('heading').allTextContents()).map((h) => h.trim()).filter(Boolean).at(-1)) ?? ''
      seen.push(heading)
      if (heading === 'Welcome back') { welcomed = true; break }
      if (heading === 'Start your account') await phone.getByRole('button', { name: 'Start as guest' }).click()
      else if (heading === 'Your year of birth') {
        await phone.getByLabel('Birth year').fill(String(new Date().getFullYear() - 30))
        await phone.getByRole('button', { name: 'Continue' }).first().click()
      } else if (heading === 'Your guest account') await phone.getByRole('button', { name: 'Sign in' }).first().click()
      else if (heading === 'Sign in') {
        since = Date.now()
        await phone.getByLabel('Email').fill(EMAIL)
        await phone.getByRole('button', { name: 'Send me a code' }).click()
      } else if ((await phone.getByLabel('Eight-digit code').count()) > 0) {
        const code = await waitFor(async () => codeFor(EMAIL, since), 10000)
        await phone.getByLabel('Eight-digit code').fill(code ?? '')
        await phone.getByRole('button', { name: 'Confirm' }).click()
      } else break
      await phone.waitForTimeout(1500)
    }
    return { welcomed, seen }
    }
    const { welcomed, seen } = await signIn()
    step('the returning learner signs in with the emailed code', welcomed, seen.join(' → '))
    await phone.screenshot({ path: path.join(SHOTS, 'second-phone-welcome.png') })
    const sessions = await one('SELECT count(*) AS n FROM sessions WHERE account_id = ?', guest.id)
    step('the second phone holds a session for the same account', sessions.n >= 2, `${sessions.n} session(s)`)
    if (welcomed) await phone.getByRole('button', { name: 'Continue' }).first().click()
    await phone.waitForTimeout(2500)
    const landed = new URL(phone.url()).pathname
    step('and lands in the app, not back in onboarding', landed !== '/onboarding', landed)
    // The course path came along too, derived from the server's records: the first phone
    // finished the current step's first lesson (the offline one), so this phone's path
    // opens on the step's second.
    const pathFollowed = await waitFor(async () => (await phone.getByText('Lesson 2 of 2', { exact: true }).count()) > 0, 15000)
    step('and its course path carries on from the first phone', pathFollowed,
      pathFollowed ? 'Lesson 2 of 2' : ((await phone.evaluate(() => document.body.innerText)).match(/Lesson \d of \d/) ?? ['no step shown'])[0])
    await phone.getByRole('tab', { name: /Profile/ }).first().click().catch(() => {})
    await phone.waitForTimeout(2500)
    // The coin balance, by its spoken label: Profile shows XP inside the current level
    // ("3 / 216 XP"), so the total only appears on screen by coincidence at level one.
    const wallet2 = await one('SELECT xp, coins FROM accounts WHERE id = ?', guest.id)
    const coinsShown = await waitFor(async () =>
      (await phone.getByLabel(`${wallet2.coins} coins`, { exact: true }).count()) > 0, 8000)
    step('the second phone shows the progress earned on the first', coinsShown && wallet2.coins > 0,
      `server ${wallet2.coins} coins, ${wallet2.xp} XP`)
    await phone.screenshot({ path: path.join(SHOTS, 'second-phone-profile.png') })

    // ── both phones learning on one account (E11, a slice) ────────────────────
    //
    // The second phone plays a lesson, then the first does. By then the first phone's
    // copy of the account is a revision behind; its lesson must still land exactly once,
    // and every reward must still be in the ledger.
    const receiptsNow = async () => (await one('SELECT count(*) AS n FROM receipts WHERE account_id = ?', guest.id)).n
    const before = await receiptsNow()
    await phone.getByRole('tab', { name: /Home/ }).first().click()
    await phone.waitForTimeout(1500)
    // Home's primary action is the course path's current step.
    await phone.getByTestId('path-node-current').first().click()
    const phoneStarted = await waitFor(async () => (await phone.getByTestId('answer-option').count()) > 0, 20000)
    if (phoneStarted && await playLesson(false, phone)) await phone.getByTestId('summary-continue').click()
    await walkHome(phone)
    const phoneLanded = await waitFor(async () => (await receiptsNow()) === before + 1, 20000)
    step('a lesson on the second phone lands on the shared account', phoneLanded, `${(await receiptsNow()) - before} new receipt(s)`)

    await page.bringToFront()
    await page.getByRole('tab', { name: /Home/ }).first().click()
    await page.waitForTimeout(1500)
    await page.getByTestId('path-node-current').first().click()
    const firstStarted = await waitFor(async () => (await page.getByTestId('answer-option').count()) > 0, 20000)
    if (firstStarted && await playLesson(false, page)) await page.getByTestId('summary-continue').click()
    await walkHome(page)
    const bothLanded = await waitFor(async () => (await receiptsNow()) === before + 2, 20000)
    step("and the first phone's lesson, a revision behind, lands too, once", bothLanded, `${(await receiptsNow()) - before} new receipt(s)`)
    const ledgerBoth = await one('SELECT sum(xp) AS xp, sum(coins) AS coins FROM ledger WHERE account_id = ?', guest.id)
    const walletBoth = await one('SELECT xp, coins FROM accounts WHERE id = ?', guest.id)
    step('every XP and coin from both phones is in the ledger', ledgerBoth.xp === walletBoth.xp && ledgerBoth.coins === walletBoth.coins,
      `wallet ${walletBoth.xp} XP · ledger ${ledgerBoth.xp} XP`)
    await phone.bringToFront()

    // ── out, back in, and gone (B02, web part) ────────────────────────────────
    //
    // On the second phone: Settings › Sign out ends this phone's session and starts over
    // as a new guest; "I already have an account" signs back in; then Settings › Privacy
    // › Delete account erases the account, confirmed by a code from the email, and the
    // Worker keeps nothing that names it.
    const openSettings = async () => {
      await phone.getByRole('tab', { name: /Profile/ }).first().click()
      await phone.waitForTimeout(1200)
      await phone.getByRole('button', { name: 'More' }).first().click()
      await phone.waitForTimeout(1500)
    }
    await openSettings()
    await phone.getByRole('button', { name: 'Sign out' }).first().click()
    const signedOut = await waitFor(async () => new URL(phone.url()).pathname === '/onboarding', 15000)
    const afterOut = await one('SELECT count(*) AS n FROM sessions WHERE account_id = ?', guest.id)
    step('signing out returns the phone to the start and ends only its own session', signedOut && afterOut.n === 1,
      `${afterOut.n} session(s) left for the account`)
    await phone.waitForTimeout(1500)
    await phone.getByRole('button', { name: 'I already have an account' }).first().click()
    await phone.waitForTimeout(1500)
    const again = await signIn()
    step('and signs back in with a new code', again.welcomed, again.seen.join(' → '))
    if (again.welcomed) await phone.getByRole('button', { name: 'Continue' }).first().click()
    await phone.waitForTimeout(2500)

    await openSettings()
    await phone.getByRole('button', { name: 'Delete account' }).first().click()
    await phone.waitForTimeout(1500)
    const deleting = []
    let deleted = false
    for (let i = 0; i < 8 && !deleted; i++) {
      const heading = ((await phone.getByRole('heading').allTextContents()).map((h) => h.trim()).filter(Boolean).at(-1)) ?? ''
      deleting.push(heading)
      if (heading === 'Your account is deleted') { deleted = true; break }
      if ((await phone.getByLabel('Eight-digit code').count()) > 0) {
        const code = await waitFor(async () => codeFor(EMAIL, since), 10000)
        await phone.getByLabel('Eight-digit code').fill(code ?? '')
        await phone.getByRole('button', { name: 'Delete permanently' }).click()
      } else if ((await phone.getByRole('button', { name: 'Send me a code' }).count()) > 0) {
        since = Date.now()
        await phone.getByRole('button', { name: 'Send me a code' }).click()
      } else if ((await phone.getByRole('button', { name: 'Delete account' }).count()) > 0) {
        await phone.getByRole('button', { name: 'Delete account' }).last().click()
      } else break
      await phone.waitForTimeout(1500)
    }
    await phone.screenshot({ path: path.join(SHOTS, 'second-phone-deleted.png') })
    const gone = await one(`SELECT
      (SELECT count(*) FROM sessions WHERE account_id = ?) AS sessions,
      (SELECT count(*) FROM auth_user WHERE email = ?) AS emails,
      (SELECT count(*) FROM accounts WHERE id = ? AND deleted_at IS NULL) AS live`, guest.id, EMAIL, guest.id)
    step('deleting the account, confirmed by a code, leaves the Worker nothing that names it',
      deleted && gone.sessions === 0 && gone.emails === 0 && gone.live === 0,
      `${deleting.join(' → ')} · sessions ${gone.sessions}, email rows ${gone.emails}, live ${gone.live}`)
    if (deleted) await phone.getByRole('button', { name: 'Continue' }).first().click()
    await phone.waitForTimeout(2000)
    step('and the phone starts over', new URL(phone.url()).pathname === '/onboarding', new URL(phone.url()).pathname)
    await second.close()

    // ── a child's phone (S02, S03) ────────────────────────────────────────────
    //
    // A ten-year-old onboards and plays the taster. From the age gate alone the Worker
    // must hold the account as protected, which refuses every email flow server-side,
    // and nothing on the phone may ask for an email: no account card on Profile, and no
    // link, sign-in or deletion rows in Settings.
    const known = new Set((await db.prepare('SELECT id FROM accounts').all()).results.map((r) => r.id))
    const kidContext = await browser.newContext({ ...browserContext, viewport: { width: 390, height: 844 } })
    const kid = await kidContext.newPage()
    kid.on('pageerror', (e) => errors.push('child phone: ' + String(e)))
    await onboard(kid, 10)
    const kidStarted = await waitFor(async () => (await kid.getByTestId('answer-option').count()) > 0, 20000)
    const kidBand = await waitFor(async () => {
      const rows = (await db.prepare('SELECT id, audience FROM accounts WHERE deleted_at IS NULL').all()).results
      const mine = rows.filter((r) => !known.has(r.id))
      return mine.length > 0 && mine.every((r) => r.audience === 'protected') ? mine.length : 0
    }, 10000)
    step("a child's account is protected on the server from the age gate alone", kidStarted && kidBand > 0,
      `${kidBand} new account(s), all protected`)
    if (kidStarted && await playLesson(false, kid)) await kid.getByTestId('summary-continue').click()
    await walkHome(kid)
    await kid.getByRole('tab', { name: /Profile/ }).first().click()
    await kid.waitForTimeout(1500)
    const kidProfileAsks = await kid.getByRole('button', { name: 'Create an account' }).count()
    await kid.getByRole('button', { name: 'More' }).first().click()
    await kid.waitForTimeout(1500)
    // Reached first, so a count of zero means "not offered" rather than "not there yet".
    const kidInSettings = (await kid.getByRole('heading', { name: 'Settings' }).count()) > 0
    const kidSettingsAsks = await kid.getByRole('button', { name: /^(Link your email|Sign in)$/ }).count()
    await kid.screenshot({ path: path.join(SHOTS, 'child-settings.png') })
    step('and nothing on the phone asks a child for an email', kidInSettings && kidProfileAsks === 0 && kidSettingsAsks === 0,
      `profile ${kidProfileAsks}, settings ${kidInSettings ? kidSettingsAsks : 'not reached'}`)

    // A child's progress lives on the server as a guest, so a grown-up can delete it —
    // behind a question, like every other way out of the app on this device.
    const kidIds = (await db.prepare('SELECT id FROM accounts WHERE deleted_at IS NULL').all()).results
      .map((r) => r.id).filter((id) => !known.has(id))
    await kid.getByRole('button', { name: 'Delete account' }).first().click()
    await kid.waitForTimeout(1500)
    const gated = (await kid.getByTestId('grown-up-gate').count()) > 0
    const sum = ((await kid.getByTestId('grown-up-gate').innerText().catch(() => '')).match(/(\d+) × (\d+)/) ?? [])
    if (sum.length === 3) {
      await kid.getByLabel('Answer').fill(String(Number(sum[1]) * Number(sum[2])))
      await kid.getByTestId('grown-up-continue').click()
      await kid.waitForTimeout(1500)
    }
    for (let i = 0; i < 4; i++) {
      if ((await kid.getByText('Your account is deleted', { exact: true }).count()) > 0) break
      const permanent = kid.getByRole('button', { name: 'Delete permanently' })
      if ((await permanent.count()) > 0) await permanent.first().click()
      else await kid.getByRole('button', { name: 'Delete account' }).last().click()
      await kid.waitForTimeout(1500)
    }
    const kidLeft = kidIds.length === 0 ? -1 : (await one(`SELECT count(*) AS n FROM accounts WHERE id IN (${kidIds.map(() => '?').join(',')})`, ...kidIds)).n
    step("a grown-up can delete a child's progress, behind a question", gated && sum.length === 3 && kidLeft === 0,
      `${gated ? 'asked ' + (sum[0] ?? '?') : 'no gate'} · ${kidLeft} account row(s) left`)
    await kidContext.close()

    step('no uncaught errors in the page', errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (error) {
    step('the journey ran to the end', false, String(error).split('\n')[0])
    await shot('failure').catch(() => {})
  } finally {
    await browser.close()
    server.close()
    await mf.dispose()
  }

  const failed = steps.filter((s) => !s.ok)
  console.log(`\n${steps.length - failed.length}/${steps.length} steps passed`)
  console.log(`screenshots → ${path.relative(REPO, SHOTS)}`)
  process.exit(failed.length === 0 ? 0 : 1)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
