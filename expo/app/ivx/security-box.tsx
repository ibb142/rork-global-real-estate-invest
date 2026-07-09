/**
 * Security Box — Secure Credential Vault screen for the 3 critical deployment
 * credentials (GitHub, Render, Supabase service role).
 *
 * Owner enters each credential once. It is saved to the device's secure
 * keystore (expo-secure-store) and auto-synced to the backend's encrypted
 * ivx_owner_variables table. After that, the app never asks again — every
 * deploy / migration / push reads from the vault automatically.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CheckCircle2,
  CircleAlert,
  CloudUpload,
  Database,
  Github,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { useCredentialVault } from '@/lib/credential-vault-context';
import {
  VAULT_CREDENTIAL_METADATA,
  VAULT_CREDENTIAL_NAMES,
  type VaultCredentialName,
  type VaultEntry,
} from '@/lib/ivx-credential-vault';

type ToastState = { message: string; tone: 'success' | 'error' } | null;
type BusyKind = 'save' | 'sync' | 'delete' | 'syncAll' | null;
type BusyState = { kind: BusyKind; name?: VaultCredentialName } | null;

function Toast({ toast }: { toast: ToastState }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: toast ? 1 : 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: toast ? 0 : 12, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [toast, opacity, translateY]);
  if (!toast) return null;
  const isSuccess = toast.tone === 'success';
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, isSuccess ? styles.toastSuccess : styles.toastError, { opacity, transform: [{ translateY }] }]}
      testID="vault-toast"
    >
      {isSuccess ? <CheckCircle2 size={16} color={Colors.success} /> : <CircleAlert size={16} color={Colors.error} />}
      <Text style={[styles.toastText, { color: isSuccess ? Colors.success : Colors.error }]} numberOfLines={3}>{toast.message}</Text>
    </Animated.View>
  );
}

function getProviderIcon(provider: 'github' | 'render' | 'supabase') {
  if (provider === 'github') return <Github size={18} color={Colors.primary} />;
  if (provider === 'render') return <Server size={18} color={Colors.primary} />;
  return <Database size={18} color={Colors.primary} />;
}

function getSyncColor(status: string): string {
  if (status === 'synced') return Colors.success;
  if (status === 'saved') return Colors.primary;
  if (status === 'error') return Colors.error;
  return Colors.warning;
}

function getSyncLabel(status: string): string {
  if (status === 'synced') return 'SYNCED';
  if (status === 'saved') return 'SAVED';
  if (status === 'error') return 'ERROR';
  return 'MISSING';
}

function formatTime(value: string | null): string {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function CredentialRow({
  name,
  entry,
  draftValue,
  onChangeDraft,
  onSaveAndSync,
  onSync,
  onDelete,
  busy,
}: {
  name: VaultCredentialName;
  entry: VaultEntry | null;
  draftValue: string;
  onChangeDraft: (value: string) => void;
  onSaveAndSync: () => void;
  onSync: () => void;
  onDelete: () => void;
  busy: BusyState;
}) {
  const meta = VAULT_CREDENTIAL_METADATA[name];
  const hasDraft = draftValue.trim().length > 0;
  const isBusy = busy?.name === name;
  const syncColor = getSyncColor(entry?.syncStatus ?? 'missing');
  const syncLabel = getSyncLabel(entry?.syncStatus ?? 'missing');

  return (
    <View style={styles.credentialCard} testID={`vault-row-${name}`}>
      <View style={styles.credentialHeader}>
        <View style={styles.credentialIconWrap}>{getProviderIcon(meta.provider)}</View>
        <View style={styles.credentialTitleBlock}>
          <Text style={styles.credentialLabel}>{meta.label}</Text>
          <Text style={styles.credentialName}>{name}</Text>
        </View>
        <View style={[styles.syncBadge, { borderColor: syncColor, backgroundColor: `${syncColor}22` }]}>
          <Text style={[styles.syncBadgeText, { color: syncColor }]}>{syncLabel}</Text>
        </View>
      </View>

      <Text style={styles.credentialDescription}>{meta.description}</Text>

      {entry?.present && entry.maskedPreview ? (
        <View style={styles.previewRow}>
          <LockKeyhole size={12} color={Colors.textTertiary} />
          <Text style={styles.previewText}>{entry.maskedPreview}</Text>
        </View>
      ) : null}

      <Text style={styles.metaText}>Last synced: {formatTime(entry?.lastSyncedAt ?? null)}</Text>
      {entry?.lastError ? <Text style={styles.errorText}>Error: {entry.lastError}</Text> : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draftValue}
          onChangeText={onChangeDraft}
          placeholder={meta.placeholder}
          placeholderTextColor={Colors.textTertiary}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          testID={`vault-input-${name}`}
        />
        <Pressable
          style={[styles.saveButton, (!hasDraft || isBusy) ? styles.buttonDisabled : null]}
          disabled={!hasDraft || isBusy}
          onPress={onSaveAndSync}
          testID={`vault-save-${name}`}
        >
          {isBusy && busy?.kind === 'save' ? <ActivityIndicator size="small" color={Colors.black} /> : <Save size={17} color={Colors.black} />}
        </Pressable>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.secondaryButton, styles.actionFlex, (!entry?.present || isBusy) ? styles.buttonDisabled : null]}
          disabled={!entry?.present || isBusy}
          onPress={onSync}
          testID={`vault-sync-${name}`}
        >
          {isBusy && busy?.kind === 'sync' ? <ActivityIndicator size="small" color={Colors.text} /> : <CloudUpload size={14} color={Colors.text} />}
          <Text style={styles.secondaryButtonText}>Sync to backend</Text>
        </Pressable>
        <Pressable
          style={[styles.dangerButton, styles.actionFlex, (!entry?.present || isBusy) ? styles.buttonDisabled : null]}
          disabled={!entry?.present || isBusy}
          onPress={onDelete}
          testID={`vault-delete-${name}`}
        >
          {isBusy && busy?.kind === 'delete' ? <ActivityIndicator size="small" color={Colors.error} /> : <Trash2 size={14} color={Colors.error} />}
          <Text style={styles.dangerButtonText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function SecurityBoxScreen() {
  const insets = useSafeAreaInsets();
  const vault = useCredentialVault();
  const [draftValues, setDraftValues] = useState<Partial<Record<VaultCredentialName, string>>>({});
  const [busy, setBusy] = useState<BusyState>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: 'success' | 'error') => {
    setToast({ message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  React.useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const handleSaveAndSync = useCallback(
    async (name: VaultCredentialName) => {
      const value = (draftValues[name] ?? '').trim();
      if (!value) {
        Alert.alert('No credential entered', `Enter ${name} before saving.`);
        return;
      }
      setBusy({ kind: 'save', name });
      try {
        const entry = await vault.saveAndSync(name, value);
        if (entry?.syncStatus === 'synced') {
          setDraftValues((prev) => {
            const next = { ...prev };
            delete next[name];
            return next;
          });
          showToast(`${name} saved + synced to backend. You will never be asked again.`, 'success');
        } else {
          showToast(`${name} saved locally but sync failed: ${entry?.lastError ?? 'unknown error'}`, 'error');
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Save failed.', 'error');
      } finally {
        setBusy(null);
      }
    },
    [draftValues, vault, showToast],
  );

  const handleSyncOne = useCallback(
    async (name: VaultCredentialName) => {
      setBusy({ kind: 'sync', name });
      try {
        const ok = await vault.syncOne(name);
        showToast(
          ok ? `${name} synced to backend.` : `${name} sync failed.`,
          ok ? 'success' : 'error',
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Sync failed.', 'error');
      } finally {
        setBusy(null);
      }
    },
    [vault, showToast],
  );

  const handleSyncAll = useCallback(async () => {
    setBusy({ kind: 'syncAll' });
    try {
      const result = await vault.syncAll();
      if (result.failed === 0) {
        showToast(`All ${result.synced} credentials synced to backend.`, 'success');
      } else {
        showToast(`${result.synced} synced, ${result.failed} failed: ${result.errors.join('; ')}`, 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Sync all failed.', 'error');
    } finally {
      setBusy(null);
    }
  }, [vault, showToast]);

  const handleDelete = useCallback(
    (name: VaultCredentialName) => {
      Alert.alert(
        `Delete ${name}?`,
        'This removes the credential from this device. You will need to re-enter it to use deploy/migration features.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setBusy({ kind: 'delete', name });
              try {
                await vault.remove(name);
                showToast(`${name} deleted from device.`, 'success');
              } catch (error) {
                showToast(error instanceof Error ? error.message : 'Delete failed.', 'error');
              } finally {
                setBusy(null);
              }
            },
          },
        ],
      );
    },
    [vault, showToast],
  );

  const updateDraft = useCallback((name: VaultCredentialName, value: string) => {
    setDraftValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const entries = vault.state?.entries;
  const summary = useMemo(() => {
    if (!entries) return { present: 0, synced: 0, total: VAULT_CREDENTIAL_NAMES.length };
    const present = VAULT_CREDENTIAL_NAMES.filter((n) => entries[n]?.present).length;
    const synced = VAULT_CREDENTIAL_NAMES.filter((n) => entries[n]?.syncStatus === 'synced').length;
    return { present, synced, total: VAULT_CREDENTIAL_NAMES.length };
  }, [entries]);

  return (
    <ErrorBoundary fallbackTitle="Security Box unavailable">
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(120, insets.bottom + 96) }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          testID="security-box-screen"
        >
          {/* Hero */}
          <View style={styles.heroCard}>
            <View style={styles.heroBadge}>
              <LockKeyhole size={15} color={Colors.black} />
              <Text style={styles.heroBadgeText}>Owner Security Box</Text>
            </View>
            <Text style={styles.heroTitle}>Credential Vault</Text>
            <Text style={styles.heroSubtitle}>
              Enter your 3 deployment credentials once. They are encrypted on this device and auto-synced to the backend. You will never be asked again.
            </Text>
            <View style={styles.heroPills}>
              <View style={[styles.heroPill, summary.present === 3 ? styles.pillPass : styles.pillWarn]}>
                <CheckCircle2 size={13} color={summary.present === 3 ? Colors.success : Colors.warning} />
                <Text style={[styles.heroPillText, { color: summary.present === 3 ? Colors.success : Colors.warning }]}>
                  {summary.present}/{summary.total} saved
                </Text>
              </View>
              <View style={[styles.heroPill, summary.synced === 3 ? styles.pillPass : styles.pillWarn]}>
                <CloudUpload size={13} color={summary.synced === 3 ? Colors.success : Colors.warning} />
                <Text style={[styles.heroPillText, { color: summary.synced === 3 ? Colors.success : Colors.warning }]}>
                  {summary.synced}/{summary.total} synced
                </Text>
              </View>
            </View>
          </View>

          {/* Status banner */}
          {vault.allSynced ? (
            <View style={styles.allClearBanner} testID="vault-all-clear">
              <ShieldCheck size={20} color={Colors.success} />
              <View style={styles.allClearText}>
                <Text style={styles.allClearTitle}>All credentials secured</Text>
                <Text style={styles.allClearSubtitle}>Deploy, migration, and push will work automatically. No more credential prompts.</Text>
              </View>
            </View>
          ) : null}

          {/* Sync all button */}
          <Pressable
            style={[styles.syncAllButton, (vault.loading || busy?.kind === 'syncAll') ? styles.buttonDisabled : null]}
            disabled={vault.loading || busy?.kind === 'syncAll'}
            onPress={handleSyncAll}
            testID="vault-sync-all"
          >
            {busy?.kind === 'syncAll' ? <ActivityIndicator size="small" color={Colors.black} /> : <CloudUpload size={16} color={Colors.black} />}
            <Text style={styles.syncAllButtonText}>
              {busy?.kind === 'syncAll' ? 'Syncing…' : 'Sync all to backend now'}
            </Text>
          </Pressable>

          {/* Credential rows */}
          {vault.loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.mutedText}>Loading vault from secure storage…</Text>
            </View>
          ) : (
            VAULT_CREDENTIAL_NAMES.map((name) => (
              <CredentialRow
                key={name}
                name={name}
                entry={entries?.[name] ?? null}
                draftValue={draftValues[name] ?? ''}
                onChangeDraft={(value) => updateDraft(name, value)}
                onSaveAndSync={() => handleSaveAndSync(name)}
                onSync={() => handleSyncOne(name)}
                onDelete={() => handleDelete(name)}
                busy={busy}
              />
            ))
          )}

          {/* Security note */}
          <View style={styles.securityNoteCard}>
            <ShieldCheck size={16} color={Colors.primary} />
            <Text style={styles.securityNoteText}>
              Credentials are stored in the device keystore (Keychain on iOS, EncryptedSharedPreferences on Android). Raw values never appear in logs, screenshots, or API responses. Only masked previews are shown.
            </Text>
          </View>

          {/* How it works */}
          <View style={styles.howItWorksCard}>
            <View style={styles.howItWorksHeader}>
              <Sparkles size={16} color={Colors.primary} />
              <Text style={styles.howItWorksTitle}>How the vault works</Text>
            </View>
            <Text style={styles.howItWorksStep}>1. Enter each credential once in the boxes above.</Text>
            <Text style={styles.howItWorksStep}>2. Tap Save — it encrypts on this device AND syncs to the backend.</Text>
            <Text style={styles.howItWorksStep}>3. Every deploy, migration, and push reads from the vault automatically.</Text>
            <Text style={styles.howItWorksStep}>4. You are never asked again — unless you delete a credential.</Text>
          </View>
        </ScrollView>
        <Toast toast={toast} />
      </KeyboardAvoidingView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  heroCard: {
    padding: 20,
    borderRadius: 30,
    backgroundColor: '#071019',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.28)',
    gap: 12,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  heroBadgeText: {
    color: Colors.black,
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900' as const,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600' as const,
  },
  heroPills: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  heroPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillPass: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.3)',
  },
  pillWarn: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: '800' as const,
  },
  allClearBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  allClearText: {
    flex: 1,
    gap: 3,
  },
  allClearTitle: {
    color: Colors.success,
    fontSize: 15,
    fontWeight: '900' as const,
  },
  allClearSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600' as const,
  },
  syncAllButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: Colors.primary,
  },
  syncAllButtonText: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '900' as const,
  },
  loadingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 12,
    paddingVertical: 40,
  },
  mutedText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  credentialCard: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  credentialHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  credentialIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,215,0,0.1)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  credentialTitleBlock: {
    flex: 1,
    gap: 2,
  },
  credentialLabel: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '900' as const,
  },
  credentialName: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  syncBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  syncBadgeText: {
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 0.5,
  },
  credentialDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600' as const,
  },
  previewRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  previewText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700' as const,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  metaText: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  errorText: {
    color: Colors.error,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  inputRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  actionRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  actionFlex: {
    flex: 1,
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  dangerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  dangerButtonText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  securityNoteCard: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  securityNoteText: {
    flex: 1,
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
  howItWorksCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,215,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.15)',
    gap: 8,
  },
  howItWorksHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  howItWorksTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '900' as const,
  },
  howItWorksStep: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  toast: {
    position: 'absolute' as const,
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
  },
  toastSuccess: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  toastError: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  toastText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700' as const,
  },
});
