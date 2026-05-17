import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
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
  ChevronRight,
  CircleDashed,
  Filter,
  Layers,
  LockKeyhole,
  Network,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  X,
  XCircle,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import {
  getIVXCTODashboardOverview,
  performIVXCTOControlAction,
  searchIVXCTOAuditLog,
  type IVXAgentExecutionStatus,
  type IVXAgentId,
  type IVXAgentRiskLevel,
  type IVXCTOAuditEntry,
  type IVXCTOControlAction,
  type IVXCTODashboardOverview,
  type IVXCTOTaskRecord,
} from '@/src/modules/ivx-owner-ai/services/ivxCTODashboardService';

const QUERY_KEY = ['ivx-owner-ai', 'cto-dashboard-overview'] as const;
const AUDIT_QUERY_KEY = ['ivx-owner-ai', 'cto-dashboard-audit'] as const;

const AGENT_FILTER_OPTIONS: { id: 'all' | IVXAgentId; label: string }[] = [
  { id: 'all', label: 'All agents' },
  { id: 'cto_orchestrator', label: 'CTO' },
  { id: 'backend_developer', label: 'Backend' },
  { id: 'frontend_developer', label: 'Frontend' },
  { id: 'infrastructure_sre', label: 'SRE' },
  { id: 'supabase_database', label: 'Supabase' },
  { id: 'investor_relations', label: 'Investor' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'operations', label: 'Ops' },
];

