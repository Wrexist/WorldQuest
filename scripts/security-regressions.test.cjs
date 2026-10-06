const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { createRequire } = require('node:module')
const path = require('node:path')

test('Expo RSA verification rejects extra nested algorithm fields and accepts valid signatures', () => {
  const forge = require('node-forge')
  const { privateKey: pem } = require('node:crypto').generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  })
  const privateKey = forge.pki.privateKeyFromPem(pem)
  const publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e)
  const { asn1 } = forge
  const node = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value)
  const digest = forge.md.sha256.create().update('WorldQuest signature regression').digest().bytes()
  const signature = (withNull, extras = []) => {
    const algorithm = [node(asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).bytes())]
    if (withNull) algorithm.push(node(asn1.Type.NULL, false, ''))
    algorithm.push(...extras)
    const info = node(asn1.Type.SEQUENCE, true, [
      node(asn1.Type.SEQUENCE, true, algorithm), node(asn1.Type.OCTETSTRING, false, digest),
    ])
    // A disposable test key signs malformed DER with ordinary PKCS#1 padding.
    // Verification must reject its structure, even though the digest matches.
    return privateKey.sign(asn1.toDer(info).bytes(), 'NONE')
  }
  for (const withNull of [false, true]) {
    assert.equal(publicKey.verify(digest, signature(withNull)), true)
    assert.throws(() => publicKey.verify(digest, signature(withNull, [
      node(asn1.Type.OCTETSTRING, false, 'unconsumed field'),
    ])), /valid RSASSA-PKCS1-v1_5 DigestInfo/)
  }
  assert.throws(() => publicKey.verify(digest, signature(true, [
    node(asn1.Type.NULL, false, ''),
  ])), /valid RSASSA-PKCS1-v1_5 DigestInfo/)
})

// Run hostile fixtures in a separate process: a parser regression must fail the
// test within a bound, rather than hang the test runner (or a Metro worker).
function bounded(source) {
  const result = spawnSync(process.execPath, ['-e', source], { timeout: 5000, encoding: 'utf8' })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
}

test('braces APIs reject excessive nesting below the input length limit', () => {
  bounded(`
    const assert = require('node:assert/strict');
    const braces = require('braces');
    const patterns = [
      '{'.repeat(4000) + 'x' + '}'.repeat(4000),
      '('.repeat(4000) + 'x' + ')'.repeat(4000),
      '{('.repeat(2000) + 'x' + ')}'.repeat(2000),
      '{'.repeat(4000) + 'x',
    ];
    for (const pattern of patterns) {
      assert.ok(pattern.length < 10000);
      for (const api of ['main', 'create', 'parse', 'compile', 'expand', 'stringify']) {
        const run = api === 'main' ? braces : braces[api];
        assert.throws(() => run(pattern), {
          name: 'SyntaxError', message: /exceeds max depth/,
        }, api + ' must reject nested input before exhausting the stack');
      }
    }
  `)
})

test('braces AST walkers enforce depth limits without relying on the parser', () => {
  bounded(`
    const assert = require('node:assert/strict');
    const braces = require('braces');
    // Construct each AST iteratively, without the guarded parser. A single value
    // per level exercises recursion without introducing exponential expansion.
    const makeAst = depth => {
      let child = { type: 'text', value: 'x' };
      for (let i = 0; i < depth; i++) {
        const node = {
          type: 'brace', open: true, close: true, commas: 0, ranges: 0,
          nodes: [{ type: 'open', value: '{' }, child, { type: 'close', value: '}' }],
        };
        node.nodes.forEach(child => { child.parent = node; });
        child = node;
      }
      const root = { type: 'root', nodes: [child] };
      child.parent = root;
      return root;
    };
    for (const api of ['compile', 'expand', 'stringify']) {
      for (const depth of [101, 4000]) {
        for (const maxDepth of [undefined, Infinity, Number.MAX_SAFE_INTEGER, NaN]) {
          for (const subtree of [false, true]) {
            const ast = makeAst(depth);
            assert.throws(() => braces[api](subtree ? ast.nodes[0] : ast, { maxDepth }), {
              name: 'RangeError', message: /exceeds max depth/,
            }, api + ' must guard caller-supplied ASTs');
          }
        }
      }
      assert.throws(() => braces[api](makeAst(4), { maxDepth: 3 }), {
        name: 'RangeError', message: /exceeds max depth/,
      });
      for (const depth of [3, 100]) {
        const literal = '{'.repeat(depth) + 'x' + '}'.repeat(depth);
        const expected = api === 'expand' ? [literal] : literal;
        assert.deepEqual(braces[api](makeAst(depth), { maxDepth: depth }), expected);
      }
    }
  `)
})

test('braces accepts the depth boundary and allows only stricter depth options', () => {
  bounded(`
    const assert = require('node:assert/strict');
    const braces = require('braces');
    for (const api of ['main', 'create', 'parse', 'compile', 'expand', 'stringify']) {
      const run = api === 'main' ? braces : braces[api];
      for (const maxDepth of [undefined, Infinity, Number.MAX_SAFE_INTEGER, NaN]) {
        const pattern = '{'.repeat(101) + 'x' + '}'.repeat(101);
        assert.throws(() => run(pattern, { maxDepth }), {
          name: 'SyntaxError', message: /exceeds max depth/,
        }, api + ' must retain the hard depth ceiling');
      }
      assert.throws(() => run('{{{{x}}}}', { maxDepth: 3 }), {
        name: 'SyntaxError', message: /exceeds max depth/,
      });
      for (const [pattern, maxDepth] of [
        ['{'.repeat(100) + 'x' + '}'.repeat(100), 100],
        ['('.repeat(100) + 'x' + ')'.repeat(100), 100],
        ['{('.repeat(50) + 'x' + ')}'.repeat(50), 100],
        ['{{{x}}}', 3],
        ['{x}(y)'.repeat(110), 1],
      ]) {
        const result = run(pattern, { maxDepth });
        if (api === 'parse') assert.equal(braces.stringify(result), pattern);
        else assert.deepEqual(result, api === 'main' || api === 'expand' ? [pattern] : pattern);
      }
    }
  `)
})

