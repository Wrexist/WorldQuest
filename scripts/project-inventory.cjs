const fs = require('node:fs')
const path = require('node:path')
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).filter(e => !['node_modules', '.git', '.convex', 'coverage'].includes(e.name)).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name).replace(/\\/g, '/')])
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const manifests = ['package.json', 'apps/mobile/package.json', ...fs.readdirSync('packages').map(p => `packages/${p}/package.json`)].filter(fs.existsSync)
const packs = walk('packages/content/packs').filter(p => p.endsWith('.json')).map(json)
const items = kind => packs.filter(p => p.kind === kind).flatMap(p => p.items)
const data = {
  notice: 'Generated source inventory, not proof of deployed, connected or device-tested behavior. Run pnpm status:generate.',
  workspaces: manifests.slice(1).map(p => ({ path: p, name: json(p).name })).sort((a,b) => a.name.localeCompare(b.name, 'en')),
  mobileDependencies: json('apps/mobile/package.json').dependencies,
  packs: packs.length,
  entities: items('entities').length,
  facts: items('facts').length,
  templates: items('templates').length,
  locales: fs.readdirSync('packages/i18n/locales').filter(p => fs.statSync(`packages/i18n/locales/${p}`).isDirectory()).sort(),
  routes: walk('apps/mobile/app').filter(p => p.endsWith('.tsx') && !p.endsWith('/_layout.tsx')),
  migrations: walk('supabase/migrations').filter(p => p.endsWith('.sql')).length,
  tests: ['apps/mobile', 'packages', 'scripts', 'supabase/functions'].flatMap(d => walk(d)).filter(p => !p.includes('/node_modules/') && /\.(test|spec)\.(ts|tsx|cjs)$/.test(p)).sort(),
}
const output = JSON.stringify(data, null, 2) + '\n'
const file = 'docs/engineering/project-inventory.generated.json'
if (process.argv.includes('--check')) {
  if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== output) throw new Error('Stale inventory: run pnpm status:generate')
} else fs.writeFileSync(file, output)
console.log(`${data.workspaces.length} workspaces; ${data.packs} packs; ${data.entities} entities; ${data.facts} facts; ${data.templates} templates; ${data.tests.length} test files`)
