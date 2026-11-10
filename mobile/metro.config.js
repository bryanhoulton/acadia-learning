const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for @ alias
config.resolver.extraNodeModules = {
  "@": path.resolve(__dirname, "./"),
};

// Ensure we handle .cjs files properly
config.resolver.sourceExts = [...config.resolver.sourceExts, "cjs"];

module.exports = withNativeWind(config, { input: "./global.css" });
