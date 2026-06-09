/**
 * landing-sync.ts — Syncs published deals to the landing page.
 *
 * CANONICAL SOURCE: jv_deals table (Supabase) is the single source of truth.
 * Both app and landing page consume the same data through the shared card model.
 * landing_deals table is auto-derived and read-only.
 *
 * P0-2 FIX: Deploy is now backend-only. This file only syncs data to
 * the landing_deals table and triggers backend deploy via API.
 */
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit-trail';
import {
  deployLandingPage,
  getDeployStatus,
  upsertLandingConfigEntry,
  LANDING_CONFIG_DEALS_CACHE_KEY,
  type DeployResult,
  isLandingConfigSchemaMismatchError,
  isLandingConfigTableMissingError,
} from '@/lib/landing-deploy';
import {
  mapDealToCardModel,
  CANONICAL_DISTRIBUTION_LABEL,
  type PublishedDealCardModel,
} from '@/lib/published-deal-card-model';
import { fetchCanonicalDeals } from '@/lib/canonical-deals';
import { fetchDealsJsonEndpoint } from '@/lib/api-response-guard';
import { DIRECT_API_BASE_URL, getPublishedDealsReadUrls } from '@/lib/public-api';

const LANDING_VISIBLE_STATUSES = ['active', 'published', 'live'] as const;

function readText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function isLandingVisibleRow(row: Record<string, unknown>): boolean {
  const status = readText(row.status).trim().toLowerCase();
  return row.published === true || row.is_published === true || LANDING_VISIBLE_STATUSES.includes(status as (typeof LANDING_VISIBLE_STATUSES)[number]);
}

function sortPublishedPayloads<T extends { displayOrder: number; publishedAt: string; updatedAt: string }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    const dateA = a.publishedAt || a.updatedAt || '';
    const dateB = b.publishedAt || b.updatedAt || '';
    return dateB.localeCompare(dateA);
  });
}

function isMissingColumnError(message: string | null | undefined): boolean {
  const msg = readText(message).toLowerCase();
  return msg.includes('column') && msg.includes('does not exist');
}

async function upsertLandingDealRow(deal: PublishedDealPayload, timestamp: string): Promise<{ message: string } | null> {
  const safePhotos = Array.isArray(deal.photos)
    ? deal.photos.filter((photo): photo is string => typeof photo === 'string' && photo.trim().length > 0)
    : [];

  const fullRow = {
    id: deal.id,
    title: deal.title,
    project_name: deal.projectName,
    description: deal.description,
    property_address: deal.propertyAddress,
    city: deal.city,
    state: deal.state,
    country: deal.country,
    total_investment: deal.totalInvestment,
    property_value: deal.propertyValue || 0,
    estimated_value: deal.propertyValue || 0,
    sale_price: deal.salePrice || 0,
    expected_roi: deal.expectedROI,
    status: deal.status,
    photos: safePhotos,
    distribution_frequency: deal.distributionFrequency,
    exit_strategy: deal.exitStrategy,
    published_at: deal.publishedAt,
    display_order: deal.displayOrder,
    trust_info: deal.trustInfo ? JSON.stringify(deal.trustInfo) : null,
    updated_at: deal.updatedAt || timestamp,
    synced_at: timestamp,
  };

  const fullResult = await supabase
    .from('landing_deals')
    .upsert(fullRow);

  if (!fullResult.error) {
    return null;
  }

  if (!isMissingColumnError(fullResult.error.message)) {
    return { message: fullResult.error.message };
  }

  console.log('[LandingSync] landing_deals schema drift detected for deal', deal.id, '— retrying with legacy-safe payload');

  const legacySafeRow = {
    id: deal.id,
    title: deal.title,
    project_name: deal.projectName,
    description: deal.description,
    property_address: deal.propertyAddress,
    city: deal.city,
    state: deal.state,
    country: deal.country,
    total_investment: deal.totalInvestment,
    estimated_value: deal.propertyValue || 0,
    sale_price: deal.salePrice || 0,
    expected_roi: deal.expectedROI,
    status: deal.status,
    photos: safePhotos,
    published_at: deal.publishedAt,
    updated_at: deal.updatedAt || timestamp,
  };

  const legacyResult = await supabase
    .from('landing_deals')
    .upsert(legacySafeRow);

  return legacyResult.error ? { message: legacyResult.error.message } : null;
}

