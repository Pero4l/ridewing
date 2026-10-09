const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// `input` points at the stylesheet NativeWind compiles and injects at runtime.
// isCSSEnabled must stay on (the default) or the styles never resolve.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
