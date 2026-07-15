"use strict";

/**
 * Stub for the `ai` npm package and `@ai-sdk/*` packages.
 * These are transitive deps of @rork-ai/toolkit-sdk but no IVX app code
 * imports them directly. This stub prevents Vercel AI Gateway strings
 * from leaking into the production Hermes bytecode bundle.
 */

module.exports = {};
module.exports.generateText = () => Promise.reject(new Error("ai package not bundled"));
module.exports.generateObject = () => Promise.reject(new Error("ai package not bundled"));
module.exports.streamText = () => Promise.reject(new Error("ai package not bundled"));
module.exports.DefaultChatTransport = class {};
module.exports.lastAssistantMessageIsCompleteWithToolCalls = () => false;
module.exports.createGateway = () => ({});