async function _getSyncAuthHeaders(): Promise<Record<string, string>> {
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
  };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const isExpiringSoon = expiresAt > 0 && (expiresAt - Date.now()) < 120000;

      if (isExpiringSoon && session.refresh_token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session?.access_token) {
          headers['Authorization'] = `Bearer ${refreshed.session.access_token}`;
        } else {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      } else {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } else {
      headers['Authorization'] = `Bearer ${anonKey}`;
    }
  } catch {
    headers['Authorization'] = `Bearer ${anonKey}`;
  }
  return headers;
}

export interface LandingSyncResult {
  success: boolean;
  syncedDeals: number;
  errors: string[];
  timestamp: string;
  filesUploaded: string[];
  deployTriggered: boolean;
}

export interface PublishedDealPayload {
  id: string;
  title: string;
  projectName: string;
  description: string;
  propertyAddress: string;
  city: string;
  state: string;
  country: string;
  totalInvestment: number;
  propertyValue: number;
  salePrice: number;
  expectedROI: number;
  status: string;
  photos: string[];
  distributionFrequency: string;
  exitStrategy: string;
  publishedAt: string;
  updatedAt: string;
  displayOrder: number;
  trustInfo?: Record<string, unknown>;
  cardModel?: PublishedDealCardModel;
}

const _landingSyncBase = DIRECT_API_BASE_URL;
const LANDING_SYNC_ENDPOINT = _landingSyncBase
  ? `${_landingSyncBase}/api/landing-sync`
  : null;

function isSupabaseConfigured(): boolean {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return !!(url && key);
}

async function fetchPublishedDealsViaBackend(): Promise<PublishedDealPayload[]> {
  const candidateUrls = getPublishedDealsReadUrls();
  if (candidateUrls.length === 0) {
    console.log('[LandingSync] No published-deals API candidates configured');
    return [];
  }
  try {
    const authHeaders = await _getSyncAuthHeaders();
    for (const url of candidateUrls) {
      const endpointName = url.includes('published-jv-deals') ? 'published-jv-deals' : 'landing-deals';
      console.log('[LandingSync] Fetching published deals from API candidate:', url);
      const result = await fetchDealsJsonEndpoint(url, {
        endpointName,
        timeoutMs: 8000,
        headers: authHeaders,
      });
      if (!result.ok) {
        console.log('[LandingSync] API candidate failed hard:', url, '|', result.error, '| content-type:', result.contentType, '| preview:', result.bodyPreview);
        continue;
      }
      console.log('[LandingSync] API candidate returned', result.deals.length, 'deals from', url);
      const mapped = sortPublishedPayloads(
        result.deals
          .filter((row: Record<string, unknown>) => isLandingVisibleRow(row))
          .map((row: Record<string, unknown>) => mapRowToPayload(row))
      );
      return mapped;
    }
    return [];
  } catch (err) {
    console.log('[LandingSync] Published deals fetch exception:', (err as Error)?.message);
    return [];
  }
}

function mapRowToPayload(row: Record<string, unknown>): PublishedDealPayload {
  const cardModel = mapDealToCardModel(row);

  let trustInfo: Record<string, unknown> | undefined;
  const rawTrust = row.trustInfo ?? row.trust_info;
  if (rawTrust) {
    if (typeof rawTrust === 'string') {
      try { trustInfo = JSON.parse(rawTrust); } catch { trustInfo = undefined; }
    } else if (typeof rawTrust === 'object') {
      trustInfo = rawTrust as Record<string, unknown>;
    }
  }

  return {
    id: cardModel.id,
    title: cardModel.title,
    projectName: cardModel.projectName || cardModel.title,
    description: cardModel.descriptionShort,
    propertyAddress: cardModel.addressFull,
    city: cardModel.city,
    state: cardModel.state,
    country: cardModel.country,
    totalInvestment: cardModel.totalInvestment,
    propertyValue: cardModel.propertyValue || 0,
    salePrice: cardModel.explicitSalePrice || 0,
    expectedROI: cardModel.expectedROI,
    status: cardModel.status,
    photos: cardModel.photos,
    distributionFrequency: cardModel.distributionFrequency || CANONICAL_DISTRIBUTION_LABEL,
    exitStrategy: cardModel.exitStrategy,
    publishedAt: cardModel.publishedAt,
    updatedAt: (row.updatedAt as string) || (row.updated_at as string) || cardModel.publishedAt || new Date().toISOString(),
    displayOrder: cardModel.displayOrder,
    trustInfo,
    cardModel,
  };
}

