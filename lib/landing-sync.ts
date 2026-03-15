import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit-trail';
import { deployLandingPage, deployConfigOnly, getDeployStatus } from '@/lib/landing-deploy';

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
  expectedROI: number;
  status: string;
  photos: string[];
  distributionFrequency: string;
  exitStrategy: string;
  publishedAt: string;
  updatedAt: string;
}

const LANDING_SYNC_ENDPOINT = process.env.EXPO_PUBLIC_RORK_API_BASE_URL
  ? `${process.env.EXPO_PUBLIC_RORK_API_BASE_URL}/api/landing-sync`
  : null;

function isSupabaseConfigured(): boolean {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return !!(url && key);
}

async function fetchPublishedDeals(): Promise<PublishedDealPayload[]> {
  if (!isSupabaseConfigured()) {
    console.log('[LandingSync] Supabase not configured — cannot fetch published deals');
    return [];
  }

  try {
    let data: Record<string, unknown>[] | null = null;
    let error: { message: string; code?: string } | null = null;

    const result1 = await supabase
      .from('jv_deals')
      .select('*')
      .eq('published', true)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (result1.error) {
      console.log('[LandingSync] Query with status filter failed:', result1.error.message);
      const result2 = await supabase
        .from('jv_deals')
        .select('*')
        .eq('published', true);

      data = result2.data as Record<string, unknown>[] | null;
      error = result2.error;
    } else {
      data = result1.data as Record<string, unknown>[] | null;
      error = null;
    }

    if (error) {
      console.log('[LandingSync] Supabase fetch error:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    console.log('[LandingSync] Found', data.length, 'published deals');

    return data.map((row: Record<string, unknown>) => {
      let photosRaw: unknown[] = [];
      if (typeof row.photos === 'string') {
        try { const parsed = JSON.parse(row.photos as string); photosRaw = Array.isArray(parsed) ? parsed : []; } catch { photosRaw = []; }
      } else if (Array.isArray(row.photos)) {
        photosRaw = row.photos;
      }
      const photos: string[] = photosRaw.filter(
        (p: unknown) => typeof p === 'string' && (p as string).length > 5 && ((p as string).startsWith('http') || (p as string).startsWith('data:image/'))
      ) as string[];

      return {
        id: row.id as string,
        title: (row.title as string) || '',
        projectName: (row.projectName as string) || (row.project_name as string) || '',
        description: (row.description as string) || '',
        propertyAddress: (row.propertyAddress as string) || (row.property_address as string) || '',
        city: (row.city as string) || '',
        state: (row.state as string) || '',
        country: (row.country as string) || '',
        totalInvestment: (row.totalInvestment as number) || (row.total_investment as number) || 0,
        expectedROI: (row.expectedROI as number) || (row.expected_roi as number) || 0,
        status: (row.status as string) || 'active',
        photos,
        distributionFrequency: (row.distributionFrequency as string) || (row.distribution_frequency as string) || '',
        exitStrategy: (row.exitStrategy as string) || (row.exit_strategy as string) || '',
        publishedAt: (row.publishedAt as string) || (row.published_at as string) || '',
        updatedAt: (row.updatedAt as string) || (row.updated_at as string) || new Date().toISOString(),
      };
    });
  } catch (err) {
    console.log('[LandingSync] Fetch exception:', (err as Error)?.message);
    return [];
  }
}

let _lastDeployTimestamp = 0;
const DEPLOY_COOLDOWN = 30000;

async function tryAutoDeployToS3(): Promise<void> {
  if (Platform.OS !== 'web') {
    console.log('[LandingSync] Native platform — triggering deploy via backend API...');
    await tryDeployViaBackend();
    return;
  }
  const now = Date.now();
  if (now - _lastDeployTimestamp < DEPLOY_COOLDOWN) {
    console.log('[LandingSync] S3 deploy cooldown active, skipping');
    return;
  }
  const status = getDeployStatus();
  if (!status.canDeploy) {
    console.log('[LandingSync] Cannot auto-deploy: AWS configured:', status.awsConfigured, '| Supabase configured:', status.supabaseConfigured);
    return;
  }
  _lastDeployTimestamp = now;
  try {
    console.log('[LandingSync] Auto-deploying full landing page to S3 (includes updated HTML)...');
    const result = await deployLandingPage();
    if (result.success) {
      console.log('[LandingSync] S3 full deploy SUCCESS — files:', result.filesUploaded.join(', '));
    } else {
      console.log('[LandingSync] S3 full deploy had issues, trying config only...', result.errors.join('; '));
      const configResult = await deployConfigOnly();
      if (configResult.success) {
        console.log('[LandingSync] S3 config-only deploy SUCCESS');
      } else {
        console.log('[LandingSync] S3 config deploy also failed:', configResult.error);
      }
    }
  } catch (err) {
    console.log('[LandingSync] S3 deploy error:', (err as Error)?.message);
  }
}

async function tryDeployViaBackend(): Promise<void> {
  const backendUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (!backendUrl) {
    console.log('[LandingSync] No backend URL — cannot deploy from native platform');
    return;
  }
  const now = Date.now();
  if (now - _lastDeployTimestamp < DEPLOY_COOLDOWN) {
    console.log('[LandingSync] Backend deploy cooldown active, skipping');
    return;
  }
  _lastDeployTimestamp = now;
  try {
    console.log('[LandingSync] Triggering deploy via backend:', backendUrl + '/api/deploy-landing');
    const response = await fetch(backendUrl + '/api/deploy-landing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: new Date().toISOString(), source: 'auto-sync' }),
    });
    if (response.ok) {
      const result = await response.json();
      console.log('[LandingSync] Backend deploy result:', result.success ? 'SUCCESS' : 'FAILED', '| files:', (result.filesUploaded || []).join(', '));
    } else {
      console.log('[LandingSync] Backend deploy HTTP error:', response.status);
    }
  } catch (err) {
    console.log('[LandingSync] Backend deploy error:', (err as Error)?.message);
  }
}

export async function syncToLandingPage(): Promise<LandingSyncResult> {
  const timestamp = new Date().toISOString();

  try {
    const deals = await fetchPublishedDeals();

    if (deals.length === 0) {
      return { success: true, syncedDeals: 0, errors: [], timestamp };
    }

    tryAutoDeployToS3().then(() => {
      console.log('[LandingSync] Auto-deploy completed');
    }).catch((err) => {
      console.log('[LandingSync] Auto-deploy failed:', (err as Error)?.message);
    });

    if (!LANDING_SYNC_ENDPOINT) {
      return await syncToSupabaseLandingTable(deals, timestamp);
    }

    try {
      const response = await fetch(LANDING_SYNC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`,
        },
        body: JSON.stringify({
          deals,
          syncedAt: timestamp,
          source: 'ivx-app',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('[LandingSync] API error:', response.status, errorText);
        console.log('[LandingSync] Falling back to Supabase landing_deals table');
        return await syncToSupabaseLandingTable(deals, timestamp);
      }

      console.log('[LandingSync] API sync SUCCESS —', deals.length, 'deals synced');

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
            endpoint: 'external_api',
          },
        });
      } catch (auditErr) {
        console.log('[LandingSync] Audit log failed (non-critical):', auditErr);
      }

      return { success: true, syncedDeals: deals.length, errors: [], timestamp };
    } catch (fetchErr) {
      console.log('[LandingSync] API fetch failed:', (fetchErr as Error)?.message);
      console.log('[LandingSync] Falling back to Supabase landing_deals table');
      return await syncToSupabaseLandingTable(deals, timestamp);
    }
  } catch (err) {
    console.log('[LandingSync] Sync exception:', (err as Error)?.message);
    return { success: false, syncedDeals: 0, errors: [(err as Error)?.message || 'Unknown error'], timestamp };
  }
}

export async function fullDeployToLanding(): Promise<{ success: boolean; filesUploaded: string[]; errors: string[] }> {
  console.log('[LandingSync] Full landing page deploy requested...');
  try {
    const result = await deployLandingPage();
    console.log('[LandingSync] Full deploy result:', result.success, '| files:', result.filesUploaded.join(', '));
    return { success: result.success, filesUploaded: result.filesUploaded, errors: result.errors };
  } catch (err) {
    console.log('[LandingSync] Full deploy error:', (err as Error)?.message);
    return { success: false, filesUploaded: [], errors: [(err as Error)?.message || 'Deploy failed'] };
  }
}

async function syncToSupabaseLandingTable(deals: PublishedDealPayload[], timestamp: string): Promise<LandingSyncResult> {
  const errors: string[] = [];
  let syncedCount = 0;

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
          expected_roi: deal.expectedROI,
          status: deal.status,
          photos: JSON.stringify(deal.photos),
          distribution_frequency: deal.distributionFrequency,
          exit_strategy: deal.exitStrategy,
          published_at: deal.publishedAt,
          updated_at: deal.updatedAt,
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
      return { success: false, error: error?.message || 'Deal not found' };
    }

    const row = data as Record<string, unknown>;
    if (row.published !== true) {
      return { success: false, error: 'Deal is not published' };
    }

    const result = await syncToLandingPage();
    return { success: result.success, error: result.errors.join('; ') || undefined };
  } catch (err) {
    return { success: false, error: (err as Error)?.message };
  }
}

export async function getLandingSyncStatus(): Promise<{
  lastSync: string | null;
  publishedDealsCount: number;
  landingDealsCount: number;
  inSync: boolean;
}> {
  let publishedCount = 0;
  let landingCount = 0;

  try {
    const { count: pubCount } = await supabase
      .from('jv_deals')
      .select('id', { count: 'exact', head: true })
      .eq('published', true)
      .eq('status', 'active');
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

  return {
    lastSync: null,
    publishedDealsCount: publishedCount,
    landingDealsCount: landingCount,
    inSync: publishedCount === landingCount,
  };
}
