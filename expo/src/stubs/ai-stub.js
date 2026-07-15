"use strict";

/**
 * Stub for the `ai` npm package and `@ai-sdk/*` packages.
 * Prevents AI provider strings from leaking into the production Hermes bytecode bundle.
 */

module.exports = {};
module.exports.generateText = () => Promise.reject(new Error("ai package not bundled"));
module.exports.generateObject = () => Promise.reject(new Error("ai package not bundled"));
module.exports.streamText = () => Promise.reject(new Error("ai package not bundled"));
module.exports.DefaultChatTransport = class {};
module.exports.lastAssistantMessageIsCompleteWithToolCalls = () => false;
