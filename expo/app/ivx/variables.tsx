import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CheckCircle2,
  CircleAlert,
  Cloud,
  Database,
  Github,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import {
  deleteIVXOwnerVariable,
  getIVXOwnerVariablesStatus,
  IVX_OWNER_VARIABLE_NAMES,
  saveIVXOwnerVariable,
  testIVXOwnerVariable,
  type IVXOwnerVariableName,
  type IVXOwnerVariableProvider,
  type IVXOwnerVariableRow,
  type IVXOwnerVariablesStatus,
} from '@/src/modules/ivx-owner-ai/services/ivxVariablesToolService';

const IVX_OWNER_VARIABLES_QUERY_KEY = ['ivx-owner-ai', 'owner-variables-status'] as const;

function getProviderLabel(provider: IVXOwnerVariableProvider | string): string {
  if (provider === 'github') return 'GitHub';
  if (provider === 'render') return 'Render';
  if (provider === 'supabase') return 'Supabase';
  if (provider === 'aws') return 'AWS / Amazon';
  if (provider === 'ai') return 'AI Gateway';
  if (provider === 'storage') return 'Storage/CDN';
  return 'Security';
}

function getProviderIcon(provider: IVXOwnerVariableProvider | string) {
  if (provider === 'github') return <Github size={16} color={Colors.primary} />;
  if (provider === 'render') return <Server size={16} color={Colors.primary} />;
  if (provider === 'supabase') return <Database size={16} color={Colors.primary} />;
  if (provider === 'aws' || provider === 'storage') return <Cloud size={16} color={Colors.primary} />;
  return <ShieldCheck size={16} color={Colors.primary} />;
}

function getStatusColor(status: string): string {
  if (status === 'tested') return Colors.success;
  if (status === 'saved') return Colors.primary;
  if (status === 'invalid') return Colors.error;
  return Colors.warning;
}

function getStatusLabel(status: string): string {
  if (status === 'tested') return 'tested';
  if (status === 'saved') return 'saved';
  if (status === 'invalid') return 'invalid';
  return 'missing';
}

