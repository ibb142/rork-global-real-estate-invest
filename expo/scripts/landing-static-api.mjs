import { sanitizeDealPhotosForDeal } from '../constants/deal-photos';
import { resolveCanonicalDealIdentity } from '../lib/deal-identity';

const ACTIVE_STATUSES = new Set(['active', 'published', 'live']);

function isDealPublished(row) {
  return row?.published === true || row?.is_published === true;
}

function isDealActive(row) {
  const status = asString(row?.status).trim().toLowerCase();
  return ACTIVE_STATUSES.has(status);
}

function isLandingVisible(row) {
  return isDealPublished(row) || isDealActive(row);
}

function buildSortTimestamp(row) {
  return asString(row.published_at).trim() || asString(row.updated_at).trim() || asString(row.created_at).trim() || '';
}

function buildNullsLastOrderClause(column) {
  return `${column}.asc.nullslast`;
}

function buildDescNullsLastOrderClause(column) {
  return `${column}.desc.nullslast`;
}

function appendOrderParams(url, columns) {
  const parsed = new URL(url);
  columns.forEach((column) => {
    parsed.searchParams.append('order', column);
  });
  return parsed.toString();
}

function buildDealsRequestUrl(supabaseUrl, select) {
  const parsed = new URL(`${supabaseUrl}/rest/v1/jv_deals`);
  parsed.searchParams.set('select', select);
  parsed.searchParams.set('limit', '100');
  return appendOrderParams(parsed.toString(), [
    buildNullsLastOrderClause('display_order'),
    buildDescNullsLastOrderClause('published_at'),
    buildDescNullsLastOrderClause('updated_at'),
    buildDescNullsLastOrderClause('created_at'),
  ]);
}

function asString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseMaybeJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRemoteUrl(value) {
  const normalized = asString(value).trim().toLowerCase();
  return normalized.startsWith('https://') || normalized.startsWith('http://');
}

function isBase64Image(value) {
  const normalized = asString(value).trim().toLowerCase();
  return normalized.startsWith('data:image/') || normalized.includes(';base64,');
}

function sanitizePhotos(value) {
  return parseMaybeJsonArray(value)
    .map((item) => asString(item).trim())
    .filter((item) => item.length > 0 && isRemoteUrl(item) && !isBase64Image(item));
}

function parseTrustIndicators(value) {
  return parseMaybeJsonArray(value)
    .map((item) => asString(item).trim())
    .filter(Boolean);
}

function buildOwnershipText(minInvestment, propertyValue) {
  const safeMin = asNumber(minInvestment);
  const safeValue = asNumber(propertyValue);
  if (safeMin <= 0 || safeValue <= 0) return '';
  const percent = (safeMin / safeValue) * 100;
  return `${percent.toFixed(percent >= 1 ? 2 : 4)}% ownership at minimum`;
}

