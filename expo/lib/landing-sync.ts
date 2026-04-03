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
import { deployLandingPage, getDeployStatus } from '@/lib/landing-deploy';
import {
  mapDealToCardModel,
  CANONICAL_DISTRIBUTION_LABEL,
  type PublishedDealCardModel,
} from '@/lib/published-deal-card-model';
import { fetchCanonicalDeals } from '@/lib/canonical-deals';

async function _getSyncAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const isExpiringSoon = expiresAt > 0 && (expiresAt - Date.now()) < 120000;

      if (isExpiringSoon && session.refresh_token) {
        console.log('[LandingSync] Token expiring soon — refreshing...');
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session?.access_token) {
          headers['Authorization'] = `Bearer ${refreshed.session.access_token}`;
          console.log('[LandingSync] Refreshed token attached');
        } else {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      } else {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } else {
      console.log('[LandingSync] No session — attempting refresh...');
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session?.access_token) {
        headers['Authorization'] = `Bearer ${refreshed.session.access_token}`;
        console.log('[LandingSync] Recovered session via refresh');
      } else {
        headers['Authorization'] = `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`;
      }
    }
  } catch {
    headers['Authorization'] = `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`;
  }
  return headers;
}

export interface LandingSyncResult {
  success: boolean;
  syncedDeals: number;
  errors: string[];
  timestamp: string;
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

const _landingSyncBase = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
const LANDING_SYNC_ENDPOINT = _landingSyncBase
  ? `${_landingSyncBase}/api/landing-sync`
  : null;

function isSupabaseConfigured(): boolean {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return !!(url && key);
}

async function fetchPublishedDealsViaBackend(): Promise<PublishedDealPayload[]> {
  const backendUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (!backendUrl) {
    console.log('[LandingSync] No backend URL — cannot fetch published deals');
    return [];
  }
  try {
    console.log('[LandingSync] Fetching published deals from backend:', backendUrl + '/api/published-jv-deals');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const authHeaders = await _getSyncAuthHeaders();
    let response = await fetch(backendUrl + '/api/published-jv-deals', { headers: authHeaders, signal: controller.signal }).catch(() => null);
    if (!response || !response.ok) {
      console.log('[LandingSync] /api/published-jv-deals failed, falling back to /api/landing-deals');
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 8000);
      response = await fetch(backendUrl + '/api/landing-deals', { headers: authHeaders, signal: controller2.signal });
      clearTimeout(timeout2);
    }
    clearTimeout(timeout);
    if (!response || !response.ok) {
      console.log('[LandingSync] Backend fetch failed:', response?.status);
      return [];
    }
    const result = await response.json();
    const deals = Array.isArray(result) ? result : (result?.deals || []);
    console.log('[LandingSync] Backend returned', deals.length, 'deals');
    const mapped = deals.map((row: Record<string, unknown>) => mapRowToPayload(row));
    mapped.sort((a: PublishedDealPayload, b: PublishedDealPayload) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return (b.publishedAt || '').localeCompare(a.publishedAt || '');
    });
    return mapped;
  } catch (err) {
    console.log('[LandingSync] Backend fetch exception:', (err as Error)?.message);
    return [];
  }
}

