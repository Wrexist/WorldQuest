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
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: 'Get started' }).first().click()
    await page.waitForTimeout(400)
    const language = page.getByRole('radio', { name: 'English' }).first()
    if ((await language.count()) > 0) { await language.click(); await page.waitForTimeout(700) }
    for (let i = 0; i < 2; i++) { await page.getByText('Next', { exact: true }).first().click(); await page.waitForTimeout(400) }
    await page.getByText('Continue', { exact: true }).first().click()
    await page.waitForTimeout(600)
    await page.getByRole('radio', { name: String(new Date().getFullYear() - 30) }).click()
    await page.waitForTimeout(300)
    await page.getByText('Continue', { exact: true }).first().click()
    await page.waitForTimeout(600)
    await page.getByText('Continue', { exact: true }).first().click()
    await page.waitForTimeout(600)
    await page.getByRole('radio', { name: 'Europe' }).first().click()
    await page.waitForTimeout(700)
    await page.getByText('Continue', { exact: true }).first().click()
    await page.waitForTimeout(600)
    await page.getByText('Continue', { exact: true }).first().click()
    await page.waitForTimeout(600)
    await page.getByText('Start learning', { exact: true }).first().click()

    // ── the first lesson: issued by the Worker ────────────────────────────────
    const issued = await waitFor(async () => (await page.getByTestId('answer-option').count()) > 0, 20000)
    const guest = await one('SELECT id FROM accounts')
    const ticket = guest && await one('SELECT count(*) AS n FROM tickets WHERE account_id = ?', guest.id)
    step('the taster lesson is one the Worker issued', issued && ticket?.n >= 1, `${ticket?.n ?? 0} ticket(s) for one guest`)
    await shot('lesson-issued')

    let reported = false
    const playLesson = async (report = false) => {
      // Up to 45: twenty questions at most, then the review round re-asks each miss.
      for (let i = 0; i < 45; i++) {
        const options = await page.getByTestId('answer-option').all()
        if (options.length === 0) break
        await page.waitForTimeout(600) // credible think time; faster answers are discarded
        await options[0].click()
        await page.waitForTimeout(200)
        await page.getByRole('button', { name: 'Check' }).first().click()
        await page.waitForTimeout(300)
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
        const next = page.getByRole('button', { name: 'Continue' })
        if (await next.count()) await next.first().click()
        await page.waitForTimeout(250)
      }
      return waitFor(async () => (await page.getByTestId('summary-continue').count()) > 0, 8000)
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

    const prefetched = await waitFor(async () => {
      const row = await one(`SELECT count(*) AS n FROM tickets t WHERE account_id = ? AND NOT EXISTS
        (SELECT 1 FROM receipts r WHERE r.account_id = t.account_id AND r.lesson_id = t.lesson_id)`, guest.id)
      return row.n >= 3 ? row.n : 0
    }, 15000)
    step('lessons are saved ahead for an offline start', prefetched >= 3, `${prefetched} unanswered ticket(s)`)

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
    await page.getByText('Continue', { exact: true }).first().click()
    const offlineStart = await waitFor(async () => (await page.getByTestId('answer-option').count()) > 0, 10000)
    step('a lesson starts offline from a saved ticket', offlineStart, new URL(page.url()).pathname + new URL(page.url()).search.slice(0, 40))
    await shot('lesson-offline')
    step('the offline lesson reaches its summary', offlineStart && await playLesson())
    const stillOne = (await one('SELECT count(*) AS n FROM receipts WHERE account_id = ?', guest.id)).n === 1
    step('nothing reached the Worker while offline', stillOne)
    await page.getByTestId('summary-continue').click()
    await page.waitForTimeout(2500)
    await context.setOffline(false)
    offline = false
    const synced = await waitFor(async () => (await one('SELECT count(*) AS n FROM receipts WHERE account_id = ?', guest.id)).n === 2, 30000)
    step('the offline lesson syncs once the connection returns', synced)
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
    await page.getByRole('button', { name: 'Link your email' }).first().click()
    await page.waitForTimeout(800)
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
    await phone.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await phone.waitForTimeout(1500)
    await phone.getByRole('button', { name: 'I already have an account' }).first().click()
    await phone.waitForTimeout(1500)
    step('"I already have an account" opens sign-in on a new phone', new URL(phone.url()).pathname === '/account',
      new URL(phone.url()).pathname)
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
    step('the returning learner signs in with the emailed code', welcomed, seen.join(' → '))
    await phone.screenshot({ path: path.join(SHOTS, 'second-phone-welcome.png') })
    const sessions = await one('SELECT count(*) AS n FROM sessions WHERE account_id = ?', guest.id)
    step('the second phone holds a session for the same account', sessions.n >= 2, `${sessions.n} session(s)`)
    if (welcomed) await phone.getByRole('button', { name: 'Continue' }).first().click()
    await phone.waitForTimeout(2500)
    const landed = new URL(phone.url()).pathname
    step('and lands in the app, not back in onboarding', landed !== '/onboarding', landed)
    await phone.getByRole('tab', { name: /Profile/ }).first().click().catch(() => {})
    await phone.waitForTimeout(2500)
    const wallet2 = await one('SELECT xp FROM accounts WHERE id = ?', guest.id)
    const profileText = await phone.evaluate(() => document.body.innerText)
    step('the second phone shows the progress earned on the first', profileText.includes(String(wallet2.xp)),
      `server ${wallet2.xp} XP`)
    await phone.screenshot({ path: path.join(SHOTS, 'second-phone-profile.png') })
    await second.close()

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
