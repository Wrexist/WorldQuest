/** Keep authoring notes in the packs, outside the production JavaScript bundle. */
const path = require('node:path')
const { unstable_transformerPath } = require('expo/metro-config')
const expoTransformer = require(unstable_transformerPath)
const packsRoot = path.resolve(__dirname, '../../packages/content/packs')

module.exports = {
  ...expoTransformer,
  transform(config, projectRoot, filename, data, options) {
    const relative = path.relative(packsRoot, path.resolve(projectRoot, filename))
    const isContentPack = relative.endsWith('.json') && !path.isAbsolute(relative)
      && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    if (isContentPack && options.dev !== true && options.type !== 'asset') {
      // Only JSON Schema's authoring keys. Facts, source citations, review flags,
      // licenses, stable IDs and every other runtime value remain byte-for-byte values.
      const pack = JSON.parse(data.toString('utf8'), (key, value) =>
        key === '$comment' || key === '$schema' ? undefined : value)
      data = Buffer.from(JSON.stringify(pack))
    }
    return expoTransformer.transform(config, projectRoot, filename, data, options)
  },
}
