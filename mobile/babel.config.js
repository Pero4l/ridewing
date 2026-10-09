/**
 * `jsxImportSource: "nativewind"` points JSX at NativeWind's runtime so
 * `className` works on React Native primitives; the `nativewind/babel` preset
 * compiles the class strings into style objects at build time.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
