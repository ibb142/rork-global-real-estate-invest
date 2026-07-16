const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  // Global ignores — must be in a standalone config object
  {
    ignores: [
      "dist/**",
      "deploy/**",
      "scripts/**",
      "sync-github.mjs",
      "verify-sync.mjs",
      "build-landing.mjs",
      "deploy-landing.mjs",
      "deploy-seo-now.mjs",
      "auto-sync.mjs",
      "pipeline.mjs",
      "qa-live-production.ts",
      "__tests__/**",
      "playwright.config.ts",
      "ivxholding-landing/**",
      "src/integrations/**",
      "mocks/**",
      "polyfills/**",
      "types/**",
      "metro.config.independent.js",
      "deploy/pm2/**",
      "deploy/supabase/**",
      ".expo/**",
    ],
  },
  expoConfig,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
      "import/no-unresolved": "off",
      "no-var": "off",
      "prefer-const": "warn",
    },
  }
]);
