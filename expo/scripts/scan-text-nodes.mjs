#!/usr/bin/env node
/**
 * AST scanner: finds raw string/number JSX text nodes (and `{expr}` children that
 * can evaluate to a string/number) that are DIRECT children of a View-like host.
 *
 * React Native (and react-native-web) throws:
 *   "Unexpected text node: <x>. A text node cannot be a child of a <View>."
 * when this happens. This reproduces the offender deterministically from source.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default ?? _traverse;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Hosts that CANNOT have a raw text child.
const VIEW_LIKE = new Set([
  'View', 'ScrollView', 'KeyboardAvoidingView', 'SafeAreaView',
  'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
  'ImageBackground', 'Animated.View', 'Animated.ScrollView',
  'LinearGradient', 'BlurView', 'TouchableNativeFeedback',
]);
// Hosts where raw text IS allowed.
const TEXT_LIKE = new Set(['Text', 'Animated.Text', 'TextInput']);

const dirs = ['app', 'components', 'src'];
const offenders = [];

function getName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return `${getName(node.object)}.${getName(node.property)}`;
  return '';
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walk(full);
    } else if (extname(full) === '.tsx') {
      scan(full);
    }
  }
}

const SOURCES = new Map();
function scan(file) {
  const code = readFileSync(file, 'utf8');
  SOURCES.set(file, code.split('\n'));
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  } catch {
    return;
  }

  traverse(ast, {
    JSXElement(path) {
      const name = getName(path.node.openingElement.name);
      if (!VIEW_LIKE.has(name)) return;

      for (const child of path.node.children) {
        // Raw text literal that is not pure whitespace.
        if (child.type === 'JSXText') {
          const txt = child.value;
          if (txt.trim().length > 0) {
            offenders.push({
              file, line: child.loc.start.line, host: name,
              kind: 'raw-string', snippet: JSON.stringify(txt.trim().slice(0, 40)),
            });
          }
          continue;
        }
        // {expr} child that resolves to a string/number literal directly.
        if (child.type === 'JSXExpressionContainer') {
          const e = child.expression;
          if (e.type === 'StringLiteral' && e.value.trim().length > 0) {
            offenders.push({ file, line: child.loc.start.line, host: name, kind: 'string-expr', snippet: JSON.stringify(e.value.slice(0, 40)) });
          } else if (e.type === 'NumericLiteral') {
            offenders.push({ file, line: child.loc.start.line, host: name, kind: 'number-expr', snippet: String(e.value) });
          } else if (e.type === 'TemplateLiteral') {
            offenders.push({ file, line: child.loc.start.line, host: name, kind: 'template-literal', snippet: '`...`' });
          } else if (e.type === 'LogicalExpression' && e.operator === '&&') {
            // {cond && "str"} or {num && <JSX/>} — the && can leak a string/number.
            const r = e.right;
            if (r.type === 'StringLiteral' && r.value.trim().length > 0) {
              offenders.push({ file, line: child.loc.start.line, host: name, kind: '&&-string', snippet: JSON.stringify(r.value.slice(0, 40)) });
            }
            // numeric left operand that can render 0: {arr.length && ...}
            const l = e.left;
            if (l.type === 'MemberExpression' && getName2(l).endsWith('.length')) {
              offenders.push({ file, line: child.loc.start.line, host: name, kind: '&&-length-zero-risk', snippet: getName2(l) });
            }
          } else if (e.type === 'Identifier' || e.type === 'MemberExpression' || e.type === 'CallExpression') {
            // {someVar} / {obj.prop} / {fn()} directly under a View — can be a string at runtime.
            offenders.push({ file, line: child.loc.start.line, host: name, kind: 'dynamic-expr', snippet: getName2(e) || '<call>' });
          } else if (e.type === 'ConditionalExpression') {
            // {cond ? a : b} — flag if either branch is a string/var (not JSX).
            const isRisky = (n) => n && (n.type === 'StringLiteral' || n.type === 'Identifier' || n.type === 'MemberExpression' || n.type === 'TemplateLiteral' || n.type === 'NumericLiteral' || n.type === 'CallExpression');
            if (isRisky(e.consequent) || isRisky(e.alternate)) {
              offenders.push({ file, line: child.loc.start.line, host: name, kind: 'ternary-maybe-string', snippet: '? :' });
            }
          }
        }
      }
    },
  });
}

function getName2(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return `${getName2(node.object)}.${getName2(node.property)}`;
  if (node.type === 'ThisExpression') return 'this';
  return '?';
}

for (const d of dirs) {
  const full = join(ROOT, d);
  try { statSync(full); walk(full); } catch {}
}

if (offenders.length === 0) {
  console.log('CLEAN: no raw text nodes found directly under View-like hosts.');
} else {
  console.log(`FOUND ${offenders.length} potential text-node offender(s):\n`);
  const STRINGY = offenders.filter((o) => o.kind !== 'dynamic-expr' || /\b(label|text|title|value|message|status|name|note|detail|desc|summary|hint|placeholder|caption|subtitle|content|copy|line|body|count|total|num|amount|price|date|time|str)\b/i.test(o.snippet));
  console.log(`\n--- High-signal (likely string) candidates: ${STRINGY.length} ---`);
  for (const o of STRINGY) {
    const rel = o.file.replace(ROOT + '/', '');
    const src = (SOURCES.get(o.file) ?? [])[o.line - 1]?.trim()?.slice(0, 110) ?? '';
    console.log(`  ${rel}:${o.line}  [${o.kind}] <${o.host}>  ${o.snippet}\n      ${src}`);
  }
}
