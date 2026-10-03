/** Instrument only a disposable native-acceptance checkout; keep the production entry. */
const fs = require('node:fs')
const path = require('node:path')

const REPORT = 'native-image-lifecycle-diagnostic.json'

function replaceOnce(source, before, after, label) {
  if (source.split(before).length !== 2) throw new Error(`Diagnostic anchor changed: ${label}`)
  return source.replace(before, after)
}

function prepareNativeImageLifecycleDiagnostic(workspaceRoot = path.resolve(__dirname, '..')) {
  const projectRoot = path.join(workspaceRoot, 'apps/mobile')
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  if (manifest.main !== 'expo-router/entry') throw new Error('Image lifecycle diagnostic requires the production entry')
  const imagePath = require.resolve('react-native/Libraries/Image/Image.ios.js', { paths: [projectRoot] })
  const resolverPath = path.join(path.dirname(imagePath), 'resolveAssetSource.js')
  const layoutPath = path.join(projectRoot, 'app/_layout.tsx')
  const originals = [imagePath, resolverPath, layoutPath].map(file => ({ file, source: fs.readFileSync(file, 'utf8') }))
  if (originals.some(({ source }) => source.includes('WQ_IMAGE_LIFECYCLE_DIAGNOSTIC'))) throw new Error('Image lifecycle diagnostic already installed')

  // No extra import runs before Image's normal imports. The file writer is required
  // only after first render; first-render evidence stays in the in-memory buffer.
  const runtime = `// WQ_IMAGE_LIFECYCLE_DIAGNOSTIC
const wqImageDiagnostic = globalThis.__wqImageDiagnostic = {
  version: 2, startedAt: new Date().toISOString(), nextId: 0, events: [], errors: [],
  record(kind, fields) {
    if (this.events.length < 2400) this.events.push({ time: new Date().toISOString(), kind, ...fields });
  },
};
function wqImageSafeSource(value) {
  if (typeof value === 'number' || value == null) return value;
  if (Array.isArray(value)) return value.map(wqImageSafeSource);
  if (typeof value !== 'object') return '[redacted]';
  return { uri: typeof value.uri === 'string' && value.uri.startsWith('file:') ? value.uri : '[redacted]',
    width: value.width, height: value.height, scale: value.scale };
}
let wqImageWrites = Promise.resolve();
for (const delay of [1500, 5000, 8500]) {
  setTimeout(() => {
    wqImageWrites = wqImageWrites.then(async () => {
      try {
        const FileSystem = require('expo-file-system/legacy');
        await FileSystem.writeAsStringAsync(FileSystem.documentDirectory + '${REPORT}', JSON.stringify(wqImageDiagnostic, null, 2));
      } catch (error) { wqImageDiagnostic.errors.push(String(error)); }
    });
  }, delay);
}
`;
  let image = replaceOnce(originals[0].source, 'function getSize(', runtime + '\nfunction getSize(', 'Image runtime')
  image = replaceOnce(image, '  const flattenedStyle = flattenStyle<ImageStyleProp>(style);', `  const wqImageId = React.useRef(null);
  if (wqImageId.current == null) wqImageId.current = ++wqImageDiagnostic.nextId;
  const wqLocalImage = sources.some(item => item && typeof item.uri === 'string' && item.uri.startsWith('file:'));
  const wqImageFields = { id: wqImageId.current, testID: props.testID, handle: wqImageSafeSource(props.source), sources: wqImageSafeSource(sources) };
  if (wqLocalImage) wqImageDiagnostic.record('render', wqImageFields);
  React.useEffect(() => {
    if (wqLocalImage) wqImageDiagnostic.record('mount', wqImageFields);
    return () => { if (wqLocalImage) wqImageDiagnostic.record('unmount', wqImageFields); };
  }, []);
  const wqOnLoad = wqLocalImage ? event => {
    wqImageDiagnostic.record('load', { ...wqImageFields, nativeTag: event.nativeEvent?.target,
      loadedSource: wqImageSafeSource(event.nativeEvent?.source) });
    props.onLoad?.(event);
  } : props.onLoad;
  const wqOnError = wqLocalImage ? event => {
    wqImageDiagnostic.record('error', { ...wqImageFields, nativeTag: event.nativeEvent?.target,
      error: event.nativeEvent?.error });
    props.onError?.(event);
  } : props.onError;
  const flattenedStyle = flattenStyle<ImageStyleProp>(style);`, 'Image render')
  image = replaceOnce(image, '            source={sources}', `            source={sources}
            onLoad={wqOnLoad}
            onError={wqOnError}`, 'Image callbacks')

  let resolver = replaceOnce(originals[1].source, '  const asset = AssetRegistry.getAssetByID(source);', `  const asset = AssetRegistry.getAssetByID(source);
  // WQ_IMAGE_LIFECYCLE_DIAGNOSTIC: snapshot metadata before transformers run.
  globalThis.__wqImageDiagnostic?.record('resolve', {
    handle: source, scriptURL: getSourceCodeScriptURL(),
    transformers: _customSourceTransformers.map(transformer => transformer.name),
    metadata: asset ? { name: asset.name, type: asset.type, hash: asset.hash,
      httpServerLocation: asset.httpServerLocation, width: asset.width, height: asset.height,
      scales: [...asset.scales] } : null,
  });`, 'Image resolver')
  let layout = replaceOnce(originals[2].source, "    router.replace('/onboarding')", `    // WQ_IMAGE_LIFECYCLE_DIAGNOSTIC: preserve the actual redirect timing.
    globalThis.__wqImageDiagnostic?.record('onboarding-redirect', { pathname, ready })
    router.replace('/onboarding')`, 'Onboarding redirect')
  const outputs = [image, resolver, layout]
  for (let index = 0; index < originals.length; index++) fs.writeFileSync(originals[index].file, outputs[index])
  return { report: REPORT, entry: manifest.main, patched: originals.map(({ file }) => file) }
}

if (require.main === module) {
  if (process.env.GITHUB_WORKFLOW !== 'Native acceptance' || process.env.CI !== 'true') {
    throw new Error('Image lifecycle instrumentation is restricted to the Native acceptance CI checkout')
  }
  console.log(JSON.stringify(prepareNativeImageLifecycleDiagnostic()))
}
module.exports = { prepareNativeImageLifecycleDiagnostic, replaceOnce }
