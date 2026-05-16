import React, { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Activity, CheckCircle2, CircleAlert, CircleX, MessageSquare, Radio, RefreshCw, Server, ShieldCheck, Wifi } from 'lucide-react-native';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { getIVXAccessToken, getIVXOwnerAIConfigAudit, getIVXOwnerAuthContext } from '@/lib/ivx-supabase-client';
import {
  classifyIVXFriendlyState,
  getIVXAIIndependenceSnapshot,
  getIVXFriendlyState,
  getLastIVXOwnerAIRuntimeProof,
  ivxChatService,
  ivxInboxService,
  type IVXAIIndependenceSnapshot,
  type IVXFriendlyState,
  type IVXOwnerAIRuntimeProof,
} from '@/src/modules/ivx-owner-ai/services';

type HealthPayload = {
  ok: boolean;
  status: string;
  service: string;
  deploymentMarker: string;
  routes: string[];
};

type ChatProbePayload = {
  ok: boolean;
  status: number;
  requestId: string | null;
  answerPreview: string | null;
  error: string | null;
  durationMs: number;
};

type AuthState = {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  role: string | null;
  hasAccessToken: boolean;
  error: string | null;
};

type SyncState = {
  lastSyncAt: string | null;
  status: 'idle' | 'ok' | 'delayed' | 'failed';
  detail: string;
};

type Snapshot = {
  baseUrl: string | null;
  health: HealthPayload | null;
  healthError: string | null;
  healthDurationMs: number;
  chatProbe: ChatProbePayload | null;
  authState: AuthState;
  realtimeState: {
    activeChannelCount: number;
    activeChannels: string[];
    localListenerCount: number;
  };
  lastSync: SyncState;
  lastRuntimeProof: IVXOwnerAIRuntimeProof | null;
  lastBackendError: string | null;
  lastAIProviderError: string | null;
};

