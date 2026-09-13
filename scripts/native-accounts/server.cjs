// Isolated CI server: local workerd/D1, synthetic mail only, never a deploy target.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { build } = require('esbuild')
const { Miniflare, convertV4MiniflareOptions } = require('miniflare')
if (process.env.CI !== 'true') throw new Error('Native account proof requires isolated CI')

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
      if (message.email !== 'native-proof@example.invalid') return new Response(null, { status: 400 })
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
      const url = new URL(incoming.url, 'http://127.0.0.1:8789')
      let body = ''
      for await (const chunk of incoming) { body += chunk; if (body.length > 16384) throw new Error('Body too large') }
      let result
      if (url.pathname === '/__proof/mailbox') result = Response.json({ code: mailbox.get('native-proof@example.invalid') })
      else if (url.pathname === '/__proof/seed' && incoming.method === 'POST') {
        const { owner } = JSON.parse(body)
        if (!/^[a-f0-9-]{36}$/.test(owner) || originalOwner !== null) throw new Error('Invalid fixture')
        originalOwner = owner
        await db.prepare('UPDATE accounts SET xp=42,coins=7 WHERE id=?').bind(owner).run()
        result = Response.json({ seeded: true })
      } else if (url.pathname === '/__proof/state') {
        result = Response.json({ originalOwner, remaining: await db.prepare('SELECT id FROM accounts WHERE id=?').bind(originalOwner).first(),
          identities: (await db.prepare('SELECT subject_id FROM identities').all()).results.length })
      } else result = await mf.dispatchFetch(url.href, { method: incoming.method, headers: incoming.headers, ...(body ? { body } : {}) })
      outgoing.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      outgoing.end(Buffer.from(await result.arrayBuffer()))
    } catch { outgoing.writeHead(500); outgoing.end('{"error":"PROOF_SERVER_FAILURE"}') }
  })
  // Android emulator's 10.0.2.2 maps to this runner loopback address.
  server.listen(8789, '127.0.0.1', () => console.log('Synthetic account proof ready on loopback:8789'))
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.close(); void mf.dispose().then(() => process.exit(0)) })
}
main().catch(error => { console.error(error); process.exitCode = 1 })