async function fetchPublishedDeals(): Promise<PublishedDealPayload[]> {
  console.log('[LandingSync] Fetching via CANONICAL DEALS API (single source of truth)...');
  try {
    const canonicalResult = await fetchCanonicalDeals(true);
    if (canonicalResult.deals.length === 0) {
      console.log('[LandingSync] Canonical API returned 0 deals (source:', canonicalResult.source, ')');
      return [];
    }

    console.log('[LandingSync] Canonical API returned', canonicalResult.deals.length, 'deals (source:', canonicalResult.source, ')');
    const mapped = canonicalResult.deals.map((card) => cardModelToPayload(card));
    for (const deal of mapped) {
      console.log('[LandingSync] Deal:', deal.id, '|', deal.projectName || deal.title, '| display_order:', deal.displayOrder);
    }
    return mapped;
  } catch (err) {
    console.log('[LandingSync] Canonical fetch failed:', (err as Error)?.message, '— falling back to direct Supabase');
    return fetchPublishedDealsDirectFallback();
  }
}

function cardModelToPayload(card: PublishedDealCardModel): PublishedDealPayload {
  return {
    id: card.id,
    title: card.title,
    projectName: card.projectName || card.title,
    description: card.descriptionShort,
    propertyAddress: card.addressFull,
    city: card.city,
    state: card.state,
    country: card.country,
    totalInvestment: card.totalInvestment,
    propertyValue: card.propertyValue || 0,
    salePrice: card.explicitSalePrice || 0,
    expectedROI: card.expectedROI,
    status: card.status,
    photos: card.photos,
    distributionFrequency: card.distributionFrequency,
    exitStrategy: card.exitStrategy,
    publishedAt: card.publishedAt,
    updatedAt: card.updatedAt || card.publishedAt || new Date().toISOString(),
    displayOrder: card.displayOrder,
    trustInfo: card.rawTrustInfo as Record<string, unknown> | undefined,
    cardModel: card,
  };
}

async function fetchPublishedDealsDirectFallback(): Promise<PublishedDealPayload[]> {
  if (!isSupabaseConfigured()) {
    console.log('[LandingSync] Supabase not configured — trying backend API');
    return fetchPublishedDealsViaBackend();
  }

  try {
    const result = await supabase
      .from('jv_deals')
      .select('*')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (result.error) {
      console.log('[LandingSync] Direct fallback query error:', result.error.message);
      return fetchPublishedDealsViaBackend();
    }

    const data = result.data as Record<string, unknown>[] | null;
    if (!data || data.length === 0) return [];

    const mapped = sortPublishedPayloads(data.filter((row) => isLandingVisibleRow(row)).map(mapRowToPayload));
    return mapped;
  } catch (err) {
    console.log('[LandingSync] Direct fallback exception:', (err as Error)?.message);
    return [];
  }
}

let _lastDeployTimestamp = 0;
let _lastSyncTimestamp: string | null = null;
let _lastDeployError: string | null = null;
const DEPLOY_COOLDOWN = 5000;

async function generateStaticDealsJson(deals: PublishedDealPayload[], timestamp: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const staticPayload = {
      deals: deals.map(d => ({
        id: d.id,
        title: d.title,
        projectName: d.projectName,
        description: d.description,
        propertyAddress: d.propertyAddress,
        city: d.city,
        state: d.state,
        country: d.country,
        totalInvestment: d.totalInvestment,
        propertyValue: d.propertyValue,
        salePrice: d.salePrice,
        expectedROI: d.expectedROI,
        status: d.status,
        photos: d.photos,
        distributionFrequency: d.distributionFrequency,
        exitStrategy: d.exitStrategy,
        displayOrder: d.displayOrder,
        trustInfo: d.trustInfo,
        cardModel: d.cardModel,
      })),
      generatedAt: timestamp,
      count: deals.length,
      ttl: 300,
    };

    const { error } = await upsertLandingConfigEntry(
      LANDING_CONFIG_DEALS_CACHE_KEY,
      {
        ...staticPayload,
        deployStatus: 'cached',
      },
      null,
      timestamp,
    );

    if (error) {
      const msg = error.message || '';
      if (isLandingConfigTableMissingError(msg) || isLandingConfigSchemaMismatchError(msg)) {
        console.log('[LandingSync] landing_page_config unavailable for deals cache — skipping (non-critical):', msg);
        return;
      }
      console.log('[LandingSync] Deals cache upsert error:', msg);
    } else {
      console.log('[LandingSync] Static deals.json cached in landing_page_config —', deals.length, 'deals, TTL 5min');
    }
  } catch (err) {
    console.log('[LandingSync] Static deals cache exception:', (err as Error)?.message);
  }
}

