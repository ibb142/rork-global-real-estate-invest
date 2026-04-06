#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';

loadEnv();

const PUBLIC_BASE_URL = (process.env.HUMAN_SMOKE_BASE_URL || 'https://ivxholding.com').trim().replace(/\/$/, '');
const DIRECT_API_BASE_URL = (process.env.HUMAN_SMOKE_DIRECT_API_URL || process.env.EXPO_PUBLIC_RORK_API_BASE_URL || PUBLIC_BASE_URL)
  .trim()
  .replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.HUMAN_SMOKE_TIMEOUT_MS || '10000', 10);

const landingMarkers = ['ivx', 'invest', 'member', 'owner', 'deal'];
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const LANDING_VISIBLE_STATUSES = new Set(['active', 'published', 'live']);

function readText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function isLandingVisibleDeal(row) {
  const status = readText(row?.status).trim().toLowerCase();
  return row?.published === true || row?.is_published === true || LANDING_VISIBLE_STATUSES.has(status);
}

function isHtml(text) {
  const normalized = text.trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html') || normalized.includes('<body');
}

function parseDeals(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray(payload.deals)) return payload.deals;
  return null;
}

function isBase64Media(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('data:image/') || normalized.includes(';base64,');
}

function isRemoteUrl(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('https://') || normalized.startsWith('http://');
}

function extractTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? '';
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function hasPattern(text, regex) {
  return regex.test(text);
}

function buildCodeTraceResult(name, ok, details, risks = []) {
  return {
    name,
    ok,
    url: 'code-trace',
    status: ok ? 200 : 500,
    contentType: 'text/plain',
    issues: ok ? risks : [...details, ...risks],
    details,
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectLandingPage() {
  const url = `${PUBLIC_BASE_URL}/`;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'user-agent': 'IVXHumanSmoke/1.0',
      },
    });
    const html = await response.text();
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const lowerHtml = html.toLowerCase();
    const markerHits = landingMarkers.filter((marker) => lowerHtml.includes(marker));
    const title = extractTitle(html);
    const ctaCount = countMatches(html, /<(a|button)\b/gi);
    const formCount = countMatches(html, /<form\b/gi);
    const doctypeCount = countMatches(html, /<!doctype html>/gi);
    const htmlTagCount = countMatches(html, /<html[\s>]/gi);
    const bodyTagCount = countMatches(html, /<body[\s>]/gi);

    const issues = [];
    if (!response.ok) issues.push(`HTTP ${response.status}`);
    if (!contentType.includes('text/html')) issues.push(`unexpected content-type ${contentType || 'unknown'}`);
    if (!isHtml(html)) issues.push('response did not look like HTML');
    if (html.length < 1500) issues.push('page HTML too small');
    if (!title) issues.push('missing title tag');
    if (markerHits.length < 2) issues.push('missing expected IVX landing markers');
    if (ctaCount < 3) issues.push('not enough interactive CTA elements detected');
    if (doctypeCount !== 1) issues.push(`expected 1 doctype, found ${doctypeCount}`);
    if (htmlTagCount !== 1) issues.push(`expected 1 html tag, found ${htmlTagCount}`);
    if (bodyTagCount !== 1) issues.push(`expected 1 body tag, found ${bodyTagCount}`);

    return {
      name: 'landing_page',
      ok: issues.length === 0,
      url,
      status: response.status,
      contentType,
      title,
      htmlLength: html.length,
      ctaCount,
      formCount,
      markerHits,
      issues,
    };
  } catch (error) {
    return {
      name: 'landing_page',
      ok: false,
      url,
      status: 0,
      contentType: '',
      title: '',
      htmlLength: 0,
      ctaCount: 0,
      formCount: 0,
      markerHits: [],
      issues: [error instanceof Error ? error.message : 'request failed'],
    };
  }
}

function buildSupabaseSourceUrl() {
  if (!SUPABASE_URL) return '';
  const url = new URL(`${SUPABASE_URL}/rest/v1/jv_deals`);
  url.searchParams.set('select', 'id,title,status,published,display_order,published_at,updated_at,created_at');
  url.searchParams.set('limit', '200');
  url.searchParams.append('order', 'display_order.asc.nullslast');
  url.searchParams.append('order', 'published_at.desc.nullslast');
  url.searchParams.append('order', 'updated_at.desc.nullslast');
  url.searchParams.append('order', 'created_at.desc.nullslast');
  return url.toString();
}