const STATUS_FILTER_OPTIONS: { id: 'all' | IVXAgentExecutionStatus; label: string }[] = [
  { id: 'all', label: 'Any status' },
  { id: 'pending', label: 'Pending' },
  { id: 'running', label: 'Running' },
  { id: 'paused', label: 'Paused' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const RISK_FILTER_OPTIONS: { id: 'all' | IVXAgentRiskLevel; label: string }[] = [
  { id: 'all', label: 'Any risk' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

function statusColor(status: string): string {
  if (status === 'completed') return Colors.success;
  if (status === 'running') return Colors.info;
  if (status === 'pending') return Colors.warning;
  if (status === 'paused') return '#9CA3AF';
  if (status === 'blocked') return Colors.warning;
  if (status === 'failed') return Colors.error;
  if (status === 'cancelled') return '#6B7280';
  if (status === 'partial') return Colors.warning;
  return Colors.textSecondary;
}

function riskColor(risk: IVXAgentRiskLevel): string {
  if (risk === 'high') return Colors.error;
  if (risk === 'medium') return Colors.warning;
  return Colors.success;
}

function shortId(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function timeAgo(at: string): string {
  const ms = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return at;
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: `${color}1F` }]}>
      <Text style={[styles.badgeText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function FilterPill<T extends string>({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterPill, active ? styles.filterPillActive : null]}
      testID={`cto-filter-${label}`}
    >
      <Text style={[styles.filterPillText, active ? styles.filterPillTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function MetricTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone?: 'good' | 'warn' | 'bad' | 'info' }) {
  const color = tone === 'bad' ? Colors.error : tone === 'warn' ? Colors.warning : tone === 'good' ? Colors.success : Colors.info;
  return (
    <View style={styles.metricTile} testID={`cto-metric-${label}`}>
      <View style={[styles.metricIconWrap, { backgroundColor: `${color}1F` }]}>{icon}</View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function TaskCard({ task, onPress }: { task: IVXCTOTaskRecord; onPress: () => void }) {
  const sColor = statusColor(task.status);
  const rColor = riskColor(task.risk);
  return (
    <Pressable style={styles.taskCard} onPress={onPress} testID={`cto-task-${task.id}`}>
      <View style={styles.taskHeader}>
        <View style={styles.taskTitleBlock}>
          <Text style={styles.taskGoal} numberOfLines={2}>{task.goal}</Text>
          <Text style={styles.taskMeta}>{task.assignedAgent} · {shortId(task.id)} · {timeAgo(task.updatedAt)}</Text>
        </View>
        <ChevronRight size={16} color={Colors.textTertiary} />
      </View>
      <View style={styles.badgeRow}>
        <Badge label={task.status} color={sColor} />
        <Badge label={`risk: ${task.risk}`} color={rColor} />
        {task.approvalRequired ? <Badge label={task.approvedBy ? 'approved' : 'approval needed'} color={task.approvedBy ? Colors.success : Colors.warning} /> : null}
      </View>
      {task.blockedReason ? <Text style={styles.blockedReason} numberOfLines={2}>Blocked: {task.blockedReason}</Text> : null}
      {task.error ? <Text style={styles.errorReason} numberOfLines={2}>Error: {task.error}</Text> : null}
    </Pressable>
  );
}

function TaskDetailModal({ visible, task, onClose, onAction, ownerEmail }: {
  visible: boolean;
  task: IVXCTOTaskRecord | null;
  onClose: () => void;
  onAction: (action: IVXCTOControlAction, taskId: string, opts?: { approverEmail?: string; reason?: string }) => Promise<void>;
  ownerEmail: string;
}) {
  const [pending, setPending] = useState<IVXCTOControlAction | null>(null);

  const run = useCallback(async (action: IVXCTOControlAction) => {
    if (!task) return;
    setPending(action);
    try {
      await onAction(action, task.id, action === 'approve' ? { approverEmail: ownerEmail } : undefined);
    } finally {
      setPending(null);
    }
  }, [task, onAction, ownerEmail]);

  if (!task) return null;
  const canRetry = task.status === 'failed' || task.status === 'cancelled';
  const canCancel = task.status === 'running' || task.status === 'pending' || task.status === 'paused' || task.status === 'blocked';
  const canPause = task.status === 'running' || task.status === 'pending';
  const canResume = task.status === 'paused';
  const canApprove = task.approvalRequired && !task.approvedBy && task.risk !== 'high';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Task control</Text>
          <Pressable onPress={onClose} testID="cto-close-detail" hitSlop={12}>
            <X size={22} color={Colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalGoal}>{task.goal}</Text>
          <View style={styles.badgeRow}>
            <Badge label={task.status} color={statusColor(task.status)} />
            <Badge label={`risk: ${task.risk}`} color={riskColor(task.risk)} />
            <Badge label={task.assignedAgent} color={Colors.info} />
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Task ID</Text>
            <Text style={styles.detailMono}>{task.id}</Text>
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Created · Updated</Text>
            <Text style={styles.detailText}>{new Date(task.createdAt).toLocaleString()} · {new Date(task.updatedAt).toLocaleString()}</Text>
          </View>
          {task.approvalRequired ? (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Approval</Text>
              <Text style={styles.detailText}>{task.approvedBy ? `Approved by ${task.approvedBy}` : 'Owner approval required'}</Text>
            </View>
          ) : null}
          {task.blockedReason ? (
            <View style={[styles.detailBlock, styles.warningBlock]}>
              <ShieldAlert size={14} color={Colors.warning} />
              <Text style={styles.warningText}>{task.blockedReason}</Text>
            </View>
          ) : null}
          {task.error ? (
            <View style={[styles.detailBlock, styles.errorBlock]}>
              <AlertTriangle size={14} color={Colors.error} />
              <Text style={styles.errorText}>{task.error}</Text>
            </View>
          ) : null}
          <Text style={styles.sectionTitle}>Execution timeline</Text>
          {task.steps.length === 0 ? (
            <Text style={styles.mutedText}>No steps recorded.</Text>
          ) : task.steps.map((step, idx) => (
            <View key={`${task.id}-step-${idx}`} style={styles.timelineRow}>
              <View style={[styles.timelineDot, { backgroundColor: statusColor(step.status) }]} />
              <View style={styles.timelineCopy}>
                <Text style={styles.timelineAction}>{step.action} · {step.agentId}</Text>
                <Text style={styles.timelineDetail} numberOfLines={3}>{step.detail}</Text>
                <Text style={styles.timelineAt}>{new Date(step.at).toLocaleString()}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.sectionTitle}>Handoffs</Text>
          {task.handoffs.length === 0 ? (
            <Text style={styles.mutedText}>No handoffs recorded.</Text>
          ) : task.handoffs.map((h) => (
            <Text key={h.id} style={styles.timelineDetail}>· {h.fromAgent} → {h.toAgent} ({h.reason}) {timeAgo(h.at)}</Text>
          ))}
          <Text style={styles.sectionTitle}>Owner controls</Text>
          <View style={styles.actionRow}>
            <ActionButton icon={<RotateCcw size={14} color={Colors.black} />} label="Retry" tone="primary" disabled={!canRetry || pending !== null} loading={pending === 'retry'} onPress={() => void run('retry')} />
            <ActionButton icon={<Pause size={14} color={Colors.black} />} label="Pause" tone="warning" disabled={!canPause || pending !== null} loading={pending === 'pause'} onPress={() => void run('pause')} />
            <ActionButton icon={<Play size={14} color={Colors.black} />} label="Resume" tone="primary" disabled={!canResume || pending !== null} loading={pending === 'resume'} onPress={() => void run('resume')} />
            <ActionButton icon={<XCircle size={14} color={Colors.white} />} label="Cancel" tone="danger" disabled={!canCancel || pending !== null} loading={pending === 'cancel'} onPress={() => void run('cancel')} />
            <ActionButton icon={<ShieldCheck size={14} color={Colors.black} />} label="Approve (low/medium)" tone="primary" disabled={!canApprove || pending !== null} loading={pending === 'approve'} onPress={() => void run('approve')} />
          </View>
          {task.risk === 'high' ? (
            <Text style={styles.highRiskNote}>High-risk tasks cannot be approved here. They remain blocked automatically.</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ActionButton({ icon, label, onPress, tone, disabled, loading }: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  tone: 'primary' | 'danger' | 'warning';
  disabled?: boolean;
  loading?: boolean;
}) {
  const bg = tone === 'danger' ? Colors.error : tone === 'warning' ? Colors.warning : Colors.primary;
  const fg = tone === 'danger' ? Colors.white : Colors.black;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionButton, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }]}
      testID={`cto-action-${label}`}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon}
      <Text style={[styles.actionLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export default function IVXCTODashboardRoute() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [agentFilter, setAgentFilter] = useState<'all' | IVXAgentId>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | IVXAgentExecutionStatus>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | IVXAgentRiskLevel>('all');
  const [auditQuery, setAuditQuery] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<IVXCTOTaskRecord | null>(null);
  const [memoryAgent, setMemoryAgent] = useState<IVXAgentId | null>(null);

  const ownerEmail = useMemo(() => {
    const fromEnv = (process.env.EXPO_PUBLIC_OWNER_EMAIL ?? '').trim();
    return fromEnv || 'owner@ivxholding.com';
  }, []);

  const overviewQuery = useQuery<IVXCTODashboardOverview, Error>({
    queryKey: [...QUERY_KEY, agentFilter, statusFilter, riskFilter] as const,
    queryFn: () => getIVXCTODashboardOverview({
      agentId: agentFilter === 'all' ? undefined : agentFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
      risk: riskFilter === 'all' ? undefined : riskFilter,
      limit: 60,
    }),
    refetchInterval: 30_000,
  });

  const auditQueryResult = useQuery<{ ok: boolean; audit: IVXCTOAuditEntry[]; total: number; marker: string }, Error>({
    queryKey: [...AUDIT_QUERY_KEY, auditQuery, agentFilter] as const,
    queryFn: () => searchIVXCTOAuditLog({
      agentId: agentFilter === 'all' ? undefined : agentFilter,
      q: auditQuery || undefined,
      limit: 80,
    }),
    refetchInterval: 60_000,
  });

  const controlMutation = useMutation({
    mutationFn: async (input: { action: IVXCTOControlAction; taskId: string; approverEmail?: string; reason?: string }) => {
      return performIVXCTOControlAction(input);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEY });
      setSelectedTask(result.task);
    },
    onError: (error: Error) => {
      Alert.alert('Owner control failed', error.message);
    },
  });

  const handleControlAction = useCallback(async (action: IVXCTOControlAction, taskId: string, opts?: { approverEmail?: string; reason?: string }) => {
    await controlMutation.mutateAsync({ action, taskId, ...opts });
  }, [controlMutation]);

  const overview = overviewQuery.data ?? null;
  const tasks = overview?.tasks ?? [];
  const blockedTasks = overview?.blockedTasks ?? [];
  const parents = overview?.parents ?? [];
  const handoffs = overview?.handoffs ?? [];
  const deployProposals = overview?.deployProposals ?? [];
  const retryEvents = overview?.retryEvents ?? [];
  const audit = auditQueryResult.data?.audit ?? [];

  const memoryNamespaces = useMemo(() => overview?.activeAgents.map((a) => ({ id: a.id, namespace: a.memoryNamespace, name: a.name })) ?? [], [overview?.activeAgents]);
  const filteredAuditByAgent = useMemo(() => {
    if (!memoryAgent) return audit;
    return audit.filter((row) => row.agentId === memoryAgent);
  }, [audit, memoryAgent]);

  return (
    <ErrorBoundary fallbackTitle="CTO Dashboard unavailable">
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(120, insets.bottom + 96) }]}
        refreshControl={<RefreshControl tintColor={Colors.primary} refreshing={overviewQuery.isFetching} onRefresh={() => { void overviewQuery.refetch(); void auditQueryResult.refetch(); }} />}
        testID="cto-dashboard-screen"
      >
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <LockKeyhole size={13} color={Colors.black} />
            <Text style={styles.heroBadgeText}>owner-only</Text>
          </View>
          <Text style={styles.heroTitle}>CTO Operational Dashboard</Text>
          <Text style={styles.heroSubtitle}>Live IVX IA orchestration: parent/child tasks, agent health, audit trail, memory writes, retries, and safe owner controls.</Text>
          {overview ? (
            <View style={styles.metricsGrid}>
              <MetricTile icon={<Layers size={14} color={Colors.info} />} label="Total tasks" value={overview.summary.totalTasks} tone="info" />
              <MetricTile icon={<Activity size={14} color={Colors.success} />} label="Active agents" value={overview.summary.activeAgentsCount} tone="good" />
              <MetricTile icon={<Sparkles size={14} color={Colors.info} />} label="Parent tasks" value={overview.summary.parentTaskCount} tone="info" />
              <MetricTile icon={<ShieldAlert size={14} color={Colors.warning} />} label="Blocked" value={overview.summary.blockedTasksCount} tone="warn" />
              <MetricTile icon={<RotateCcw size={14} color={Colors.warning} />} label="Retries" value={overview.summary.retryEventsCount} tone="warn" />
              <MetricTile icon={<Network size={14} color={Colors.info} />} label="Handoffs" value={overview.summary.handoffsCount} tone="info" />
            </View>
          ) : null}
          {overviewQuery.error ? (
            <Text style={styles.errorText}>{overviewQuery.error.message}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Filter size={16} color={Colors.primary} />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Filters</Text>
              <Text style={styles.cardSubtitle}>Agent · status · risk · time range</Text>
            </View>
            <Pressable onPress={() => { void overviewQuery.refetch(); }} style={styles.refreshButton} testID="cto-refresh">
              <RefreshCw size={12} color={Colors.black} />
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </Pressable>
          </View>
          <Text style={styles.subLabel}>Agent</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {AGENT_FILTER_OPTIONS.map((opt) => (
              <FilterPill key={opt.id} label={opt.label} active={agentFilter === opt.id} onPress={() => setAgentFilter(opt.id)} />
            ))}
          </ScrollView>
          <Text style={styles.subLabel}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <FilterPill key={opt.id} label={opt.label} active={statusFilter === opt.id} onPress={() => setStatusFilter(opt.id)} />
            ))}
          </ScrollView>
          <Text style={styles.subLabel}>Risk</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {RISK_FILTER_OPTIONS.map((opt) => (
              <FilterPill key={opt.id} label={opt.label} active={riskFilter === opt.id} onPress={() => setRiskFilter(opt.id)} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Activity size={16} color={Colors.success} />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Agent health</Text>
              <Text style={styles.cardSubtitle}>Active task counts per specialist agent.</Text>
            </View>
          </View>
          <View style={styles.agentGrid}>
            {(overview?.activeAgents ?? []).map((agent) => (
              <View key={agent.id} style={styles.agentTile} testID={`cto-agent-${agent.id}`}>
                <View style={[styles.agentDot, { backgroundColor: agent.activeTaskCount > 0 ? Colors.success : Colors.textTertiary }]} />
                <Text style={styles.agentName}>{agent.name}</Text>
                <Text style={styles.agentMeta}>active: {agent.activeTaskCount} · risk≤{agent.riskLimit}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Layers size={16} color={Colors.info} />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Tasks ({tasks.length})</Text>
              <Text style={styles.cardSubtitle}>Tap a task to inspect, retry, cancel, pause, or approve (low/medium risk).</Text>
            </View>
          </View>
          {overviewQuery.isLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : tasks.length === 0 ? (
            <Text style={styles.mutedText}>No tasks match the current filters.</Text>
          ) : tasks.map((task) => (
            <TaskCard key={task.id} task={task} onPress={() => setSelectedTask(task)} />
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <ShieldAlert size={16} color={Colors.warning} />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Blocked tasks ({blockedTasks.length})</Text>
              <Text style={styles.cardSubtitle}>Risk gates and high-risk blocks.</Text>
            </View>
          </View>
          {blockedTasks.length === 0 ? (
            <Text style={styles.mutedText}>No blocked tasks.</Text>
          ) : blockedTasks.map((task) => (
            <TaskCard key={task.id} task={task} onPress={() => setSelectedTask(task)} />
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Network size={16} color={Colors.info} />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Parent tasks ({parents.length})</Text>
              <Text style={styles.cardSubtitle}>Parallel parent/child trees with aggregation summaries.</Text>
            </View>
          </View>
          {parents.length === 0 ? (
            <Text style={styles.mutedText}>No parent tasks recorded.</Text>
          ) : parents.map((p) => (
            <View key={p.id} style={styles.parentCard} testID={`cto-parent-${p.id}`}>
              <View style={styles.taskHeader}>
                <View style={styles.taskTitleBlock}>
                  <Text style={styles.taskGoal} numberOfLines={2}>{p.goal}</Text>
                  <Text style={styles.taskMeta}>{shortId(p.id)} · {p.children} children · {timeAgo(p.createdAt)}</Text>
                </View>
                <Badge label={p.status} color={statusColor(p.status)} />
              </View>
              {p.aggregation ? (
                <Text style={styles.aggregationText}>{p.aggregation.summary}</Text>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Sparkles size={16} color={Colors.primary} />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Deployment proposals ({deployProposals.length})</Text>
              <Text style={styles.cardSubtitle}>Low/medium-risk approvals waiting for owner. High-risk is blocked automatically.</Text>
            </View>
          </View>
          {deployProposals.length === 0 ? (
            <Text style={styles.mutedText}>No deployment proposals.</Text>
          ) : deployProposals.map((proposal) => (
            <Pressable
              key={proposal.taskId}
              style={styles.proposalRow}
              onPress={() => {
                const t = tasks.find((task) => task.id === proposal.taskId) ?? blockedTasks.find((task) => task.id === proposal.taskId);
                if (t) setSelectedTask(t);
              }}
              testID={`cto-proposal-${proposal.taskId}`}
            >
              <View style={styles.taskTitleBlock}>
                <Text style={styles.taskGoal} numberOfLines={2}>{proposal.goal}</Text>
                <Text style={styles.taskMeta}>{proposal.agentId} · {shortId(proposal.taskId)}</Text>
              </View>
              <Badge label={`risk: ${proposal.risk}`} color={riskColor(proposal.risk)} />
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Timer size={16} color={Colors.warning} />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Retry & timeout signals ({retryEvents.length})</Text>
              <Text style={styles.cardSubtitle}>Captured from parent/child execution audit.</Text>
            </View>
          </View>
          {retryEvents.length === 0 ? (
            <Text style={styles.mutedText}>No retries observed.</Text>
          ) : retryEvents.slice(0, 12).map((e) => (
            <View key={e.id} style={styles.auditRow}>
              <CircleDashed size={12} color={Colors.warning} />
              <View style={styles.auditCopy}>
                <Text style={styles.auditAction}>{e.action}</Text>
                <Text style={styles.auditDetail} numberOfLines={2}>{e.detail}</Text>
                <Text style={styles.auditAt}>{timeAgo(e.at)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Network size={16} color={Colors.info} />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Recent handoffs ({handoffs.length})</Text>
              <Text style={styles.cardSubtitle}>Agent → agent routing.</Text>
            </View>
          </View>
          {handoffs.length === 0 ? (
            <Text style={styles.mutedText}>No handoffs.</Text>
          ) : handoffs.slice(0, 14).map((h) => (
            <Text key={h.id} style={styles.handoffRow}>· {h.fromAgent} → {h.toAgent}  ({h.reason}) {timeAgo(h.at)}</Text>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Search size={16} color={Colors.primary} />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Audit log search</Text>
              <Text style={styles.cardSubtitle}>Search by action, detail, or task id.</Text>
            </View>
          </View>
          <View style={styles.searchRow}>
            <TextInput
              value={auditQuery}
              onChangeText={setAuditQuery}
              placeholder="e.g. retry, blocked, parent.aggregated"
              placeholderTextColor={Colors.textTertiary}
              style={styles.searchInput}
              autoCapitalize="none"
              testID="cto-audit-search"
            />
          </View>
          {auditQueryResult.isLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : audit.length === 0 ? (
            <Text style={styles.mutedText}>No audit entries.</Text>
          ) : audit.slice(0, 30).map((row) => (
            <View key={row.id} style={styles.auditRow}>
              <CheckCircle2 size={12} color={Colors.info} />
              <View style={styles.auditCopy}>
                <Text style={styles.auditAction}>{row.action} · {row.agentId}</Text>
                <Text style={styles.auditDetail} numberOfLines={2}>{row.detail}</Text>
                <Text style={styles.auditAt}>{row.taskId ? `${shortId(row.taskId)} · ` : ''}{timeAgo(row.at)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Layers size={16} color={Colors.info} />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Memory namespaces</Text>
              <Text style={styles.cardSubtitle}>Pick an agent to filter audit signals to its namespace.</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <FilterPill label="all" active={memoryAgent === null} onPress={() => setMemoryAgent(null)} />
            {memoryNamespaces.map((m) => (
              <FilterPill key={m.id} label={m.namespace} active={memoryAgent === m.id} onPress={() => setMemoryAgent(m.id)} />
            ))}
          </ScrollView>
          {filteredAuditByAgent.length === 0 ? (
            <Text style={styles.mutedText}>No memory writes recorded.</Text>
          ) : filteredAuditByAgent
            .filter((row) => row.action === 'memory.write' || (row.metadata && typeof row.metadata === 'object' && 'namespace' in row.metadata))
            .slice(0, 16)
            .map((row) => (
              <View key={`${row.id}-mem`} style={styles.auditRow}>
                <CheckCircle2 size={12} color={Colors.success} />
                <View style={styles.auditCopy}>
                  <Text style={styles.auditAction}>{row.action} · {row.agentId}</Text>
                  <Text style={styles.auditDetail} numberOfLines={2}>{row.detail}</Text>
                </View>
              </View>
            ))}
        </View>
      </ScrollView>

      <TaskDetailModal
        visible={selectedTask !== null}
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onAction={handleControlAction}
        ownerEmail={ownerEmail}
      />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 14,
    gap: 12,
  },
  heroCard: {
    padding: 18,
    borderRadius: 28,
    backgroundColor: '#071019',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.28)',
    gap: 12,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900' as const,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600' as const,
  },
  metricsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  metricTile: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 96,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  metricIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  metricValue: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900' as const,
  },
  metricLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  card: {
    padding: 14,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '900' as const,
  },
  cardSubtitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
  refreshButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  refreshButtonText: {
    color: Colors.black,
    fontSize: 11,
    fontWeight: '900' as const,
  },
  subLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '900' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterRow: {
    flexDirection: 'row' as const,
    gap: 7,
    paddingVertical: 4,
  },
  filterPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterPillText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '800' as const,
  },
  filterPillTextActive: {
    color: Colors.black,
  },
  agentGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  agentTile: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 130,
    padding: 11,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  agentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  agentName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '900' as const,
  },
  agentMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  taskCard: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  taskHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
  },
  taskTitleBlock: {
    flex: 1,
    gap: 3,
  },
  taskGoal: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800' as const,
  },
  taskMeta: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  badgeRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  blockedReason: {
    color: Colors.warning,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  errorReason: {
    color: Colors.error,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  parentCard: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  aggregationText: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700' as const,
  },
  proposalRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  auditRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    paddingVertical: 5,
  },
  auditCopy: {
    flex: 1,
    gap: 2,
  },
  auditAction: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  auditDetail: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  auditAt: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '700' as const,
  },
  handoffRow: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  searchRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mutedText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '900' as const,
  },
  modalContent: {
    padding: 16,
    gap: 14,
  },
  modalGoal: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800' as const,
  },
  detailBlock: {
    padding: 11,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 5,
  },
  detailLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '900' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  detailMono: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  warningBlock: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  warningText: {
    flex: 1,
    color: Colors.warning,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  errorBlock: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '900' as const,
    marginTop: 4,
  },
  timelineRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    paddingVertical: 5,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  timelineCopy: {
    flex: 1,
    gap: 2,
  },
  timelineAction: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  timelineDetail: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  timelineAt: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '700' as const,
  },
  actionRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '900' as const,
  },
  highRiskNote: {
    color: Colors.error,
    fontSize: 11,
    fontWeight: '800' as const,
    marginTop: 6,
  },
});