async function triggerBackendDeploy(): Promise<DeployResult | null> {
  const now = Date.now();
  if (now - _lastDeployTimestamp < DEPLOY_COOLDOWN) {
    console.log('[LandingSync] Deploy cooldown active, skipping duplicate deploy');
    return null;
  }
  const status = getDeployStatus();
  if (!status.canDeploy) {
    console.log('[LandingSync] Cannot deploy: backend not configured');
    return null;
  }
  _lastDeployTimestamp = now;
  try {
    console.log('[LandingSync] Triggering backend deploy...');
    const result = await deployLandingPage();
    if (result.success) {
      console.log('[LandingSync] Backend deploy SUCCESS — files:', result.filesUploaded.join(', '));
      _lastDeployError = null;
    } else {
      console.log('[LandingSync] Backend deploy failed:', result.errors.join('; '));
      _lastDeployError = result.errors.join('; ') || 'Deploy failed';
    }
    return result;
  } catch (err) {
    const message = (err as Error)?.message || 'Deploy error';
    console.log('[LandingSync] Deploy error:', message);
    _lastDeployError = message;
    return {
      success: false,
      filesUploaded: [],
      errors: [message],
      timestamp: new Date().toISOString(),
    };
  }
}

export async function syncToLandingPage(): Promise<LandingSyncResult> {
  const timestamp = new Date().toISOString();

  try {
    const deals = await fetchPublishedDeals();
    _lastSyncTimestamp = timestamp;

    console.log('[LandingSync] Syncing', deals.length, 'published deals to landing_deals table + triggering deploy...');

    const tableResult = await syncToSupabaseLandingTable(deals, timestamp);

    try {
      await generateStaticDealsJson(deals, timestamp);
    } catch (cacheErr) {
      console.log('[LandingSync] Static deals.json cache failed (non-blocking):', (cacheErr as Error)?.message);
    }

    let deployResult: DeployResult | null = null;
    try {
      deployResult = await triggerBackendDeploy();
      if (deployResult) {
        console.log('[LandingSync] Backend deploy triggered after table sync');
      } else {
        console.log('[LandingSync] Backend deploy skipped after table sync');
      }
    } catch (deployErr) {
      console.log('[LandingSync] Backend deploy trigger failed (non-blocking):', (deployErr as Error)?.message);
    }

    if (LANDING_SYNC_ENDPOINT) {
      try {
        const syncHeaders = await _getSyncAuthHeaders();
        const response = await fetch(LANDING_SYNC_ENDPOINT, {
          method: 'POST',
          headers: syncHeaders,
          body: JSON.stringify({
            deals,
            syncedAt: timestamp,
            source: 'ivx-app',
          }),
        });

        if (response.ok) {
          console.log('[LandingSync] API sync also succeeded —', deals.length, 'deals');
        } else {
          console.log('[LandingSync] API sync failed (non-blocking):', response.status);
        }
      } catch (fetchErr) {
        console.log('[LandingSync] API sync exception (non-blocking):', (fetchErr as Error)?.message);
      }
    }

    const combinedErrors = [...tableResult.errors];
    if (deployResult && deployResult.errors.length > 0) {
      combinedErrors.push(...deployResult.errors.map((error) => `Deploy: ${error}`));
    }

    const finalResult: LandingSyncResult = {
      success: tableResult.success && (deployResult ? deployResult.success : true),
      syncedDeals: tableResult.syncedDeals,
      errors: combinedErrors,
      timestamp,
      filesUploaded: deployResult?.filesUploaded ?? [],
      deployTriggered: !!deployResult,
    };

    try {
      await logAudit({
        entityType: 'system',
        entityId: `landing-sync-${Date.now()}`,
        entityTitle: `Landing page sync: ${deals.length} deals`,
        action: 'SYSTEM_EVENT',
        source: 'system',
        details: {
          dealCount: deals.length,
          dealIds: deals.map(d => d.id),
          syncedToTable: tableResult.syncedDeals,
          deployTriggered: finalResult.deployTriggered,
          deployedFiles: finalResult.filesUploaded,
        },
      });
    } catch (auditErr) {
      console.log('[LandingSync] Audit log failed (non-critical):', auditErr);
    }

    return finalResult;
  } catch (err) {
    console.log('[LandingSync] Sync exception:', (err as Error)?.message);
    return {
      success: false,
      syncedDeals: 0,
      errors: [(err as Error)?.message || 'Unknown error'],
      timestamp,
      filesUploaded: [],
      deployTriggered: false,
    };
  }
}

