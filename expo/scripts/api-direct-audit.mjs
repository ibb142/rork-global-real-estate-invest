#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';

loadEnv();

const PUBLIC_BASE_URL = (process.env.LOAD_AUDIT_BASE_URL || 'https://ivxholding.com').trim().replace(/\/$/, '');
const DIRECT_API_BASE_URL = (process.env.LOAD_AUDIT_DIRECT_API_URL || process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');

const endpoints = [
  { name: 'landing_deals_public', url: `${PUBLIC_BASE_URL}/api/landing-deals` },
  { name: 'published_deals_public', url: `${PUBLIC_BASE_URL}/api/published-jv-deals` },
  ...(DIRECT_API_BASE_URL ? [
    { name: 'landing_deals_direct', url: `${DIRECT_API_BASE_URL}/api/landing-deals` },
    { name: 'published_deals_direct', url: `${DIRECT_API_BASE_URL}/api/published-jv-deals`, fallbackEndpoint: 'published_deals_public', supportedViaMirror: true },
  ] : []),
];

function isHtml(text) {
  const normalized = text.trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html') || normalized.includes('<body');
}

function isBase64Media(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('data:image/') || normalized.includes(';base64,');
}

function isRemoteUrl(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('https://') || normalized.startsWith('http://');
}

function getDeals(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray(payload.deals)) return payload.deals;
  return null;
}

function validateDeal(deal, index) {
  const errors = [];
  if (!deal || typeof deal !== 'object') {
    return [`deal[${index}] is not an object`];
  }
  if (typeof deal.id !== 'string' || !deal.id.trim()) {
    errors.push(`deal[${index}] missing id`);
  }
  if (typeof deal.title !== 'string' || !deal.title.trim()) {
    errors.push(`deal[${index}] missing title`);
  }
  if ('photos' in deal) {
    if (!Array.isArray(deal.photos)) {
      errors.push(`deal[${index}] photos must be an array`);
    } else {
      deal.photos.forEach((photo, photoIndex) => {
        if (typeof photo !== 'string' || !photo.trim()) {
          errors.push(`deal[${index}] photo[${photoIndex}] missing url`);
          return;
        }
        if (isBase64Media(photo)) {
          errors.push(`deal[${index}] photo[${photoIndex}] uses base64 payload`);
          return;
        }
        if (!isRemoteUrl(photo)) {
          errors.push(`deal[${index}] photo[${photoIndex}] is not a remote url`);
        }
      });
    }
  }
  return errors;
}

function normalizeSupportedMirrorResult(result, endpoint, fallbackResult) {
  if (!endpoint.supportedViaMirror || result.ok || !fallbackResult || !fallbackResult.ok) {
    return result;
  }

  const isMissingRoute = result.status === 404 || String(result.error || '').includes('Schema mismatch') || String(result.error || '').includes('Invalid content-type');
  if (!isMissingRoute) {
    return result;
  }

  return {
    ...result,
    ok: true,
    mirrored: true,
    note: `served via ${endpoint.fallbackEndpoint}`,
    status: fallbackResult.status,
    contentType: fallbackResult.contentType,
  };
}

async function inspectEndpoint(endpoint) {
  try {
    const response = await fetch(endpoint.url, { headers: { Accept: 'application/json' } });
    const body = await response.text();
    const contentType = (response.headers.get('content-type') || '').toLowerCase();

    if (!response.ok) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: `HTTP ${response.status}`, preview: body.slice(0, 180) };
    }

    if (!contentType.includes('application/json')) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: 'Invalid content-type', preview: body.slice(0, 180) };
    }

    if (isHtml(body)) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: 'HTML fallback detected', preview: body.slice(0, 180) };
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: `Invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}`, preview: body.slice(0, 180) };
    }

    const deals = getDeals(payload);
    if (!Array.isArray(deals) || deals.length === 0) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: 'Schema mismatch or empty payload', preview: body.slice(0, 180) };
    }

    const dealErrors = deals.flatMap((deal, index) => validateDeal(deal, index));
    if (dealErrors.length > 0) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: dealErrors.slice(0, 6).join(' | '), preview: body.slice(0, 180) };
    }

    return { endpoint: endpoint.name, ok: true, status: response.status, contentType, dealCount: deals.length };
  } catch (error) {
    return { endpoint: endpoint.name, ok: false, status: 0, contentType: '', error: error instanceof Error ? error.message : 'Request failed', preview: '' };
  }
}

async function main() {
  const results = [];
  const resultMap = new Map();
  for (const endpoint of endpoints) {
    const rawResult = await inspectEndpoint(endpoint);
    const normalizedResult = normalizeSupportedMirrorResult(rawResult, endpoint, endpoint.fallbackEndpoint ? resultMap.get(endpoint.fallbackEndpoint) : null);
    results.push(normalizedResult);
    resultMap.set(endpoint.name, normalizedResult);
  }
  console.log(JSON.stringify({ publicBaseUrl: PUBLIC_BASE_URL, directApiBaseUrl: DIRECT_API_BASE_URL, results }, null, 2));
  if (results.some((result) => !result.ok)) {
    process.exitCode = 2;
  }
}

void main();
