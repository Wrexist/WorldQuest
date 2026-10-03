const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, readdirSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const transformer = require('../apps/mobile/metro-content-transformer.cjs')
const projectRoot = path.resolve(__dirname, '../apps/mobile')
const packsRoot = path.resolve(__dirname, '../packages/content/packs')

async function runtimePack(filename, source, options = {}) {
  // Exercise Expo's real JSON worker while leaving its CommonJS wrapper executable.
  const result = await transformer.transform({ unstable_disableModuleWrapping: true },
    projectRoot, filename, source, { dev: false, minify: false, type: 'module', ...options })
  const context = { module: { exports: undefined } }
  vm.runInNewContext(result.output[0].data.code, context)
  return JSON.parse(JSON.stringify(context.module.exports))
}

function withoutAuthoring(value) {
  if (Array.isArray(value)) return value.map(withoutAuthoring)
  if (value !== null && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([key]) => !['$comment', '$schema'].includes(key))
      .map(([key, child]) => [key, withoutAuthoring(child)]))
  return value
}

test('production JSON keeps every runtime content value and citation; canonical packs retain authoring notes', async () => {
  const files = readdirSync(packsRoot, { recursive: true }).filter(file => file.endsWith('.json'))
  let annotated = 0
  for (const file of files) {
    const filename = path.join(packsRoot, file)
    const source = readFileSync(filename)
    const original = JSON.parse(source.toString('utf8'))
    if ('$comment' in original) annotated += 1
    const actual = await runtimePack(filename, source)
    assert.deepEqual(actual, withoutAuthoring(original), file)
    assert.deepEqual(readFileSync(filename), source, 'build transform must not rewrite its input')
  }
  assert.ok(annotated > 0, 'the real pack fixtures must contain authoring notes')
})

test('development and unrelated JSON keep their exact data, even in a similarly named sibling directory', async () => {
  const data = { $schema: './schema.json', $comment: 'Editor instructions',
    fact: { value: '$comment is literal content', source: { name: 'Source', url: 'https://example.org' } } }
  const source = Buffer.from(JSON.stringify(data))
  const inside = path.join(packsRoot, 'geography', 'fixture.json')
  const sibling = path.join(packsRoot + '-other', 'fixture.json')
  assert.deepEqual(await runtimePack(inside, source, { dev: true }), data)
  assert.deepEqual(await runtimePack(sibling, source), data)
  assert.deepEqual(await runtimePack(path.resolve(projectRoot, 'app.json'), source), data)
  assert.deepEqual(await runtimePack(path.relative(projectRoot, inside), source), withoutAuthoring(data))
})

test('malformed content JSON still fails the build instead of being silently dropped', async () => {
  await assert.rejects(runtimePack(path.join(packsRoot, 'broken.json'), Buffer.from('{ broken')), SyntaxError)
})