export async function fullDeployToLanding(): Promise<{ success: boolean; filesUploaded: string[]; errors: string[] }> {
  console.log('[LandingSync] Full landing page deploy requested (backend-only)...');
  try {
    const result = await deployLandingPage();
    console.log('[LandingSync] Backend deploy result:', result.success, '| files:', result.filesUploaded.join(', '));
    return { success: result.success, filesUploaded: result.filesUploaded, errors: result.errors };
  } catch (err) {
    console.log('[LandingSync] Backend deploy error:', (err as Error)?.message);
    return { success: false, filesUploaded: [], errors: [(err as Error)?.message || 'Deploy failed'] };
  }
}

async function syncToSupabaseLandingTable(deals: PublishedDealPayload[], timestamp: string): Promise<LandingSyncResult> {
  const errors: string[] = [];
  let syncedCount = 0;

  console.log('[LandingSync] landing_deals is a READ-ONLY derived cache. Only this sync function writes to it.');

  let tableExists = true;
  try {
    const probe = await supabase.from('landing_deals').select('id').limit(1);
    if (probe.error) {
      const msg = (probe.error.message || '').toLowerCase();
      if (msg.includes('could not find') || msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('relation')) {
        console.log('[LandingSync] landing_deals table does not exist — skipping sync. Create it with supabase-full-setup.sql');
        tableExists = false;
      }
    }
  } catch {
    console.log('[LandingSync] landing_deals probe failed — assuming table missing');
    tableExists = false;
  }

  if (!tableExists) {
    return {
      success: false,
      syncedDeals: 0,
      errors: ['landing_deals table not found — create with supabase-full-setup.sql'],
      timestamp,
      filesUploaded: [],
      deployTriggered: false,
    };
  }

  const liveDealIds = new Set(deals.map(d => d.id));

  try {
    const { data: existingLanding, error: existingLandingError } = await supabase.from('landing_deals').select('id');
    if (existingLandingError) {
      console.log('[LandingSync] Existing landing_deals read failed:', existingLandingError.message);
    } else if (existingLanding && Array.isArray(existingLanding)) {
      const staleIds = existingLanding
        .map((r: { id: string }) => r.id)
        .filter((id: string) => !liveDealIds.has(id));
      if (staleIds.length > 0) {
        console.log('[LandingSync] Removing', staleIds.length, 'stale deals from landing_deals:', staleIds.join(', '));
        for (const staleId of staleIds) {
          await supabase.from('landing_deals').delete().eq('id', staleId);
        }
      }
    }
  } catch (cleanupErr) {
    console.log('[LandingSync] Stale cleanup failed (non-critical):', (cleanupErr as Error)?.message);
  }

  for (const deal of deals) {
    try {
      const error = await upsertLandingDealRow(deal, timestamp);

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('could not find') || msg.includes('does not exist') || msg.includes('schema cache')) {
          console.log('[LandingSync] landing_deals table not found — create it with supabase-full-setup.sql');
          errors.push('landing_deals table not found in Supabase');
          break;
        }
        errors.push(`Deal ${deal.id}: ${error.message}`);
        console.log('[LandingSync] Upsert error for deal', deal.id, ':', error.message);
      } else {
        syncedCount++;
      }
    } catch (err) {
      errors.push(`Deal ${deal.id}: ${(err as Error)?.message}`);
    }
  }

  if (syncedCount > 0) {
    console.log('[LandingSync] Supabase landing_deals sync:', syncedCount, 'deals synced,', errors.length, 'errors');
  }

  try {
    await logAudit({
      entityType: 'system',
      entityId: `landing-sync-${Date.now()}`,
      entityTitle: `Landing sync: ${syncedCount}/${deals.length} deals`,
      action: 'SYSTEM_EVENT',
      source: 'system',
      details: {
        syncedCount,
        totalDeals: deals.length,
        errors,
        endpoint: 'supabase_landing_deals',
      },
    });
  } catch (auditErr) {
    console.log('[LandingSync] Audit log failed (non-critical):', auditErr);
  }

  return {
    success: errors.length === 0,
    syncedDeals: syncedCount,
    errors,
    timestamp,
    filesUploaded: [],
    deployTriggered: false,
  };
}

