const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')

// Keep the registry findings visible. Only these specific installed, verified
// backports may be accepted; an unrelated advisory or registry failure is fatal.
const policy = require('../patches/security-policy.json')
const manifest = require('../package.json')
assert.ok(Date.now() < Date.parse(policy.reviewBefore), 'Security backports need their scheduled review')
for (const patch of policy.patches) {
  assert.equal(manifest.pnpm.patchedDependencies[patch.package], patch.file)
  const hash = data => createHash('sha256').update(data).digest('hex')
  // Normalize checkout EOL: Git may materialize text patches with CRLF on Windows.
  assert.equal(hash(fs.readFileSync(patch.file, 'utf8').replace(/\r\n/g, '\n')), patch.sha256)
  for (const [relative, expected] of Object.entries(patch.installedFiles)) {
    const installed = path.join(path.dirname(require.resolve(patch.module + '/package.json')), relative)
    assert.equal(hash(fs.readFileSync(installed, 'utf8').replace(/\r\n/g, '\n')), expected, installed)
  }
}
const test = spawnSync(process.execPath, ['--test', 'scripts/security-regressions.test.cjs'], { stdio: 'inherit' })
assert.equal(test.status, 0, 'Backport regressions failed')
assert.ok(process.env.npm_execpath, 'Run through pnpm security:check')
const scan = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--prod', '--json'], {
  encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024,
})
assert.ifError(scan.error)
const audit = JSON.parse(scan.stdout)
assert.ok(audit.advisories && audit.metadata?.vulnerabilities, 'Registry returned no valid audit report')
assert.ok(scan.status === 0 || scan.status === 1, `Audit command failed: ${scan.status}`)
const findings = Object.values(audit.advisories).map(a => ({
  id: a.github_advisory_id, module: a.module_name, severity: a.severity,
  versions: [...new Set(a.findings.map(f => f.version))], url: a.url,
}))
const unexpected = findings.filter(a => !policy.patches.some(p =>
  p.module === a.module && p.advisories.includes(a.id) && a.versions.every(v => p.package === `${a.module}@${v}`)))
const report = { scannedAt: new Date().toISOString(), command: 'pnpm audit --prod --json',
  metadata: audit.metadata, findings, unexpected, reviewBefore: policy.reviewBefore,
  note: 'Registry does not recognize local patches. Accepted findings require patch and installed-file hashes plus behavioral regressions.' }
fs.mkdirSync('node_modules/.cache', { recursive: true })
fs.writeFileSync('node_modules/.cache/security-report.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
assert.equal(unexpected.length, 0, 'Unexpected security findings; review node_modules/.cache/security-report.json')