async function inspectSupabaseSourceOfTruth() {
  const url = buildSupabaseSourceUrl();

  if (!url || !SUPABASE_ANON_KEY) {
    return {
      name: 'supabase_source_of_truth',
      ok: false,
      url: url || 'missing',
      status: 0,
      contentType: '',
      issues: ['missing Supabase env for source-of-truth comparison'],
      dealCount: 0,
      healthKeys: 0,
      expectedCount: 0,
    };
  }

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'user-agent': 'IVXHumanSmoke/1.0',
      },
    });
    const body = await response.text();
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const issues = [];

    if (!response.ok) issues.push(`HTTP ${response.status}`);
    if (!contentType.includes('application/json')) issues.push(`unexpected content-type ${contentType || 'unknown'}`);
    if (isHtml(body)) issues.push('returned HTML fallback');

    let rows = [];
    if (issues.length === 0) {
      try {
        const payload = JSON.parse(body);
        rows = Array.isArray(payload) ? payload : [];
      } catch (error) {
        issues.push(`invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}`);
      }
    }

    const visibleRows = rows.filter((row) => row && typeof row === 'object' && isLandingVisibleDeal(row));

    return {
      name: 'supabase_source_of_truth',
      ok: issues.length === 0,
      url,
      status: response.status,
      contentType,
      issues,
      dealCount: visibleRows.length,
      healthKeys: 0,
      expectedCount: visibleRows.length,
    };
  } catch (error) {
    return {
      name: 'supabase_source_of_truth',
      ok: false,
      url,
      status: 0,
      contentType: '',
      issues: [error instanceof Error ? error.message : 'request failed'],
      dealCount: 0,
      healthKeys: 0,
      expectedCount: 0,
    };
  }
}

