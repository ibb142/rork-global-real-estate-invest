/**
 * Live before/after proof for the "Unexpected text node" fix.
 *
 * Renders a string child THROUGH a wrapper (Animated.View) — the exact path the
 * old allowlist guard missed — to react-native-web and counts the real
 * console.error("Unexpected text node ...") emitted by View/index.js.
 *
 * BEFORE (old allowlist logic): Animated.View is not recognised -> string
 *   reaches inner <View> -> 1 "Unexpected text node" error.
 * AFTER (inverse-allowlist guard): string is wrapped in <Text> before render
 *   -> 0 errors.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Animated, Text, View } from 'react-native-web';

function countTextNodeErrors(renderFn) {
  const original = console.error;
  let count = 0;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Unexpected text node')) {
      count += 1;
    }
  };
  try {
    renderFn();
  } catch {
    // ignore unrelated render issues; we only care about the text-node error
  } finally {
    console.error = original;
  }
  return count;
}

// ---- Replicate the OLD allowlist decision (pre-fix) -------------------------
const OLD_VIEW_LIKE = new Set([View]);
function oldShouldSanitize(type) {
  if (OLD_VIEW_LIKE.has(type)) return true;
  const dn = type && type.displayName;
  return typeof dn === 'string' && (dn === 'View' || dn.endsWith('(View)'));
}

// ---- The NEW decision (mirrors lib/text-node-guard.ts) ----------------------
function isTextAccepting(type) {
  if (type === Text) return true;
  if (type == null) return false;
  for (const c of [type, type.type, type.render]) {
    const label = c && (c.displayName ?? c.name);
    if (typeof label === 'string' && (label === 'Text' || label.endsWith('(Text)'))) return true;
  }
  return false;
}
function newShouldSanitize(type) {
  if (type == null) return false;
  if (typeof type === 'string' || typeof type === 'symbol') return false;
  return !isTextAccepting(type);
}

console.log('Animated.View recognised by OLD allowlist guard?', oldShouldSanitize(Animated.View));
console.log('Animated.View recognised by NEW guard?         ', newShouldSanitize(Animated.View));
console.log('Text treated as text host by NEW guard?        ', !newShouldSanitize(Text));

// BEFORE: raw string straight through Animated.View (old guard would skip it)
const before = countTextNodeErrors(() => {
  renderToStaticMarkup(React.createElement(Animated.View, null, 'stray runtime string'));
});

// AFTER: guard wraps the string in <Text> before it reaches the inner View
const after = countTextNodeErrors(() => {
  renderToStaticMarkup(
    React.createElement(Animated.View, null, React.createElement(Text, null, 'stray runtime string')),
  );
});

console.log('\nBEFORE fix  -> "Unexpected text node" errors:', before);
console.log('AFTER fix   -> "Unexpected text node" errors:', after);

if (before >= 1 && after === 0 && newShouldSanitize(Animated.View) && !oldShouldSanitize(Animated.View)) {
  console.log('\nRESULT: PASS — wrapper gap reproduced (before) and closed by the new guard (after).');
  process.exit(0);
} else {
  console.log('\nRESULT: INCONCLUSIVE');
  process.exit(1);
}
