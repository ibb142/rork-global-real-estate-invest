import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { scopedKey } from '@/lib/project-storage';
import { getAuthUserId, getAuthUserRole } from '@/lib/auth-store';

const AUDIT_STORAGE_KEY = scopedKey('global_audit_trail_v1');
const MAX_LOCAL_ENTRIES = 2000;

export type AuditEntityType =
  | 'jv_deal'
  | 'transaction'
  | 'holding'
  | 'property'
  | 'contract'
  | 'wallet'
  | 'profile'
  | 'notification'
  | 'application'
  | 'auth'
  | 'system';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'SOFT_DELETE'
  | 'TRASH'
  | 'RESTORE'
  | 'RESTORE_FROM_TRASH'
  | 'PERMANENT_DELETE'
  | 'ARCHIVE'
  | 'PUBLISH'
  | 'UNPUBLISH'
  | 'PURCHASE'
  | 'SELL'
  | 'TRANSFER'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'REFUND'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ROLE_CHANGE'
  | 'PHOTO_UPDATE'
  | 'BACKUP_CREATED'
  | 'BACKUP_RESTORED'
  | 'SYSTEM_EVENT';

export interface AuditEntry {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  entityTitle?: string;
  action: AuditAction;
  userId: string;
  userRole: string;
  timestamp: string;
  details?: Record<string, unknown>;
  snapshotBefore?: Record<string, unknown>;
  snapshotAfter?: Record<string, unknown>;
  ip?: string;
  source: 'app' | 'admin' | 'system' | 'api';
}

function generateAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

async function getLocalAuditLog(): Promise<AuditEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.log('[AuditTrail] Local read error:', (err as Error)?.message);
    return [];
  }
}

async function saveLocalAuditLog(entries: AuditEntry[]): Promise<void> {
  try {
    if (entries.length > MAX_LOCAL_ENTRIES) {
      entries = entries.slice(0, MAX_LOCAL_ENTRIES);
    }
    await AsyncStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.log('[AuditTrail] Local save error:', (err as Error)?.message);
  }
}

