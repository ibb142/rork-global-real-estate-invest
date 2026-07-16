const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Disable Watchman — it refuses to start in sandboxed CI environments
// due to process priority restrictions. Not needed for production bundles.
config.watcher = config.watcher || {};
config.watcher.watchman = false;

module.exports = config;
