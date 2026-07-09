/**
 * IVX Credential Vault — local on-device secure storage for the 3 critical
 * deployment credentials (GitHub, Render, Supabase service role).
 *
 * Uses expo-secure-store (Keychain on iOS, EncryptedSharedPreferences on
 * Android) so secrets never live in plaintext. Values are encrypted at rest
 * by the OS keystore and only decrypted into memory when the app needs them.
 *
 * Auto-load: on app start, CredentialVaultProvider calls loadVault() which
 * reads all 3 keys from SecureStore and populates the in-memory vault. Once
 * loaded, every backend sync / deploy / migration call reads from the vault
 * first, falling back to backend env only if the vault is empty.
 *
 * After a successful save + test, the vault is marked "synced" and the app
 * will never prompt for that credential again unless the user explicitly
 * deletes it.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The 3 critical deployment credentials that the vault manages. */
export const VAULT_CREDENTIAL_NAMES = [
  'GITHUB_TOKEN',
  'RENDER_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

export type VaultCredentialName = (typeof VAULT_CREDENTIAL_NAMES)[number];

export type VaultCredentialMeta = {
  name: VaultCredentialName;
  label: string;
  description: string;
  provider: 'github' | 'render' | 'supabase';
  placeholder: string;
};

export const VAULT_CREDENTIAL_METADATA: Record<VaultCredentialName, VaultCredentialMeta> = {
  GITHUB_TOKEN: {
    name: 'GITHUB_TOKEN',
    label: 'GitHub Token',
    description: 'Personal access token for pushing code to the canonical repo.',
    provider: 'github',
    placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
  },
  RENDER_API_KEY: {
    name: 'RENDER_API_KEY',
    label: 'Render API Key',
    description: 'API key for triggering backend deploys on Render.',
    provider: 'render',
    placeholder: 'rnd_xxxxxxxxxxxxxxxxxxxx',
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    label: 'Supabase Service Role Key',
    description: 'Server-side key for running SQL migrations and admin operations.',
    provider: 'supabase',
    placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
  },
};

const SECURE_STORE_KEY_PREFIX = 'ivx_vault_';
const SYNC_STATUS_KEY = 'ivx_vault_sync_status';

/** Web fallback: SecureStore is not available on web, use AsyncStorage. */
const IS_WEB = Platform.OS === 'web';

function secureKey(name: string): string {
  return `${SECURE_STORE_KEY_PREFIX}${name}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VaultCredentialStatus = 'missing' | 'saved' | 'synced' | 'error';

export type VaultEntry = {
  name: VaultCredentialName;
  /** True if a value is stored in the vault (local SecureStore). */
  present: boolean;
  /** Masked preview like ghp_****1234 — never the raw value. */
  maskedPreview: string | null;
  /** Sync status: has the credential been pushed to the backend? */
  syncStatus: VaultCredentialStatus;
  /** Last time the credential was successfully synced to backend. */
  lastSyncedAt: string | null;
  /** Last error message if sync failed. */
  lastError: string | null;
};

export type VaultState = {
  loaded: boolean;
  entries: Record<VaultCredentialName, VaultEntry>;
};

export type SyncStatusMap = Record<
  VaultCredentialName,
  { syncStatus: VaultCredentialStatus; lastSyncedAt: string | null; lastError: string | null }
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mask a secret value for safe display. Shows first 4 and last 4 chars.
 * Non-secret / short values return ****.
 */
export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

async function secureGet(key: string): Promise<string | null> {
  try {
    if (IS_WEB) {
      return await AsyncStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.log('[Vault] secureGet error for', key, ':', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<boolean> {
  try {
    if (IS_WEB) {
      await AsyncStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    return true;
  } catch (error) {
    console.log('[Vault] secureSet error for', key, ':', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    if (IS_WEB) {
      await AsyncStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Sync status persistence (synced/error state is not secret, use AsyncStorage)
// ---------------------------------------------------------------------------

async function loadSyncStatus(): Promise<SyncStatusMap> {
  const result: SyncStatusMap = {} as SyncStatusMap;
  for (const name of VAULT_CREDENTIAL_NAMES) {
    result[name] = { syncStatus: 'missing', lastSyncedAt: null, lastError: null };
  }
  try {
    const raw = await AsyncStorage.getItem(SYNC_STATUS_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw) as Partial<SyncStatusMap>;
    for (const name of VAULT_CREDENTIAL_NAMES) {
      const entry = parsed[name];
      if (entry) {
        result[name] = {
          syncStatus: entry.syncStatus ?? 'missing',
          lastSyncedAt: entry.lastSyncedAt ?? null,
          lastError: entry.lastError ?? null,
        };
      }
    }
  } catch {
    // ignore parse errors
  }
  return result;
}

async function saveSyncStatus(map: SyncStatusMap): Promise<void> {
  try {
    await AsyncStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(map));
  } catch (error) {
    console.log('[Vault] saveSyncStatus error:', error instanceof Error ? error.message : 'unknown');
  }
}

// ---------------------------------------------------------------------------
// Public vault API
// ---------------------------------------------------------------------------

/**
 * Load all vault entries from SecureStore + sync status from AsyncStorage.
 * Returns the full vault state. Safe to call on every app start.
 */
export async function loadVault(): Promise<VaultState> {
  const syncStatus = await loadSyncStatus();
  const entries = {} as Record<VaultCredentialName, VaultEntry>;

  for (const name of VAULT_CREDENTIAL_NAMES) {
    const value = await secureGet(secureKey(name));
    const present = !!value && value.trim().length > 0;
    const status = syncStatus[name];
    entries[name] = {
      name,
      present,
      maskedPreview: present ? maskSecret(value!) : null,
      syncStatus: present ? (status.syncStatus === 'missing' ? 'saved' : status.syncStatus) : 'missing',
      lastSyncedAt: status.lastSyncedAt,
      lastError: status.lastError,
    };
  }

  return { loaded: true, entries };
}

/**
 * Save a credential value to the local vault (SecureStore).
 * Does NOT sync to backend — call syncVaultToBackend() after saving.
 * Returns the updated entry (without the raw value).
 */
export async function saveVaultCredential(
  name: VaultCredentialName,
  value: string,
): Promise<VaultEntry> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Cannot save empty credential value.');
  }

  const ok = await secureSet(secureKey(name), trimmed);
  if (!ok) {
    throw new Error(`Failed to save ${name} to secure storage. The device keystore may be unavailable.`);
  }

  // Update sync status to "saved" (present locally, not yet synced)
  const syncStatus = await loadSyncStatus();
  syncStatus[name] = { syncStatus: 'saved', lastSyncedAt: syncStatus[name]?.lastSyncedAt ?? null, lastError: null };
  await saveSyncStatus(syncStatus);

  return {
    name,
    present: true,
    maskedPreview: maskSecret(trimmed),
    syncStatus: 'saved',
    lastSyncedAt: syncStatus[name].lastSyncedAt,
    lastError: null,
  };
}

/**
 * Read a credential value from the local vault.
 * Returns null if not stored. This is the function backend-sync / deploy
 * code should call to get the raw value before falling back to env vars.
 */
export async function readVaultCredential(name: VaultCredentialName): Promise<string | null> {
  const value = await secureGet(secureKey(name));
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Delete a credential from the local vault.
 */
export async function deleteVaultCredential(name: VaultCredentialName): Promise<void> {
  await secureDelete(secureKey(name));
  const syncStatus = await loadSyncStatus();
  syncStatus[name] = { syncStatus: 'missing', lastSyncedAt: null, lastError: null };
  await saveSyncStatus(syncStatus);
}

/**
 * Mark a credential as successfully synced to the backend.
 * Called after the backend confirms the credential was saved to ivx_owner_variables.
 */
export async function markCredentialSynced(name: VaultCredentialName): Promise<void> {
  const syncStatus = await loadSyncStatus();
  syncStatus[name] = {
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
  };
  await saveSyncStatus(syncStatus);
}

/**
 * Mark a credential sync as failed.
 */
export async function markCredentialSyncError(name: VaultCredentialName, error: string): Promise<void> {
  const syncStatus = await loadSyncStatus();
  syncStatus[name] = {
    syncStatus: 'error',
    lastSyncedAt: syncStatus[name]?.lastSyncedAt ?? null,
    lastError: error,
  };
  await saveSyncStatus(syncStatus);
}

/**
 * Check if all 3 critical credentials are present in the vault.
 */
export function isVaultComplete(state: VaultState | null): boolean {
  if (!state) return false;
  return VAULT_CREDENTIAL_NAMES.every((name) => state.entries[name]?.present === true);
}

/**
 * Check if all 3 credentials are present AND synced to backend.
 */
export function isVaultFullySynced(state: VaultState | null): boolean {
  if (!state) return false;
  return VAULT_CREDENTIAL_NAMES.every(
    (name) => state.entries[name]?.present === true && state.entries[name]?.syncStatus === 'synced',
  );
}

/**
 * Get a summary string for the vault state.
 */
export function getVaultSummary(state: VaultState | null): string {
  if (!state) return 'Vault not loaded';
  const present = VAULT_CREDENTIAL_NAMES.filter((n) => state.entries[n]?.present).length;
  const synced = VAULT_CREDENTIAL_NAMES.filter((n) => state.entries[n]?.syncStatus === 'synced').length;
  return `${present}/${VAULT_CREDENTIAL_NAMES.length} saved · ${synced}/${VAULT_CREDENTIAL_NAMES.length} synced`;
}
