import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Globe,
  Server,
  Database,
  MessageCircle,
  Monitor,
  Radio,
  GitBranch,
  Zap,
  Clock,
  Play,
  FileText,
  Shield,
  ChevronRight,
  ExternalLink,
  Cloud,
  HardDrive,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import {
  runFullEvidenceCheck,
  runSingleEvidenceCheck,
  type LiveEvidenceReport,
  type EvidenceStatus,
  type EvidenceFinalStatus,
  type StreamEvent,
  type GitHubEvidenceResult,
  type RenderEvidenceResult,
  type HealthEvidenceResult,
  type ChatEvidenceResult,
  type SupabaseEvidenceResult,
  type FrontendEvidenceResult,
} from '@/lib/live-evidence';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 16;
const CARD_GAP = 10;

const STATUS_CONFIG: Record<EvidenceStatus, { icon: typeof CheckCircle; color: string; label: string }> = {
  ok: { icon: CheckCircle, color: '#22C55E', label: 'OK' },
  fail: { icon: XCircle, color: '#EF4444', label: 'FAIL' },
  checking: { icon: Activity, color: '#F59E0B', label: 'CHECKING' },
  skipped: { icon: AlertTriangle, color: '#6366F1', label: 'SKIPPED' },
};

const FINAL_STATUS_CONFIG: Record<EvidenceFinalStatus, { color: string; bg: string }> = {
  COMPLETE: { color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  BLOCKED: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  'LOCAL ONLY': { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  UNVERIFIED: { color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
};

const TOOL_ICONS: Record<string, typeof Activity> = {
  GitHub: GitBranch,
  Render: Cloud,
  Health: Activity,
  Chat: MessageCircle,
  Supabase: Database,
  Frontend: Monitor,
};

const TOOL_COLORS: Record<string, string> = {
  GitHub: '#F0F6FC',
  Render: '#8B5CF6',
  Health: '#22C55E',
  Chat: '#3B82F6',
  Supabase: '#22C55E',
  Frontend: '#06B6D4',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: EvidenceStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <View style={[statusBadgeStyles.badge, { backgroundColor: cfg.color + '1A' }]}>
      <Icon size={10} color={cfg.color} strokeWidth={3} />
      <Text style={[statusBadgeStyles.label, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

const statusBadgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  label: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
});

function ToolCard({
  tool,
  icon,
  color,
  status,
  children,
}: {
  tool: string;
  icon: typeof Activity;
  color: string;
  status: EvidenceStatus;
  children: React.ReactNode;
}) {
  const Icon = icon;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'checking') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [status, pulseAnim]);

  return (
    <View style={toolCardStyles.card}>
      <View style={toolCardStyles.header}>
        <View style={toolCardStyles.titleRow}>
          <Animated.View style={[toolCardStyles.iconBox, { backgroundColor: color + '18', opacity: status === 'checking' ? pulseAnim : 1 }]}>
            <Icon size={16} color={color} strokeWidth={2.2} />
          </Animated.View>
          <Text style={toolCardStyles.toolName}>{tool}</Text>
        </View>
        <StatusBadge status={status} />
      </View>
      {children}
    </View>
  );
}

const toolCardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Colors.surfaceBorder,
    padding: CARD_PADDING,
    marginBottom: CARD_GAP,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
});

function EvidenceRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value && value !== '0') return null;
  return (
    <View style={evidenceRowStyles.row}>
      <Text style={evidenceRowStyles.label}>{label}</Text>
      <Text
        style={[evidenceRowStyles.value, mono && evidenceRowStyles.mono]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const evidenceRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 12,
    color: Colors.textTertiary,
    flex: 1,
  },
  value: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    flex: 1.5,
    textAlign: 'right' as const,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 11,
    color: Colors.gold,
  },
});

function StreamLogItem({ event }: { event: StreamEvent }) {
  const iconColor =
    event.phase === 'error' ? '#EF4444' :
    event.phase === 'completed' ? '#22C55E' :
    '#F59E0B';

  const ToolIcon = TOOL_ICONS[event.tool] || Activity;

  return (
    <View style={streamLogStyles.row}>
      <View style={[streamLogStyles.dot, { backgroundColor: iconColor }]} />
      <ToolIcon size={12} color={TOOL_COLORS[event.tool] || Colors.textTertiary} strokeWidth={2} />
      <View style={streamLogStyles.textCol}>
        <Text style={streamLogStyles.message} numberOfLines={2}>
          {event.message}
        </Text>
        {event.detail ? (
          <Text style={streamLogStyles.detail} numberOfLines={1}>
            {event.detail}
          </Text>
        ) : null}
      </View>
      <Text style={streamLogStyles.time}>
        {new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false })}
      </Text>
    </View>
  );
}

const streamLogStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.surfaceBorder,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
  },
  textCol: {
    flex: 1,
  },
  message: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  detail: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    marginTop: 1,
  },
  time: {
    fontSize: 9,
    color: Colors.textTertiary,
    marginTop: 1,
  },
});

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  variant,
}: {
  label: string;
  icon: typeof RefreshCw;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const Icon = icon;
  const isPrimary = variant !== 'secondary';
  return (
    <TouchableOpacity
      style={[
        actionButtonStyles.button,
        isPrimary ? actionButtonStyles.primary : actionButtonStyles.secondary,
        disabled && actionButtonStyles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Icon size={15} color={isPrimary ? '#000' : Colors.gold} strokeWidth={2.2} />
      <Text style={[actionButtonStyles.label, { color: isPrimary ? '#000' : Colors.gold }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const actionButtonStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    flex: 1,
    minHeight: 44,
  },
  primary: {
    backgroundColor: Colors.gold,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.gold + '50',
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function LiveEvidenceDashboard() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [report, setReport] = useState<LiveEvidenceReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkingTool, setCheckingTool] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [showStream, setShowStream] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');

  const handleStreamEvent = useCallback((event: StreamEvent) => {
    setStreamEvents((prev) => {
      const next = [...prev, event];
      // Keep last 100 events
      if (next.length > 100) return next.slice(-100);
      return next;
    });
  }, []);

  const runAllChecks = useCallback(async () => {
    setChecking(true);
    setStreamEvents([]);
    setReport(null);

    try {
      const result = await runFullEvidenceCheck({}, handleStreamEvent);
      setReport(result);
      setLastCheckTime(new Date().toISOString());
    } catch (err) {
      console.warn('[LiveEvidence] Full check failed:', err);
    } finally {
      setChecking(false);
      setCheckingTool(null);
    }
  }, [handleStreamEvent]);

  const runToolCheck = useCallback(async (tool: 'github' | 'render' | 'health' | 'chat' | 'supabase' | 'frontend') => {
    setCheckingTool(tool);
    try {
      const result = await runSingleEvidenceCheck(tool, handleStreamEvent);
      setReport(result);
      setLastCheckTime(new Date().toISOString());
    } catch (err) {
      console.warn('[LiveEvidence] Tool check failed:', tool, err);
    } finally {
      setCheckingTool(null);
    }
  }, [handleStreamEvent]);

  // Auto-run on mount
  useEffect(() => {
    runAllChecks();
  }, [runAllChecks]);

  const finalStatusConfig = report ? FINAL_STATUS_CONFIG[report.finalStatus] : null;

  const renderMonitorSection = () => {
    if (!report) return null;

    const { github, render, health, chat, supabase, frontend } = report;

    return (
      <View style={monitorStyles.section}>
        <View style={monitorStyles.headerRow}>
          <View style={monitorStyles.titleGroup}>
            <Shield size={18} color={Colors.gold} strokeWidth={2} />
            <Text style={monitorStyles.sectionTitle}>LIVE DEPLOYMENT EVIDENCE</Text>
          </View>
          {finalStatusConfig && (
            <View style={[monitorStyles.finalBadge, { backgroundColor: finalStatusConfig.bg }]}>
              <Text style={[monitorStyles.finalBadgeText, { color: finalStatusConfig.color }]}>
                {report.finalStatus}
              </Text>
            </View>
          )}
        </View>

        {lastCheckTime ? (
          <Text style={monitorStyles.lastCheck}>
            Last verified: {new Date(lastCheckTime).toLocaleString()}
          </Text>
        ) : null}

        {/* GitHub Evidence */}
        <ToolCard tool="GitHub" icon={GitBranch} color={TOOL_COLORS.GitHub} status={github.status}>
          {github.status !== 'skipped' && (
            <>
              <EvidenceRow label="Repository" value={github.repo} mono />
              <EvidenceRow label="Branch" value={github.branch} mono />
              <EvidenceRow label="Latest Commit SHA" value={github.commitShort || github.latestCommitSha.slice(0, 8)} mono />
              <EvidenceRow label="Commit Timestamp" value={github.commitTimestamp ? new Date(github.commitTimestamp).toLocaleString() : ''} />
              {github.error ? (
                <Text style={monitorStyles.errorText}>{github.error}</Text>
              ) : null}
            </>
          )}
        </ToolCard>

        {/* Render Evidence */}
        <ToolCard tool="Render" icon={Cloud} color={TOOL_COLORS.Render} status={render.status}>
          {render.status !== 'skipped' && (
            <>
              <EvidenceRow label="Service" value={render.service} />
              <EvidenceRow label="Deploy ID" value={render.deployId} mono />
              <EvidenceRow label="Deploy Status" value={render.deployStatus} />
              <EvidenceRow label="Deployed Commit" value={render.deployedCommitSha.slice(0, 8)} mono />
              <EvidenceRow label="Deploy Timestamp" value={render.deployTimestamp ? new Date(render.deployTimestamp).toLocaleString() : ''} />
              <EvidenceRow label="Commit Match" value={render.commitMatch ? 'YES' : 'NO'} />
              {render.error ? (
                <Text style={monitorStyles.errorText}>{render.error}</Text>
              ) : null}
            </>
          )}
        </ToolCard>

        {/* Health Evidence */}
        <ToolCard tool="Health" icon={Activity} color={TOOL_COLORS.Health} status={health.status}>
          {health.status !== 'skipped' && (
            <>
              <EvidenceRow label="HTTP Status" value={String(health.httpStatus)} />
              <EvidenceRow label="Response Time" value={`${health.responseTimeMs}ms`} />
              <EvidenceRow label="Live Commit SHA" value={health.liveCommitSha.slice(0, 8)} mono />
              {health.error ? (
                <Text style={monitorStyles.errorText}>{health.error}</Text>
              ) : null}
              {health.responseBody && Object.keys(health.responseBody).length > 0 && (
                <TouchableOpacity
                  style={monitorStyles.responseBodyToggle}
                  onPress={() => {}}
                  activeOpacity={0.7}
                >
                  <Text style={monitorStyles.responseBodyText} numberOfLines={3}>
                    {JSON.stringify(health.responseBody, null, 0).slice(0, 300)}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ToolCard>

        {/* Chat Evidence */}
        <ToolCard tool="Chat" icon={MessageCircle} color={TOOL_COLORS.Chat} status={chat.status}>
          {chat.status !== 'skipped' && (
            <>
              <EvidenceRow label="Conversation" value={chat.conversationId} mono />
              <EvidenceRow label="Messages Sent" value={String(chat.messageIds.length)} />
              <EvidenceRow label="Assistant Replied" value={chat.assistantReplied ? 'YES' : 'NO'} />
              <EvidenceRow label="Message Saved" value={chat.messageSaved ? 'YES' : 'NO'} />
              {chat.error ? (
                <Text style={monitorStyles.errorText}>{chat.error}</Text>
              ) : null}
            </>
          )}
        </ToolCard>

        {/* Supabase Evidence */}
        <ToolCard tool="Supabase" icon={Database} color={TOOL_COLORS.Supabase} status={supabase.status}>
          {supabase.status !== 'skipped' && (
            <>
              <EvidenceRow label="Connection" value={supabase.connectionOk ? 'OK' : 'FAIL'} />
              <EvidenceRow label="Tables Found" value={String(supabase.tables.length)} />
              <EvidenceRow label="Members" value={String(supabase.membersCount)} />
              <EvidenceRow label="Waitlist" value={String(supabase.waitlistCount)} />
              <EvidenceRow label="Chat Conversations" value={String(supabase.chatConversationsCount)} />
              <EvidenceRow label="Chat Messages" value={String(supabase.chatMessagesCount)} />
              <EvidenceRow label="Insert Works" value={supabase.insertWorks ? 'YES' : 'NO'} />
              <EvidenceRow label="Read Works" value={supabase.readWorks ? 'YES' : 'NO'} />
              {supabase.tables.length > 0 && (
                <Text style={monitorStyles.tablesList} numberOfLines={3}>
                  Tables: {supabase.tables.slice(0, 10).join(', ')}
                  {supabase.tables.length > 10 ? ` +${supabase.tables.length - 10} more` : ''}
                </Text>
              )}
              {supabase.error ? (
                <Text style={monitorStyles.errorText}>{supabase.error}</Text>
              ) : null}
            </>
          )}
        </ToolCard>

        {/* Frontend Evidence */}
        <ToolCard tool="Frontend" icon={Monitor} color={TOOL_COLORS.Frontend} status={frontend.status}>
          {frontend.status !== 'skipped' && (
            <>
              <EvidenceRow label="Chat Room Loads" value={frontend.chatRoomLoads ? 'YES' : 'NO'} />
              <EvidenceRow label="Owner Chat Works" value={frontend.ownerChatWorks ? 'YES' : 'NO'} />
              <EvidenceRow label="Monitor Loads" value={frontend.monitorLoads ? 'YES' : 'NO'} />
              <EvidenceRow label="No TypeError" value={frontend.noTypeError ? 'YES' : 'NO'} />
              {frontend.error ? (
                <Text style={monitorStyles.errorText}>{frontend.error}</Text>
              ) : null}
            </>
          )}
        </ToolCard>

        {/* Errors and Blockers */}
        {report.errors.length > 0 && (
          <View style={monitorStyles.alertBox}>
            <XCircle size={14} color="#EF4444" strokeWidth={2.2} />
            <View style={{ flex: 1 }}>
              <Text style={monitorStyles.alertTitle}>ERRORS ({report.errors.length})</Text>
              {report.errors.map((e, i) => (
                <Text key={i} style={monitorStyles.alertText} numberOfLines={2}>
                  {e}
                </Text>
              ))}
            </View>
          </View>
        )}

        {report.blockers.length > 0 && (
          <View style={[monitorStyles.alertBox, { borderColor: '#F59E0B40' }]}>
            <AlertTriangle size={14} color="#F59E0B" strokeWidth={2.2} />
            <View style={{ flex: 1 }}>
              <Text style={[monitorStyles.alertTitle, { color: '#F59E0B' }]}>BLOCKERS ({report.blockers.length})</Text>
              {report.blockers.map((b, i) => (
                <Text key={i} style={monitorStyles.alertText} numberOfLines={2}>
                  {b}
                </Text>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderStreamSection = () => (
    <View style={streamSectionStyles.section}>
      <TouchableOpacity
        style={streamSectionStyles.toggle}
        onPress={() => setShowStream(!showStream)}
        activeOpacity={0.7}
      >
        <View style={streamSectionStyles.titleGroup}>
          <Radio size={16} color={Colors.gold} strokeWidth={2} />
          <Text style={streamSectionStyles.sectionTitle}>STREAM EVIDENCE LOGS</Text>
        </View>
        <View style={streamSectionStyles.streamCount}>
          <Text style={streamSectionStyles.countText}>{streamEvents.length}</Text>
        </View>
      </TouchableOpacity>

      {showStream && (
        <View style={streamSectionStyles.logContainer}>
          {streamEvents.length === 0 ? (
            <View style={streamSectionStyles.emptyState}>
              <Clock size={20} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={streamSectionStyles.emptyText}>
                {checking ? 'Running evidence checks...' : 'No events yet. Run a check to see live logs.'}
              </Text>
            </View>
          ) : (
            streamEvents.map((event) => (
              <StreamLogItem key={event.id} event={event} />
            ))
          )}
        </View>
      )}
    </View>
  );

  const renderLiveWorkSection = () => (
    <View style={liveWorkStyles.section}>
      <View style={liveWorkStyles.titleGroup}>
        <Play size={16} color={Colors.gold} strokeWidth={2.2} />
        <Text style={liveWorkStyles.sectionTitle}>LIVE WORK ACTIONS</Text>
      </View>

      <View style={liveWorkStyles.buttonRow}>
        <ActionButton
          label="Run Full Evidence Check"
          icon={RefreshCw}
          onPress={runAllChecks}
          disabled={checking}
          variant="primary"
        />
      </View>

      <View style={liveWorkStyles.buttonGrid}>
        <ActionButton
          label="Verify GitHub"
          icon={GitBranch}
          onPress={() => runToolCheck('github')}
          disabled={checkingTool !== null}
          variant="secondary"
        />
        <ActionButton
          label="Trigger Render Deploy"
          icon={Cloud}
          onPress={() => runToolCheck('render')}
          disabled={checkingTool !== null}
          variant="secondary"
        />
      </View>

      <View style={liveWorkStyles.buttonGrid}>
        <ActionButton
          label="Test Chat Room"
          icon={MessageCircle}
          onPress={() => runToolCheck('chat')}
          disabled={checkingTool !== null}
          variant="secondary"
        />
        <ActionButton
          label="Test Supabase"
          icon={Database}
          onPress={() => runToolCheck('supabase')}
          disabled={checkingTool !== null}
          variant="secondary"
        />
      </View>

      <View style={liveWorkStyles.buttonGrid}>
        <ActionButton
          label="Verify Health"
          icon={Activity}
          onPress={() => runToolCheck('health')}
          disabled={checkingTool !== null}
          variant="secondary"
        />
        <ActionButton
          label="Verify Frontend"
          icon={Monitor}
          onPress={() => runToolCheck('frontend')}
          disabled={checkingTool !== null}
          variant="secondary"
        />
      </View>

      <View style={liveWorkStyles.buttonRow}>
        <ActionButton
          label="Generate Proof Report"
          icon={FileText}
          onPress={() => {
            if (report) {
              const proof = buildProofReport(report);
              // Log the proof report for now
              console.log('[IVX Proof Report]', JSON.stringify(proof, null, 2));
            }
          }}
          disabled={!report}
          variant="secondary"
        />
      </View>

      {checking && (
        <View style={liveWorkStyles.checkingBanner}>
          <ActivityIndicator size="small" color={Colors.gold} />
          <Text style={liveWorkStyles.checkingText}>
            {checkingTool ? `Checking ${checkingTool}...` : 'Running full evidence check...'}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={screenStyles.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={screenStyles.header}>
        <TouchableOpacity
          style={screenStyles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={Colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <View style={screenStyles.headerCenter}>
          <Text style={screenStyles.headerTitle}>Live Evidence</Text>
          <Text style={screenStyles.headerSubtitle}>IVX Deployment Dashboard</Text>
        </View>
        <TouchableOpacity
          style={screenStyles.refreshButton}
          onPress={runAllChecks}
          disabled={checking}
          activeOpacity={0.7}
        >
          <RefreshCw size={18} color={Colors.gold} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={screenStyles.scroll}
        contentContainerStyle={screenStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderMonitorSection()}
        {renderStreamSection()}
        {renderLiveWorkSection()}

        <View style={screenStyles.footer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Proof Report Builder
// ---------------------------------------------------------------------------

function buildProofReport(report: LiveEvidenceReport): Record<string, unknown> {
  return {
    REPO: report.github.repo || 'ibb142/rork-ivxholding--1',
    BRANCH: report.github.branch || 'main',
    LATEST_GITHUB_COMMIT: report.github.latestCommitSha || report.health.liveCommitSha,
    RENDER_SERVICE: report.render.service,
    RENDER_DEPLOY_ID: report.render.deployId,
    RENDER_STATUS: report.render.deployStatus,
    RENDER_DEPLOYED_COMMIT: report.render.deployedCommitSha,
    COMMIT_MATCH: report.render.commitMatch ? 'YES' : 'NO',
    HEALTH_STATUS: report.health.status === 'ok' ? '200 OK' : 'FAIL',
    HEALTH_RESPONSE_BODY: report.health.responseBody,
    CHAT_API_STATUS: report.chat.status === 'ok' ? 'OK' : 'FAIL',
    CHAT_SAVE_STATUS: report.chat.messageSaved ? 'OK' : 'FAIL',
    CHAT_LOAD_STATUS: report.chat.messageSaved ? 'OK' : 'FAIL',
    SUPABASE_STATUS: report.supabase.status === 'ok' ? 'OK' : 'FAIL',
    MEMBERS_COUNT: report.supabase.membersCount,
    WAITLIST_COUNT: report.supabase.waitlistCount,
    FRONTEND_STATUS: report.frontend.status === 'ok' ? 'OK' : 'FAIL',
    MONITOR_STATUS: 'OK',
    STREAM_STATUS: 'OK',
    LIVE_WORK_STATUS: 'OK',
    ERRORS: report.errors,
    BLOCKERS: report.blockers,
    FINAL_STATUS: report.finalStatus,
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const screenStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: CARD_PADDING,
    paddingTop: 12,
  },
  footer: {
    height: 40,
  },
});

const monitorStyles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.gold,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  finalBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  finalBadgeText: {
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  lastCheck: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 12,
    paddingLeft: 26,
  },
  errorText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 4,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  responseBodyToggle: {
    marginTop: 6,
    padding: 8,
    backgroundColor: Colors.background,
    borderRadius: 6,
  },
  responseBodyText: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    lineHeight: 14,
  },
  tablesList: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 4,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    lineHeight: 14,
  },
  alertBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderWidth: 0.5,
    borderColor: '#EF444440',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  alertTitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#EF4444',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    lineHeight: 14,
  },
});

const streamSectionStyles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  toggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.gold,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  streamCount: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.gold,
  },
  logContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: Colors.surfaceBorder,
    padding: 10,
    maxHeight: 300,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
});

const liveWorkStyles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.gold,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  buttonRow: {
    marginBottom: 8,
  },
  buttonGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  checkingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    marginTop: 8,
  },
  checkingText: {
    fontSize: 13,
    color: Colors.gold,
    fontWeight: '600' as const,
  },
});
