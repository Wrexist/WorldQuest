/**
 * babel-preset-expo already knows about expo-router — it wires up the route context,
 * JSX runtime and the reanimated plugin. Adding those by hand is how a config drifts
 * out of sync with the SDK.
 */
module.exports = function babelConfig(api) {
  api.cache(true)
  return { presets: [['babel-preset-expo', { jsxImportSource: 'react' }]] }
}
