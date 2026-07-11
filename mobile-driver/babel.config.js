module.exports = function (api) {
  api.cache(true)
  return {
    // babel-preset-expo auto-adds the reanimated plugin. jsxImportSource enables className interop.
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  }
}
