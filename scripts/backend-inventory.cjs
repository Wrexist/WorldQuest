const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = ts.createSourceFile('database.types.ts', fs.readFileSync('packages/api/src/database.types.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const database = source.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === 'Database').type
const member = (node, name) => node.members.find(item => item.name?.getText(source) === name).type
const publicSchema = member(database, 'public')
const names = name => member(publicSchema, name).members.map(node => node.name.getText(source).replace(/['"]/g, '')).sort()
const migrations = fs.readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort()
const scan = expression => migrations.flatMap(file => [...fs.readFileSync(path.join('supabase/migrations', file), 'utf8').matchAll(expression)].map(match => ({ name: match[1], migration: file })))
const data = {
  notice: 'Source inventory mapped to the selected Cloudflare Workers/D1 destination (ADR 0013). Source hosted drift remains unverified; owner confirmed no live users.',
  source: 'packages/api/src/database.types.ts and forward SQL migrations',
  tables: names('Tables').map(name => ({ source: `public.${name}`, destination: `D1 table/projection: ${name}`, status: 'full contract port required; lesson acceptance slice is not complete schema parity' })),
  views: names('Views').map(name => ({ source: `public.${name}`, destination: 'Owned, indexed and bounded D1 query behind the Worker API', status: 'port required' })),
  rpcs: names('Functions').map(name => ({ source: `public.${name}`, destination: 'Authenticated Worker handler or scheduled Worker; preserve D1 atomic batch boundary', status: 'port required' })),
  migrationFiles: migrations,
  sqlFunctionDeclarations: scan(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)/gi),
  triggers: scan(/create\s+(?:or\s+replace\s+)?trigger\s+(\w+)/gi),
  schedules: scan(/cron\.schedule\(\s*'([^']+)'/gi),
  edgeFunctions: fs.readdirSync('supabase/functions/_src').filter(name => fs.existsSync(`supabase/functions/_src/${name}/index.ts`)).map(name => ({ name, destination: name === 'submit-lesson' ? 'Worker grader with revision-guarded D1 batch' : 'Verified Worker HTTP webhook plus deduplicated D1 batch' })),
  destination: {
    provider: 'Cloudflare Workers/D1', database: 'worldquest-development',
    databaseId: '4354bdf7-8e07-46d9-93d7-a0700f2f1096', jurisdiction: 'eu',
    verifiedOn: '2026-09-13', migration: '0001_accounts_and_lessons.sql', applicationTables: 8, accounts: 0,
    verification: 'Chrome dashboard SQL result; remote migration list has no pending migrations. Worker deployed; Cloudflare API confirmed D1 binding, API disabled and workers.dev/preview URLs disabled. Source database untouched.',
    worker: 'worldquest-development-api', workerVersion: 'dc8bd22b-f2ec-4ab1-9cb7-6915dd20bb87',
    prototypeMappings: { profiles: 'accounts (partial)', lessons: 'tickets + receipts (partial)', user_facts: 'memories', review_log: 'reviews', xp_ledger: 'ledger.xp', coin_ledger: 'ledger.coins' },
  },
  hostedInspection: {
    checkedOn: '2026-09-13', project: 'worldquest-dev', region: 'eu-north-1', status: 'INACTIVE',
    schema: 'Table and migration inspection timed out. Not restored or modified.',
    functionsListed: [{ name: 'submit-lesson', version: 1, verifyJwt: true }],
    liveUserData: 'Owner confirmed only development/test data on 2026-09-13. No live-user migration required; no data deleted or migrated.',
  },
}
fs.writeFileSync('docs/engineering/backend-inventory.generated.json', JSON.stringify(data, null, 2) + '\n')
console.log(`${data.tables.length} tables, ${data.views.length} views, ${data.rpcs.length} RPCs, ${data.edgeFunctions.length} edge functions; hosted drift unresolved`)
