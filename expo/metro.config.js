const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Watchman refuses to start in cloud sandbox environments due to process
// priority (nice_value=19 vs required 0). Force Metro to use polling
// fallback instead of Watchman for file watching.
config.watcher = config.watcher || {};
config.watcher.useWatchman = false;

// ---------------------------------------------------------------------------
// Bundle optimization — block heavy server-only packages from the mobile bundle.
// These packages are only used in deploy scripts (scripts/*.mjs) and never
// imported in app/lib/components/src source code. Without this blocklist Metro
// still crawls them during module resolution, inflating the module graph and
// the final bundle by tens of MB.
//
// Verified zero app-source imports for each:
//   @aws-sdk/client-s3, @aws-sdk/client-cloudfront — deploy scripts only
//   pdf-lib, unpdf                              — deploy scripts only
//   eas-cli                                     — CI/CD only, never in app
//   pg                                          — backend only, never in app
//   zustand                                     — not imported anywhere
//   ai (vercel ai sdk)                          — not imported in app source
// ---------------------------------------------------------------------------
const SERVER_ONLY_PACKAGES = [
  '@aws-sdk/client-s3',
  '@aws-sdk/client-cloudfront',
  '@aws-sdk/core',
  '@aws-sdk/credential-provider-node',
  '@aws-sdk/middleware-host-header',
  '@aws-sdk/middleware-logger',
  '@aws-sdk/middleware-retry',
  '@aws-sdk/middleware-sdk-s3',
  '@aws-sdk/middleware-sdk-cloudfront',
  '@aws-sdk/region-config',
  '@aws-sdk/types',
  '@aws-sdk/util-stream',
  '@aws-sdk/util-utf8',
  '@smithy/abort-controller',
  '@smithy/config-resolver',
  '@smithy/core',
  '@smithy/fetch-http-handler',
  '@smithy/hash-node',
  '@smithy/invalid-dependency',
  '@smithy/middleware-content-length',
  '@smithy/middleware-endpoint',
  '@smithy/middleware-retry',
  '@smithy/middleware-serde',
  '@smithy/middleware-stack',
  '@smithy/node-config-provider',
  '@smithy/node-http-handler',
  '@smithy/protocol-http',
  '@smithy/querystring-builder',
  '@smithy/service-client-class',
  '@smithy/shared-ini-file-loader',
  '@smithy/smithy-client',
  '@smithy/types',
  '@smithy/url-parser',
  '@smithy/util-base64',
  '@smithy/util-body-length',
  '@smithy/util-buffer-from',
  '@smithy/util-config-provider',
  '@smithy/util-defaults-mode',
  '@smithy/util-endpoints',
  '@smithy/util-hex-encoding',
  '@smithy/util-middleware',
  '@smithy/util-retry',
  '@smithy/util-stream',
  '@smithy/util-utf8',
  '@smithy/util-waiter',
  'pdf-lib',
  'unpdf',
  'eas-cli',
  'pg',
  'zustand',
  'ai',
];

const serverOnlyPattern = new RegExp(
  `^(${SERVER_ONLY_PACKAGES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(/|$)`
);

config.resolver = config.resolver || {};
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Block server-only packages from being resolved in the mobile bundle.
  // If something does accidentally import them, they'll get a clear error
  // instead of silently inflating the bundle.
  if (serverOnlyPattern.test(moduleName) && platform !== 'web') {
    return {
      type: 'empty',
    };
  }

  // Fall through to the original resolver (or Expo's default) for everything else.
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  // Default: let Metro handle it
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
