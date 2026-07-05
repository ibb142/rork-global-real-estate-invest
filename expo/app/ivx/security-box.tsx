/**
 * IVX Owner — Security Box (GitHub + Render)
 *
 * Live security posture panel for the two production deployment platforms.
 * Pulls real, verified status from the backend deployment-tools routes:
 *   - GET /api/ivx/deploy-tools/github      — token, perms, branches, commit
 *   - GET /api/ivx/deploy-tools/render      — service, deploys, env vars
 *   - GET /api/ivx/deploy-tools/credentials — masked credential sync
 *   - GET /api/ivx/deploy-tools/dashboard   — unified summary
 *
 * No secrets are ever displayed. Values are masked server-side. Blockers are
 * reported honestly with the exact missing/expired credential name.
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Github,
  KeyRound,
  Lock,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';

const API_BASE = ((process.env.EXPO_PUBLIC_IVX_API_BASE_URL
  ?? process.env.EXPO_PUBLIC_API_BASE_URL
  ?? 'https://api.ivxholding.com') as string).replace(/\/$/, '');

// ─── Backend response shapes (only the fields we render) ────────────────

type GitHubPermissions = {
  scopes?: string[];
  repoAccess?: boolean;
  workflowAccess?: boolean;
  adminAccess?: boolean;
  canPush?: boolean;
  canReadWorkflows?: boolean;
  canReadSecrets?: boolean;
} | null;

type GitHubCommit = {
  sha: string;
  shortSha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string;
} | null;

type GitHubBranch = { name: string; sha: string; protected: boolean };

type GitHubStatusResponse = {
  ok: boolean;
  error?: string | null;
  branches?: GitHubBranch[];
  commit?: GitHubCommit;
  permissions?: GitHubPermissions;
};

type RenderService = {
  id: string;
  name: string;
  type: string;
  repo: string;
  branch: string;
  autoDeploy: string;
  suspended: string;
} | null;

type RenderDeploy = {
  id: string;
  status: string;
  commitSha: string | null;
  commitMessage: string | null;
  createdAt: string | null;
  finishedAt: string | null;
  failureReason: string | null;
};

type RenderStatusResponse = {
  ok: boolean;
  error?: string | null;
  service?: RenderService;
  deploys?: RenderDeploy[];
  envVarsCount?: number;
  autoDeploy?: boolean | null;
};

type CredentialSource = 'process.env' | 'owner_variables' | 'github_secrets' | 'render_env' | 'vercel_env' | 'supabase_vault' | 'unknown';
type CredentialValidation = 'valid' | 'missing' | 'expired' | 'wrong_scope' | 'auth_failed' | 'network_error' | 'unverified';

type CredentialRow = {
  name: string;
  category: 'github' | 'render' | 'supabase' | 'vercel' | 'aws' | 'ai' | 'security' | 'other';
  required: boolean;
  validation: CredentialValidation;
  validationDetail: string | null;
  sources: { source: CredentialSource; present: boolean }[];
  tested: boolean;
};

type CredentialsResponse = {
  ok: boolean;
  credentials?: CredentialRow[];
  summary?: { total: number; valid: number; missing: number; failed: number; unverified: number };
  gaps?: string[];
  recommendations?: string[];
};

// ─── Helpers ────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as T;
}

function platformState(
  ok: boolean,
  error?: string | null,
): 'READY' | 'BLOCKED' | 'DEGRADED' {
  if (ok && !error) return 'READY';
  if (error && /not configured|missing|401|403|invalid|expired/i.test(error)) return 'BLOCKED';
  return 'DEGRADED';
}

function stateColor(state: 'READY' | 'BLOCKED' | 'DEGRADED'): string {
  if (state === 'READY') return Colors.success;
  if (state === 'BLOCKED') return Colors.error;
  return Colors.warning;
}

function stateIcon(state: 'READY' | 'BLOCKED' | 'DEGRADED', size = 18) {
  if (state === 'READY') return <CheckCircle2 size={size} color={Colors.success} />;
  if (state === 'BLOCKED') return <XCircle size={size} color={Colors.error} />;
  return <AlertTriangle size={size} color={Colors.warning} />;
}

function credColor(v: CredentialValidation): string {
  if (v === 'valid') return Colors.success;
  if (v === 'missing') return Colors.error;
  if (v === 'auth_failed' || v === 'expired' || v === 'wrong_scope') return Colors.error;
  if (v === 'network_error') return Colors.warning;
  return Colors.textTertiary;
}

function credLabel(v: CredentialValidation): string {
  return v.toUpperCase().replace(/_/g, ' ');
}

function maskCommitSha(sha: string | null): string {
  if (!sha) return '—';
  return sha.length > 12 ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : sha;
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ─── Components ─────────────────────────────────────────────────────────

function StateBanner({ state, label, error }: { state: 'READY' | 'BLOCKED' | 'DEGRADED'; label: string; error?: string | null }) {
  const color = stateColor(state);
  return (
    <View style={[styles.stateBanner, { borderColor: color + '44', backgroundColor: color + '12' }]}>
      {stateIcon(state, 22)}
      <View style={styles.stateBannerText}>
        <Text style={[styles.stateBannerLabel, { color }]}>{label}</Text>
        <Text style={styles.stateBannerSub}>
          {state === 'READY'
            ? 'Token valid · permissions verified live'
            : state === 'BLOCKED'
              ? (error || 'BLOCKED — exact blocker below')
              : (error || 'Degraded — partial reachability')}
        </Text>
      </View>
      <View style={[styles.statePill, { backgroundColor: color }]}>
        <Text style={styles.statePillText}>{state}</Text>
      </View>
    </View>
  );
}

function PermRow({ label, value }: { label: string; value: boolean | null | undefined }) {
  const ok = value === true;
  const unknown = value === null || value === undefined;
  const color = unknown ? Colors.textTertiary : ok ? Colors.success : Colors.error;
  return (
    <View style={styles.permRow}>
      {unknown ? <EyeOff size={14} color={Colors.textTertiary} /> : ok ? <CheckCircle2 size={14} color={Colors.success} /> : <XCircle size={14} color={Colors.error} />}
      <Text style={styles.permLabel}>{label}</Text>
      <Text style={[styles.permValue, { color }]}>{unknown ? 'UNKNOWN' : ok ? 'YES' : 'NO'}</Text>
    </View>
  );
}

function CredentialCard({ row }: { row: CredentialRow }) {
  const color = credColor(row.validation);
  const sources = row.sources.filter((s) => s.present);
  return (
    <View style={[styles.credCard, { borderColor: color + '55' }]}>
      <View style={styles.credHeader}>
        {row.validation === 'valid' ? <CheckCircle2 size={15} color={Colors.success} /> : row.validation === 'missing' ? <XCircle size={15} color={Colors.error} /> : <AlertTriangle size={15} color={Colors.warning} />}
        <Text style={styles.credName} numberOfLines={1}>{row.name}</Text>
        {row.required ? <View style={styles.requiredPill}><Text style={styles.requiredPillText}>REQUIRED</Text></View> : null}
        <View style={[styles.credPill, { backgroundColor: color }]}>
          <Text style={styles.credPillText}>{credLabel(row.validation)}</Text>
        </View>
      </View>
      {row.validationDetail ? <Text style={styles.credDetail}>{row.validationDetail}</Text> : null}
      <View style={styles.credMetaRow}>
        <Text style={styles.credMetaLabel}>Sources:</Text>
        <Text style={styles.credMetaValue}>
          {sources.length > 0 ? sources.map((s) => s.source).join(' · ') : 'none found'}
        </Text>
      </View>
      <View style={styles.credMetaRow}>
        <Text style={styles.credMetaLabel}>Tested:</Text>
        <Text style={styles.credMetaValue}>{row.tested ? 'yes (live probe)' : 'presence only'}</Text>
      </View>
    </View>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      {icon}
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function BlockerList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.blockerBox}>
      <ShieldAlert size={16} color={Colors.error} />
      <View style={styles.blockerTextWrap}>
        {items.map((b, i) => (
          <Text key={`${b}-${i}`} style={styles.blockerText}>• {b}</Text>
        ))}
      </View>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────

export default function IVXSecurityBoxScreen() {
  const insets = useSafeAreaInsets();
  const [revealSecrets, setRevealSecrets] = useState<boolean>(false);

  const githubQ = useQuery<GitHubStatusResponse>({
    queryKey: ['ivx-security-box', 'github'],
    queryFn: () => fetchJson<GitHubStatusResponse>('/api/ivx/deploy-tools/github'),
    retry: 1,
    staleTime: 30_000,
  });

  const renderQ = useQuery<RenderStatusResponse>({
    queryKey: ['ivx-security-box', 'render'],
    queryFn: () => fetchJson<RenderStatusResponse>('/api/ivx/deploy-tools/render'),
    retry: 1,
    staleTime: 30_000,
  });

  const credsQ = useQuery<CredentialsResponse>({
    queryKey: ['ivx-security-box', 'credentials'],
    queryFn: () => fetchJson<CredentialsResponse>('/api/ivx/deploy-tools/credentials'),
    retry: 1,
    staleTime: 30_000,
  });

  const refreshAll = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([githubQ.refetch(), renderQ.refetch(), credsQ.refetch()]);
  }, [credsQ, githubQ, renderQ]);

  const refreshControl = (
    <RefreshControl
      refreshing={githubQ.isFetching || renderQ.isFetching || credsQ.isFetching}
      onRefresh={refreshAll}
      tintColor={Colors.tint}
      colors={[Colors.tint]}
    />
  );

  const ghState = platformState(githubQ.data?.ok ?? false, githubQ.data?.error ?? githubQ.error?.message);
  const renderState = platformState(renderQ.data?.ok ?? false, renderQ.data?.error ?? renderQ.error?.message);

  const ghCreds = useMemo(
    () => (credsQ.data?.credentials ?? []).filter((c) => c.category === 'github'),
    [credsQ.data],
  );
  const renderCreds = useMemo(
    () => (credsQ.data?.credentials ?? []).filter((c) => c.category === 'render'),
    [credsQ.data],
  );
  const otherCreds = useMemo(
    () => (credsQ.data?.credentials ?? []).filter((c) => c.category !== 'github' && c.category !== 'render'),
    [credsQ.data],
  );

  const ghBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (githubQ.data?.error) blockers.push(`GitHub API: ${githubQ.data.error}`);
    if (githubQ.error && !githubQ.data) blockers.push(`Network: ${githubQ.error.message}`);
    ghCreds.filter((c) => c.required && c.validation === 'missing').forEach((c) => blockers.push(`${c.name} — REQUIRED credential missing`));
    ghCreds.filter((c) => c.validation === 'auth_failed' || c.validation === 'expired').forEach((c) => blockers.push(`${c.name} — ${c.validationDetail ?? credLabel(c.validation)}`));
    return blockers;
  }, [ghCreds, githubQ.data?.error, githubQ.error]);

  const renderBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (renderQ.data?.error) blockers.push(`Render API: ${renderQ.data.error}`);
    if (renderQ.error && !renderQ.data) blockers.push(`Network: ${renderQ.error.message}`);
    renderCreds.filter((c) => c.required && c.validation === 'missing').forEach((c) => blockers.push(`${c.name} — REQUIRED credential missing`));
    renderCreds.filter((c) => c.validation === 'auth_failed' || c.validation === 'expired').forEach((c) => blockers.push(`${c.name} — ${c.validationDetail ?? credLabel(c.validation)}`));
    if (renderQ.data?.service?.suspended && renderQ.data.service.suspended !== 'not_suspended') {
      blockers.push(`Render service suspended: ${renderQ.data.service.suspended}`);
    }
    return blockers;
  }, [renderCreds, renderQ.data?.error, renderQ.data?.service, renderQ.error]);

  const latestDeploy = renderQ.data?.deploys?.[0] ?? null;
  const perms = githubQ.data?.permissions ?? null;
  const summary = credsQ.data?.summary;
  const gaps = credsQ.data?.gaps ?? [];

  const copyBlockers = useCallback(async (blockers: string[], label: string) => {
    const text = `${label} blockers:\n${blockers.length ? blockers.map((b) => `- ${b}`).join('\n') : 'none'}`;
    await Clipboard.setStringAsync(text);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <ErrorBoundary>
      <Stack.Screen options={{ title: 'Security Box · GitHub + Render', headerShown: true }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        refreshControl={refreshControl}
        testID="ivx-security-box-screen"
      >
        {/* Top summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <ShieldCheck size={22} color={Colors.tint} />
            <Text style={styles.summaryTitle}>Platform Security Box</Text>
          </View>
          <Text style={styles.summarySub}>
            Live, verified posture for the two production deployment platforms. Tokens are probed server-side; values are masked and never exposed.
          </Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellLabel}>GitHub</Text>
              <Text style={[styles.summaryCellValue, { color: stateColor(ghState) }]}>{ghState}</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellLabel}>Render</Text>
              <Text style={[styles.summaryCellValue, { color: stateColor(renderState) }]}>{renderState}</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellLabel}>Creds valid</Text>
              <Text style={styles.summaryCellValue}>{summary?.valid ?? '—'}<Text style={styles.summaryCellSub}>/{summary?.total ?? '—'}</Text></Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellLabel}>Missing</Text>
              <Text style={[styles.summaryCellValue, { color: (summary?.missing ?? 0) > 0 ? Colors.error : Colors.text }]}>{summary?.missing ?? '—'}</Text>
            </View>
          </View>
        </View>

        {/* GitHub panel */}
        <SectionHeader
          icon={<Github size={20} color={Colors.tint} />}
          title="GitHub Security Box"
          subtitle="Token · permissions · repo · latest commit"
        />
        <View style={styles.panel}>
          <StateBanner state={ghState} label="GitHub" error={githubQ.data?.error ?? githubQ.error?.message} />
          {githubQ.isLoading ? <ActivityIndicator color={Colors.tint} style={styles.loader} /> : null}

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Token permissions (live)</Text>
            <PermRow label="Repo access" value={perms?.repoAccess} />
            <PermRow label="Can push" value={perms?.canPush} />
            <PermRow label="Read workflows" value={perms?.canReadWorkflows} />
            <PermRow label="Read secrets" value={perms?.canReadSecrets} />
            <PermRow label="Workflow access" value={perms?.workflowAccess} />
            <PermRow label="Admin" value={perms?.adminAccess} />
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Repository</Text>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Default branch</Text>
              <Text style={styles.kvValue}>
                {(githubQ.data?.branches ?? []).find((b) => b.name === 'main') ? 'main' : (githubQ.data?.branches?.[0]?.name ?? '—')}
              </Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Branches</Text>
              <Text style={styles.kvValue}>{githubQ.data?.branches?.length ?? 0}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Protected branches</Text>
              <Text style={styles.kvValue}>{(githubQ.data?.branches ?? []).filter((b) => b.protected).length}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Latest commit</Text>
              <Text style={styles.kvValue}>{maskCommitSha(githubQ.data?.commit?.sha ?? null)}</Text>
            </View>
            {githubQ.data?.commit?.message ? (
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Message</Text>
                <Text style={styles.kvValueFlex} numberOfLines={2}>{githubQ.data.commit.message}</Text>
              </View>
            ) : null}
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Pushed at</Text>
              <Text style={styles.kvValue}>{formatTimestamp(githubQ.data?.commit?.date ?? null)}</Text>
            </View>
          </View>

          <Text style={styles.subBlockTitle}>GitHub credentials ({ghCreds.length})</Text>
          {ghCreds.map((c) => <CredentialCard key={c.name} row={c} />)}
          {ghCreds.length === 0 && !credsQ.isLoading ? (
            <Text style={styles.emptyText}>No GitHub credentials registered.</Text>
          ) : null}

          <BlockerList items={ghBlockers} />
          {ghBlockers.length > 0 ? (
            <Pressable style={styles.copyBtn} onPress={() => copyBlockers(ghBlockers, 'GitHub')} testID="ivx-security-box-copy-gh-blockers">
              <Text style={styles.copyBtnText}>Copy blockers</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Render panel */}
        <SectionHeader
          icon={<Rocket size={20} color={Colors.tint} />}
          title="Render Security Box"
          subtitle="Service · latest deploy · env vars"
        />
        <View style={styles.panel}>
          <StateBanner state={renderState} label="Render" error={renderQ.data?.error ?? renderQ.error?.message} />
          {renderQ.isLoading ? <ActivityIndicator color={Colors.tint} style={styles.loader} /> : null}

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Service</Text>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Name</Text>
              <Text style={styles.kvValue}>{renderQ.data?.service?.name ?? '—'}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Type</Text>
              <Text style={styles.kvValue}>{renderQ.data?.service?.type ?? '—'}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Branch</Text>
              <Text style={styles.kvValue}>{renderQ.data?.service?.branch ?? '—'}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Auto-deploy</Text>
              <Text style={[styles.kvValue, { color: renderQ.data?.autoDeploy ? Colors.success : Colors.textTertiary }]}>
                {renderQ.data?.autoDeploy === null || renderQ.data?.autoDeploy === undefined ? '—' : renderQ.data.autoDeploy ? 'ON' : 'OFF'}
              </Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Suspended</Text>
              <Text style={[styles.kvValue, { color: renderQ.data?.service?.suspended && renderQ.data.service.suspended !== 'not_suspended' ? Colors.error : Colors.success }]}>
                {renderQ.data?.service?.suspended && renderQ.data.service.suspended !== 'not_suspended' ? renderQ.data.service.suspended : 'no'}
              </Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Env vars configured</Text>
              <Text style={styles.kvValue}>{renderQ.data?.envVarsCount ?? 0}</Text>
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Latest deploy</Text>
            {latestDeploy ? (
              <>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Deploy id</Text>
                  <Text style={styles.kvValue}>{latestDeploy.id.slice(0, 12)}…</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Status</Text>
                  <Text style={[styles.kvValue, { color: latestDeploy.status === 'live' ? Colors.success : latestDeploy.status === 'build_failed' || latestDeploy.status === 'deactivated' ? Colors.error : Colors.warning }]}>
                    {latestDeploy.status.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Commit</Text>
                  <Text style={styles.kvValue}>{maskCommitSha(latestDeploy.commitSha)}</Text>
                </View>
                {latestDeploy.failureReason ? (
                  <View style={styles.kvRow}>
                    <Text style={styles.kvLabel}>Failure</Text>
                    <Text style={[styles.kvValueFlex, { color: Colors.error }]} numberOfLines={3}>{latestDeploy.failureReason}</Text>
                  </View>
                ) : null}
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Created</Text>
                  <Text style={styles.kvValue}>{formatTimestamp(latestDeploy.createdAt)}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Finished</Text>
                  <Text style={styles.kvValue}>{formatTimestamp(latestDeploy.finishedAt)}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>No deploys returned.</Text>
            )}
          </View>

          <Text style={styles.subBlockTitle}>Render credentials ({renderCreds.length})</Text>
          {renderCreds.map((c) => <CredentialCard key={c.name} row={c} />)}
          {renderCreds.length === 0 && !credsQ.isLoading ? (
            <Text style={styles.emptyText}>No Render credentials registered.</Text>
          ) : null}

          <BlockerList items={renderBlockers} />
          {renderBlockers.length > 0 ? (
            <Pressable style={styles.copyBtn} onPress={() => copyBlockers(renderBlockers, 'Render')} testID="ivx-security-box-copy-render-blockers">
              <Text style={styles.copyBtnText}>Copy blockers</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Other credentials (Supabase, AWS, AI, security, etc.) */}
        {otherCreds.length > 0 ? (
          <>
            <SectionHeader
              icon={<KeyRound size={20} color={Colors.tint} />}
              title="Other Platform Credentials"
              subtitle="Supabase · AWS · Vercel · AI · Security"
            />
            <View style={styles.panel}>
              <View style={styles.revealRow}>
                <Text style={styles.revealLabel}>Show masked values</Text>
                <Pressable
                  onPress={() => setRevealSecrets((v) => !v)}
                  style={styles.revealToggle}
                  testID="ivx-security-box-toggle-reveal"
                >
                  {revealSecrets ? <Eye size={16} color={Colors.tint} /> : <EyeOff size={16} color={Colors.textTertiary} />}
                  <Text style={styles.revealToggleText}>{revealSecrets ? 'Hiding' : 'Hidden'}</Text>
                </Pressable>
              </View>
              {otherCreds.map((c) => <CredentialCard key={c.name} row={c} />)}

              {gaps.length > 0 ? (
                <View style={styles.gapBox}>
                  <Lock size={14} color={Colors.warning} />
                  <View style={styles.gapTextWrap}>
                    <Text style={styles.gapTitle}>Credential gaps ({gaps.length})</Text>
                    {gaps.map((g, i) => <Text key={`${g}-${i}`} style={styles.gapText}>• {g}</Text>)}
                  </View>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Footer proof */}
        <View style={styles.footerBox}>
          <ShieldCheck size={14} color={Colors.success} />
          <Text style={styles.footerText}>
            No secret values were fetched or displayed. All tokens are probed server-side; only masked presence and validation status are returned.
          </Text>
        </View>
      </ScrollView>
    </ErrorBoundary>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: 16, gap: 16 },
  loader: { marginVertical: 12 },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 18,
    gap: 12,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryTitle: { color: Colors.text, fontSize: 18, fontWeight: '800' as const },
  summarySub: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  summaryGrid: { flexDirection: 'row', gap: 8, marginTop: 4 },
  summaryCell: { flex: 1, backgroundColor: Colors.backgroundSecondary, borderRadius: 12, padding: 12, gap: 4 },
  summaryCellLabel: { color: Colors.textTertiary, fontSize: 10, fontWeight: '700' as const, textTransform: 'uppercase' as const },
  summaryCellValue: { color: Colors.text, fontSize: 16, fontWeight: '800' as const },
  summaryCellSub: { color: Colors.textTertiary, fontSize: 12, fontWeight: '700' as const },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  sectionHeaderText: { flex: 1, gap: 2 },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' as const },
  sectionSubtitle: { color: Colors.textTertiary, fontSize: 12 },

  panel: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
    gap: 14,
  },

  stateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  stateBannerText: { flex: 1, gap: 2 },
  stateBannerLabel: { fontSize: 15, fontWeight: '800' as const },
  stateBannerSub: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  statePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statePillText: { color: Colors.black, fontSize: 10, fontWeight: '800' as const, letterSpacing: 0.5 },

  block: { gap: 8, marginTop: 4 },
  blockTitle: { color: Colors.text, fontSize: 13, fontWeight: '800' as const, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  subBlockTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const, marginTop: 4 },

  permRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  permLabel: { flex: 1, color: Colors.text, fontSize: 13 },
  permValue: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4 },

  kvRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kvLabel: { color: Colors.textTertiary, fontSize: 12, minWidth: 120 },
  kvValue: { color: Colors.text, fontSize: 13, fontWeight: '700' as const, flexShrink: 1 },
  kvValueFlex: { color: Colors.text, fontSize: 13, fontWeight: '600' as const, flex: 1, flexShrink: 1 },

  credCard: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  credHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  credName: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: '700' as const },
  requiredPill: { backgroundColor: Colors.error + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  requiredPillText: { color: Colors.error, fontSize: 9, fontWeight: '800' as const, letterSpacing: 0.4 },
  credPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  credPillText: { color: Colors.black, fontSize: 9, fontWeight: '800' as const, letterSpacing: 0.4 },
  credDetail: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16 },
  credMetaRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  credMetaLabel: { color: Colors.textTertiary, fontSize: 11 },
  credMetaValue: { color: Colors.text, fontSize: 11, fontWeight: '600' as const, flex: 1 },

  blockerBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.error + '12',
    borderWidth: 1,
    borderColor: Colors.error + '44',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  blockerTextWrap: { flex: 1, gap: 3 },
  blockerText: { color: Colors.error, fontSize: 12, lineHeight: 17, fontWeight: '600' as const },

  copyBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  copyBtnText: { color: Colors.tint, fontSize: 12, fontWeight: '700' as const },

  revealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  revealLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const },
  revealToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  revealToggleText: { color: Colors.textTertiary, fontSize: 11, fontWeight: '700' as const },

  gapBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.warning + '12',
    borderWidth: 1,
    borderColor: Colors.warning + '44',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  gapTextWrap: { flex: 1, gap: 3 },
  gapTitle: { color: Colors.warning, fontSize: 12, fontWeight: '800' as const },
  gapText: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16 },

  emptyText: { color: Colors.textTertiary, fontSize: 12, fontStyle: 'italic' as const },

  footerBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: Colors.success + '10',
    borderWidth: 1,
    borderColor: Colors.success + '33',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  footerText: { flex: 1, color: Colors.textSecondary, fontSize: 11, lineHeight: 16 },
});
