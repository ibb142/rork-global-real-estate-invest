import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { scopedKey } from '@/lib/project-storage';
import { getAuthUserRole, getAuthUserId, isAdminRole } from '@/lib/auth-store';
import { logAudit } from '@/lib/audit-trail';

const BACKUP_KEY = scopedKey('data_backups_v1');
const DELETED_SNAPSHOTS_KEY = scopedKey('deleted_snapshots_v1');

export type RecoverableEntity = 'jv_deals' | 'transactions' | 'holdings' | 'properties' | 'wallets' | 'profiles' | 'notifications';

export interface DataSnapshot {
  id: string;
  entityType: RecoverableEntity;
  entityId: string;
  entityTitle: string;
  data: Record<string, unknown>;
  deletedAt: string;
  deletedBy: string;
  deletedByRole: string;
  source: 'supabase' | 'local' | 'manual';
  restored: boolean;
  restoredAt?: string;
  restoredBy?: string;
}

export interface BackupRecord {
  id: string;
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  entityType: RecoverableEntity | 'all';
  entityCount: number;
  data: Record<string, unknown>[];
  note?: string;
}

function requireAdmin(action: string): { allowed: boolean; userId: string; role: string; error?: string } {
  const role = getAuthUserRole();
  const userId = getAuthUserId();
  const allowed = isAdminRole(role);
  if (!allowed) {
    console.warn(`[DataRecovery] BLOCKED — ${action} requires admin. Role: '${role}', userId: '${userId}'`);
  }
  return { allowed, userId, role, error: allowed ? undefined : `Only admin can ${action}. Your role: ${role}` };
}

async function getDeletedSnapshots(): Promise<DataSnapshot[]> {
  try {
    const raw = await AsyncStorage.getItem(DELETED_SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.log('[DataRecovery] Snapshot read error:', (err as Error)?.message);
    return [];
  }
}

async function saveDeletedSnapshots(snapshots: DataSnapshot[]): Promise<void> {
  try {
    if (snapshots.length > 500) {
      snapshots = snapshots.slice(0, 500);
    }
    await AsyncStorage.setItem(DELETED_SNAPSHOTS_KEY, JSON.stringify(snapshots));
    console.log('[DataRecovery] Saved', snapshots.length, 'deleted snapshots');
  } catch (err) {
    console.log('[DataRecovery] Snapshot save error:', (err as Error)?.message);
  }
}

function mapEntityTypeToAudit(et: RecoverableEntity): 'jv_deal' | 'transaction' | 'holding' | 'property' | 'wallet' | 'profile' | 'notification' {
  const map: Record<RecoverableEntity, 'jv_deal' | 'transaction' | 'holding' | 'property' | 'wallet' | 'profile' | 'notification'> = {
    jv_deals: 'jv_deal',
    transactions: 'transaction',
    holdings: 'holding',
    properties: 'property',
    wallets: 'wallet',
    profiles: 'profile',
    notifications: 'notification',
  };
  return map[et] || 'jv_deal';
}

export async function captureDeleteSnapshot(params: {
  entityType: RecoverableEntity;
  entityId: string;
  entityTitle: string;
  data: Record<string, unknown>;
  source?: 'supabase' | 'local' | 'manual';
}): Promise<DataSnapshot> {
  const userId = getAuthUserId();
  const role = getAuthUserRole();

  const snapshot: DataSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    entityType: params.entityType,
    entityId: params.entityId,
    entityTitle: params.entityTitle,
    data: params.data,
    deletedAt: new Date().toISOString(),
    deletedBy: userId,
    deletedByRole: role,
    source: params.source || 'supabase',
    restored: false,
  };

  try {
    const snapshots = await getDeletedSnapshots();
    snapshots.unshift(snapshot);
    await saveDeletedSnapshots(snapshots);
    console.log(`[DataRecovery] Captured delete snapshot: ${params.entityType}:${params.entityId} — "${params.entityTitle}"`);
  } catch (err) {
    console.log('[DataRecovery] Failed to save snapshot (non-critical):', (err as Error)?.message);
  }

  try {
    await logAudit({
      entityType: mapEntityTypeToAudit(params.entityType),
      entityId: params.entityId,
      entityTitle: params.entityTitle,
      action: 'SOFT_DELETE',
      snapshotBefore: params.data,
      source: 'system',
    });
  } catch (auditErr) {
    console.log('[DataRecovery] Audit log failed (non-critical):', (auditErr as Error)?.message);
  }

  return snapshot;
}

