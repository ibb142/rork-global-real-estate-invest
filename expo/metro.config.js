const { getDefaultConfig } = require("expo/metro-config");

// Resilient Metro config: wrap @rork-ai/toolkit-sdk/metro in try/catch
// so the bundler falls back to the default Expo Metro config if the
// toolkit SDK is missing or does not export withRorkMetro.
//
// Root cause this fixes: the bare `require("@rork-ai/toolkit-sdk/metro")`
// crashed the Gradle `createBundleReleaseJsAndAssets` task when the
// subpath export was unavailable, producing a bundle with no JS and
// a black screen on launch.
let config = getDefaultConfig(__dirname);

try {
  const rorkMetro = require("@rork-ai/toolkit-sdk/metro");
  if (rorkMetro && typeof rorkMetro.withRorkMetro === "function") {
    config = rorkMetro.withRorkMetro(config);
    console.log("[IVX] Metro config: @rork-ai/toolkit-sdk/metro applied");
  } else {
    console.log("[IVX] Metro config: @rork-ai/toolkit-sdk/metro found but no withRorkMetro export — using default");
  }
} catch (err) {
  console.log("[IVX] Metro config: @rork-ai/toolkit-sdk/metro not available — using default Expo config:", err?.message ?? "unknown");
}

module.exports = config;