function mapRowToPayload(row: Record<string, unknown>): PublishedDealPayload {
  let photosRaw: unknown[] = [];
  if (typeof row.photos === 'string') {
    try { const parsed = JSON.parse(row.photos as string); photosRaw = Array.isArray(parsed) ? parsed : []; } catch { photosRaw = []; }
  } else if (Array.isArray(row.photos)) {
    photosRaw = row.photos;
  }
  const photos: string[] = photosRaw.filter(
    (p: unknown) => typeof p === 'string' && (p as string).length > 5 && ((p as string).startsWith('http') || (p as string).startsWith('data:image/'))
  ) as string[];

  let trustInfo: Record<string, unknown> | undefined;
  const rawTrust = row.trustInfo ?? row.trust_info;
  if (rawTrust) {
    if (typeof rawTrust === 'string') {
      try { trustInfo = JSON.parse(rawTrust); } catch { trustInfo = undefined; }
    } else if (typeof rawTrust === 'object') {
      trustInfo = rawTrust as Record<string, unknown>;
    }
  }

  const payload: PublishedDealPayload = {
    id: (row.id as string) || '',
    title: (row.title as string) || '',
    projectName: (row.projectName as string) || (row.project_name as string) || '',
    description: (row.description as string) || '',
    propertyAddress: (row.propertyAddress as string) || (row.property_address as string) || '',
    city: (row.city as string) || '',
    state: (row.state as string) || '',
    country: (row.country as string) || '',
    totalInvestment: (row.totalInvestment as number) || (row.total_investment as number) || 0,
    propertyValue: (row.propertyValue as number) || (row.property_value as number) || (row.estimated_value as number) || 0,
    expectedROI: (row.expectedROI as number) || (row.expected_roi as number) || 0,
    status: (row.status as string) || 'active',
    photos,
    distributionFrequency: CANONICAL_DISTRIBUTION_LABEL,
    exitStrategy: (row.exitStrategy as string) || (row.exit_strategy as string) || 'Sale upon completion',
    publishedAt: (row.publishedAt as string) || (row.published_at as string) || '',
    updatedAt: (row.updatedAt as string) || (row.updated_at as string) || new Date().toISOString(),
    displayOrder: (row.displayOrder as number) ?? (row.display_order as number) ?? 999,
    trustInfo,
  };

  payload.cardModel = mapDealToCardModel(row);

  return payload;
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
    projectName: card.developerName,
    description: card.descriptionShort,
    propertyAddress: card.addressFull,
    city: card.city,
    state: card.state,
    country: card.country,
    totalInvestment: card.totalInvestment,
    propertyValue: card.propertyValue || 0,
    expectedROI: card.expectedROI,
    status: card.status,
    photos: card.photos,
    distributionFrequency: card.distributionFrequency,
    exitStrategy: card.exitStrategy,
    publishedAt: card.publishedAt,
    updatedAt: card.publishedAt,
    displayOrder: card.displayOrder,
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
      .eq('published', true)
      .in('status', ['active', 'published', 'live'])
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (result.error) {
      console.log('[LandingSync] Direct fallback query error:', result.error.message);
      return fetchPublishedDealsViaBackend();
    }

    const data = result.data as Record<string, unknown>[] | null;
    if (!data || data.length === 0) return [];

    const mapped = data.map(mapRowToPayload);
    mapped.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return (b.publishedAt || '').localeCompare(a.publishedAt || '');
    });
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

    const { error } = await supabase
      .from('landing_page_config')
      .upsert({
        id: 'deals_cache',
        deployed_at: timestamp,
        deploy_status: 'cached',
        updated_at: timestamp,
        details: JSON.stringify(staticPayload),
      });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')) {
        console.log('[LandingSync] landing_page_config table not found — skipping deals cache');
        return;
      }
      if (msg.includes('details')) {
        console.log('[LandingSync] deals_cache column missing — skipping (non-critical)');
        return;
      }
      console.log('[LandingSync] Deals cache upsert error:', error.message);
    } else {
      console.log('[LandingSync] Static deals.json cached in landing_page_config —', deals.length, 'deals, TTL 5min');
    }
  } catch (err) {
    console.log('[LandingSync] Static deals cache exception:', (err as Error)?.message);
  }
}

async function triggerBackendDeploy(): Promise<void> {
  const now = Date.now();
  if (now - _lastDeployTimestamp < DEPLOY_COOLDOWN) {
    console.log('[LandingSync] Deploy cooldown active, skipping');
    return;
  }
  const status = getDeployStatus();
  if (!status.canDeploy) {
    console.log('[LandingSync] Cannot deploy: backend not configured');
    return;
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
  } catch (err) {
    console.log('[LandingSync] Deploy error:', (err as Error)?.message);
    _lastDeployError = (err as Error)?.message || 'Deploy error';
  }
}

export async function syncToLandingPage(): Promise<LandingSyncResult> {
  const timestamp = new Date().toISOString();

  try {
    const deals = await fetchPublishedDeals();
    _lastSyncTimestamp = timestamp;

    if (deals.length === 0) {
      return { success: true, syncedDeals: 0, errors: [], timestamp };
    }

    console.log('[LandingSync] Syncing', deals.length, 'deals to landing_deals table + triggering deploy...');

    const tableResult = await syncToSupabaseLandingTable(deals, timestamp);

    try {
      await generateStaticDealsJson(deals, timestamp);
    } catch (cacheErr) {
      console.log('[LandingSync] Static deals.json cache failed (non-blocking):', (cacheErr as Error)?.message);
    }

    try {
      await triggerBackendDeploy();
      console.log('[LandingSync] Backend deploy triggered after table sync');
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
        },
      });
    } catch (auditErr) {
      console.log('[LandingSync] Audit log failed (non-critical):', auditErr);
    }

    return tableResult;
  } catch (err) {
    console.log('[LandingSync] Sync exception:', (err as Error)?.message);
    return { success: false, syncedDeals: 0, errors: [(err as Error)?.message || 'Unknown error'], timestamp };
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
      success: true,
      syncedDeals: 0,
      errors: ['landing_deals table not found — create with supabase-full-setup.sql'],
      timestamp,
    };
  }

  const liveDealIds = new Set(deals.map(d => d.id));

  try {
    const { data: existingLanding } = await supabase.from('landing_deals').select('id');
    if (existingLanding && Array.isArray(existingLanding)) {
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
      const { error } = await supabase
        .from('landing_deals')
        .upsert({
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
          expected_roi: deal.expectedROI,
          status: deal.status,
          photos: JSON.stringify(deal.photos),
          distribution_frequency: deal.distributionFrequency,
          exit_strategy: deal.exitStrategy,
          published_at: deal.publishedAt,
          updated_at: deal.updatedAt,
          display_order: deal.displayOrder ?? 999,
          trust_info: deal.trustInfo ? JSON.stringify(deal.trustInfo) : null,
          synced_at: timestamp,
        });

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
    const { count: pubCount } = await supabase
      .from('jv_deals')
      .select('id', { count: 'exact', head: true })
      .eq('published', true)
      .in('status', ['active', 'published', 'live']);
    publishedCount = pubCount ?? 0;
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
