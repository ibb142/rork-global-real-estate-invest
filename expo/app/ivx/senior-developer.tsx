/**
 * IVX IA SENIOR DEVELOPER — canonical task dashboard (owner view).
 *
 * Every record on this screen comes from the live production task store
 * (GET /api/ivx/senior-developer/tasks) served from the durable orchestrator
 * ledger. Nothing is hardcoded, mocked, or read from device storage.
 *
 * A task only displays PRODUCTION_VERIFIED when its evidence passes the
 * five-point gate: real commit SHA, real deployment identity, health HTTP 200,
 * running-commit match, and QA evidence.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  GitCommitHorizontal,
  HeartPulse,
  Rocket,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react-native';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import {
  fetchCanonicalTaskDetail,
  fetchCanonicalTaskStore,
  type CanonicalTask,
  type CanonicalTaskStatus,
} from '@/src/modules/ivx-developer/seniorDeveloperTaskStoreService';

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All Tasks' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'NOT_DEPLOYED', label: 'Not Deployed' },
  { key: 'PRODUCTION_VERIFIED', label: 'Production Verified' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'WAITING_APPROVAL', label: 'Waiting Approval' },
];

const QUICK_FILTERS: { key: string; label: string; status?: string; feature?: string; sinceHours?: number }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today', sinceHours: 24 },
  { key: '7d', label: 'Last 7 days', sinceHours: 168 },
  { key: 'verified', label: 'Verified', status: 'PRODUCTION_VERIFIED' },
  { key: 'not-deployed', label: 'Not deployed', status: 'NOT_DEPLOYED' },
  { key: 'failed', label: 'Failed', status: 'FAILED' },
  { key: 'reels', label: 'Reels', feature: 'Reels' },
  { key: 'landing', label: 'Landing page', feature: 'Landing page' },
  { key: 'chat', label: 'Chat', feature: 'Chat' },
  { key: 'owner-login', label: 'Owner login', feature: 'Owner login' },
  { key: 'members', label: 'Members', feature: 'Members' },
  { key: 'properties', label: 'Properties', feature: 'Properties' },
  { key: 'deployment', label: 'Deployment', feature: 'Deployment' },
];

function statusColor(status: CanonicalTaskStatus): string {
  switch (status) {
    case 'PRODUCTION_VERIFIED':
      return Colors.success;
    case 'DEPLOYED':
      return Colors.info;
    case 'IN_PROGRESS':
      return Colors.gold;
    case 'WAITING_APPROVAL':
      return Colors.orange;
    case 'BLOCKED':
      return Colors.warning;
    case 'FAILED':
      return Colors.error;
    case 'NOT_DEPLOYED':
    default:
      return Colors.textSecondary;
  }
}

function StatusIcon({ status }: { status: CanonicalTaskStatus }) {
  const color = statusColor(status);
  switch (status) {
    case 'PRODUCTION_VERIFIED':
      return <ShieldCheck color={color} size={16} />;
    case 'DEPLOYED':
      return <Rocket color={color} size={16} />;
    case 'IN_PROGRESS':
      return <Activity color={color} size={16} />;
    case 'BLOCKED':
      return <AlertTriangle color={color} size={16} />;
    case 'FAILED':
      return <XCircle color={color} size={16} />;
    default:
      return <CircleDashed color={color} size={16} />;
  }
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 10) : '—';
}

function timeAgo(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CountPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.countPill}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function EvidenceRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <View style={styles.evidenceRow}>
      <Text style={styles.evidenceLabel}>{label}</Text>
      <Text
        style={[styles.evidenceValue, ok === true && { color: Colors.success }, ok === false && { color: Colors.error }]}
        numberOfLines={3}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function TaskDetailModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const detailQuery = useQuery({
    queryKey: ['ivx-senior-developer', 'task-detail', taskId],
    queryFn: () => fetchCanonicalTaskDetail(taskId),
  });
  const detail = detailQuery.data;
  const task = detail?.task;
  const evidence = task?.evidence ?? null;
  const gate = task?.verified_gate;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={2}>
              {task ? `#${task.number} ${task.title}` : 'Task evidence'}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} testID="ivx-senior-dev-close-detail">
              <X color={Colors.textSecondary} size={22} />
            </Pressable>
          </View>
          {detailQuery.isLoading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={Colors.gold} />
              <Text style={styles.modalLoadingText}>Loading live evidence…</Text>
            </View>
          ) : detailQuery.isError || !task ? (
            <View style={styles.modalLoading}>
              <XCircle color={Colors.error} size={22} />
              <Text style={styles.modalLoadingText}>
                {detailQuery.error instanceof Error ? detailQuery.error.message : 'Task not found in production store.'}
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              <View style={[styles.statusBadge, { borderColor: statusColor(task.status) }]}>
                <StatusIcon status={task.status} />
                <Text style={[styles.statusBadgeText, { color: statusColor(task.status) }]}>{task.status}</Text>
              </View>

              <Text style={styles.sectionTitle}>What was changed</Text>
              <Text style={styles.bodyText} selectable>
                {task.description}
              </Text>

              <Text style={styles.sectionTitle}>Verified evidence gate</Text>
              <EvidenceRow label="Real commit SHA" value={gate?.real_commit_sha ? 'PASS' : 'FAIL'} ok={gate?.real_commit_sha} />
              <EvidenceRow label="Real deployment ID" value={gate?.real_deployment_id ? 'PASS' : 'FAIL'} ok={gate?.real_deployment_id} />
              <EvidenceRow label="Health HTTP 200" value={gate?.health_200 ? 'PASS' : 'FAIL'} ok={gate?.health_200} />
              <EvidenceRow label="Running commit match" value={gate?.running_commit_match ? 'PASS' : 'FAIL'} ok={gate?.running_commit_match} />
              <EvidenceRow label="QA evidence" value={gate?.qa_evidence ? 'PASS' : 'FAIL'} ok={gate?.qa_evidence} />

              <Text style={styles.sectionTitle}>Deployment evidence</Text>
              <EvidenceRow label="Commit SHA" value={evidence?.commit_sha ?? '—'} />
              <EvidenceRow label="Push result" value={evidence?.push_status ?? '—'} />
              <EvidenceRow label="Deployment ID" value={task.deployment_id ?? '—'} />
              <EvidenceRow label="Deployment status" value={task.deployment_status ?? '—'} />
              <EvidenceRow
                label="Health check"
                value={
                  evidence?.health_http_status
                    ? `${evidence.health_endpoint ?? '/health'} → HTTP ${evidence.health_http_status}`
                    : '—'
                }
                ok={evidence?.health_http_status === 200 ? true : undefined}
              />
              <EvidenceRow label="Running commit" value={evidence?.running_commit_sha ?? '—'} />
              <EvidenceRow label="Production URL" value={task.production_url ?? '—'} />
              <EvidenceRow label="QA result" value={evidence?.qa_result ?? '—'} />
              <EvidenceRow label="Verified at" value={evidence?.verification_time ?? '—'} />

              <Text style={styles.sectionTitle}>Blocks ({detail.blocks.length})</Text>
              {detail.blocks.map((block) => (
                <View key={block.id} style={styles.blockRow}>
                  <Text style={styles.blockTitle} numberOfLines={2}>
                    {block.index + 1}. {block.title}
                  </Text>
                  <Text style={styles.blockMeta}>
                    {block.status}
                    {block.commitHash ? ` · ${block.commitHash.slice(0, 10)}` : ''}
                    {block.testResult ? ` · tests: ${block.testResult.slice(0, 60)}` : ''}
                  </Text>
                  {block.filesInvolved.length > 0 ? (
                    <Text style={styles.blockFiles} numberOfLines={3}>
                      files: {block.filesInvolved.join(', ')}
                    </Text>
                  ) : null}
                  {block.blocker ? (
                    <Text style={styles.blockBlocker} numberOfLines={3}>
                      {block.blocker}
                    </Text>
                  ) : null}
                </View>
              ))}

              <Text style={styles.sectionTitle}>Activity log ({detail.events.length})</Text>
              {detail.events.slice(-40).reverse().map((event, index) => (
                <View key={`${event.at ?? ''}-${index}`} style={styles.eventRow}>
                  <Text style={styles.eventType}>{event.type ?? 'EVENT'}</Text>
                  <Text style={styles.eventDetail} numberOfLines={2}>
                    {event.at ?? ''} {event.detail ?? ''}
                  </Text>
                </View>
              ))}

              <Text style={styles.sectionTitle}>Final status</Text>
              <View style={[styles.statusBadge, { borderColor: statusColor(task.status) }]}>
                <StatusIcon status={task.status} />
                <Text style={[styles.statusBadgeText, { color: statusColor(task.status) }]}>{task.status}</Text>
              </View>
              <Text style={styles.sourceText}>Source: {detail.fetched_from}</Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function TaskCard({ task, onOpenEvidence }: { task: CanonicalTask; onOpenEvidence: (taskId: string) => void }) {
  const color = statusColor(task.status);
  return (
    <View style={styles.card} testID={`ivx-senior-dev-task-${task.id}`}>
      <View style={styles.cardTopRow}>
        <Text style={styles.cardNumber}>#{task.number}</Text>
        <View style={[styles.statusBadge, { borderColor: color }]}>
          <StatusIcon status={task.status} />
          <Text style={[styles.statusBadgeText, { color }]}>{task.status}</Text>
        </View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {task.title}
      </Text>
      <View style={styles.cardMetaRow}>
        <Text style={styles.cardMeta}>{task.feature}</Text>
        <Text style={styles.cardMeta}>{timeAgo(task.updated_at)}</Text>
      </View>
      <View style={styles.cardMetaRow}>
        <View style={styles.inlineMeta}>
          <GitCommitHorizontal color={Colors.textTertiary} size={13} />
          <Text style={styles.cardMono}>{shortSha(task.commit_sha)}</Text>
        </View>
        <View style={styles.inlineMeta}>
          <Rocket color={Colors.textTertiary} size={13} />
          <Text style={styles.cardMono} numberOfLines={1}>
            {task.deployment_id ? task.deployment_id.slice(0, 26) : '—'}
          </Text>
        </View>
      </View>
      <View style={styles.cardMetaRow}>
        <View style={styles.inlineMeta}>
          <HeartPulse color={Colors.textTertiary} size={13} />
          <Text style={styles.cardMeta}>QA: {task.qa_status ?? '—'}</Text>
        </View>
        <View style={styles.inlineMeta}>
          {task.verified_gate.passed ? (
            <CheckCircle2 color={Colors.success} size={13} />
          ) : (
            <CircleDashed color={Colors.textTertiary} size={13} />
          )}
          <Text style={styles.cardMeta}>{task.verified_gate.passed ? 'Production verified' : 'Not verified'}</Text>
        </View>
      </View>
      <Pressable
        style={styles.evidenceButton}
        onPress={() => onOpenEvidence(task.id)}
        testID={`ivx-senior-dev-open-evidence-${task.id}`}
      >
        <ClipboardList color={Colors.black} size={15} />
        <Text style={styles.evidenceButtonText}>Open evidence</Text>
      </Pressable>
    </View>
  );
}

function SeniorDeveloperScreen() {
  const [statusTab, setStatusTab] = useState<string>('ALL');
  const [quickFilter, setQuickFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const activeQuick = QUICK_FILTERS.find((filter) => filter.key === quickFilter);
  const effectiveStatus = activeQuick?.status ?? statusTab;

  const storeQuery = useQuery({
    queryKey: ['ivx-senior-developer', 'task-store', effectiveStatus, activeQuick?.feature ?? '', activeQuick?.sinceHours ?? 0, search],
    queryFn: () =>
      fetchCanonicalTaskStore({
        status: effectiveStatus,
        feature: activeQuick?.feature,
        sinceHours: activeQuick?.sinceHours,
        search,
      }),
    refetchInterval: 30_000,
  });

  const counts = storeQuery.data?.counts;
  const tasks = useMemo(() => storeQuery.data?.tasks ?? [], [storeQuery.data]);

  const onOpenEvidence = useCallback((taskId: string) => setDetailTaskId(taskId), []);
  const renderTask = useCallback(
    ({ item }: { item: CanonicalTask }) => <TaskCard task={item} onOpenEvidence={onOpenEvidence} />,
    [onOpenEvidence],
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'IVX IA Senior Developer' }} />

      <View style={styles.countsRow}>
        <CountPill label="TOTAL" value={counts?.TOTAL_TASKS ?? 0} color={Colors.text} />
        <CountPill label="IN PROGRESS" value={counts?.IN_PROGRESS ?? 0} color={Colors.gold} />
        <CountPill label="BLOCKED" value={counts?.BLOCKED ?? 0} color={Colors.warning} />
        <CountPill label="NOT DEPLOYED" value={counts?.NOT_DEPLOYED ?? 0} color={Colors.textSecondary} />
        <CountPill label="VERIFIED" value={counts?.PRODUCTION_VERIFIED ?? 0} color={Colors.success} />
        <CountPill label="FAILED" value={counts?.FAILED ?? 0} color={Colors.error} />
      </View>

      <View style={styles.searchRow}>
        <Search color={Colors.textTertiary} size={16} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search task history (title, id, commit SHA)…"
          placeholderTextColor={Colors.inputPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          testID="ivx-senior-dev-search"
        />
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {STATUS_TABS.map((tab) => {
            const active = effectiveStatus === tab.key && !activeQuick?.status;
            const selfActive = statusTab === tab.key && !activeQuick?.status;
            return (
              <Pressable
                key={tab.key}
                style={[styles.chip, (active || selfActive) && styles.chipActive]}
                onPress={() => {
                  setStatusTab(tab.key);
                  setQuickFilter('all');
                }}
              >
                <Text style={[styles.chipText, (active || selfActive) && styles.chipTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {QUICK_FILTERS.map((filter) => (
            <Pressable
              key={filter.key}
              style={[styles.chip, quickFilter === filter.key && styles.chipActive]}
              onPress={() => setQuickFilter(filter.key)}
            >
              <Text style={[styles.chipText, quickFilter === filter.key && styles.chipTextActive]}>{filter.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {storeQuery.isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={Colors.gold} size="large" />
          <Text style={styles.centerText}>Loading canonical production task store…</Text>
        </View>
      ) : storeQuery.isError ? (
        <View style={styles.centerBox}>
          <XCircle color={Colors.error} size={28} />
          <Text style={styles.centerText}>
            {storeQuery.error instanceof Error ? storeQuery.error.message : 'Task store unavailable.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => storeQuery.refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(task) => task.id}
          renderItem={renderTask}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={storeQuery.isRefetching} onRefresh={() => storeQuery.refetch()} tintColor={Colors.gold} />
          }
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <CircleDashed color={Colors.textTertiary} size={26} />
              <Text style={styles.centerText}>No tasks match this filter.</Text>
            </View>
          }
          ListFooterComponent={
            storeQuery.data ? (
              <Text style={styles.sourceText}>
                Live store: {storeQuery.data.fetched_from} · generated {storeQuery.data.generated_at}
              </Text>
            ) : null
          }
        />
      )}

      {detailTaskId ? <TaskDetailModal taskId={detailTaskId} onClose={() => setDetailTaskId(null)} /> : null}
    </View>
  );
}

export default function SeniorDeveloperRoute() {
  return (
    <ErrorBoundary>
      <SeniorDeveloperScreen />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  countsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  countPill: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    minWidth: 84,
  },
  countValue: { fontSize: 18, fontWeight: '800' as const },
  countLabel: { fontSize: 10, color: Colors.textTertiary, marginTop: 2, letterSpacing: 0.5 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.inputBackground,
  },
  searchInput: { flex: 1, color: Colors.text, paddingVertical: 10, fontSize: 14 },
  chipsRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' as const },
  chipTextActive: { color: Colors.black },
  listContent: { padding: 16, gap: 12, paddingBottom: 48 },
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardNumber: { color: Colors.textTertiary, fontSize: 12, fontWeight: '700' as const },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' as const, lineHeight: 20 },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardMeta: { color: Colors.textSecondary, fontSize: 12 },
  cardMono: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Courier' as const, flexShrink: 1 },
  inlineMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4 },
  evidenceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.gold,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
    minHeight: 44,
  },
  evidenceButtonText: { color: Colors.black, fontWeight: '800' as const, fontSize: 13 },
  centerBox: { alignItems: 'center', gap: 10, padding: 32 },
  centerText: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' as const },
  retryButton: {
    backgroundColor: Colors.gold,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: { color: Colors.black, fontWeight: '800' as const },
  modalBackdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '88%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' as const, flex: 1 },
  modalLoading: { alignItems: 'center', gap: 10, padding: 32 },
  modalLoadingText: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' as const },
  modalScroll: { paddingHorizontal: 16 },
  modalScrollContent: { paddingVertical: 14, gap: 6 },
  sectionTitle: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
  },
  bodyText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  evidenceRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  evidenceLabel: { color: Colors.textTertiary, fontSize: 12, width: 130 },
  evidenceValue: { color: Colors.text, fontSize: 12, flex: 1, fontFamily: 'Courier' as const },
  blockRow: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    gap: 3,
  },
  blockTitle: { color: Colors.text, fontSize: 13, fontWeight: '600' as const },
  blockMeta: { color: Colors.textSecondary, fontSize: 11 },
  blockFiles: { color: Colors.textTertiary, fontSize: 11, fontFamily: 'Courier' as const },
  blockBlocker: { color: Colors.warning, fontSize: 11 },
  eventRow: { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  eventType: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' as const },
  eventDetail: { color: Colors.textTertiary, fontSize: 11 },
  sourceText: { color: Colors.textTertiary, fontSize: 10, marginTop: 14, textAlign: 'center' as const },
});