function inspectLandingCodePaths(landingHtml) {
  const details = [];
  const risks = [];

  const ctaToFunnel = hasPattern(landingHtml, /class="nav-cta-btn"[^>]+onclick="openFunnel\(\); return false;"/i)
    || hasPattern(landingHtml, /class="btn-primary"[^>]+onclick="openFunnel\(\); return false;"/i);
  details.push(ctaToFunnel
    ? 'CTA trace: hero/nav CTA routes into openFunnel() in landing bundle.'
    : 'CTA trace missing: expected main CTA -> openFunnel() wiring not found.');

  const funnelSubmit = hasPattern(landingHtml, /async function handleFunnelSubmit\(e\)/)
    && hasPattern(landingHtml, /trpcCall\('waitlist\.join'/)
    && hasPattern(landingHtml, /showFunnelStep\(3\)/);
  details.push(funnelSubmit
    ? 'Form trace: funnel submit calls waitlist.join and reaches success step in code.'
    : 'Form trace missing: funnel submit path is incomplete.');

  const waitlistForm = hasPattern(landingHtml, /<form class="waitlist-form[^"]*" id="waitlist-form" onsubmit="handleWaitlist\(event\)"/i);
  details.push(waitlistForm
    ? 'Public intake trace: rich waitlist form is present and bound to handleWaitlist(event).'
    : 'Public intake trace missing: rich waitlist form binding not found.');

  const portalLogin = hasPattern(landingHtml, /async function handlePortalLogin\(e\)/)
    && hasPattern(landingHtml, /signInWithPassword\(/)
    && hasPattern(landingHtml, /showPortalDashboard\(\)/);
  details.push(portalLogin
    ? 'Login trace: landing portal login calls Supabase signInWithPassword() then showPortalDashboard().'
    : 'Login trace missing: landing portal login path is incomplete.');

  const investAuth = hasPattern(landingHtml, /async function handleInvestAuth\(e\)/)
    && hasPattern(landingHtml, /auth\.signUp\(/)
    && hasPattern(landingHtml, /auth\.signInWithPassword\(/);
  details.push(investAuth
    ? 'Invest auth trace: deal modal supports signup/login before continuing.'
    : 'Invest auth trace missing: modal auth path is incomplete.');

  if (hasPattern(landingHtml, /setTimeout\(function\(\) \{\s*console\.warn\('\[IVX\] Funnel submission timed out after 12s — showing success anyway'/)) {
    risks.push('Human-only risk: funnel modal still has a timeout fallback that can show success UI even if the network path stalls.');
  }

  if (hasPattern(landingHtml, /catch\(err\) \{\s*clearTimeout\(_fnlTimeout\);[\s\S]*showFunnelStep\(3\);/)) {
    risks.push('Human-only risk: funnel catch path still advances to a success screen after an error, so visual success alone is not proof of persistence.');
  }

  if (hasPattern(landingHtml, /localStorage\.setItem\('ivx_portal_session'/)) {
    risks.push('Human-only risk: landing portal relies on localStorage session persistence, so private browsing/storage blocking can change real-user behavior.');
  }

  if (hasPattern(landingHtml, /window\.supabase\.createClient\(/)) {
    risks.push('Human-only risk: login and invest auth depend on runtime Supabase script/client availability in the real browser.');
  }

  const ok = ctaToFunnel && funnelSubmit && waitlistForm && portalLogin && investAuth;
  return buildCodeTraceResult('code_path_trace', ok, details, risks);
}

async function inspectJsonEndpoint(name, url, type, expectedCount = null) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'application/json',
        'user-agent': 'IVXHumanSmoke/1.0',
      },
    });
    const body = await response.text();
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const issues = [];

    if (!response.ok) issues.push(`HTTP ${response.status}`);
    if (!contentType.includes('application/json')) issues.push(`unexpected content-type ${contentType || 'unknown'}`);
    if (isHtml(body)) issues.push('returned HTML fallback');

    let payload = null;
    if (issues.length === 0) {
      try {
        payload = JSON.parse(body);
      } catch (error) {
        issues.push(`invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}`);
      }
    }

    let dealCount = 0;
    let healthKeys = 0;
    if (payload && type === 'deals') {
      const deals = parseDeals(payload);
      if (!Array.isArray(deals) || deals.length === 0) {
        issues.push('missing or empty deals payload');
      } else {
        dealCount = deals.length;
        if (typeof expectedCount === 'number' && expectedCount >= 0 && dealCount !== expectedCount) {
          issues.push(`deal count mismatch vs source of truth (${String(dealCount)} !== ${String(expectedCount)})`);
        }
        deals.forEach((deal, index) => {
          if (!deal || typeof deal !== 'object') {
            issues.push(`deal[${index}] is not an object`);
            return;
          }
          if (typeof deal.id !== 'string' || !deal.id.trim()) issues.push(`deal[${index}] missing id`);
          if (typeof deal.title !== 'string' || !deal.title.trim()) issues.push(`deal[${index}] missing title`);
          if ('photos' in deal) {
            if (!Array.isArray(deal.photos)) {
              issues.push(`deal[${index}] photos must be an array`);
            } else {
              deal.photos.forEach((photo, photoIndex) => {
                if (typeof photo !== 'string' || !photo.trim()) issues.push(`deal[${index}] photo[${photoIndex}] missing url`);
                else if (isBase64Media(photo)) issues.push(`deal[${index}] photo[${photoIndex}] uses base64 payload`);
                else if (!isRemoteUrl(photo)) issues.push(`deal[${index}] photo[${photoIndex}] is not a remote url`);
              });
            }
          }
        });
      }
    }

    if (payload && type === 'health') {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        issues.push('health payload is not an object');
      } else {
        healthKeys = Object.keys(payload).length;
      }
    }

    return {
      name,
      ok: issues.length === 0,
      url,
      status: response.status,
      contentType,
      issues: issues.slice(0, 12),
      dealCount,
      healthKeys,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      url,
      status: 0,
      contentType: '',
      issues: [error instanceof Error ? error.message : 'request failed'],
      dealCount: 0,
      healthKeys: 0,
    };
  }
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printResult(result) {
  const statusIcon = result.ok ? 'PASS' : 'FAIL';
  console.log(`${statusIcon} ${result.name}`);
  console.log(`  url: ${result.url}`);
  console.log(`  status: ${result.status}`);
  if ('title' in result && result.title) console.log(`  title: ${result.title}`);
  if ('contentType' in result && result.contentType) console.log(`  content-type: ${result.contentType}`);
  if ('htmlLength' in result) console.log(`  html-length: ${result.htmlLength}`);
  if ('ctaCount' in result) console.log(`  cta-count: ${result.ctaCount}`);
  if ('formCount' in result) console.log(`  form-count: ${result.formCount}`);
  if ('markerHits' in result && result.markerHits.length > 0) console.log(`  markers: ${result.markerHits.join(', ')}`);
  if ('dealCount' in result && result.dealCount > 0) console.log(`  deal-count: ${result.dealCount}`);
  if ('healthKeys' in result && result.healthKeys > 0) console.log(`  health-keys: ${result.healthKeys}`);
  if ('details' in result && Array.isArray(result.details) && result.details.length > 0) {
    result.details.forEach((detail) => console.log(`  detail: ${detail}`));
  }
  if (result.issues.length > 0) {
    result.issues.forEach((issue) => console.log(`  issue: ${issue}`));
  }
}

async function main() {
  console.log('[HumanSmoke] Starting human smoke check...');
  console.log(`[HumanSmoke] public base url: ${PUBLIC_BASE_URL}`);
  console.log(`[HumanSmoke] direct api base url: ${DIRECT_API_BASE_URL}`);

  const landingResult = await inspectLandingPage();
  const sourceOfTruthResult = await inspectSupabaseSourceOfTruth();
  const expectedDealCount = sourceOfTruthResult.ok ? sourceOfTruthResult.expectedCount : null;
  const codeTraceResult = await fetchWithTimeout(`${PUBLIC_BASE_URL}/`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'user-agent': 'IVXHumanSmoke/1.0',
    },
  }).then(async (response) => inspectLandingCodePaths(await response.text())).catch((error) => buildCodeTraceResult('code_path_trace', false, [`failed to inspect landing bundle: ${error instanceof Error ? error.message : 'request failed'}`]));
  const jsonResults = await Promise.all([
    inspectJsonEndpoint('landing_deals_public', `${PUBLIC_BASE_URL}/api/landing-deals`, 'deals', expectedDealCount),
    inspectJsonEndpoint('published_deals_public', `${PUBLIC_BASE_URL}/api/published-jv-deals`, 'deals', expectedDealCount),
    inspectJsonEndpoint('health_public', `${PUBLIC_BASE_URL}/health`, 'health'),
    ...(DIRECT_API_BASE_URL && DIRECT_API_BASE_URL !== PUBLIC_BASE_URL
      ? [inspectJsonEndpoint('landing_deals_direct', `${DIRECT_API_BASE_URL}/api/landing-deals`, 'deals', expectedDealCount)]
      : []),
  ]);

  printSection('Landing');
  printResult(landingResult);

  printSection('Source of truth');
  printResult(sourceOfTruthResult);

  printSection('JSON endpoints');
  jsonResults.forEach(printResult);

  printSection('Code-path trace');
  printResult(codeTraceResult);

  printSection('Human manual checklist');
  const checklist = [
    `Open ${PUBLIC_BASE_URL} on phone + desktop and confirm the first screen loads without blank sections.`,
    'Tap the main CTA buttons and confirm they scroll or route to the expected section.',
    'Submit one real waitlist/member form and confirm success messaging feels clear to a normal user.',
    'Open the Expo app on a phone, refresh once, and verify the same live deal card data matches the landing page.',
    'Check login, returning-user sign in, and owner entry path once each with real credentials.',
    'Verify one investor card image, sale price, and minimum entry amount are visually synced between app and landing.',
  ];
  checklist.forEach((item, index) => console.log(`${index + 1}. ${item}`));

  const failedResults = [landingResult, sourceOfTruthResult, codeTraceResult, ...jsonResults].filter((result) => !result.ok);
  printSection('Summary');
  if (failedResults.length === 0) {
    console.log('PASS human smoke checks are green.');
  } else {
    console.log(`FAIL ${failedResults.length} checks failed.`);
    failedResults.forEach((result) => console.log(`- ${result.name}`));
    process.exitCode = 2;
  }
}

void main();