async function timedFetchJson<T>(url: string, token: string | null): Promise<{ data: T; durationMs: number }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const startedAt = Date.now();
  const response = await fetch(url, { headers });
  const durationMs = Date.now() - startedAt;
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON response (HTTP ${response.status}): ${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    const detail = (parsed as { error?: string } | null)?.error ?? `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return { data: parsed as T, durationMs };
}

async function probeChatEndpoint(baseUrl: string, token: string | null): Promise<ChatProbePayload> {
  const url = `${baseUrl}/chat`;
  const startedAt = Date.now();
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        requestId: `diagnostics-${Date.now()}`,
        conversationId: 'ivx-owner-room',
        message: 'health_probe',
        mode: 'chat',
        persistUserMessage: false,
        persistAssistantMessage: false,
        probe: true,
      }),
    });
    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const error = (parsed as { error?: string } | null)?.error ?? `HTTP ${response.status}`;
      return {
        ok: false,
        status: response.status,
        requestId: null,
        answerPreview: null,
        error,
        durationMs,
      };
    }
    const record = parsed as { requestId?: string; answer?: string } | null;
    return {
      ok: true,
      status: response.status,
      requestId: record?.requestId ?? null,
      answerPreview: record?.answer ? record.answer.slice(0, 120) : null,
      error: null,
      durationMs,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      requestId: null,
      answerPreview: null,
      error: error instanceof Error ? error.message : 'Chat probe failed.',
      durationMs: Date.now() - startedAt,
    };
  }
}

async function resolveAuthState(): Promise<AuthState> {
  try {
    const context = await getIVXOwnerAuthContext();
    return {
      authenticated: true,
      userId: context.userId,
      email: context.email,
      role: context.role,
      hasAccessToken: !!context.accessToken,
      error: null,
    };
  } catch (error) {
    return {
      authenticated: false,
      userId: null,
      email: null,
      role: null,
      hasAccessToken: false,
      error: error instanceof Error ? error.message : 'Auth context unavailable.',
    };
  }
}

async function loadSnapshot(): Promise<Snapshot> {
  const audit = getIVXOwnerAIConfigAudit();
  const baseUrl = audit.activeBaseUrl;
  const token = await getIVXAccessToken();
  const authState = await resolveAuthState();
  const realtimeAudit = ivxChatService.getOwnerRealtimeSubscriptionAudit();
  const realtimeState = {
    activeChannelCount: realtimeAudit.activeChannelCount,
    activeChannels: realtimeAudit.activeChannels,
    localListenerCount: realtimeAudit.localListenerCount,
  };

  let lastSync: SyncState = {
    lastSyncAt: null,
    status: 'idle',
    detail: 'Inbox sync has not run in this session yet.',
  };

  try {
    const started = Date.now();
    const items = await ivxInboxService.loadOwnerInbox();
    const durationMs = Date.now() - started;
    lastSync = {
      lastSyncAt: new Date().toISOString(),
      status: durationMs > 4000 ? 'delayed' : 'ok',
      detail: `${items.length} conversation(s) synced in ${durationMs} ms.`,
    };
  } catch (error) {
    lastSync = {
      lastSyncAt: new Date().toISOString(),
      status: 'failed',
      detail: error instanceof Error ? error.message : 'Inbox sync failed.',
    };
  }

  if (!baseUrl) {
    return {
      baseUrl: null,
      health: null,
      healthError: audit.configurationError ?? 'Owner AI base URL is not configured.',
      healthDurationMs: 0,
      chatProbe: null,
      authState,
      realtimeState,
      lastSync,
      lastRuntimeProof: getLastIVXOwnerAIRuntimeProof(),
      lastBackendError: audit.configurationError ?? null,
      lastAIProviderError: null,
    };
  }

  let health: HealthPayload | null = null;
  let healthError: string | null = null;
  let healthDurationMs = 0;
  try {
    const result = await timedFetchJson<HealthPayload>(`${baseUrl}/health`, null);
    health = result.data;
    healthDurationMs = result.durationMs;
  } catch (error) {
    healthError = error instanceof Error ? error.message : 'Unknown /health error';
  }

  const chatProbe = await probeChatEndpoint(baseUrl, token);
  const runtimeProof = getLastIVXOwnerAIRuntimeProof();

  return {
    baseUrl,
    health,
    healthError,
    healthDurationMs,
    chatProbe,
    authState,
    realtimeState,
    lastSync,
    lastRuntimeProof: runtimeProof,
    lastBackendError: healthError ?? chatProbe.error,
    lastAIProviderError: runtimeProof?.failureClass && runtimeProof.failureClass !== 'none'
      ? runtimeProof.detail
      : null,
  };
}

function StatusChip({ tone, label, testID }: { tone: 'success' | 'warn' | 'error' | 'neutral'; label: string; testID?: string }) {
  const backgroundColor = tone === 'success' ? '#163a24'
    : tone === 'warn' ? '#3a2c16'
    : tone === 'error' ? '#3a1a1a'
    : Colors.surfaceLight;
  const color = tone === 'success' ? Colors.success
    : tone === 'warn' ? Colors.warning
    : tone === 'error' ? Colors.error
    : Colors.textSecondary;
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warn' ? CircleAlert : tone === 'error' ? CircleX : Activity;

  return (
    <View style={[styles.chip, { backgroundColor }]} testID={testID}>
      <Icon size={12} color={color} />
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

function toneFromFriendly(tone: IVXFriendlyState['tone']): 'success' | 'warn' | 'error' | 'neutral' {
  if (tone === 'success') return 'success';
  if (tone === 'warn') return 'warn';
  if (tone === 'error') return 'error';
  return 'neutral';
}

export default function IVXDiagnosticsRoute() {
  const query = useQuery<Snapshot, Error>({
    queryKey: ['ivx-diagnostics'],
    queryFn: loadSnapshot,
    refetchInterval: 20000,
  });

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const audit = useMemo(() => getIVXOwnerAIConfigAudit(), []);
  const snapshot = query.data ?? null;

  const friendlyState = useMemo<IVXFriendlyState>(() => {
    if (!snapshot) {
      return getIVXFriendlyState('ready');
    }

    if (!snapshot.authState.authenticated) {
      return getIVXFriendlyState('auth_expired');
    }

    return classifyIVXFriendlyState({
      httpStatus: snapshot.chatProbe?.status ?? null,
      classification: snapshot.lastRuntimeProof?.failureClass ?? null,
      detail: snapshot.lastBackendError ?? snapshot.chatProbe?.error ?? null,
      source: snapshot.lastRuntimeProof?.source ?? (snapshot.chatProbe?.ok ? 'remote_api' : 'unknown'),
      aiHealth: snapshot.chatProbe?.ok ? 'active' : snapshot.health?.ok ? 'degraded' : 'inactive',
      hasNetwork: true,
    });
  }, [snapshot]);

  const healthTone: 'success' | 'warn' | 'error' = snapshot?.health?.ok ? 'success' : snapshot?.healthError ? 'error' : 'warn';
  const chatTone: 'success' | 'warn' | 'error' = snapshot?.chatProbe?.ok ? 'success' : snapshot?.chatProbe?.error ? 'error' : 'warn';
  const authTone: 'success' | 'warn' | 'error' = snapshot?.authState.authenticated ? 'success' : 'error';
  const realtimeTone: 'success' | 'warn' | 'neutral' = (snapshot?.realtimeState.activeChannelCount ?? 0) > 0 ? 'success' : 'neutral';
  const syncTone: 'success' | 'warn' | 'error' | 'neutral' = snapshot?.lastSync.status === 'ok'
    ? 'success'
    : snapshot?.lastSync.status === 'delayed'
      ? 'warn'
      : snapshot?.lastSync.status === 'failed'
        ? 'error'
        : 'neutral';
  const fallbackTone: 'success' | 'warn' | 'neutral' = snapshot?.lastRuntimeProof?.source === 'provider_fallback'
    ? 'warn'
    : snapshot?.lastRuntimeProof?.source === 'remote_api'
      ? 'success'
      : 'neutral';

  return (
    <ErrorBoundary fallbackTitle="IVX diagnostics unavailable">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl tintColor={Colors.primary} refreshing={query.isFetching} onRefresh={onRefresh} />}
        testID="ivx-diagnostics-screen"
      >
        <View style={styles.headerCard}>
          <View style={styles.headerBadge}>
            <ShieldCheck size={16} color={Colors.black} />
            <Text style={styles.headerBadgeText}>Owner Diagnostics</Text>
          </View>
          <Text style={styles.headerTitle}>{friendlyState.title}</Text>
          <Text style={styles.headerSubtitle}>{friendlyState.detail}</Text>
          <View style={styles.chipRow}>
            <StatusChip tone={toneFromFriendly(friendlyState.tone)} label={friendlyState.badge} testID="ivx-diagnostics-friendly-state" />
            <StatusChip tone={healthTone} label={`/health · ${snapshot?.health?.status ?? (snapshot?.healthError ? 'error' : 'pending')}`} testID="ivx-diagnostics-health-chip" />
            <StatusChip tone={chatTone} label={`/chat · ${snapshot?.chatProbe?.ok ? 'ok' : snapshot?.chatProbe?.error ? 'error' : 'pending'}`} testID="ivx-diagnostics-chat-chip" />
            <StatusChip tone={authTone} label={snapshot?.authState.authenticated ? 'auth · owner' : 'auth · expired'} testID="ivx-diagnostics-auth-chip" />
            <StatusChip tone={realtimeTone === 'success' ? 'success' : 'neutral'} label={`realtime · ${snapshot?.realtimeState.activeChannelCount ?? 0} channel(s)`} testID="ivx-diagnostics-realtime-chip" />
            <StatusChip tone={syncTone} label={`sync · ${snapshot?.lastSync.status ?? 'pending'}`} testID="ivx-diagnostics-sync-chip" />
            <StatusChip tone={fallbackTone === 'success' ? 'success' : fallbackTone === 'warn' ? 'warn' : 'neutral'} label={`fallback · ${snapshot?.lastRuntimeProof?.source === 'provider_fallback' ? 'active' : snapshot?.lastRuntimeProof?.source === 'remote_api' ? 'cleared' : 'idle'}`} testID="ivx-diagnostics-fallback-chip" />
          </View>
          <Pressable style={styles.refreshButton} onPress={onRefresh} testID="ivx-diagnostics-refresh">
            <RefreshCw size={14} color={Colors.black} />
            <Text style={styles.refreshButtonText}>Re-run diagnostics</Text>
          </Pressable>
        </View>

        {query.isLoading && !snapshot ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Probing backend…</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Server size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>API routing</Text>
          </View>
          <Row label="Current API base URL" value={snapshot?.baseUrl ?? audit.activeBaseUrl ?? 'unconfigured'} />
          <Row label="Active endpoint" value={audit.activeEndpoint ?? 'unconfigured'} />
          <Row label="Routing policy" value={audit.routingPolicy} />
          <Row label="Selection reason" value={audit.selectionReason} multiline />
          {audit.configurationError ? <Row label="Configuration error" value={audit.configurationError} tone="error" multiline /> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Activity size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>/health endpoint</Text>
          </View>
          <Row label="Result" value={snapshot?.health?.ok ? 'ok' : snapshot?.healthError ? 'error' : 'pending'} tone={healthTone === 'error' ? 'error' : healthTone === 'success' ? 'success' : 'warn'} />
          <Row label="Duration" value={snapshot ? `${snapshot.healthDurationMs} ms` : 'pending'} />
          {snapshot?.health?.service ? <Row label="Service" value={snapshot.health.service} /> : null}
          {snapshot?.health?.deploymentMarker ? <Row label="Deployment" value={snapshot.health.deploymentMarker} /> : null}
          {snapshot?.healthError ? <Row label="Error" value={snapshot.healthError} tone="error" multiline /> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <MessageSquare size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>/chat endpoint</Text>
          </View>
          <Row label="Result" value={snapshot?.chatProbe?.ok ? 'ok' : snapshot?.chatProbe?.error ? 'error' : 'pending'} tone={chatTone === 'error' ? 'error' : chatTone === 'success' ? 'success' : 'warn'} />
          <Row label="HTTP status" value={snapshot?.chatProbe ? String(snapshot.chatProbe.status) : 'pending'} />
          <Row label="Duration" value={snapshot?.chatProbe ? `${snapshot.chatProbe.durationMs} ms` : 'pending'} />
          {snapshot?.chatProbe?.requestId ? <Row label="Request ID" value={snapshot.chatProbe.requestId} /> : null}
          {snapshot?.chatProbe?.answerPreview ? <Row label="Answer preview" value={snapshot.chatProbe.answerPreview} multiline /> : null}
          {snapshot?.chatProbe?.error ? <Row label="Error" value={snapshot.chatProbe.error} tone="error" multiline /> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <ShieldCheck size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>Auth state</Text>
          </View>
          <Row
            label="Authenticated"
            value={snapshot?.authState.authenticated ? 'yes' : 'no'}
            tone={snapshot?.authState.authenticated ? 'success' : 'error'}
          />
          {snapshot?.authState.email ? <Row label="Owner email" value={snapshot.authState.email} /> : null}
          {snapshot?.authState.role ? <Row label="Role" value={snapshot.authState.role} /> : null}
          <Row label="Access token" value={snapshot?.authState.hasAccessToken ? 'present' : 'missing'} tone={snapshot?.authState.hasAccessToken ? 'success' : 'warn'} />
          {snapshot?.authState.error ? <Row label="Error" value={snapshot.authState.error} tone="error" multiline /> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Radio size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>Realtime connection</Text>
          </View>
          <Row
            label="Active channels"
            value={String(snapshot?.realtimeState.activeChannelCount ?? 0)}
            tone={(snapshot?.realtimeState.activeChannelCount ?? 0) > 0 ? 'success' : 'warn'}
          />
          <Row label="Local listeners" value={String(snapshot?.realtimeState.localListenerCount ?? 0)} />
          {snapshot?.realtimeState.activeChannels && snapshot.realtimeState.activeChannels.length > 0 ? (
            <Row label="Channels" value={snapshot.realtimeState.activeChannels.join(', ')} multiline />
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Wifi size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>Last inbox sync</Text>
          </View>
          <Row
            label="Status"
            value={snapshot?.lastSync.status ?? 'idle'}
            tone={snapshot?.lastSync.status === 'ok' ? 'success' : snapshot?.lastSync.status === 'failed' ? 'error' : 'warn'}
          />
          {snapshot?.lastSync.lastSyncAt ? (
            <Row label="Observed at" value={new Date(snapshot.lastSync.lastSyncAt).toLocaleString()} />
          ) : null}
          <Row label="Detail" value={snapshot?.lastSync.detail ?? 'No sync observed yet.'} multiline />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <CircleAlert size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>Fallback & AI provider</Text>
          </View>
          <Row
            label="Fallback status"
            value={snapshot?.lastRuntimeProof?.source === 'provider_fallback' ? 'active' : snapshot?.lastRuntimeProof?.source === 'remote_api' ? 'cleared' : 'idle'}
            tone={snapshot?.lastRuntimeProof?.source === 'provider_fallback' ? 'warn' : snapshot?.lastRuntimeProof?.source === 'remote_api' ? 'success' : undefined}
          />
          {snapshot?.lastRuntimeProof?.requestStage ? <Row label="Last request stage" value={snapshot.lastRuntimeProof.requestStage} /> : null}
          {snapshot?.lastRuntimeProof?.requestId ? <Row label="Last request ID" value={snapshot.lastRuntimeProof.requestId} /> : null}
          {snapshot?.lastBackendError ? <Row label="Last backend error" value={snapshot.lastBackendError} tone="error" multiline /> : null}
          {snapshot?.lastAIProviderError ? <Row label="Last AI provider error" value={snapshot.lastAIProviderError} tone="error" multiline /> : null}
          {!snapshot?.lastBackendError && !snapshot?.lastAIProviderError ? (
            <Row label="Errors" value="No backend or AI provider errors captured yet." tone="success" multiline />
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <ShieldCheck size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>IVX AI Independence</Text>
          </View>
          {(() => {
            const independence: IVXAIIndependenceSnapshot = getIVXAIIndependenceSnapshot();
            const exposedPublic = independence.rorkPublicEnvPresentOnClient.filter((row) => row.present);
            const secretExposed = independence.rorkToolkitSecretPresentOnClient;
            return (
              <View style={{ gap: 8 }}>
                <Row label="Active provider" value={independence.activeProvider} tone="success" />
                <Row label="Active model" value={independence.activeModel} />
                <Row label="IVX backend proxy" value={`${independence.ivxBackendBaseUrl ?? 'unconfigured'}${independence.ivxBackendProxyPath}`} multiline />
                <Row
                  label="Client direct-gateway rollback"
                  value={independence.clientDirectGatewayRollbackEnabled ? 'ENABLED (legacy)' : 'disabled (IVX-only)'}
                  tone={independence.clientDirectGatewayRollbackEnabled ? 'warn' : 'success'}
                />
                <Row
                  label="Rork toolkit secret on client"
                  value={secretExposed ? 'present (residual)' : 'not read at runtime'}
                  tone={secretExposed ? 'warn' : 'success'}
                />
                <Row
                  label="Public Rork envs present (names only)"
                  value={exposedPublic.length === 0 ? 'none' : exposedPublic.map((row) => row.name).join(', ')}
                  tone={exposedPublic.length === 0 ? 'success' : 'warn'}
                  multiline
                />
                <Row label="toolkit-sdk usage" value={independence.toolkitSdkMetroOnly ? 'metro bundler only (not in AI runtime path)' : 'absent'} tone="success" multiline />
                <Row label="Rate limits source" value={independence.rateLimitsSource} />
                <Row
                  label="Audit logging"
                  value={`${independence.auditLoggingTable} · ${independence.auditLoggingActive}`}
                  tone={independence.auditLoggingActive === 'active' ? 'success' : 'warn'}
                  multiline
                />
                <Row
                  label="Last fallback state"
                  value={independence.lastFallbackState}
                  tone={independence.lastFallbackState === 'remote_api' ? 'success' : independence.lastFallbackState === 'provider_fallback' ? 'warn' : undefined}
                />
                <Row label="Brain-free score" value={`${independence.brainFreePercent}%`} tone={independence.brainFreePercent >= 90 ? 'success' : independence.brainFreePercent >= 60 ? 'warn' : 'error'} />
              </View>
            );
          })()}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Activity size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>Routes advertised</Text>
          </View>
          {(snapshot?.health?.routes ?? []).map((route) => (
            <View key={route} style={styles.routeRow}>
              <CheckCircle2 size={12} color={Colors.success} />
              <Text style={styles.routeText}>{route}</Text>
            </View>
          ))}
          {!snapshot?.health?.routes || snapshot.health.routes.length === 0 ? (
            <Text style={styles.dimText}>No route manifest received yet.</Text>
          ) : null}
        </View>

        <View style={styles.footerCard}>
          <Text style={styles.footerText}>
            Platform {Platform.OS} · Base {audit.activeBaseUrl ?? 'unconfigured'}
          </Text>
        </View>
      </ScrollView>
    </ErrorBoundary>
  );
}

function Row({ label, value, tone, multiline }: { label: string; value: string; tone?: 'success' | 'warn' | 'error'; multiline?: boolean }) {
  const color = tone === 'success' ? Colors.success : tone === 'warn' ? Colors.warning : tone === 'error' ? Colors.error : Colors.text;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }, multiline && styles.rowValueMultiline]} numberOfLines={multiline ? undefined : 2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  headerCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerBadgeText: { color: Colors.black, fontSize: 12, fontWeight: '700' as const },
  headerTitle: { color: Colors.text, fontSize: 22, fontWeight: '800' as const },
  headerSubtitle: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { fontSize: 12, fontWeight: '700' as const },
  refreshButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  refreshButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 13 },
  loadingCard: {
    padding: 20,
    gap: 10,
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  loadingText: { color: Colors.textSecondary, fontSize: 13 },
  card: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  row: { gap: 4 },
  rowLabel: { color: Colors.textTertiary, fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase' },
  rowValue: { color: Colors.text, fontSize: 13 },
  rowValueMultiline: { lineHeight: 18 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeText: { color: Colors.text, fontSize: 13 },
  dimText: { color: Colors.textTertiary, fontSize: 12 },
  footerCard: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  footerText: { color: Colors.textTertiary, fontSize: 11 },
});
