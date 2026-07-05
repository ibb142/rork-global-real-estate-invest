// IVX build-independence reference (BLOCK 47).
//
// This is the Rork-free Metro config the cutover switches `metro.config.js` to
// when IVX runs on the owner-controlled pipeline (off Rork). It is intentionally
// the plain Expo default — no `withRorkMetro`, no `@rork-ai/toolkit-sdk`.
//
// It is kept as a SEPARATE reference file so the live `metro.config.js` can keep
// using `withRorkMetro` inside the Rork-managed sandbox (where the cloud bundler
// requires it and auto-restores it). `rork-independence-cutover.mjs` copies this
// content over `metro.config.js` on the independent checkout.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;
