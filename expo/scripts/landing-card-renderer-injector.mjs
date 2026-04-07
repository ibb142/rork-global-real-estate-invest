import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RENDERER_SOURCE_PATH = resolve(__dirname, 'landing-card-html.mjs');
const BUILD_DEAL_CARD_PATTERN = /function buildDealCardHtml\(deal\) \{[\s\S]*?\n    \}\n\n    function safeJsonParse/;

export function injectLandingCardRenderer(html) {
  const rendererModuleSource = readFileSync(RENDERER_SOURCE_PATH, 'utf-8');
  const browserRendererSource = `${rendererModuleSource.replace(/^export\s+/gm, '').trim()}\nwindow.generateLandingCardHtml = generateLandingCardHtml;`;

  if (!BUILD_DEAL_CARD_PATTERN.test(html)) {
    throw new Error('Could not find buildDealCardHtml block in landing HTML');
  }

  return html.replace(
    BUILD_DEAL_CARD_PATTERN,
    () => `${browserRendererSource}\n\n    function buildDealCardHtml(deal) {\n      return window.generateLandingCardHtml(deal);\n    }\n\n    function safeJsonParse`
  );
}