export async function syncSingleDealToLanding(dealId: string): Promise<{ success: boolean; error?: string }> {
  console.log('[LandingSync] Syncing single deal:', dealId);

  try {
    const { data, error } = await supabase
      .from('jv_deals')
      .select('*')
      .eq('id', dealId)
      .single();

    if (error || !data) {
      console.log('[LandingSync] Deal not found in Supabase, trying full sync anyway...');
    } else {
      const row = data as Record<string, unknown>;
      if (row.published !== true) {
        return { success: false, error: 'Deal is not published' };
      }
    }

    const result = await syncToLandingPage();

    console.log('[LandingSync] Single deal sync complete — deploy already triggered inside syncToLandingPage, skipping duplicate');

    return { success: result.success, error: result.errors.join('; ') || undefined };
  } catch (err) {
    return { success: false, error: (err as Error)?.message };
  }
}

export async function triggerAutoDeployAfterPublish(dealId: string): Promise<void> {
  console.log('[LandingSync] Auto-deploy triggered after publish for deal:', dealId);
  try {
    const syncResult = await syncToLandingPage();
    console.log('[LandingSync] Post-publish sync:', syncResult.success, 'deals:', syncResult.syncedDeals, '— deploy already triggered inside syncToLandingPage, skipping duplicate');
  } catch (err) {
    console.log('[LandingSync] Post-publish auto-deploy error:', (err as Error)?.message);
  }
}

export async function getLandingSyncStatus(): Promise<{
  lastSync: string | null;
  publishedDealsCount: number;
  landingDealsCount: number;
  canonicalApiCount: number;
  inSync: boolean;
  lastDeployTime: string | null;
  lastDeployError: string | null;
}> {
  let publishedCount = 0;
  let landingCount = 0;

  try {
    const { data: publishedRows } = await supabase
      .from('jv_deals')
      .select('id,published,status')
      .order('id', { ascending: true });
    publishedCount = Array.isArray(publishedRows)
      ? publishedRows.filter((row) => isLandingVisibleRow((row ?? {}) as Record<string, unknown>)).length
      : 0;
  } catch {
    console.log('[LandingSync] Could not count published deals');
  }

  try {
    const { count: landCount } = await supabase
      .from('landing_deals')
      .select('id', { count: 'exact', head: true });
    landingCount = landCount ?? 0;
  } catch {
    console.log('[LandingSync] Could not count landing deals (table may not exist)');
  }

  const inSync = publishedCount === landingCount;
  if (!inSync) {
    console.warn('[LandingSync] ⚠️ OUT OF SYNC: jv_deals published:', publishedCount, '| landing_deals:', landingCount);
  }

  return {
    lastSync: _lastSyncTimestamp || null,
    publishedDealsCount: publishedCount,
    landingDealsCount: landingCount,
    canonicalApiCount: publishedCount,
    inSync,
    lastDeployTime: _lastDeployTimestamp > 0 ? new Date(_lastDeployTimestamp).toISOString() : null,
    lastDeployError: _lastDeployError,
  };
}

export async function fetchCanonicalPublishedDeals(): Promise<PublishedDealCardModel[]> {
  const deals = await fetchPublishedDeals();
  return deals.map(d => d.cardModel || mapDealToCardModel(d as unknown as Record<string, unknown>));
}

export function validateSyncIntegrity(publishedCount: number, landingCount: number): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (publishedCount !== landingCount) {
    errors.push(`Count mismatch: jv_deals has ${publishedCount} published, landing_deals has ${landingCount}`);
  }
  return { valid: errors.length === 0, errors };
}
