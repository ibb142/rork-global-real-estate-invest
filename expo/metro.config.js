const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

let withRorkMetro;
try {
  ({ withRorkMetro } = require("@rork-ai/toolkit-sdk/metro"));
} catch (_e) {
  withRorkMetro = (c) => c;
}

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // Block unused ai/@ai-sdk packages from production bundle
    // These are transitive deps of @rork-ai/toolkit-sdk but no app code uses them
    if (
      moduleName === "ai" ||
      moduleName === "@ai-sdk/react" ||
      moduleName === "@ai-sdk/gateway" ||
      moduleName === "@ai-sdk/provider" ||
      moduleName === "@ai-sdk/provider-utils"
    ) {
      return {
        filePath: path.resolve(__dirname, "src/stubs/ai-stub.js"),
        type: "sourceFile",
      };
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform, {
      resolveRequest: context.resolveRequest,
    });
  },
};

module.exports = withRorkMetro(config);
