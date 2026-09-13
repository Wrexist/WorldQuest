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
  notice: 'Source inventory and proposed responsibility mapping. Hosted drift and user-data reconciliation remain unverified.',
  source: 'packages/api/src/database.types.ts and forward SQL migrations',
  tables: names('Tables').map(name => ({ source: `public.${name}`, destination: `Convex collection/projection: ${name}`, status: 'port required' })),
  views: names('Views').map(name => ({ source: `public.${name}`, destination: 'Owned, indexed Convex query projection', status: 'port required' })),
  rpcs: names('Functions').map(name => ({ source: `public.${name}`, destination: 'Authenticated Convex mutation or internal scheduled job; preserve transaction boundary', status: 'port required' })),
  migrationFiles: migrations,
  sqlFunctionDeclarations: scan(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)/gi),
  triggers: scan(/create\s+(?:or\s+replace\s+)?trigger\s+(\w+)/gi),
  schedules: scan(/cron\.schedule\(\s*'([^']+)'/gi),
  edgeFunctions: fs.readdirSync('supabase/functions/_src').filter(name => fs.existsSync(`supabase/functions/_src/${name}/index.ts`)).map(name => ({ name, destination: name === 'submit-lesson' ? 'Convex transactional grading mutation' : 'Verified HTTP webhook plus deduplicated internal transaction' })),
  hostedInspection: {
    checkedOn: '2026-09-13', project: 'worldquest-dev', region: 'eu-north-1', status: 'INACTIVE',
    schema: 'Table and migration inspection timed out. Not restored or modified.',
    functionsListed: [{ name: 'submit-lesson', version: 1, verifyJwt: true }],
    liveUserData: 'Owner confirmed only development/test data on 2026-09-13. No live-user migration required; no data deleted or migrated.',
  },
}
fs.writeFileSync('docs/engineering/backend-inventory.generated.json', JSON.stringify(data, null, 2) + '\n')
console.log(`${data.tables.length} tables, ${data.views.length} views, ${data.rpcs.length} RPCs, ${data.edgeFunctions.length} edge functions; hosted drift unresolved`)