async function syncToSupabase(entry: AuditEntry): Promise<boolean> {
  try {
    const { error } = await supabase.from('audit_trail').insert({
      id: entry.id,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      entity_title: entry.entityTitle || null,
      action: entry.action,
      user_id: entry.userId || null,
      user_role: entry.userRole || 'unknown',
      timestamp: entry.timestamp,
      details: entry.details ? JSON.stringify(entry.details) : null,
      snapshot_before: entry.snapshotBefore ? JSON.stringify(entry.snapshotBefore) : null,
      snapshot_after: entry.snapshotAfter ? JSON.stringify(entry.snapshotAfter) : null,
      source: entry.source,
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('could not find') || msg.includes('schema cache') || msg.includes('does not exist')) {
        console.log('[AuditTrail] Supabase audit_trail table not found — storing locally only');
        return false;
      }
      console.log('[AuditTrail] Supabase sync error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.log('[AuditTrail] Supabase sync exception:', (err as Error)?.message);
    return false;
  }
}

export async function logAudit(params: {
  entityType: AuditEntityType;
  entityId: string;
  entityTitle?: string;
  action: AuditAction;
  details?: Record<string, unknown>;
  snapshotBefore?: Record<string, unknown>;
  snapshotAfter?: Record<string, unknown>;
  source?: 'app' | 'admin' | 'system' | 'api';
}): Promise<AuditEntry> {
  const userId = getAuthUserId();
  const userRole = getAuthUserRole();

  const entry: AuditEntry = {
    id: generateAuditId(),
    entityType: params.entityType,
    entityId: params.entityId,
    entityTitle: params.entityTitle,
    action: params.action,
    userId: userId ?? 'anonymous',
    userRole: userRole ?? 'unknown',
    timestamp: new Date().toISOString(),
    details: params.details,
    snapshotBefore: params.snapshotBefore,
    snapshotAfter: params.snapshotAfter,
    source: params.source || 'app',
  };

  console.log(`[AuditTrail] ${entry.action} | ${entry.entityType}:${entry.entityId} | by:${userId} (${userRole}) | ${entry.entityTitle || ''}`);

  const localLog = await getLocalAuditLog();
  localLog.unshift(entry);
  await saveLocalAuditLog(localLog);

  void syncToSupabase(entry);

  return entry;
}

export async function getAuditTrail(filters?: {
  entityType?: AuditEntityType;
  entityId?: string;
  action?: AuditAction;
  userId?: string;
  limit?: number;
  startDate?: string;
  endDate?: string;
}): Promise<AuditEntry[]> {
  let entries: AuditEntry[] = [];

  try {
    let query = supabase
      .from('audit_trail')
      .select('*')
      .order('timestamp', { ascending: false });

    if (filters?.entityType) query = query.eq('entity_type', filters.entityType);
    if (filters?.entityId) query = query.eq('entity_id', filters.entityId);
    if (filters?.action) query = query.eq('action', filters.action);
    if (filters?.userId) query = query.eq('user_id', filters.userId);
    if (filters?.startDate) query = query.gte('timestamp', filters.startDate);
    if (filters?.endDate) query = query.lte('timestamp', filters.endDate);
    if (filters?.limit) query = query.limit(filters.limit);
    else query = query.limit(200);

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      entries = data.map((row: any) => ({
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityTitle: row.entity_title,
        action: row.action,
        userId: row.user_id,
        userRole: row.user_role,
        timestamp: row.timestamp,
        details: row.details ? (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) : undefined,
        snapshotBefore: row.snapshot_before ? (typeof row.snapshot_before === 'string' ? JSON.parse(row.snapshot_before) : row.snapshot_before) : undefined,
        snapshotAfter: row.snapshot_after ? (typeof row.snapshot_after === 'string' ? JSON.parse(row.snapshot_after) : row.snapshot_after) : undefined,
        source: row.source || 'app',
      }));
      console.log('[AuditTrail] Fetched', entries.length, 'entries from Supabase');
      return entries;
    }
  } catch (err) {
    console.log('[AuditTrail] Supabase fetch failed, falling back to local:', (err as Error)?.message);
  }

  let localEntries = await getLocalAuditLog();

  if (filters?.entityType) localEntries = localEntries.filter(e => e.entityType === filters.entityType);
  if (filters?.entityId) localEntries = localEntries.filter(e => e.entityId === filters.entityId);
  if (filters?.action) localEntries = localEntries.filter(e => e.action === filters.action);
  if (filters?.userId) localEntries = localEntries.filter(e => e.userId === filters.userId);
  if (filters?.startDate) localEntries = localEntries.filter(e => e.timestamp >= filters.startDate!);
  if (filters?.endDate) localEntries = localEntries.filter(e => e.timestamp <= filters.endDate!);
  if (filters?.limit) localEntries = localEntries.slice(0, filters.limit);

  console.log('[AuditTrail] Returning', localEntries.length, 'entries from local storage');
  return localEntries;
}

export async function getEntityHistory(entityType: AuditEntityType, entityId: string): Promise<AuditEntry[]> {
  return getAuditTrail({ entityType, entityId, limit: 100 });
}

export async function getAuditStats(): Promise<{
  totalEntries: number;
  todayEntries: number;
  deleteActions: number;
  restoreActions: number;
  topUsers: Array<{ userId: string; count: number }>;
}> {
  const entries = await getAuditTrail({ limit: 2000 });
  const today = new Date().toISOString().split('T')[0];

  const todayEntries = entries.filter(e => e.timestamp.startsWith(today));
  const deleteActions = entries.filter(e =>
    ['DELETE', 'SOFT_DELETE', 'TRASH', 'PERMANENT_DELETE'].includes(e.action)
  );
  const restoreActions = entries.filter(e =>
    ['RESTORE', 'RESTORE_FROM_TRASH', 'BACKUP_RESTORED'].includes(e.action)
  );

  const userCounts: Record<string, number> = {};
  entries.forEach(e => {
    if (e.userId) {
      userCounts[e.userId] = (userCounts[e.userId] || 0) + 1;
    }
  });

  const topUsers = Object.entries(userCounts)
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalEntries: entries.length,
    todayEntries: todayEntries.length,
    deleteActions: deleteActions.length,
    restoreActions: restoreActions.length,
    topUsers,
  };
}

export async function exportAuditTrail(filters?: {
  entityType?: AuditEntityType;
  startDate?: string;
  endDate?: string;
}): Promise<string> {
  const entries = await getAuditTrail({ ...filters, limit: 5000 });

  const lines = [
    'ID,Timestamp,Entity Type,Entity ID,Entity Title,Action,User ID,User Role,Source,Details',
  ];

  entries.forEach(e => {
    const detailsStr = e.details ? JSON.stringify(e.details).replace(/"/g, '""') : '';
    lines.push(
      `"${e.id}","${e.timestamp}","${e.entityType}","${e.entityId}","${e.entityTitle || ''}","${e.action}","${e.userId}","${e.userRole}","${e.source}","${detailsStr}"`
    );
  });

  return lines.join('\n');
}
