import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthUserId } from './auth-store';

const PROJECT_ID = process.env.EXPO_PUBLIC_PROJECT_ID || 'default';
const ISOLATION_VERSION = 'v1';
const INTEGRITY_KEY = `@ivx_storage_integrity_${PROJECT_ID}_${ISOLATION_VERSION}`;

export interface StorageNamespace {
  projectId: string;
  userId?: string;
  scope: 'project' | 'user' | 'admin';
}

function getProjectPrefix(): string {
  return `@ivx_p_${PROJECT_ID}`;
}

function getUserPrefix(userId: string): string {
  return `@ivx_p_${PROJECT_ID}_u_${userId}`;
}

export function scopedKey(baseKey: string, scope: 'project' | 'user' = 'project'): string {
  if (scope === 'user') {
    const userId = getAuthUserId();
    if (userId) {
      const key = `${getUserPrefix(userId)}::${baseKey}`;
      console.log('[ProjectStorage] Scoped user key:', key);
      return key;
    }
    console.warn('[ProjectStorage] No userId for user-scoped key, falling back to project scope');
  }
  const key = `${getProjectPrefix()}::${baseKey}`;
  console.log('[ProjectStorage] Scoped project key:', key);
  return key;
}

export function isOwnedKey(key: string): boolean {
  const prefix = getProjectPrefix();
  return key.startsWith(prefix);
}

export function extractProjectIdFromKey(key: string): string | null {
  const match = key.match(/@ivx_p_([^_:]+)/);
  return match ? match[1] : null;
}

export function validateKeyOwnership(key: string): { valid: boolean; reason?: string } {
  if (!key.startsWith('@ivx_p_')) {
    return { valid: true };
  }

  const keyProjectId = extractProjectIdFromKey(key);
  if (!keyProjectId) {
    return { valid: false, reason: 'Could not extract project ID from key' };
  }

  if (keyProjectId !== PROJECT_ID) {
    console.warn(
      '[ProjectStorage] CROSS-PROJECT ACCESS BLOCKED — key project:',
      keyProjectId,
      '| current project:',
      PROJECT_ID
    );
    return {
      valid: false,
      reason: `Cross-project access denied: key belongs to project ${keyProjectId}, current project is ${PROJECT_ID}`,
    };
  }

  return { valid: true };
}

export async function scopedGetItem(baseKey: string, scope: 'project' | 'user' = 'project'): Promise<string | null> {
  const key = scopedKey(baseKey, scope);
  const ownership = validateKeyOwnership(key);
  if (!ownership.valid) {
    console.warn('[ProjectStorage] GET blocked:', ownership.reason);
    return null;
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch (err) {
    console.log('[ProjectStorage] GET error:', (err as Error)?.message);
    return null;
  }
}

export async function scopedSetItem(baseKey: string, value: string, scope: 'project' | 'user' = 'project'): Promise<void> {
  const key = scopedKey(baseKey, scope);
  const ownership = validateKeyOwnership(key);
  if (!ownership.valid) {
    console.warn('[ProjectStorage] SET blocked:', ownership.reason);
    return;
  }
  try {
    await AsyncStorage.setItem(key, value);
    console.log('[ProjectStorage] SET success:', baseKey, '| scope:', scope);
  } catch (err) {
    console.log('[ProjectStorage] SET error:', (err as Error)?.message);
  }
}

export async function scopedRemoveItem(baseKey: string, scope: 'project' | 'user' = 'project'): Promise<void> {
  const key = scopedKey(baseKey, scope);
  const ownership = validateKeyOwnership(key);
  if (!ownership.valid) {
    console.warn('[ProjectStorage] REMOVE blocked:', ownership.reason);
    return;
  }
  try {
    await AsyncStorage.removeItem(key);
    console.log('[ProjectStorage] REMOVE success:', baseKey);
  } catch (err) {
    console.log('[ProjectStorage] REMOVE error:', (err as Error)?.message);
  }
}

export async function scopedGetJSON<T>(baseKey: string, scope: 'project' | 'user' = 'project'): Promise<T | null> {
  const raw = await scopedGetItem(baseKey, scope);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.log('[ProjectStorage] JSON parse error for key:', baseKey);
    return null;
  }
}

