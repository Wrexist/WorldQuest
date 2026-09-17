// Isolated CI server: local workerd/D1, synthetic mail only, never a deploy target.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { createHash } = require('node:crypto')
const { build } = require('esbuild')
const { Miniflare, convertV4MiniflareOptions } = require('miniflare')
if (process.env.CI !== 'true') throw new Error('Native account proof requires isolated CI')
const port = Number(process.env.WQ_PROOF_PORT || 8789)
const fixtureEmail = 'native-proof@example.invalid'

async function main() {
  const mailbox = new Map()
  let originalOwner = null
  const compiled = await build({ stdin: { contents: `import {createWorker} from './src/index';
    export default {fetch(request,env){return createWorker({send:async message=>{
      const result=await env.MAILBOX.fetch('https://fixture.invalid',{method:'POST',body:JSON.stringify(message)});
      if(!result.ok)throw new Error('Synthetic delivery failed');
    }}).fetch(request,env)}};`, resolveDir: path.resolve('packages/backend') },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'] })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: compiled.outputFiles[0].text,
    compatibilityDate: '2026-09-13', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'],
    bindings: { API_ENABLED: 'true', AUTH_SECRET: 'synthetic-ci-only-native-account-proof-secret' },
    serviceBindings: { MAILBOX: async request => {
      const message = await request.json()
      if (message.email !== fixtureEmail) return new Response(null, { status: 400 })
      mailbox.set(message.email, message.code)
      return new Response(null, { status: 204 })
    } } }))
  const db = await mf.getD1Database('DB')
  for (const file of fs.readdirSync('packages/backend/migrations').sort()) {
    const sql = fs.readFileSync('packages/backend/migrations/' + file, 'utf8').replace(/--[^\n]*/g, '')
    await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)))
  }
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://127.0.0.1:${port}`)
      if (incoming.method === 'GET' && ['/__proof/ui', '/__proof/ui.js'].includes(url.pathname)) {
        const script = url.pathname.endsWith('.js')
        outgoing.writeHead(200, { 'Content-Type': script ? 'text/javascript' : 'text/html', 'Cache-Control': 'no-store' })
        outgoing.end(fs.readFileSync('node_modules/.cache/d1-account-ui/' + (script ? 'ui.js' : 'index.html')))
        return
      }
      let body = ''
      for await (const chunk of incoming) { body += chunk; if (body.length > 16384) throw new Error('Body too large') }
      let result
      if (url.pathname === '/__proof/mailbox') result = Response.json({ code: mailbox.get(fixtureEmail) })
      // Codes live five minutes and sessions for a day or more. A device proof
      // cannot wait either out, and the expiry that matters is the server's, not
      // the copy the client kept. These age the real rows; they are GET because
      // Maestro's host-side http.get is the only call the flows already use.
      // One fixture mailbox and one live account exist per run, so no filter
      // beyond that is needed — this server refuses to start outside CI.
      else if (url.pathname === '/__proof/recent-send' && incoming.method === 'GET') {
        // The resend floor is 60 seconds from sent_at. Re-stamping it keeps the
        // cooldown check from depending on how fast the flow reached the button.
        const updated = await db.prepare(`UPDATE email_challenges SET sent_at=? WHERE email=? AND state='pending'`)
          .bind(Date.now(), fixtureEmail).run()
        result = Response.json({ restamped: updated.meta.changes })
      } else if (url.pathname === '/__proof/expire-challenge' && incoming.method === 'GET') {
        const updated = await db.prepare(`UPDATE email_challenges SET expires_at=? WHERE email=? AND state IN ('pending','verifying')`)
          .bind(Date.now() - 1000, fixtureEmail).run()
        result = Response.json({ expired: updated.meta.changes })
      } else if (url.pathname === '/__proof/expire-session' && incoming.method === 'GET') {
        const updated = await db.prepare(`UPDATE sessions SET expires_at=? WHERE account_id IN (SELECT id FROM accounts WHERE deleted_at IS NULL)`)
          .bind(Date.now() - 1000).run()
        result = Response.json({ expired: updated.meta.changes })
      } else if (url.pathname === '/__proof/seed' && incoming.method === 'POST') {
        const { owner } = JSON.parse(body)
        if (!/^[a-f0-9-]{36}$/.test(owner) || originalOwner !== null) throw new Error('Invalid fixture')
        originalOwner = owner
        await db.prepare('UPDATE accounts SET xp=42,coins=7 WHERE id=?').bind(owner).run()
        result = Response.json({ seeded: true })
      } else if (url.pathname === '/__proof/renewal-due' && incoming.method === 'POST') {
        const token = incoming.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
        if (!token) throw new Error('Invalid fixture credential')
        const expiresAt = Date.now() + 86400000
        const updated = await db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=? AND account_id=?')
          .bind(expiresAt, createHash('sha256').update(token).digest('hex'), originalOwner).run()
        if (updated.meta.changes !== 1) throw new Error('Missing fixture session')
        result = Response.json({ expiresAt })
      } else if (url.pathname === '/__proof/state') {
        result = Response.json({ originalOwner, remaining: await db.prepare('SELECT id FROM accounts WHERE id=?').bind(originalOwner).first(),
          identities: (await db.prepare('SELECT subject_id FROM identities').all()).results.length })
      } else result = await mf.dispatchFetch(url.href, { method: incoming.method, headers: incoming.headers, ...(body ? { body } : {}) })
      outgoing.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      outgoing.end(Buffer.from(await result.arrayBuffer()))
    } catch { outgoing.writeHead(500); outgoing.end('{"error":"PROOF_SERVER_FAILURE"}') }
  })
  // Android emulator's 10.0.2.2 maps to this runner loopback address.
  server.listen(port, '127.0.0.1', () => console.log(`Synthetic account proof ready on loopback:${port}`))
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.close(); void mf.dispose().then(() => process.exit(0)) })
}
main().catch(error => { console.error(error); process.exitCode = 1 })
