const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Watchman refuses to start in cloud sandbox environments due to process
// priority (nice_value=19 vs required 0). Force Metro to use polling
// fallback instead of Watchman for file watching.
config.watcher = config.watcher || {};
config.watcher.useWatchman = false;

module.exports = config;
