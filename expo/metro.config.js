const { getDefaultConfig } = require("expo/metro-config");

// IVX build independence: plain Expo Metro config — no Rork toolkit.
const config = getDefaultConfig(__dirname);

module.exports = config;
