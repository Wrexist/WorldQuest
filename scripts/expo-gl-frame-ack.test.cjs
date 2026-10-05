const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Exercise the installed dependency, so forgetting the pnpm patch fails the check.
const expo = path.dirname(require.resolve('expo-gl/package.json'))
const read = name => fs.readFileSync(path.join(expo, name), 'utf8')
function block(source, prefix) {
  const start = source.indexOf(prefix)
  assert.notEqual(start, -1, `Missing patched method: ${prefix}`)
  let depth = 0, opened = false
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') { depth++; opened = true }
    if (source[i] === '}' && --depth === 0 && opened) return source.slice(start, i + 1)
  }
  throw Error('Unclosed method')
}
function wrapper(manager) {
  const source = read('build/GLView.js')
  const method = block(source, 'static async waitForFrameAsync(exgl)')
  const contextId = block(source, 'const getContextId = (exgl) =>')
  return new Function('ExponentGLObjectManager', 'UnavailabilityError', `${contextId}; return class { ${method} }`)(manager, Error)
}

test('frame acknowledgement stays pending until native completion and accepts the actual context id', async () => {
  let complete, nativeId, settled = false
  const View = wrapper({ waitForFrameAsync: id => {
    nativeId = id
    return new Promise(resolve => { complete = resolve })
  } })
  const pending = View.waitForFrameAsync({ contextId: 7 }).then(() => { settled = true })
  await Promise.resolve()
  assert.equal(nativeId, 7)
  assert.equal(settled, false)
  complete()
  await pending
  assert.equal(settled, true)
})

test('frame acknowledgement propagates native loss and rejects unavailable or invalid contexts', async () => {
  await assert.rejects(wrapper({}).waitForFrameAsync(7))
  const View = wrapper({ waitForFrameAsync: () => Promise.reject(new Error('context destroyed')) })
  await assert.rejects(View.waitForFrameAsync(7), /context destroyed/)
  await assert.rejects(View.waitForFrameAsync(0), /Invalid EXGLContext/)
})

test('native Android frame promises settle once across completion, destruction and GPU failure', t => {
  const javac = spawnSync('javac', ['-version'], { encoding: 'utf8' })
  if (javac.error?.code === 'ENOENT') {
    t.skip('JDK unavailable; Android native acceptance compiles the patched implementation')
    return
  }
  assert.equal(javac.status, 0, javac.stderr)
  const java = read('android/src/main/java/expo/modules/gl/GLContext.java')
  const wait = block(java, 'public void waitForFrameAsync(final Promise promise)')
  const destroy = block(java, 'public void destroy()').split('    if (mGLThread != null)')[0]
    .replace('public void destroy()', 'public void destroyPending()') + '} '
  // Compile the real patched methods, substituting only the GL/Promise boundaries.
  // Native platform builds remain necessary; this verifies queue/lifecycle semantics.
  const source = `import java.util.*;
public class FrameAckLifecycleTest {
  static class Promise {
    String result; int settlements;
    void resolve(Object ignored) { if (++settlements != 1) throw new AssertionError("double settlement"); result = "resolved"; }
    // Match expo.modules.kotlin.Promise overloads: untyped null is ambiguous in Java.
    void resolve() { resolve((Object) null); }
    void resolve(int value) { resolve((Object) value); }
    void resolve(boolean value) { resolve((Object) value); }
    void resolve(double value) { resolve((Object) value); }
    void resolve(float value) { resolve((Object) value); }
    void resolve(String value) { resolve((Object) value); }
    void resolve(Collection<? extends Object> value) { resolve((Object) value); }
    void resolve(Map<String, ? extends Object> value) { resolve((Object) value); }
    void reject(String code, String message, Throwable error) { if (++settlements != 1) throw new AssertionError("double settlement"); result = code; }
  }
  private final Object mFrameLock = new Object();
  private final Set<Promise> mFramePromises = new HashSet<>();
  private boolean mFrameContextDestroyed = false;
  private final Queue<Runnable> queue = new ArrayDeque<>();
  private final Object mGLThread = new Object();
  private int mEXGLCtxId = 1, finishCalls = 0, error = 0;
  private static final int GL_NO_ERROR = 0;
  private Runnable finishHook = () -> {};
  void runAsync(Runnable operation) { queue.add(operation); }
  void glFinish() { finishCalls++; finishHook.run(); }
  int glGetError() { return error; }
  void drain() { while (!queue.isEmpty()) queue.remove().run(); }
  ${wait}
  ${destroy}
  static void check(boolean value) { if (!value) throw new AssertionError(); }
  public static void main(String[] args) {
    FrameAckLifecycleTest c = new FrameAckLifecycleTest(); Promise p = new Promise();
    c.waitForFrameAsync(p); check(p.result == null && c.finishCalls == 0); c.drain(); check("resolved".equals(p.result) && c.finishCalls == 1);
    c = new FrameAckLifecycleTest(); p = new Promise(); c.waitForFrameAsync(p); c.destroyPending(); c.drain(); check("E_GL_CONTEXT_DESTROYED".equals(p.result) && c.finishCalls == 0);
    Promise after = new Promise(); c.waitForFrameAsync(after); check("E_GL_CONTEXT_DESTROYED".equals(after.result) && c.queue.isEmpty());
    c = new FrameAckLifecycleTest(); p = new Promise(); c.finishHook = c::destroyPending; c.waitForFrameAsync(p); c.drain(); check("E_GL_CONTEXT_DESTROYED".equals(p.result) && p.settlements == 1);
    c = new FrameAckLifecycleTest(); p = new Promise(); c.error = 1282; c.waitForFrameAsync(p); c.drain(); check("E_GL_FRAME".equals(p.result));
    c = new FrameAckLifecycleTest(); Promise a = new Promise(), b = new Promise(); c.waitForFrameAsync(a); c.waitForFrameAsync(b); c.destroyPending(); c.drain(); check(a.settlements == 1 && b.settlements == 1 && c.finishCalls == 0);
  }
}`
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wq-frame-ack-'))
  try {
    fs.writeFileSync(path.join(directory, 'FrameAckLifecycleTest.java'), source)
    for (const [command, args] of [['javac', ['FrameAckLifecycleTest.java']], ['java', ['-cp', '.', 'FrameAckLifecycleTest']]]) {
      const result = spawnSync(command, args, { cwd: directory, encoding: 'utf8', timeout: 30000 })
      assert.ifError(result.error)
      assert.equal(result.status, 0, result.stderr || result.stdout)
    }
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'wq-frame-ack-'))
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
