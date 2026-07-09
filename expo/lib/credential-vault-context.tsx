/**
 * Credential Vault Context — auto-loads the 3 critical deployment credentials
 * from SecureStore on app start and provides save/sync/delete operations.
 *
 * Wraps the entire app so every screen can check vault status without
 * re-reading SecureStore. Auto-syncs to the backend ivx_owner_variables
 * table after a credential is saved, so the owner never has to manually
 * push credentials to the server.
 */

import { useCallback, useEffect, useState } from 'react';
import createContextHook from '@nkzw/create-context-hook';

import {
  deleteVaultCredential,
  loadVault,
  markCredentialSynced,
  markCredentialSyncError,
  saveVaultCredential,
  readVaultCredential,
  VAULT_CREDENTIAL_NAMES,
  type VaultCredentialName,
  type VaultEntry,
  type VaultState,
} from '@/lib/ivx-credential-vault';
import { saveIVXOwnerVariable } from '@/src/modules/ivx-owner-ai/services/ivxVariablesToolService';

type VaultContextValue = {
  state: VaultState | null;
  loading: boolean;
  /** True when all 3 critical credentials are saved locally. */
  allPresent: boolean;
  /** True when all 3 are saved AND synced to the backend. */
  allSynced: boolean;
  /** Save a credential to the local vault (SecureStore). */
  save: (name: VaultCredentialName, value: string) => Promise<VaultEntry>;
  /**
   * Save to the local vault AND immediately sync to the backend.
   * After this succeeds, the credential is marked "synced" and the
   * app will never ask for it again.
   */
  saveAndSync: (name: VaultCredentialName, value: string) => Promise<VaultEntry>;
  /** Sync a single credential from the local vault to the backend. */
  syncOne: (name: VaultCredentialName) => Promise<boolean>;
  /** Sync all present-but-unsynced credentials to the backend. */
  syncAll: () => Promise<{ synced: number; failed: number; errors: string[] }>;
  /** Delete a credential from the local vault. */
  remove: (name: VaultCredentialName) => Promise<void>;
  /** Reload the vault from SecureStore. */
  reload: () => Promise<void>;
  /** Read the raw value of a credential (for deploy/migration code). */
  read: (name: VaultCredentialName) => Promise<string | null>;
};

function createVaultContext(): VaultContextValue {
  const [state, setState] = useState<VaultState | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const next = await loadVault();
    setState(next);
    setLoading(false);
  }, []);

  // Auto-load on mount — this runs once when the provider initializes.
  useEffect(() => {
    void reload();
  }, [reload]);

  const allPresent = state
    ? VAULT_CREDENTIAL_NAMES.every((n) => state.entries[n]?.present === true)
    : false;
  const allSynced = state
    ? VAULT_CREDENTIAL_NAMES.every(
        (n) => state.entries[n]?.present === true && state.entries[n]?.syncStatus === 'synced',
      )
    : false;

  const save = useCallback(
    async (name: VaultCredentialName, value: string): Promise<VaultEntry> => {
      const entry = await saveVaultCredential(name, value);
      await reload();
      return entry;
    },
    [reload],
  );

  const syncOne = useCallback(
    async (name: VaultCredentialName): Promise<boolean> => {
      const value = await readVaultCredential(name);
      if (!value) {
        await markCredentialSyncError(name, 'No value in local vault to sync.');
        await reload();
        return false;
      }
      try {
        const result = await saveIVXOwnerVariable({ name, value });
        if (result.ok) {
          await markCredentialSynced(name);
          await reload();
          return true;
        }
        const errMsg = result.error ?? 'Backend save returned ok=false.';
        await markCredentialSyncError(name, errMsg);
        await reload();
        return false;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Sync request failed.';
        await markCredentialSyncError(name, errMsg);
        await reload();
        return false;
      }
    },
    [reload],
  );

  const saveAndSync = useCallback(
    async (name: VaultCredentialName, value: string): Promise<VaultEntry> => {
      // 1. Save to local SecureStore
      await saveVaultCredential(name, value);
      await reload();
      // 2. Sync to backend
      await syncOne(name);
      // 3. Reload to get final state
      await reload();
      const finalState = await loadVault();
      setState(finalState);
      return finalState.entries[name];
    },
    [reload, syncOne],
  );

  const syncAll = useCallback(async (): Promise<{
    synced: number;
    failed: number;
    errors: string[];
  }> => {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const name of VAULT_CREDENTIAL_NAMES) {
      const entry = state?.entries[name];
      if (!entry?.present) {
        continue; // skip missing credentials
      }
      if (entry.syncStatus === 'synced') {
        synced += 1; // already synced
        continue;
      }
      const ok = await syncOne(name);
      if (ok) {
        synced += 1;
      } else {
        failed += 1;
        errors.push(`${name}: ${entry.lastError ?? 'sync failed'}`);
      }
    }
    return { synced, failed, errors };
  }, [state, syncOne]);

  const remove = useCallback(
    async (name: VaultCredentialName): Promise<void> => {
      await deleteVaultCredential(name);
      await reload();
    },
    [reload],
  );

  const read = useCallback(async (name: VaultCredentialName): Promise<string | null> => {
    return await readVaultCredential(name);
  }, []);

  return {
    state,
    loading,
    allPresent,
    allSynced,
    save,
    saveAndSync,
    syncOne,
    syncAll,
    remove,
    reload,
    read,
  };
}

export const [CredentialVaultProvider, useCredentialVault] =
  createContextHook(createVaultContext);