export async function scopedSetJSON<T>(baseKey: string, value: T, scope: 'project' | 'user' = 'project'): Promise<void> {
  try {
    await scopedSetItem(baseKey, JSON.stringify(value), scope);
  } catch (err) {
    console.log('[ProjectStorage] JSON stringify error for key:', baseKey, (err as Error)?.message);
  }
}

export async function migrateUnscopedKey(oldKey: string, baseKey: string, scope: 'project' | 'user' = 'project'): Promise<boolean> {
  try {
    const oldValue = await AsyncStorage.getItem(oldKey);
    if (oldValue === null) return false;

    const newKey = scopedKey(baseKey, scope);
    const existingNew = await AsyncStorage.getItem(newKey);
    if (existingNew !== null) {
      console.log('[ProjectStorage] Migration skipped — new key already exists:', baseKey);
      return false;
    }

    await AsyncStorage.setItem(newKey, oldValue);
    console.log('[ProjectStorage] Migrated key:', oldKey, '->', newKey);
    return true;
  } catch (err) {
    console.log('[ProjectStorage] Migration error:', (err as Error)?.message);
    return false;
  }
}

export async function auditStorageKeys(): Promise<{
  totalKeys: number;
  ownedKeys: number;
  foreignKeys: string[];
  unscopedKeys: string[];
}> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const foreignKeys: string[] = [];
    const unscopedKeys: string[] = [];
    let ownedKeys = 0;

    for (const key of allKeys) {
      if (key.startsWith('@ivx_p_')) {
        const keyProjectId = extractProjectIdFromKey(key);
        if (keyProjectId === PROJECT_ID) {
          ownedKeys++;
        } else {
          foreignKeys.push(key);
        }
      } else if (key.startsWith('@ivx_') || key.startsWith('ivx_')) {
        unscopedKeys.push(key);
      }
    }

    console.log('[ProjectStorage] AUDIT — total:', allKeys.length, '| owned:', ownedKeys, '| foreign:', foreignKeys.length, '| unscoped:', unscopedKeys.length);

    if (foreignKeys.length > 0) {
      console.warn('[ProjectStorage] ⚠️ FOREIGN KEYS DETECTED from other projects:', foreignKeys);
    }

    return {
      totalKeys: allKeys.length,
      ownedKeys,
      foreignKeys,
      unscopedKeys,
    };
  } catch (err) {
    console.log('[ProjectStorage] Audit error:', (err as Error)?.message);
    return { totalKeys: 0, ownedKeys: 0, foreignKeys: [], unscopedKeys: [] };
  }
}

export async function cleanForeignKeys(): Promise<number> {
  const audit = await auditStorageKeys();
  let cleaned = 0;

  for (const key of audit.foreignKeys) {
    try {
      await AsyncStorage.removeItem(key);
      cleaned++;
      console.log('[ProjectStorage] Cleaned foreign key:', key);
    } catch (err) {
      console.log('[ProjectStorage] Failed to clean foreign key:', key, (err as Error)?.message);
    }
  }

  console.log('[ProjectStorage] Cleaned', cleaned, 'foreign keys');
  return cleaned;
}

export async function runStorageIntegrityCheck(): Promise<{
  passed: boolean;
  projectId: string;
  issues: string[];
}> {
  const issues: string[] = [];

  if (!PROJECT_ID || PROJECT_ID === 'default') {
    issues.push('EXPO_PUBLIC_PROJECT_ID is not set — storage isolation may not work correctly');
  }

  const audit = await auditStorageKeys();

  if (audit.foreignKeys.length > 0) {
    issues.push(`Found ${audit.foreignKeys.length} keys from other projects — data contamination risk`);
  }

  if (audit.unscopedKeys.length > 0) {
    issues.push(`Found ${audit.unscopedKeys.length} unscoped IVX keys — should be migrated to project-scoped format`);
  }

  try {
    await AsyncStorage.setItem(INTEGRITY_KEY, JSON.stringify({
      projectId: PROJECT_ID,
      checkedAt: new Date().toISOString(),
      passed: issues.length === 0,
      issues,
    }));
  } catch {}

  const passed = issues.length === 0;
  console.log('[ProjectStorage] Integrity check:', passed ? '✅ PASSED' : '❌ FAILED', '| issues:', issues.length);
  return { passed, projectId: PROJECT_ID, issues };
}

export function getProjectId(): string {
  return PROJECT_ID;
}

export function getStorageVersion(): string {
  return ISOLATION_VERSION;
}