function normalizeDeal(row) {
  const propertyValue = asNumber(row.property_value ?? row.estimated_value ?? row.total_investment);
  const totalInvestment = asNumber(row.total_investment ?? row.property_value ?? row.estimated_value);
  const minInvestment = asNumber(row.minimum_investment ?? row.min_investment ?? 1000);
  const fractionalSharePrice = asNumber(row.fractional_share_price ?? minInvestment);
  const ownershipPercentAtMinimum = propertyValue > 0 ? Number(((minInvestment / propertyValue) * 100).toFixed(4)) : 0;
  const trustInfo = parseMaybeJsonObject(row.trust_info ?? row.trustInfo) ?? {};
  const trustIndicators = parseTrustIndicators(row.trust_indicators ?? trustInfo.trust_indicators);
  const identity = resolveCanonicalDealIdentity(row);
  const photos = sanitizeDealPhotosForDeal({
    title: identity.title,
    projectName: identity.projectName,
    project_name: identity.projectName,
  }, sanitizePhotos(row.photos));
  const id = asString(row.id).trim();

  const addressShort = [asString(row.city).trim(), asString(row.state).trim()].filter(Boolean).join(', ');
  const addressFull = asString(row.property_address ?? row.address_full ?? row.address).trim();
  const descriptionShort = asString(row.description_short ?? row.description).trim();
  const publishedAt = asString(row.published_at).trim() || asString(row.updated_at).trim() || new Date().toISOString();
  const displayOrder = Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : 999;
  const updatedAt = asString(row.updated_at).trim();
  const createdAt = asString(row.created_at).trim();

  return {
    id,
    title: identity.title,
    projectName: identity.projectName,
    project_name: identity.projectName,
    developerName: identity.developerName,
    developer_name: identity.developerName,
    addressShort,
    address_short: addressShort,
    addressFull,
    address_full: addressFull,
    descriptionShort,
    description_short: descriptionShort,
    total_investment: totalInvestment,
    property_value: propertyValue,
    sale_price: asNumber(row.sale_price),
    fractional_share_price: fractionalSharePrice,
    ownership_percent_at_minimum: ownershipPercentAtMinimum,
    ownership_text: asString(row.ownership_text).trim() || buildOwnershipText(minInvestment, propertyValue),
    expectedROI: asNumber(row.expected_roi ?? row.expectedROI),
    expected_roi: asNumber(row.expected_roi ?? row.expectedROI),
    timeline: asString(row.timeline).trim(),
    partners_count: asNumber(row.partners_count ?? row.partnersCount),
    badges: parseMaybeJsonArray(row.badges).map((item) => asString(item).trim()).filter(Boolean),
    minInvestment: minInvestment,
    min_investment: minInvestment,
    photos,
    dealType: asString(row.deal_type ?? row.type).trim() || 'fractional_real_estate',
    deal_type: asString(row.deal_type ?? row.type).trim() || 'fractional_real_estate',
    status: asString(row.status).trim() || 'active',
    exitStrategy: asString(row.exit_strategy ?? row.exitStrategy).trim() || 'Sale upon completion',
    exit_strategy: asString(row.exit_strategy ?? row.exitStrategy).trim() || 'Sale upon completion',
    distributionFrequency: asString(row.distribution_frequency ?? row.distributionFrequency).trim() || 'Quarterly',
    distribution_frequency: asString(row.distribution_frequency ?? row.distributionFrequency).trim() || 'Quarterly',
    publishedAt,
    published_at: publishedAt,
    displayOrder,
    display_order: displayOrder,
    city: asString(row.city).trim(),
    state: asString(row.state).trim(),
    country: asString(row.country).trim() || 'USA',
    trustVerified: Boolean(row.trust_verified ?? trustInfo.trust_verified ?? true),
    trust_verified: Boolean(row.trust_verified ?? trustInfo.trust_verified ?? true),
    trustIndicators,
    trust_indicators: trustIndicators,
    published: isDealPublished(row),
    is_published: row.is_published === true,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
  };
}

function filterPublishedDeals(rows) {
  return rows
    .filter((row) => Boolean(row && typeof row === 'object'))
    .filter((row) => {
      return isLandingVisible(row);
    })
    .map((row) => normalizeDeal(row))
    .filter((deal) => deal.id && deal.title)
    .sort((a, b) => {
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return buildSortTimestamp(b).localeCompare(buildSortTimestamp(a));
    });
}

export async function fetchStaticLandingApiPayloads(options = {}) {
  const supabaseUrl = asString(options.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL).trim().replace(/\/$/, '');
  const supabaseAnonKey = asString(options.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY).trim();
  const directApiBaseUrl = asString(options.directApiBaseUrl ?? process.env.EXPO_PUBLIC_RORK_API_BASE_URL).trim().replace(/\/$/, '');
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }

  const select = '*';

  const url = buildDealsRequestUrl(supabaseUrl, select);
  const response = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase jv_deals fetch failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }

  const rows = await response.json();
  const rawRows = Array.isArray(rows) ? rows : [];
  const deals = filterPublishedDeals(rawRows);
  const generatedAt = new Date().toISOString();
  const source = directApiBaseUrl ? 'supabase_static_export_with_direct_origin' : 'supabase_static_export';

  const dealsPayload = {
    deals,
    count: deals.length,
    source,
    generatedAt,
  };

  const healthPayload = {
    ok: true,
    status: 'healthy',
    timestamp: generatedAt,
    service: 'landing-static-api',
    source,
    checks: {
      deals: {
        ok: deals.length > 0,
        count: deals.length,
      },
      routing: {
        ok: true,
        mode: 'static_s3_json',
      },
    },
  };

  return {
    dealsPayload,
    healthPayload,
  };
}
