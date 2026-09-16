const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { createRequire } = require('node:module')
const path = require('node:path')

// Run hostile fixtures in a separate process: a parser regression must fail the
// test within a bound, rather than hang the test runner (or a Metro worker).
function bounded(source) {
  const result = spawnSync(process.execPath, ['-e', source], { timeout: 5000, encoding: 'utf8' })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
}

test('Metro image parser rejects zero, short, oversized and truncated ICNS entries', () => {
  bounded(`
    const assert = require('node:assert/strict');
    const size = require('image-size');
    for (const length of [0, 1, 7, 100]) {
      const b = Buffer.alloc(24); b.write('icns'); b.writeUInt32BE(24, 4);
      b.write('icp4', 8); b.writeUInt32BE(8, 12);
      b.write('icp5', 16); b.writeUInt32BE(length, 20);
      assert.throws(() => size(b), /Invalid ICNS/);
    }
    const b = Buffer.alloc(20); b.write('icns'); b.writeUInt32BE(20, 4);
    b.write('icp4', 8); b.writeUInt32BE(8, 12);
    assert.throws(() => size(b), /Invalid ICNS/);
    b.writeUInt32BE(16, 4);
    assert.equal(size(b).width, 16);
  `)
})

test('ISO boxes advance to EOF or reject incomplete headers, including JXL partial streams', () => {
  bounded(`
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const root = path.dirname(require.resolve('image-size'));
    const { findBox } = require(path.join(root, 'types/utils.js'));
    const { JXL } = require(path.join(root, 'types/jxl.js'));
    const { HEIF } = require(path.join(root, 'types/heif.js'));
    for (const length of [0, 1, 7, 100]) {
      const b = Buffer.alloc(12); b.writeUInt32BE(length); b.write('jxlp', 4);
      if (length === 0) assert.equal(findBox(b, 'jxlp', 0).size, b.length);
      else assert.equal(findBox(b, 'jxlp', 0), undefined);
      assert.throws(() => JXL.calculate(b));
      assert.throws(() => HEIF.calculate(b));
    }
    assert.equal(findBox(Buffer.alloc(7), 'jxlp', 0), undefined);
    assert.equal(findBox(Buffer.alloc(8), 'jxlp', -1), undefined);
    const b = Buffer.alloc(16); b.writeUInt32BE(8); b.write('skip', 4);
    b.writeUInt32BE(8, 8); b.write('jxlp', 12);
    assert.equal(findBox(b, 'jxlp', 0).offset, 8);
  `)
})

test('normal shipped PNG and HEIF dimensions survive the parser patch', () => {
  const size = require('image-size')
  assert.ok(size(require('node:fs').readFileSync('apps/mobile/assets/flags/SE.png')).width > 0)
  const box = (name, data) => {
    const b = Buffer.alloc(8 + data.length)
    b.writeUInt32BE(b.length); b.write(name, 4); data.copy(b, 8)
    return b
  }
  const dimensions = Buffer.alloc(12)
  dimensions.writeUInt32BE(640, 4); dimensions.writeUInt32BE(480, 8)
  const heif = Buffer.concat([
    box('ftyp', Buffer.from('heic0000')),
    box('meta', Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', box('ispe', dimensions)))])),
  ])
  assert.deepEqual(size(heif), { width: 640, height: 480, type: 'heic' })
})

test('React Navigation query decoder retains CommonJS, Unicode, plus and malformed-input behavior', () => {
  bounded(`
    const assert = require('node:assert/strict');
    const query = require('query-string');
    assert.equal(query.parse('name=G%C3%B6teborg+%26+%F0%9F%8C%8D').name, 'Göteborg & 🌍');
    assert.equal(query.parse('x=%41%FF%42').x, 'A%FFB');
    assert.equal(query.parse('x=%').x, '%');
    const decode = require('decode-uri-component');
    assert.equal(decode('a+b'), 'a b');
    assert.throws(() => decode(null), TypeError);
    const hostile = '%FE'.repeat(30000);
    assert.equal(query.parse('x=' + hostile).x, hostile);
  `)
})

test('xcode resolves patched CommonJS uuid and still generates valid project identifiers', () => {
  const requireXcode = createRequire(require.resolve('xcode'))
  assert.equal(requireXcode('uuid/package.json').version, '11.1.1')
  const project = require('xcode').project(path.resolve('unused.pbxproj'))
  project.hash = { project: { objects: {} } }
  const identifiers = Array.from({ length: 100 }, () => project.generateUuid())
  assert.equal(new Set(identifiers).size, identifiers.length)
  identifiers.forEach(id => assert.match(id, /^[A-F0-9]{24}$/))
})
