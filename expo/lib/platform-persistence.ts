/**
 * IVX Platform Persistence (Phase 1 — Core Owner Write-Through)
 *
 * Typed React Query hooks + mutations for the 7 owner-controlled tables created
 * in `expo/deploy/supabase/ivx-platform-persistence-phase1.sql`:
 *
 *   - platform_settings
 *   - fee_configurations
 *   - property_controls
 *   - notification_events
 *   - deployment_history
 *   - ai_usage_logs
 *   - audit_events
 *
 * Tables not yet migrated return graceful empty/`null` results so the UI stays
 * stable until the migration is applied (rollback safe).
 *
 * All write paths funnel through `recordAuditEvent` so every owner action is
 * captured in `audit_events`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PLATFORM_PERSISTENCE_PHASE1_SQL } from '@/lib/platform-persistence-migration-sql';

const IVX_DEPLOY_BACKEND_ORIGIN = 'https://ivx-holdings-platform.onrender.com';
const IVX_SUPABASE_SQL_CONFIRM_TEXT = 'CONFIRM_IVX_SUPABASE_MIGRATION';

/**
 * Apply Phase 1 owner persistence migration in one tap.
 *
 * Calls the owner-only backend route `supabase_execute_sql` with the bundled SQL.
 * The phone never sees the Supabase DB URL — the backend runtime uses its own
 * SUPABASE_DB_URL / DATABASE_URL / POSTGRES_URL.
 */
export type ApplyMigrationResult = {
  ok: boolean;
  endpoint: string;
  httpStatus: number;
  command: string | null;
  rowCount: number | null;
  error: string | null;
  timestamp: string;
};

export async function applyPlatformPersistenceMigration(): Promise<ApplyMigrationResult> {
  const endpoint = `${IVX_DEPLOY_BACKEND_ORIGIN}/api/ivx/developer-deploy/action`;
  const timestamp = new Date().toISOString();
  let accessToken: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token ?? null;
  } catch (e) {
    return { ok: false, endpoint, httpStatus: 0, command: null, rowCount: null, error: `Session lookup failed: ${String(e)}`, timestamp };
  }
  if (!accessToken) {
    return { ok: false, endpoint, httpStatus: 0, command: null, rowCount: null, error: 'Owner session token not connected. Sign in again, then re-tap Apply migration.', timestamp };
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: 'supabase_execute_sql',
        confirm: true,
        confirmText: IVX_SUPABASE_SQL_CONFIRM_TEXT,
        reason: 'Owner-tapped Phase 1 persistence migration from Owner Controls',
        input: { sql: PLATFORM_PERSISTENCE_PHASE1_SQL, returnRows: false },
      }),
    });
    const text = await response.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    const result = payload && typeof payload === 'object' ? payload.result : null;
    if (!response.ok) {
      const message = (payload && (payload.error || payload.message)) || `Migration request failed with HTTP ${response.status}.`;
      return { ok: false, endpoint, httpStatus: response.status, command: null, rowCount: null, error: String(message), timestamp };
    }
    return {
      ok: true,
      endpoint,
      httpStatus: response.status,
      command: result && typeof result.command === 'string' ? result.command : null,
      rowCount: result && typeof result.rowCount === 'number' ? result.rowCount : null,
      error: null,
      timestamp,
    };
  } catch (e) {
    return { ok: false, endpoint, httpStatus: 0, command: null, rowCount: null, error: `Network error: ${String(e)}`, timestamp };
  }
}

const TABLE_MISSING_CODES = new Set(['42P01', 'PGRST205']);

function isTableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code && TABLE_MISSING_CODES.has(error.code)) return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('schema cache');
}

async function currentUser(): Promise<{ id: string | null; email: string | null }> {
  try {
    const { data } = await supabase.auth.getUser();
    return { id: data.user?.id ?? null, email: data.user?.email ?? null };
  } catch {
    return { id: null, email: null };
  }
}

/** Append-only owner action log. Never throws — auditing must not break flows. */
export async function recordAuditEvent(input: {
  category: string;
  action: string;
  targetType?: string;
  targetId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { id, email } = await currentUser();
    const { error } = await supabase.from('audit_events').insert({
      actor_id: id,
      actor_email: email,
      category: input.category,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      before_state: input.beforeState ?? null,
      after_state: input.afterState ?? null,
      metadata: input.metadata ?? {},
    });
    if (error && !isTableMissing(error)) {
      console.log('[PlatformPersistence] audit_events insert error:', error.message);
    }
  } catch (e) {
    console.log('[PlatformPersistence] recordAuditEvent failed:', e);
  }
}

// ---------------------------------------------------------------------------
// platform_settings
// ---------------------------------------------------------------------------
export type PlatformSetting = {
  key: string;
  value: unknown;
  description: string | null;
  category: string;
  updatedAt: string;
};

