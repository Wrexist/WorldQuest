const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
const engines = walk('packages/engines/src').filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
const contracts = ['packages/api/src/contracts.ts', 'packages/api/src/ports.ts']
let imports = 0
for (const file of [...engines, ...contracts]) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const allowedRoot = path.resolve(engines.includes(file) ? 'packages/engines/src' : 'packages/api/src') + path.sep
  function visit(node) {
    let target
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) target = node.moduleSpecifier
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')) target = node.arguments[0]
    if (target) {
      if (!ts.isStringLiteral(target)) throw new Error(`Dynamic module path in domain code: ${file}`)
      imports++
      const specifier = target.text
      const resolved = path.resolve(path.dirname(file), specifier)
      if (!specifier.startsWith('.') || !resolved.startsWith(allowedRoot)) throw new Error(`Domain import escapes its boundary: ${file}: ${specifier}`)
      if (contracts.includes(file) && !contracts.some(candidate => path.resolve(candidate).replace(/\.ts$/, '.js') === resolved)) {
        throw new Error(`Provider dependency in contract: ${file}: ${specifier}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}
console.log(`Backend boundaries: ${engines.length} engine files, ${contracts.length} contract files, ${imports} imports checked`)