test('braces preserves nested globs, ranges and escaped or quoted literals', () => {
  const braces = require('braces')
  const pattern = 'src/{client,{shared,server}}/*.{js,ts}'
  const compiled = 'src/(client|(shared|server))/*.(js|ts)'
  const expanded = [
    'src/client/*.js', 'src/client/*.ts', 'src/shared/*.js',
    'src/shared/*.ts', 'src/server/*.js', 'src/server/*.ts',
  ]
  assert.deepEqual(braces(pattern), [compiled])
  assert.equal(braces.create(pattern), compiled)
  assert.equal(braces.compile(pattern), compiled)
  assert.deepEqual(braces(pattern, { expand: true }), expanded)
  assert.deepEqual(braces.create(pattern, { expand: true }), expanded)
  assert.deepEqual(braces.expand(pattern), expanded)
  assert.equal(braces.stringify(braces.parse(pattern)), pattern)
  assert.deepEqual(braces.expand('file-{01..03}'), ['file-01', 'file-02', 'file-03'])
  assert.equal(braces.compile('file-{01..03}'), 'file-(0[1-3])')
  assert.deepEqual(braces.expand('{a..c}'), ['a', 'b', 'c'])
  const literal = '{'.repeat(101) + 'x' + '}'.repeat(101)
  for (const input of ['\\{'.repeat(101) + 'x' + '\\}'.repeat(101), '"' + literal + '"']) {
    assert.deepEqual(braces(input, { maxDepth: 0 }), [literal])
    assert.deepEqual(braces.expand(input, { maxDepth: 0 }), [literal])
    assert.equal(braces.stringify(input, { maxDepth: 0 }), literal)
  }
})

test('micromatch resolves guarded braces and retains ordinary glob behavior', () => {
  bounded(`
    const assert = require('node:assert/strict');
    const { createRequire } = require('node:module');
    const requireMicromatch = createRequire(require.resolve('micromatch'));
    assert.equal(requireMicromatch.resolve('braces'), require.resolve('braces'));
    const micromatch = require('micromatch');
    const pattern = '{'.repeat(4000) + 'x' + '}'.repeat(4000);
    for (const api of ['braces', 'braceExpand']) {
      assert.throws(() => micromatch[api](pattern), {
        name: 'SyntaxError', message: /exceeds max depth/,
      });
    }
    assert.deepEqual(micromatch.braces('src/{client,{shared,server}}/*.ts'),
      ['src/(client|(shared|server))/*.ts']);
    assert.deepEqual(micromatch.braceExpand('src/{client,{shared,server}}/*.ts'),
      ['src/client/*.ts', 'src/shared/*.ts', 'src/server/*.ts']);
    assert.deepEqual(micromatch(
      ['src/client/a.ts', 'src/shared/b.ts', 'src/server/c.js', 'test/a.ts'],
      'src/{client,{shared,server}}/*.ts'
    ), ['src/client/a.ts', 'src/shared/b.ts']);
  `)
})

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

test('shell quoting rejects line terminators after comment tokens', () => {
  const { quote, parse } = require('shell-quote')
  for (const separator of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => quote(['echo', 'ok', { comment: 'note' }, 'a' + separator + 'echo unsafe;#']), TypeError)
  }
  const tokens = ['echo', 'hello world', "it's safe", 'plain']
  assert.deepEqual(parse(quote(tokens)), tokens)
  assert.equal(typeof quote(['echo', 'ok', { comment: 'ordinary comment' }]), 'string')
})

test('sprintf numeric precision stays bounded without aborting formatting', () => {
  const { sprintf, vsprintf } = require('sprintf-js')
  const value = 1.25
  for (const [specifier, format] of [['f', n => value.toFixed(n)], ['e', n => value.toExponential(n)], ['g', n => value.toPrecision(n)]]) {
    for (const precision of ['101', '999999', '9'.repeat(400)]) {
      assert.equal(sprintf('%.' + precision + specifier, value), format(100))
    }
    for (const precision of [1, 2, 20, 100]) {
      assert.equal(sprintf('%.' + precision + specifier, value), format(precision))
    }
  }
  assert.equal(sprintf('%.0f', value), '1')
  assert.equal(sprintf('%.0e', value), '1e+0')
  assert.equal(sprintf('%.0g', value), '1')
  assert.equal(sprintf('%(value).2f', { value }), '1.25')
  assert.equal(vsprintf('%s: %04d / %.2f', ['item', 7, value]), 'item: 0007 / 1.25')
  assert.equal(sprintf('%.999s', 'ordinary text'), 'ordinary text')
})

test('indexed source-map offsets beyond the code do not block the event loop', () => {
  const script = `
    const assert = require('node:assert/strict');
    const { SourceMapConsumer, SourceNode } = require('source-map-js');
    const map = line => ({ version: 3, sections: [{
      offset: { line, column: 0 },
      map: { version: 3, sources: ['original.js'], sourcesContent: ['hello'], names: [], mappings: 'AAAA' }
    }] });
    assert.throws(() => new SourceMapConsumer(map(1e9)), /Section offset line/);
    const consumer = new SourceMapConsumer(map(1e7));
    assert.equal(SourceNode.fromStringWithSourceMap('hello', consumer).toString(), 'hello');
  `
  const result = spawnSync(process.execPath, ['-e', script], { timeout: 3000, encoding: 'utf8' })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
})