export async function getDeletedItems(filters?: {
  entityType?: RecoverableEntity;
  restored?: boolean;
  limit?: number;
}): Promise<DataSnapshot[]> {
  let snapshots = await getDeletedSnapshots();

  if (filters?.entityType) {
    snapshots = snapshots.filter(s => s.entityType === filters.entityType);
  }
  if (filters?.restored !== undefined) {
    snapshots = snapshots.filter(s => s.restored === filters.restored);
  }
  if (filters?.limit) {
    snapshots = snapshots.slice(0, filters.limit);
  }

  return snapshots;
}

export async function restoreDeletedItem(snapshotId: string): Promise<{ success: boolean; error?: string }> {
  const auth = requireAdmin('restore deleted item');
  if (!auth.allowed) return { success: false, error: auth.error };

  const snapshots = await getDeletedSnapshots();
  const idx = snapshots.findIndex(s => s.id === snapshotId);
  if (idx < 0) return { success: false, error: 'Snapshot not found' };

  const snapshot = snapshots[idx];
  if (snapshot.restored) return { success: false, error: 'Already restored' };

  console.log(`[DataRecovery] Restoring ${snapshot.entityType}:${snapshot.entityId} — "${snapshot.entityTitle}"`);

  try {
    const table = snapshot.entityType;
    const payload = { ...snapshot.data };

    const restorable = payload as Record<string, unknown>;
    delete restorable.trashedAt;
    if ('status' in restorable) {
      restorable.status = 'active';
    }
    if ('published' in restorable) {
      restorable.published = false;
    }
    restorable.updated_at = new Date().toISOString();
    restorable.updatedAt = new Date().toISOString();

    const { error } = await supabase.from(table).upsert(payload);

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('could not find') || msg.includes('does not exist')) {
        console.log(`[DataRecovery] Table '${table}' not found — cannot restore to Supabase`);
        return { success: false, error: `Table '${table}' not found in Supabase. Cannot restore.` };
      }
      console.log('[DataRecovery] Supabase restore error:', error.message);
      return { success: false, error: error.message };
    }

    snapshots[idx] = {
      ...snapshot,
      restored: true,
      restoredAt: new Date().toISOString(),
      restoredBy: auth.userId,
    };
    await saveDeletedSnapshots(snapshots);

    try {
      await logAudit({
        entityType: mapEntityTypeToAudit(snapshot.entityType),
        entityId: snapshot.entityId,
        entityTitle: snapshot.entityTitle,
        action: 'BACKUP_RESTORED',
        snapshotAfter: payload,
        source: 'admin',
        details: { snapshotId, restoredBy: auth.userId },
      });
    } catch (auditErr) {
      console.log('[DataRecovery] Audit log on restore failed (non-critical):', (auditErr as Error)?.message);
    }

    console.log(`[DataRecovery] Successfully restored ${snapshot.entityType}:${snapshot.entityId}`);
    return { success: true };
  } catch (err) {
    console.log('[DataRecovery] Restore exception:', (err as Error)?.message);
    return { success: false, error: (err as Error)?.message || 'Unknown error' };
  }
}

