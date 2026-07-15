const { getDefaultConfig } = require("expo/metro-config");

let withRorkMetro = (config) => config;

try {
  const rorkMetro = require("@rork-ai/toolkit-sdk/metro");
  if (rorkMetro && typeof rorkMetro.withRorkMetro === "function") {
    withRorkMetro = rorkMetro.withRorkMetro;
  }
} catch (err) {
  console.warn("[IVX Metro] @rork-ai/toolkit-sdk/metro not available, using default Metro config:", err?.message || err);
}

const config = getDefaultConfig(__dirname);

module.exports = withRorkMetro(config);