function formatTime(value: string | null): string {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function SecurityPill({ passed, label }: { passed: boolean; label: string }) {
  return (
    <View style={[styles.securityPill, passed ? styles.securityPillPass : styles.securityPillWarn]}>
      {passed ? <CheckCircle2 size={13} color={Colors.success} /> : <CircleAlert size={13} color={Colors.warning} />}
      <Text style={[styles.securityPillText, { color: passed ? Colors.success : Colors.warning }]}>{label}</Text>
    </View>
  );
}

function ProviderCard({ status, provider }: { status: IVXOwnerVariablesStatus | null; provider: IVXOwnerVariableProvider }) {
  const readiness = status?.providers[provider];
  const providerStatus = readiness?.status ?? 'missing';
  const missingCount = readiness?.missingVariableNames.length ?? 0;
  return (
    <View style={styles.providerCard} testID={`ivx-owner-provider-${provider}`}>
      <View style={styles.providerHeader}>
        {getProviderIcon(provider)}
        <Text style={styles.providerTitle}>{getProviderLabel(provider)}</Text>
        <View style={[styles.statusBadge, { borderColor: getStatusColor(providerStatus), backgroundColor: `${getStatusColor(providerStatus)}22` }]}>
          <Text style={[styles.statusBadgeText, { color: getStatusColor(providerStatus) }]}>{getStatusLabel(providerStatus)}</Text>
        </View>
      </View>
      <Text style={styles.providerDetail}>{missingCount === 0 ? 'Required credentials are saved.' : `${missingCount} required credential${missingCount === 1 ? '' : 's'} missing.`}</Text>
      <Text style={styles.providerMuted}>Last tested: {formatTime(readiness?.lastTestedAt ?? null)}</Text>
    </View>
  );
}

function VariableRow({
  variable,
  draftValue,
  onChangeDraft,
  onSave,
  onTest,
  onDelete,
  busyName,
  isMutating,
}: {
  variable: IVXOwnerVariableRow;
  draftValue: string;
  onChangeDraft: (name: IVXOwnerVariableName, value: string) => void;
  onSave: (name: IVXOwnerVariableName) => void;
  onTest: (name: IVXOwnerVariableName) => void;
  onDelete: (name: IVXOwnerVariableName) => void;
  busyName: IVXOwnerVariableName | null;
  isMutating: boolean;
}) {
  const hasDraft = draftValue.trim().length > 0;
  const isBusy = busyName === variable.name && isMutating;
  const statusColor = getStatusColor(variable.status);
  return (
    <View style={styles.variableCard} testID={`ivx-owner-variable-row-${variable.name}`}>
      <View style={styles.variableTopRow}>
        <View style={styles.variableNameBlock}>
          <Text style={styles.variableName}>{variable.name}</Text>
          <Text style={styles.variableDescription}>{variable.description}</Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: statusColor, backgroundColor: `${statusColor}22` }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{getStatusLabel(variable.status)}</Text>
        </View>
      </View>

      <View style={styles.variableMetaGrid}>
        <Text style={styles.metaText}>Provider: {getProviderLabel(variable.provider)}</Text>
        <Text style={styles.metaText}>Preview: {variable.maskedPreview ?? 'not saved'}</Text>
        <Text style={styles.metaText}>Last tested: {formatTime(variable.lastTestedAt)}</Text>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draftValue}
          onChangeText={(value) => onChangeDraft(variable.name, value)}
          placeholder={`Enter ${variable.name}`}
          placeholderTextColor={Colors.textTertiary}
          secureTextEntry={variable.secret}
          autoCapitalize="none"
          autoCorrect={false}
          testID={`ivx-owner-variable-input-${variable.name}`}
        />
        <Pressable
          style={[styles.iconButton, (!hasDraft || isMutating) ? styles.buttonDisabled : null]}
          disabled={!hasDraft || isMutating}
          onPress={() => onSave(variable.name)}
          testID={`ivx-owner-variable-save-${variable.name}`}
        >
          {isBusy ? <ActivityIndicator size="small" color={Colors.black} /> : <Save size={17} color={Colors.black} />}
        </Pressable>
      </View>

      <View style={styles.rowActions}>
        <Pressable
          style={[styles.secondaryButton, isMutating || !variable.saved ? styles.buttonDisabled : null]}
          disabled={isMutating || !variable.saved}
          onPress={() => onTest(variable.name)}
          testID={`ivx-owner-variable-test-${variable.name}`}
        >
          <ShieldCheck size={14} color={Colors.text} />
          <Text style={styles.secondaryButtonText}>Test</Text>
        </Pressable>
        <Pressable
          style={[styles.dangerButton, isMutating || !variable.saved ? styles.buttonDisabled : null]}
          disabled={isMutating || !variable.saved}
          onPress={() => onDelete(variable.name)}
          testID={`ivx-owner-variable-delete-${variable.name}`}
        >
          <Trash2 size={14} color={Colors.error} />
          <Text style={styles.dangerButtonText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function IVXVariablesToolRoute() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [draftValues, setDraftValues] = useState<Partial<Record<IVXOwnerVariableName, string>>>({});
  const [busyName, setBusyName] = useState<IVXOwnerVariableName | null>(null);

  const statusQuery = useQuery<IVXOwnerVariablesStatus, Error>({
    queryKey: IVX_OWNER_VARIABLES_QUERY_KEY,
    queryFn: getIVXOwnerVariablesStatus,
    refetchInterval: 45_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (input: { name: IVXOwnerVariableName; value: string }) => await saveIVXOwnerVariable(input),
    onMutate: (input) => setBusyName(input.name),
    onSuccess: async (response, input) => {
      setDraftValues((current) => {
        const nextValues = { ...current };
        delete nextValues[input.name];
        return nextValues;
      });
      await queryClient.invalidateQueries({ queryKey: IVX_OWNER_VARIABLES_QUERY_KEY });
      Alert.alert(`${input.name} saved`, `Stored securely. Preview: ${response.saved?.maskedPreview ?? 'masked'}. Secret values returned=false.`);
    },
    onError: (error) => Alert.alert('Secure save failed', error instanceof Error ? error.message : 'Owner Variables save failed.'),
    onSettled: () => setBusyName(null),
  });

  const testMutation = useMutation({
    mutationFn: async (input: { name?: IVXOwnerVariableName; provider?: IVXOwnerVariableProvider }) => await testIVXOwnerVariable(input),
    onMutate: (input) => setBusyName(input.name ?? null),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: IVX_OWNER_VARIABLES_QUERY_KEY });
      Alert.alert(response.ok ? 'Credential test passed' : 'Credential test finished', response.message ?? response.providerResult?.error ?? 'Status updated. Secret values returned=false.');
    },
    onError: (error) => Alert.alert('Credential test failed', error instanceof Error ? error.message : 'Owner Variables test failed.'),
    onSettled: () => setBusyName(null),
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: IVXOwnerVariableName) => await deleteIVXOwnerVariable(name),
    onMutate: (name) => setBusyName(name),
    onSuccess: async (_response, name) => {
      await queryClient.invalidateQueries({ queryKey: IVX_OWNER_VARIABLES_QUERY_KEY });
      Alert.alert(`${name} deleted`, 'Credential removed. No secret values were returned.');
    },
    onError: (error) => Alert.alert('Delete failed', error instanceof Error ? error.message : 'Owner Variables delete failed.'),
    onSettled: () => setBusyName(null),
  });

  const status = statusQuery.data ?? null;
  const variables = useMemo<IVXOwnerVariableRow[]>(() => {
    const rowsByName = new Map((status?.variables ?? []).map((item) => [item.name, item]));
    return IVX_OWNER_VARIABLE_NAMES.map((name) => rowsByName.get(name)).filter((item): item is IVXOwnerVariableRow => Boolean(item));
  }, [status?.variables]);
  const providerNames = useMemo<IVXOwnerVariableProvider[]>(() => ['github', 'render', 'supabase', 'aws', 'ai', 'security', 'storage'], []);
  const requiredTotal = useMemo<number>(() => variables.filter((item) => item.required).length, [variables]);
  const savedRequiredCount = useMemo<number>(() => variables.filter((item) => item.required && item.saved).length, [variables]);
  const missingList = status?.missingCredentials ?? [];
  const isMutating = saveMutation.isPending || testMutation.isPending || deleteMutation.isPending;

  const updateDraftValue = useCallback((name: IVXOwnerVariableName, value: string) => {
    setDraftValues((current) => ({ ...current, [name]: value }));
  }, []);

  const handleRefresh = useCallback(() => {
    void statusQuery.refetch();
  }, [statusQuery]);

  const handleSave = useCallback((name: IVXOwnerVariableName) => {
    const value = (draftValues[name] ?? '').trim();
    if (!value) {
      Alert.alert('No credential entered', `Enter ${name} before saving.`);
      return;
    }
    Alert.alert(
      `Save ${name}?`,
      'This sends the value only to the owner-only backend. The response, UI, logs, and screenshots show only masked status/proof.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save securely', onPress: () => saveMutation.mutate({ name, value }) },
      ],
    );
  }, [draftValues, saveMutation]);

  const handleDelete = useCallback((name: IVXOwnerVariableName) => {
    Alert.alert(
      `Delete ${name}?`,
      'The saved encrypted value will be removed. Audit logs keep only variable name/provider/action, never the secret.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(name) },
      ],
    );
  }, [deleteMutation]);

  const handleTestProvider = useCallback((provider: IVXOwnerVariableProvider) => {
    testMutation.mutate({ provider });
  }, [testMutation]);

  return (
    <ErrorBoundary fallbackTitle="IVX Owner Variables unavailable">
      <Stack.Screen options={{ title: 'Owner Variables' }} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(120, insets.bottom + 96) }]}
          refreshControl={<RefreshControl tintColor={Colors.primary} refreshing={statusQuery.isFetching} onRefresh={handleRefresh} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          testID="ivx-owner-variables-screen"
        >
          <View style={styles.heroCard}>
            <View style={styles.heroBadge}>
              <LockKeyhole size={15} color={Colors.black} />
              <Text style={styles.heroBadgeText}>Owner/admin only</Text>
            </View>
            <Text style={styles.heroTitle}>Owner Variables / Credentials</Text>
            <Text style={styles.heroSubtitle}>Secure portal for GitHub, Render, Supabase, AWS, AI, and storage credentials. IVX AI can check readiness without ever returning raw secret values.</Text>
            <View style={styles.heroPills}>
              <SecurityPill passed={status?.ownerOnly === true} label="owner login required" />
              <SecurityPill passed={status?.storage.encryptedAtRest === true} label="encrypted at rest" />
              <SecurityPill passed={status?.secretValuesReturned === false || !status} label="secret echo blocked" />
              <SecurityPill passed={status?.storage.auditLogEnabled === true} label="audit log enabled" />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <ShieldCheck size={18} color={Colors.primary} />
              <View style={styles.cardHeaderCopy}>
                <Text style={styles.cardTitle}>Readiness proof</Text>
                <Text style={styles.cardSubtitle}>{`${savedRequiredCount}/${requiredTotal} required credentials saved · deployment marker: ${status?.deploymentMarker ?? 'not loaded'}`}</Text>
              </View>
              <Pressable style={styles.refreshButton} onPress={handleRefresh} testID="ivx-owner-variables-refresh">
                <RefreshCw size={13} color={Colors.black} />
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </Pressable>
            </View>
            {statusQuery.isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Colors.primary} size="small" />
                <Text style={styles.mutedText}>Checking encrypted credential statuses only…</Text>
              </View>
            ) : statusQuery.error ? (
              <Text style={styles.errorText}>{statusQuery.error.message}</Text>
            ) : status?.storage.error ? (
              <Text style={styles.errorText}>{status.storage.error}</Text>
            ) : null}
            <View style={styles.proofGrid}>
              <Text style={styles.proofText}>Storage: {status?.storage.backend ?? 'not verified'}</Text>
              <Text style={styles.proofText}>Authenticated owner: {status?.authenticatedUserId ? 'yes' : 'not verified'}</Text>
              <Text style={styles.proofText}>Missing: {missingList.length > 0 ? missingList.join(', ') : 'none'}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <KeyRound size={18} color={Colors.primary} />
              <View style={styles.cardHeaderCopy}>
                <Text style={styles.cardTitle}>Provider tests</Text>
                <Text style={styles.cardSubtitle}>Tests verify external access and store only status, time, provider, and variable name in audit logs.</Text>
              </View>
            </View>
            <View style={styles.providerGrid}>
              {providerNames.map((provider) => (
                <View key={provider} style={styles.providerWrapper}>
                  <ProviderCard status={status} provider={provider} />
                  <Pressable
                    style={[styles.providerTestButton, isMutating ? styles.buttonDisabled : null]}
                    disabled={isMutating}
                    onPress={() => handleTestProvider(provider)}
                    testID={`ivx-owner-provider-test-${provider}`}
                  >
                    <Text style={styles.providerTestButtonText}>Test {getProviderLabel(provider)}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <KeyRound size={18} color={Colors.primary} />
              <View style={styles.cardHeaderCopy}>
                <Text style={styles.cardTitle}>Add / update credentials</Text>
                <Text style={styles.cardSubtitle}>Inputs are masked for secret fields. Leave a field blank unless you want to replace that one credential.</Text>
              </View>
            </View>
            <View style={styles.inputList}>
              {variables.map((variable) => (
                <VariableRow
                  key={variable.name}
                  variable={variable}
                  draftValue={draftValues[variable.name] ?? ''}
                  onChangeDraft={updateDraftValue}
                  onSave={handleSave}
                  onTest={(name) => testMutation.mutate({ name })}
                  onDelete={handleDelete}
                  busyName={busyName}
                  isMutating={isMutating}
                />
              ))}
            </View>
            <Text style={styles.securityNote}>Security proof: UI/API responses show only name, provider, status, last tested time, and masked preview like ghp_****1234. Raw secrets are never returned.</Text>
          </View>
        </ScrollView>
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
  securityPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  securityPillPass: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.3)',
  },
  securityPillWarn: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  securityPillText: {
    fontSize: 11,
    fontWeight: '800' as const,
  },
  card: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '900' as const,
  },
  cardSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600' as const,
  },
  refreshButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  refreshButtonText: {
    color: Colors.black,
    fontSize: 11,
    fontWeight: '900' as const,
  },
  loadingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  mutedText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700' as const,
  },
  proofGrid: {
    gap: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  proofText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700' as const,
  },
  providerGrid: {
    gap: 10,
  },
  providerWrapper: {
    gap: 8,
  },
  providerCard: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 7,
  },
  providerHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  providerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '900' as const,
  },
  providerDetail: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  providerMuted: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  providerTestButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.28)',
  },
  providerTestButtonText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '900' as const,
  },
  inputList: {
    gap: 12,
  },
  variableCard: {
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  variableTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
  },
  variableNameBlock: {
    flex: 1,
    gap: 3,
  },
  variableName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '900' as const,
  },
  variableDescription: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '900' as const,
    textTransform: 'uppercase',
  },
  variableMetaGrid: {
    gap: 4,
  },
  metaText: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 46,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.inputBackground,
    color: Colors.text,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  buttonDisabled: {
    opacity: 0.44,
  },
  rowActions: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '900' as const,
  },
  dangerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.24)',
  },
  dangerButtonText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '900' as const,
  },
  securityNote: {
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700' as const,
  },
});