export async function createFullBackup(entityType: RecoverableEntity | 'all', note?: string): Promise<{ success: boolean; backup?: BackupRecord; error?: string }> {
  const auth = requireAdmin('create backup');
  if (!auth.allowed) return { success: false, error: auth.error };

  console.log(`[DataRecovery] Creating full backup for: ${entityType}`);

  try {
    const tables: RecoverableEntity[] = entityType === 'all'
      ? ['jv_deals', 'transactions', 'holdings', 'properties', 'wallets', 'profiles']
      : [entityType];

    const allData: Record<string, unknown>[] = [];

    for (const table of tables) {
      try {
        const { data, error } = await supabase.from(table).select('*').limit(1000);
        if (!error && data) {
          data.forEach((row: any) => {
            allData.push({ _table: table, ...row });
          });
          console.log(`[DataRecovery] Backed up ${data.length} rows from ${table}`);
        } else if (error) {
          console.log(`[DataRecovery] Backup skip ${table}:`, error.message);
        }
      } catch (e) {
        console.log(`[DataRecovery] Backup skip ${table}:`, (e as Error)?.message);
      }
    }

    const backup: BackupRecord = {
      id: `backup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: new Date().toISOString(),
      createdBy: auth.userId,
      createdByRole: auth.role,
      entityType,
      entityCount: allData.length,
      data: allData,
      note,
    };

    const backups = await getBackups();
    backups.unshift(backup);
    if (backups.length > 20) backups.length = 20;
    await AsyncStorage.setItem(BACKUP_KEY, JSON.stringify(backups));

    await logAudit({
      entityType: 'system',
      entityId: backup.id,
      entityTitle: `Full backup: ${entityType}`,
      action: 'BACKUP_CREATED',
      source: 'admin',
      details: { entityType, entityCount: allData.length, note },
    });

    console.log(`[DataRecovery] Backup created: ${backup.id} — ${allData.length} records`);
    return { success: true, backup };
  } catch (err) {
    console.log('[DataRecovery] Backup exception:', (err as Error)?.message);
    return { success: false, error: (err as Error)?.message || 'Unknown error' };
  }
}

export async function getBackups(): Promise<BackupRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function restoreFromBackup(backupId: string, options?: { entityType?: RecoverableEntity; dryRun?: boolean }): Promise<{ success: boolean; restoredCount: number; errors: string[]; error?: string }> {
  const auth = requireAdmin('restore from backup');
  if (!auth.allowed) return { success: false, restoredCount: 0, errors: [], error: auth.error };

  const backups = await getBackups();
  const backup = backups.find(b => b.id === backupId);
  if (!backup) return { success: false, restoredCount: 0, errors: [], error: 'Backup not found' };

  console.log(`[DataRecovery] Restoring from backup ${backupId} — ${backup.entityCount} records`);

  if (options?.dryRun) {
    return { success: true, restoredCount: backup.entityCount, errors: [] };
  }

  const errors: string[] = [];
  let restoredCount = 0;

  const groupedByTable: Record<string, Record<string, unknown>[]> = {};
  backup.data.forEach(row => {
    const rowRecord = row as Record<string, unknown>;
    const table = rowRecord._table as string;
    if (options?.entityType && table !== options.entityType) return;
    if (!groupedByTable[table]) groupedByTable[table] = [];
    const cleanRow = { ...row };
    delete (cleanRow as Record<string, unknown>)._table;
    groupedByTable[table].push(cleanRow);
  });

  for (const [table, rows] of Object.entries(groupedByTable)) {
    try {
      const { error } = await supabase.from(table).upsert(rows);
      if (error) {
        errors.push(`${table}: ${error.message}`);
        console.log(`[DataRecovery] Restore error for ${table}:`, error.message);
      } else {
        restoredCount += rows.length;
        console.log(`[DataRecovery] Restored ${rows.length} rows to ${table}`);
      }
    } catch (e) {
      errors.push(`${table}: ${(e as Error)?.message}`);
    }
  }

  await logAudit({
    entityType: 'system',
    entityId: backupId,
    entityTitle: `Restore from backup: ${backup.entityType}`,
    action: 'BACKUP_RESTORED',
    source: 'admin',
    details: { backupId, restoredCount, errors, restoredBy: auth.userId },
  });

  console.log(`[DataRecovery] Restore complete: ${restoredCount} records, ${errors.length} errors`);
  return { success: errors.length === 0, restoredCount, errors };
}

export async function getRecoveryStats(): Promise<{
  deletedItemsCount: number;
  restorableCount: number;
  backupsCount: number;
  latestBackup?: string;
}> {
  const snapshots = await getDeletedSnapshots();
  const backups = await getBackups();
  const restorableCount = snapshots.filter(s => !s.restored).length;

  return {
    deletedItemsCount: snapshots.length,
    restorableCount,
    backupsCount: backups.length,
    latestBackup: backups.length > 0 ? backups[0].createdAt : undefined,
  };
}