export function usePlatformSettings(category?: string) {
  return useQuery<PlatformSetting[]>({
    queryKey: ['platform-settings', category ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('platform_settings').select('*');
      if (category) q = q.eq('category', category);
      const { data, error } = await q.order('key');
      if (error) {
        if (isTableMissing(error)) return [];
        throw error;
      }
      return (data ?? []).map((row: any) => ({
        key: row.key,
        value: row.value,
        description: row.description,
        category: row.category ?? 'general',
        updatedAt: row.updated_at ?? new Date().toISOString(),
      }));
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useUpsertPlatformSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      key: string;
      value: unknown;
      category?: string;
      description?: string;
    }) => {
      const { id } = await currentUser();
      const { error } = await supabase
        .from('platform_settings')
        .upsert({
          key: input.key,
          value: input.value as object,
          category: input.category ?? 'general',
          description: input.description ?? null,
          updated_by: id,
        });
      if (error) throw error;
      await recordAuditEvent({
        category: 'platform_settings',
        action: 'upsert',
        targetType: 'platform_setting',
        targetId: input.key,
        afterState: { value: input.value, category: input.category ?? 'general' },
      });
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings'] });
    },
  });
}

// ---------------------------------------------------------------------------
// fee_configurations
// ---------------------------------------------------------------------------
export type FeeConfigRow = {
  id: string;
  type: string;
  name: string;
  percentage: number;
  minFee: number;
  maxFee: number;
  isActive: boolean;
  updatedAt: string;
};

export function useUpsertFeeConfiguration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      type: string;
      name: string;
      percentage: number;
      minFee: number;
      maxFee: number;
      isActive: boolean;
    }) => {
      const { id: userId } = await currentUser();
      const payload = {
        id: input.id ?? `fee-${input.type}`,
        type: input.type,
        name: input.name,
        percentage: input.percentage,
        min_fee: input.minFee,
        max_fee: input.maxFee,
        is_active: input.isActive,
        updated_by: userId,
      };
      const { error } = await supabase
        .from('fee_configurations')
        .upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      await recordAuditEvent({
        category: 'fees',
        action: 'upsert',
        targetType: 'fee_configuration',
        targetId: payload.id,
        afterState: payload,
      });
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fee-configurations'] });
    },
  });
}

// ---------------------------------------------------------------------------
// property_controls
// ---------------------------------------------------------------------------
export type PropertyControlRow = {
  propertyId: string;
  isFeatured: boolean;
  isHidden: boolean;
  isLocked: boolean;
  overrideStatus: string | null;
  overridePrice: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export function usePropertyControls() {
  return useQuery<PropertyControlRow[]>({
    queryKey: ['property-controls'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_controls')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) {
        if (isTableMissing(error)) return [];
        throw error;
      }
      return (data ?? []).map((row: any) => ({
        propertyId: row.property_id,
        isFeatured: !!row.is_featured,
        isHidden: !!row.is_hidden,
        isLocked: !!row.is_locked,
        overrideStatus: row.override_status,
        overridePrice: row.override_price,
        notes: row.notes,
        metadata: row.metadata ?? {},
        updatedAt: row.updated_at ?? new Date().toISOString(),
      }));
    },
    staleTime: 60_000,
    retry: 1,
  });
}

export function useUpsertPropertyControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PropertyControlRow> & { propertyId: string }) => {
      const { id: userId } = await currentUser();
      const payload = {
        property_id: input.propertyId,
        is_featured: input.isFeatured ?? false,
        is_hidden: input.isHidden ?? false,
        is_locked: input.isLocked ?? false,
        override_status: input.overrideStatus ?? null,
        override_price: input.overridePrice ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata ?? {},
        updated_by: userId,
      };
      const { error } = await supabase
        .from('property_controls')
        .upsert(payload, { onConflict: 'property_id' });
      if (error) throw error;
      await recordAuditEvent({
        category: 'properties',
        action: 'upsert_control',
        targetType: 'property',
        targetId: input.propertyId,
        afterState: payload,
      });
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['property-controls'] });
    },
  });
}

// ---------------------------------------------------------------------------
// notification_events
// ---------------------------------------------------------------------------
export type NotificationEvent = {
  id: string;
  channel: 'email' | 'sms' | 'push' | 'in_app' | 'webhook';
  topic: string;
  recipient: string | null;
  payload: Record<string, unknown>;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  error: string | null;
  createdAt: string;
};

export function useRecentNotifications(limit: number = 100) {
  return useQuery<NotificationEvent[]>({
    queryKey: ['notification-events', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (isTableMissing(error)) return [];
        throw error;
      }
      return (data ?? []).map((row: any) => ({
        id: row.id,
        channel: row.channel,
        topic: row.topic,
        recipient: row.recipient,
        payload: row.payload ?? {},
        status: row.status,
        error: row.error,
        createdAt: row.created_at,
      }));
    },
    staleTime: 30_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// deployment_history
// ---------------------------------------------------------------------------
export type DeploymentRecord = {
  id: string;
  target: 'backend' | 'landing' | 'mobile' | 'infra' | 'other';
  status: 'triggered' | 'running' | 'success' | 'failed' | 'rolled_back';
  serviceId: string | null;
  deployId: string | null;
  commitSha: string | null;
  triggerReason: string | null;
  metadata: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
};

export function useDeploymentHistory(limit: number = 50) {
  return useQuery<DeploymentRecord[]>({
    queryKey: ['deployment-history', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deployment_history')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (isTableMissing(error)) return [];
        throw error;
      }
      return (data ?? []).map((row: any) => ({
        id: row.id,
        target: row.target,
        status: row.status,
        serviceId: row.service_id,
        deployId: row.deploy_id,
        commitSha: row.commit_sha,
        triggerReason: row.trigger_reason,
        metadata: row.metadata ?? {},
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      }));
    },
    staleTime: 15_000,
    retry: 1,
  });
}

export async function recordDeploymentStart(input: {
  target: DeploymentRecord['target'];
  serviceId?: string;
  triggerReason?: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const { id: userId } = await currentUser();
    const { data, error } = await supabase
      .from('deployment_history')
      .insert({
        target: input.target,
        status: 'triggered',
        service_id: input.serviceId ?? null,
        trigger_reason: input.triggerReason ?? null,
        metadata: input.metadata ?? {},
        triggered_by: userId,
      })
      .select('id')
      .single();
    if (error) {
      if (!isTableMissing(error)) {
        console.log('[PlatformPersistence] recordDeploymentStart error:', error.message);
      }
      return null;
    }
    await recordAuditEvent({
      category: 'deployments',
      action: 'trigger',
      targetType: input.target,
      targetId: data?.id,
      metadata: input.metadata,
    });
    return data?.id ?? null;
  } catch (e) {
    console.log('[PlatformPersistence] recordDeploymentStart failed:', e);
    return null;
  }
}

export async function recordDeploymentFinish(
  id: string,
  patch: { status: DeploymentRecord['status']; deployId?: string; commitSha?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    const { error } = await supabase
      .from('deployment_history')
      .update({
        status: patch.status,
        deploy_id: patch.deployId ?? null,
        commit_sha: patch.commitSha ?? null,
        metadata: patch.metadata ?? {},
        finished_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error && !isTableMissing(error)) {
      console.log('[PlatformPersistence] recordDeploymentFinish error:', error.message);
    }
  } catch (e) {
    console.log('[PlatformPersistence] recordDeploymentFinish failed:', e);
  }
}

// ---------------------------------------------------------------------------
// ai_usage_logs / audit_events
// ---------------------------------------------------------------------------
export type AIUsageLog = {
  id: string;
  provider: string;
  model: string;
  surface: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  status: 'success' | 'error' | 'blocked' | 'rate_limited';
  error: string | null;
  costUsd: number;
  createdAt: string;
};

export function useAIUsageLogs(limit: number = 100) {
  return useQuery<AIUsageLog[]>({
    queryKey: ['ai-usage-logs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (isTableMissing(error)) return [];
        throw error;
      }
      return (data ?? []).map((row: any) => ({
        id: row.id,
        provider: row.provider,
        model: row.model ?? '',
        surface: row.surface ?? 'ivx_ia',
        promptTokens: row.prompt_tokens ?? 0,
        completionTokens: row.completion_tokens ?? 0,
        totalTokens: row.total_tokens ?? 0,
        latencyMs: row.latency_ms ?? 0,
        status: row.status,
        error: row.error,
        costUsd: Number(row.cost_usd ?? 0),
        createdAt: row.created_at,
      }));
    },
    staleTime: 15_000,
    retry: 1,
  });
}

export type AuditEvent = {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  category: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export function useAuditEvents(limit: number = 200, category?: string) {
  return useQuery<AuditEvent[]>({
    queryKey: ['audit-events', category ?? 'all', limit],
    queryFn: async () => {
      let q = supabase
        .from('audit_events')
        .select('id,actor_email,actor_role,category,action,target_type,target_id,metadata,created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (category) q = q.eq('category', category);
      const { data, error } = await q;
      if (error) {
        if (isTableMissing(error)) return [];
        throw error;
      }
      return (data ?? []).map((row: any) => ({
        id: row.id,
        actorEmail: row.actor_email,
        actorRole: row.actor_role,
        category: row.category,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        metadata: row.metadata ?? {},
        createdAt: row.created_at,
      }));
    },
    staleTime: 15_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Runtime health probe — used by debug panel
// ---------------------------------------------------------------------------
export type PersistenceHealth = {
  table: string;
  ok: boolean;
  missing: boolean;
  error: string | null;
};

export async function probePersistenceHealth(): Promise<PersistenceHealth[]> {
  const tables = [
    'platform_settings',
    'fee_configurations',
    'property_controls',
    'notification_events',
    'deployment_history',
    'ai_usage_logs',
    'audit_events',
  ] as const;
  const results: PersistenceHealth[] = [];
  for (const t of tables) {
    try {
      const { error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      if (!error) {
        results.push({ table: t, ok: true, missing: false, error: null });
      } else if (isTableMissing(error)) {
        results.push({ table: t, ok: false, missing: true, error: error.message });
      } else {
        results.push({ table: t, ok: false, missing: false, error: error.message });
      }
    } catch (e) {
      results.push({ table: t, ok: false, missing: false, error: String(e) });
    }
  }
  return results;
}
