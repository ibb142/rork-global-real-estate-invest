import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  Activity,
  Users,
  Radio,
  Eye,
  Shield,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  MessageSquare,
  Home,
  TrendingUp,
  PieChart,
  BarChart3,
  Globe,
  Lock,
  Mail,
  Cpu,
  Settings,
  Trash2,
  FileText,
  DollarSign,
  Play,
  Pause,
  User,
  Wifi,
  Brain,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  LayoutDashboard,
  MousePointer,
  FormInput,
  Send,
  Link2,
  Clock,
  Wrench,
  Radar,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import {
  controlTowerAggregator,
  executeOperatorAction,
  getActionLabel,
  isActionSafe,
  generateDecisionSummary,
  getRemediationStats,
  CT_MODULE_LABELS,
  type CTDashboardSnapshot,
  type CTModulePresence,
  type CTModuleHealth,
  type CTChatRoomSnapshot,
  type CTIncident,
  type CTModuleId,
  type CTOperatorAction,
  type CTHealthState,
  type CTPredictiveScore,
  type CTLandingFunnelSnapshot,
  type CTAutoRemediationLog,
  type CTDecisionAnalysis,
} from '@/lib/control-tower';
import { usePresenceTracker, type LivePresenceState } from '@/lib/realtime-presence';
import { TrafficIntelTab } from '@/lib/control-tower/TrafficIntelTab';
import { controlTowerAggregator as ctAgg } from '@/lib/control-tower';
import type { TrafficIntelSnapshot } from '@/lib/control-tower/traffic-types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48 - 12) / 2;

type TabId = 'nerve' | 'traffic' | 'landing' | 'predict' | 'chat' | 'incidents' | 'operator' | 'auto';

const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
  { id: 'nerve', label: 'Nerve', icon: Brain },
  { id: 'traffic', label: 'Traffic', icon: Radar },
  { id: 'landing', label: 'Funnel', icon: Globe },
  { id: 'predict', label: 'Risk', icon: Target },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'incidents', label: 'Alerts', icon: AlertTriangle },
  { id: 'operator', label: 'Ops', icon: Zap },
  { id: 'auto', label: 'Auto', icon: Wrench },
];

const MODULE_ICON_MAP: Record<string, typeof Activity> = {
  home: Home, invest: TrendingUp, market: BarChart3, portfolio: PieChart,
  chat: MessageSquare, profile: User, analytics: Activity,
  admin_dashboard: LayoutDashboard, admin_publish_deal: FileText,
  user_invest_flow: DollarSign, realtime_sync: Radio, photo_protection: Shield,
  trash_recovery: Trash2, storage_isolation: Lock, landing: Globe,
  settings: Settings, email: Mail, ai_ops: Cpu,
};

function getHealthColor(state: CTHealthState): string {
  switch (state) {
    case 'healthy': return '#00E676';
    case 'degraded': return '#FFB300';
    case 'critical': return '#FF1744';
    default: return '#555';
  }
}

function getHealthLabel(state: CTHealthState): string {
  switch (state) {
    case 'healthy': return 'HEALTHY';
    case 'degraded': return 'DEGRADED';
    case 'critical': return 'CRITICAL';
    default: return 'UNKNOWN';
  }
}

function getRiskColor(score: number): string {
  if (score >= 0.7) return '#FF1744';
  if (score >= 0.4) return '#FFB300';
  if (score >= 0.2) return '#448AFF';
  return '#00E676';
}

function getTrendIcon(trend: 'rising' | 'stable' | 'falling') {
  if (trend === 'rising') return ArrowUpRight;
  if (trend === 'falling') return ArrowDownRight;
  return Minus;
}

function getTrendColor(trend: 'rising' | 'stable' | 'falling'): string {
  if (trend === 'rising') return '#FF1744';
  if (trend === 'falling') return '#00E676';
  return '#555';
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3600_000)}h ago`;
}

function formatSeconds(s: number | null): string {
  if (s === null) return '--';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const PulsingOrb = memo(function PulsingOrb({ color, size = 8 }: { color: string; size?: number }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
      ]),
    ).start();
  }, [anim]);
  return (
    <View style={{ width: size * 3, height: size * 3, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute' as const,
          width: size * 2.5, height: size * 2.5, borderRadius: size * 1.25,
          backgroundColor: color,
          opacity: anim.interpolate({ inputRange: [0.4, 1], outputRange: [0.15, 0.05] }),
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
});

const RiskGauge = memo(function RiskGauge({ score, size = 60 }: { score: number; size?: number }) {
  const color = getRiskColor(score);
  const pct = Math.round(score * 100);
  return (
    <View style={[s.riskGauge, { width: size, height: size }]}>
      <View style={[s.riskGaugeOuter, { width: size, height: size, borderRadius: size / 2, borderColor: color + '30' }]}>
        <View style={[s.riskGaugeInner, { width: size - 8, height: size - 8, borderRadius: (size - 8) / 2, borderColor: color + '60' }]}>
          <Text style={[s.riskGaugeText, { color, fontSize: size > 50 ? 18 : 14 }]}>{pct}</Text>
        </View>
      </View>
    </View>
  );
});

const NerveCenterTab = memo(function NerveCenterTab({
  snapshot,
  presence,
}: {
  snapshot: CTDashboardSnapshot;
  presence: LivePresenceState;
}) {
  const summary = useMemo(() => generateDecisionSummary(snapshot), [snapshot]);
  const remStats = useMemo(() => getRemediationStats(), [snapshot]);
  const color = getHealthColor(snapshot.systemHealth);
  const totalOnline = Math.max(snapshot.totalActiveUsers, presence.totalOnline);

  const activeModules = useMemo(() =>
    [...snapshot.modules].filter(m => m.activeNow > 0).sort((a, b) => b.activeNow - a.activeNow).slice(0, 10),
    [snapshot.modules],
  );

  const topRisks = useMemo(() =>
    [...snapshot.predictions].filter(p => p.score > 0.15).sort((a, b) => b.score - a.score).slice(0, 6),
    [snapshot.predictions],
  );

  return (
    <>
      <View style={[s.nerveBanner, { borderColor: color + '30' }]}>
        <View style={s.nerveBannerTop}>
          <PulsingOrb color={color} size={7} />
          <Text style={[s.nerveLabel, { color }]}>{getHealthLabel(snapshot.systemHealth)}</Text>
          <View style={{ flex: 1 }} />
          <RiskGauge score={snapshot.systemRiskScore} size={48} />
        </View>
        <Text style={s.nerveAssessment}>{summary.overallAssessment}</Text>
        <View style={s.nerveStatsRow}>
          <View style={s.nerveStat}>
            <Text style={s.nerveStatVal}>{formatNum(totalOnline)}</Text>
            <Text style={s.nerveStatLbl}>ONLINE</Text>
          </View>
          <View style={s.nerveStatDiv} />
          <View style={s.nerveStat}>
            <Text style={s.nerveStatVal}>{formatNum(snapshot.totalAuthenticated)}</Text>
            <Text style={s.nerveStatLbl}>AUTH</Text>
          </View>
          <View style={s.nerveStatDiv} />
          <View style={s.nerveStat}>
            <Text style={s.nerveStatVal}>{formatNum(snapshot.totalAnonymous)}</Text>
            <Text style={s.nerveStatLbl}>ANON</Text>
          </View>
          <View style={s.nerveStatDiv} />
          <View style={s.nerveStat}>
            <Text style={[s.nerveStatVal, { color: snapshot.incidents.length > 0 ? '#FF1744' : '#00E676' }]}>
              {snapshot.incidents.length}
            </Text>
            <Text style={s.nerveStatLbl}>ALERTS</Text>
          </View>
          <View style={s.nerveStatDiv} />
          <View style={s.nerveStat}>
            <Text style={[s.nerveStatVal, { color: '#E040FB' }]}>{remStats.total}</Text>
            <Text style={s.nerveStatLbl}>HEALS</Text>
          </View>
        </View>
      </View>

      {summary.topRisks.length > 0 && (
        <View style={s.nerveSection}>
          <Text style={s.nerveSectionTitle}>Rising Risks</Text>
          {summary.topRisks.map((r, i) => (
            <View key={i} style={s.nerveRiskRow}>
              <ArrowUpRight size={12} color="#FF1744" />
              <Text style={s.nerveRiskText}>{r}</Text>
            </View>
          ))}
        </View>
      )}

      {summary.immediateActions.length > 0 && (
        <View style={s.nerveSection}>
          <Text style={s.nerveSectionTitle}>Recommended Actions</Text>
          {summary.immediateActions.map((a, i) => (
            <View key={i} style={s.nerveActionRow}>
              <Zap size={12} color="#FFB300" />
              <Text style={s.nerveActionText}>{a}</Text>
            </View>
          ))}
        </View>
      )}

      {summary.approvalNeeded.length > 0 && (
        <View style={s.nerveSection}>
          <Text style={[s.nerveSectionTitle, { color: '#FF6D00' }]}>Requires Approval</Text>
          {summary.approvalNeeded.map((a, i) => (
            <View key={i} style={s.nerveActionRow}>
              <Shield size={12} color="#FF6D00" />
              <Text style={[s.nerveActionText, { color: '#FF6D00' }]}>{a}</Text>
            </View>
          ))}
        </View>
      )}

      {activeModules.length > 0 && (
        <View style={s.nerveSection}>
          <Text style={s.nerveSectionTitle}>Live Module Occupancy</Text>
          <View style={s.nerveModGrid}>
            {activeModules.map(m => {
              const Icon = MODULE_ICON_MAP[m.moduleId] || Activity;
              const h = snapshot.health.find(x => x.moduleId === m.moduleId);
              const hc = h ? getHealthColor(h.state) : '#555';
              return (
                <View key={m.moduleId} style={s.nerveModChip}>
                  <Icon size={12} color={hc} />
                  <Text style={s.nerveModLabel} numberOfLines={1}>{CT_MODULE_LABELS[m.moduleId]}</Text>
                  <Text style={s.nerveModCount}>{m.activeNow}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {topRisks.length > 0 && (
        <View style={s.nerveSection}>
          <Text style={s.nerveSectionTitle}>Risk Scores by Module</Text>
          {topRisks.map(p => {
            const TrendIcon = getTrendIcon(p.trend);
            const tc = getTrendColor(p.trend);
            return (
              <View key={p.moduleId} style={s.nerveRiskModule}>
                <View style={s.nerveRiskModLeft}>
                  <Text style={s.nerveRiskModName}>{CT_MODULE_LABELS[p.moduleId]}</Text>
                  <View style={s.nerveRiskModTrend}>
                    <TrendIcon size={10} color={tc} />
                    <Text style={[s.nerveRiskModTrendText, { color: tc }]}>{p.trend}</Text>
                  </View>
                </View>
                <RiskGauge score={p.score} size={36} />
                {p.estimatedTimeToIncident !== null && (
                  <View style={s.nerveETI}>
                    <Clock size={9} color="#FF1744" />
                    <Text style={s.nerveETIText}>~{formatSeconds(p.estimatedTimeToIncident)}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </>
  );
});

const LandingFunnelTab = memo(function LandingFunnelTab({ funnel }: { funnel: CTLandingFunnelSnapshot }) {
  const funnelSteps = useMemo(() => [
    { label: 'Visitors', value: funnel.activeVisitors, icon: Users, color: '#448AFF' },
    { label: 'CTA Clicks', value: funnel.ctaClicks, icon: MousePointer, color: '#E040FB' },
    { label: 'Form Starts', value: funnel.formStarts, icon: FormInput, color: '#FFB300' },
    { label: 'Submissions', value: funnel.formSubmits, icon: Send, color: '#00E676' },
    { label: 'API OK', value: funnel.apiSuccesses, icon: CheckCircle, color: '#00BCD4' },
    { label: 'Handoffs', value: funnel.handoffsCompleted, icon: Link2, color: '#FF6D00' },
  ], [funnel]);

  const maxVal = Math.max(1, ...funnelSteps.map(f => f.value));

  return (
    <View style={s.funnelTab}>
      <Text style={s.sectionTitle}>Landing Page Funnel</Text>

      <View style={s.funnelOverview}>
        <View style={s.funnelOverviewStat}>
          <Text style={s.funnelOverviewVal}>{funnel.activeVisitors}</Text>
          <Text style={s.funnelOverviewLbl}>Now</Text>
        </View>
        <View style={s.funnelOverviewDiv} />
        <View style={s.funnelOverviewStat}>
          <Text style={s.funnelOverviewVal}>{funnel.visitorsLast5m}</Text>
          <Text style={s.funnelOverviewLbl}>5min</Text>
        </View>
        <View style={s.funnelOverviewDiv} />
        <View style={s.funnelOverviewStat}>
          <Text style={s.funnelOverviewVal}>{funnel.visitorsLast1h}</Text>
          <Text style={s.funnelOverviewLbl}>1hr</Text>
        </View>
        <View style={s.funnelOverviewDiv} />
        <View style={s.funnelOverviewStat}>
          <Text style={[s.funnelOverviewVal, { color: '#00E676' }]}>{funnel.ctaClickRate}%</Text>
          <Text style={s.funnelOverviewLbl}>CTR</Text>
        </View>
        <View style={s.funnelOverviewDiv} />
        <View style={s.funnelOverviewStat}>
          <Text style={[s.funnelOverviewVal, { color: funnel.apiSuccessRate < 90 ? '#FF1744' : '#00E676' }]}>
            {funnel.apiSuccessRate}%
          </Text>
          <Text style={s.funnelOverviewLbl}>API</Text>
        </View>
      </View>

      <View style={s.funnelBars}>
        {funnelSteps.map((step) => {
          const Icon = step.icon;
          const barW = Math.max(8, (step.value / maxVal) * 100);
          return (
            <View key={step.label} style={s.funnelBarRow}>
              <View style={s.funnelBarLeft}>
                <Icon size={12} color={step.color} />
                <Text style={s.funnelBarLabel}>{step.label}</Text>
              </View>
              <View style={s.funnelBarTrack}>
                <View style={[s.funnelBarFill, { width: `${barW}%`, backgroundColor: step.color }]} />
              </View>
              <Text style={s.funnelBarVal}>{step.value}</Text>
            </View>
          );
        })}
      </View>

      {funnel.dropOffPoints.length > 0 && (
        <View style={s.funnelDropSection}>
          <Text style={s.funnelDropTitle}>Drop-off Analysis</Text>
          {funnel.dropOffPoints.filter(d => d.rate > 0).map((d) => (
            <View key={d.step} style={s.funnelDropRow}>
              <Text style={s.funnelDropStep}>{d.step}</Text>
              <View style={s.funnelDropBarTrack}>
                <View style={[s.funnelDropBarFill, { width: `${Math.min(100, d.rate)}%` }]} />
              </View>
              <Text style={[s.funnelDropRate, d.rate > 50 ? { color: '#FF1744' } : {}]}>{d.rate}%</Text>
            </View>
          ))}
        </View>
      )}

      {funnel.topReferrers.length > 0 && (
        <View style={s.funnelRefSection}>
          <Text style={s.funnelDropTitle}>Top Referrers</Text>
          {funnel.topReferrers.slice(0, 5).map((r) => (
            <View key={r.source} style={s.funnelRefRow}>
              <Text style={s.funnelRefSource} numberOfLines={1}>{r.source}</Text>
              <Text style={s.funnelRefCount}>{r.count}</Text>
            </View>
          ))}
        </View>
      )}

      {funnel.avgLatencyMs > 0 && (
        <View style={s.funnelLatency}>
          <Clock size={12} color={Colors.textTertiary} />
          <Text style={s.funnelLatencyText}>Avg API Latency: {funnel.avgLatencyMs}ms</Text>
        </View>
      )}
    </View>
  );
});

const PredictiveTab = memo(function PredictiveTab({ predictions, health }: {
  predictions: CTPredictiveScore[];
  health: CTModuleHealth[];
}) {
  const sorted = useMemo(() => [...predictions].sort((a, b) => b.score - a.score), [predictions]);
  const healthMap = useMemo(() => {
    const m = new Map<CTModuleId, CTModuleHealth>();
    for (const h of health) m.set(h.moduleId, h);
    return m;
  }, [health]);

  return (
    <View style={s.predictTab}>
      <Text style={s.sectionTitle}>Predictive Risk Scoring</Text>
      <Text style={s.sectionSub}>AI-derived failure probability per module</Text>

      {sorted.map(p => {
        const h = healthMap.get(p.moduleId);
        const TrendIcon = getTrendIcon(p.trend);
        const tc = getTrendColor(p.trend);
        const rc = getRiskColor(p.score);
        const critFactors = p.factors.filter(f => f.status === 'critical');
        const elevFactors = p.factors.filter(f => f.status === 'elevated');

        return (
          <View key={p.moduleId} style={[s.predictCard, { borderLeftColor: rc }]}>
            <View style={s.predictCardHeader}>
              <View style={s.predictCardLeft}>
                <Text style={s.predictCardName}>{CT_MODULE_LABELS[p.moduleId]}</Text>
                <View style={s.predictCardTrend}>
                  <TrendIcon size={11} color={tc} />
                  <Text style={[s.predictCardTrendText, { color: tc }]}>{p.trend}</Text>
                  {p.estimatedTimeToIncident !== null && (
                    <Text style={s.predictCardETI}>ETA ~{formatSeconds(p.estimatedTimeToIncident)}</Text>
                  )}
                </View>
              </View>
              <RiskGauge score={p.score} size={44} />
            </View>

            <Text style={s.predictCardPrediction}>{p.prediction}</Text>

            {(critFactors.length > 0 || elevFactors.length > 0) && (
              <View style={s.predictFactors}>
                {critFactors.map(f => (
                  <View key={f.name} style={[s.predictFactorChip, { borderColor: '#FF1744' + '40' }]}>
                    <View style={[s.predictFactorDot, { backgroundColor: '#FF1744' }]} />
                    <Text style={[s.predictFactorName, { color: '#FF1744' }]}>{f.name}</Text>
                  </View>
                ))}
                {elevFactors.map(f => (
                  <View key={f.name} style={[s.predictFactorChip, { borderColor: '#FFB300' + '40' }]}>
                    <View style={[s.predictFactorDot, { backgroundColor: '#FFB300' }]} />
                    <Text style={[s.predictFactorName, { color: '#FFB300' }]}>{f.name}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={s.predictConfidence}>
              <Text style={s.predictConfLabel}>Confidence</Text>
              <View style={s.predictConfBar}>
                <View style={[s.predictConfFill, { width: `${Math.round(p.confidence * 100)}%` }]} />
              </View>
              <Text style={s.predictConfVal}>{Math.round(p.confidence * 100)}%</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
});

const ChatControlTab = memo(function ChatControlTab({ rooms }: { rooms: CTChatRoomSnapshot[] }) {
  return (
    <View style={s.chatTab}>
      <Text style={s.sectionTitle}>Chat Control Layer</Text>
      {rooms.length > 0 ? rooms.map((room) => {
        const modeColor = room.mode === 'shared_live' ? '#00E676'
          : room.mode === 'local_fallback' ? '#FFB300' : '#555';
        return (
          <View key={room.roomId} style={s.chatCard}>
            <View style={s.chatCardHeader}>
              <MessageSquare size={16} color={Colors.primary} />
              <Text style={s.chatCardName}>{room.roomName}</Text>
              <View style={[s.chatModeBadge, { backgroundColor: modeColor + '15', borderColor: modeColor + '30' }]}>
                <Text style={[s.chatModeText, { color: modeColor }]}>{room.mode.replace(/_/g, ' ').toUpperCase()}</Text>
              </View>
            </View>
            <View style={s.chatStatsGrid}>
              {[
                { label: 'Users', value: room.activeUsers, icon: Users, warn: false },
                { label: 'Typing', value: room.typingUsers, icon: Activity, warn: false },
                { label: 'Stuck', value: room.stuckSends, icon: AlertTriangle, warn: room.stuckSends > 0 },
                { label: 'Failed', value: room.failedSends, icon: XCircle, warn: room.failedSends > 0 },
              ].map(stat => {
                const Icon = stat.icon;
                return (
                  <View key={stat.label} style={s.chatStatCell}>
                    <Icon size={12} color={stat.warn ? '#FF1744' : Colors.textTertiary} />
                    <Text style={[s.chatStatVal, stat.warn ? { color: '#FF1744' } : {}]}>{stat.value}</Text>
                    <Text style={s.chatStatLbl}>{stat.label}</Text>
                  </View>
                );
              })}
            </View>
            {room.isDegraded && (
              <View style={s.chatDegBanner}>
                <AlertTriangle size={12} color="#FFB300" />
                <Text style={s.chatDegText}>Room degraded</Text>
              </View>
            )}
            <View style={s.chatTimestamps}>
              <Text style={s.chatTimestamp}>Last write: {timeAgo(room.lastSharedWrite)}</Text>
              <Text style={s.chatTimestamp}>Last RT: {timeAgo(room.lastRealtimeEvent)}</Text>
            </View>
          </View>
        );
      }) : (
        <View style={s.emptyState}>
          <MessageSquare size={32} color={Colors.textTertiary} />
          <Text style={s.emptyText}>No active chat rooms</Text>
        </View>
      )}
    </View>
  );
});

const IncidentCard = memo(function IncidentCard({
  incident,
  onResolve,
  onAction,
}: {
  incident: CTIncident;
  onResolve: (id: string) => void;
  onAction: (action: CTOperatorAction, module: CTModuleId) => void;
}) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const isCrit = incident.severity === 'critical';
  const color = isCrit ? '#FF1744' : '#FFB300';
  const analysis = incident.decisionAnalysis;

  return (
    <View style={[s.incCard, { borderLeftColor: color }]}>
      <View style={s.incHeader}>
        {isCrit ? <XCircle size={16} color={color} /> : <AlertTriangle size={16} color={color} />}
        <Text style={[s.incTitle, { color }]} numberOfLines={2}>{incident.title}</Text>
      </View>
      <Text style={s.incDesc}>{incident.description}</Text>
      <View style={s.incMeta}>
        <Text style={s.incMetaText}>
          {CT_MODULE_LABELS[incident.module]} · {incident.affectedUsers} users · {timeAgo(incident.timestamp)}
        </Text>
      </View>

      {analysis && (
        <TouchableOpacity onPress={() => setShowAnalysis(p => !p)} style={s.incAnalysisToggle}>
          <Brain size={12} color="#E040FB" />
          <Text style={s.incAnalysisToggleText}>{showAnalysis ? 'Hide' : 'Show'} Decision Analysis</Text>
        </TouchableOpacity>
      )}

      {showAnalysis && analysis && (
        <View style={s.incAnalysis}>
          <Text style={s.incAnalysisLabel}>Likely Cause</Text>
          <Text style={s.incAnalysisValue}>{analysis.likelyCause}</Text>
          <Text style={s.incAnalysisLabel}>Business Impact</Text>
          <Text style={s.incAnalysisValue}>{analysis.businessImpact}</Text>
          <Text style={s.incAnalysisLabel}>Severity</Text>
          <Text style={[s.incAnalysisValue, {
            color: analysis.estimatedSeverity === 'critical' ? '#FF1744' :
              analysis.estimatedSeverity === 'high' ? '#FF6D00' :
              analysis.estimatedSeverity === 'medium' ? '#FFB300' : '#00E676',
          }]}>{analysis.estimatedSeverity.toUpperCase()}</Text>
          {analysis.involvedModules.length > 1 && (
            <>
              <Text style={s.incAnalysisLabel}>Involved Modules</Text>
              <Text style={s.incAnalysisValue}>{analysis.involvedModules.map(m => CT_MODULE_LABELS[m]).join(', ')}</Text>
            </>
          )}
          {analysis.approvalActions.length > 0 && (
            <>
              <Text style={[s.incAnalysisLabel, { color: '#FF6D00' }]}>Requires Approval</Text>
              {analysis.approvalActions.map((a, i) => (
                <Text key={i} style={[s.incAnalysisValue, { color: '#FF6D00' }]}>• {a}</Text>
              ))}
            </>
          )}
        </View>
      )}

      <View style={s.incActions}>
        <TouchableOpacity
          style={[s.incActionBtn, { borderColor: color + '40' }]}
          onPress={() => onAction(incident.suggestedAction, incident.module)}
        >
          <Zap size={12} color={color} />
          <Text style={[s.incActionText, { color }]}>{getActionLabel(incident.suggestedAction)}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.incActionBtn, { borderColor: '#00E676' + '40' }]}
          onPress={() => onResolve(incident.id)}
        >
          <CheckCircle size={12} color="#00E676" />
          <Text style={[s.incActionText, { color: '#00E676' }]}>Resolve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const OperatorPanel = memo(function OperatorPanel({
  onExecute,
  isExecuting,
  lastResult,
}: {
  onExecute: (action: CTOperatorAction) => void;
  isExecuting: boolean;
  lastResult: { action: string; success: boolean; message: string } | null;
}) {
  const actions: { action: CTOperatorAction; label: string; icon: typeof Activity; color: string }[] = [
    { action: 'rerun_health_probe', label: 'Health Probe', icon: Activity, color: '#00E676' },
    { action: 'reconnect_realtime', label: 'Reconnect RT', icon: Radio, color: '#448AFF' },
    { action: 'clear_stale_cache', label: 'Clear Cache', icon: RefreshCw, color: '#FFB300' },
    { action: 'retry_safe_rpc', label: 'Retry RPC', icon: Zap, color: '#E040FB' },
    { action: 'reopen_subscriptions', label: 'Reopen Subs', icon: Wifi, color: '#00BCD4' },
    { action: 'transition_stuck_sends', label: 'Fix Stuck', icon: MessageSquare, color: '#FF6D00' },
    { action: 'retry_landing_api', label: 'Landing API', icon: Globe, color: '#448AFF' },
    { action: 'invalidate_query_cache', label: 'Query Cache', icon: RefreshCw, color: '#9C27B0' },
    { action: 'notify_admin', label: 'Notify Admin', icon: Mail, color: '#FF1744' },
  ];

  return (
    <View style={s.opPanel}>
      <Text style={s.sectionTitle}>Safe Operator Actions</Text>
      <Text style={s.sectionSub}>Non-destructive remediation only</Text>
      <View style={s.opGrid}>
        {actions.map((a) => {
          const Icon = a.icon;
          const safe = isActionSafe(a.action);
          return (
            <TouchableOpacity
              key={a.action}
              style={[s.opBtn, { borderColor: a.color + '25' }]}
              activeOpacity={0.7}
              disabled={isExecuting}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onExecute(a.action); }}
            >
              <View style={[s.opBtnIcon, { backgroundColor: a.color + '12' }]}>
                <Icon size={18} color={a.color} />
              </View>
              <Text style={s.opBtnLabel}>{a.label}</Text>
              {safe && (
                <View style={s.opSafeBadge}>
                  <Shield size={8} color="#00E676" />
                  <Text style={s.opSafeText}>SAFE</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {isExecuting && (
        <View style={s.opExec}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={s.opExecText}>Executing...</Text>
        </View>
      )}
      {lastResult && (
        <View style={[s.opResult, { borderColor: lastResult.success ? '#00E676' + '30' : '#FF1744' + '30' }]}>
          {lastResult.success ? <CheckCircle size={14} color="#00E676" /> : <XCircle size={14} color="#FF1744" />}
          <View style={s.opResultText}>
            <Text style={s.opResultAction}>{lastResult.action}</Text>
            <Text style={s.opResultMsg}>{lastResult.message}</Text>
          </View>
        </View>
      )}
    </View>
  );
});

const AutoRemediationTab = memo(function AutoRemediationTab({ logs }: { logs: CTAutoRemediationLog[] }) {
  const stats = useMemo(() => getRemediationStats(), [logs]);
  return (
    <View style={s.autoTab}>
      <Text style={s.sectionTitle}>Autonomous Remediation</Text>
      <Text style={s.sectionSub}>Safe auto-heal actions executed by the system</Text>

      <View style={s.autoStatsRow}>
        <View style={s.autoStat}>
          <Text style={s.autoStatVal}>{stats.total}</Text>
          <Text style={s.autoStatLbl}>Total</Text>
        </View>
        <View style={s.autoStatDiv} />
        <View style={s.autoStat}>
          <Text style={[s.autoStatVal, { color: '#00E676' }]}>{stats.success}</Text>
          <Text style={s.autoStatLbl}>Success</Text>
        </View>
        <View style={s.autoStatDiv} />
        <View style={s.autoStat}>
          <Text style={[s.autoStatVal, { color: '#FF1744' }]}>{stats.failed}</Text>
          <Text style={s.autoStatLbl}>Failed</Text>
        </View>
        <View style={s.autoStatDiv} />
        <View style={s.autoStat}>
          <Text style={[s.autoStatVal, { color: '#FFB300' }]}>{stats.skipped}</Text>
          <Text style={s.autoStatLbl}>Skipped</Text>
        </View>
      </View>

      {logs.length > 0 ? (
        <View style={s.autoLogList}>
          {[...logs].reverse().slice(0, 20).map((log) => {
            const resultColor = log.result === 'success' ? '#00E676' : log.result === 'failed' ? '#FF1744' : '#FFB300';
            return (
              <View key={log.id} style={s.autoLogRow}>
                <View style={[s.autoLogDot, { backgroundColor: resultColor }]} />
                <View style={s.autoLogContent}>
                  <View style={s.autoLogHeader}>
                    <Text style={s.autoLogAction}>{log.action}</Text>
                    <Text style={[s.autoLogResult, { color: resultColor }]}>{log.result}</Text>
                  </View>
                  <Text style={s.autoLogModule}>{CT_MODULE_LABELS[log.module]} · {log.durationMs}ms</Text>
                  <Text style={s.autoLogMsg} numberOfLines={2}>{log.message}</Text>
                  <Text style={s.autoLogTime}>{timeAgo(log.triggeredAt)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={s.emptyState}>
          <Wrench size={32} color={Colors.textTertiary} />
          <Text style={s.emptyText}>No auto-remediation actions yet</Text>
        </View>
      )}
    </View>
  );
});

export default function ControlTowerScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('nerve');
  const [snapshot, setSnapshot] = useState<CTDashboardSnapshot | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastActionResult, setLastActionResult] = useState<{
    action: string; success: boolean; message: string;
  } | null>(null);
  const presence = usePresenceTracker();

  useEffect(() => {
    controlTowerAggregator.start();
    setIsRunning(true);
    const unsub = controlTowerAggregator.subscribe((snap) => setSnapshot(snap));
    return () => { unsub(); };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await controlTowerAggregator.refreshHealth();
    setRefreshing(false);
  }, []);

  const handleToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isRunning) { controlTowerAggregator.stop(); setIsRunning(false); }
    else { controlTowerAggregator.start(); setIsRunning(true); }
  }, [isRunning]);

  const operatorMutation = useMutation({
    mutationFn: async (action: CTOperatorAction) => executeOperatorAction(action, 'home'),
    onSuccess: (result) => {
      setLastActionResult({ action: getActionLabel(result.action), success: result.success, message: result.message });
      Haptics.notificationAsync(result.success ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    },
    onError: (err) => {
      setLastActionResult({ action: 'Unknown', success: false, message: (err as Error)?.message || 'Failed' });
    },
  });

  const handleOperatorAction = useCallback((action: CTOperatorAction) => { operatorMutation.mutate(action); }, [operatorMutation]);
  const handleResolveIncident = useCallback((id: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); controlTowerAggregator.resolveIncident(id); }, []);
  const handleIncidentAction = useCallback((action: CTOperatorAction, _module: CTModuleId) => { operatorMutation.mutate(action); }, [operatorMutation]);

  const trafficIntel = useMemo<TrafficIntelSnapshot | null>(() => {
    return ctAgg.getTrafficIntel();
  }, [snapshot]);

  const renderContent = () => {
    if (!snapshot) return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={s.loadingText}>Initializing nerve center...</Text>
      </View>
    );

    switch (activeTab) {
      case 'nerve': return <NerveCenterTab snapshot={snapshot} presence={presence} />;
      case 'traffic': return trafficIntel ? <TrafficIntelTab intel={trafficIntel} /> : (
        <View style={s.loading}>
          <Radar size={28} color={Colors.textTertiary} />
          <Text style={s.loadingText}>Loading traffic intelligence...</Text>
        </View>
      );
      case 'landing': return <LandingFunnelTab funnel={snapshot.landingFunnel} />;
      case 'predict': return <PredictiveTab predictions={snapshot.predictions} health={snapshot.health} />;
      case 'chat': return <ChatControlTab rooms={snapshot.chatRooms} />;
      case 'incidents': return snapshot.incidents.length > 0 ? (
        <View style={s.incTab}><Text style={s.sectionTitle}>Active Incidents</Text>
          {snapshot.incidents.map(inc => (
            <IncidentCard key={inc.id} incident={inc} onResolve={handleResolveIncident} onAction={handleIncidentAction} />
          ))}
        </View>
      ) : (
        <View style={s.emptyState}><CheckCircle size={32} color="#00E676" /><Text style={s.emptyText}>All clear</Text></View>
      );
      case 'operator': return <OperatorPanel onExecute={handleOperatorAction} isExecuting={operatorMutation.isPending} lastResult={lastActionResult} />;
      case 'auto': return <AutoRemediationTab logs={snapshot.autoRemediations} />;
    }
  };

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="ct-back">
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Brain size={18} color={Colors.primary} />
            <Text style={s.headerTitle}>Nerve Center</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity onPress={handleToggle} style={s.headerAction} testID="ct-toggle">
              {isRunning ? <Pause size={16} color="#00E676" /> : <Play size={16} color="#FFB300" />}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRefresh} style={s.headerAction} testID="ct-refresh">
              <RefreshCw size={16} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[s.tab, active && s.tabActive]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab.id); }}
                testID={`ct-tab-${tab.id}`}
              >
                <Icon size={13} color={active ? Colors.primary : Colors.textTertiary} />
                <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
        >
          {renderContent()}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050508' },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1F' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A1A1F', justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' as const, letterSpacing: 0.3 },
  headerRight: { flexDirection: 'row', gap: 8 },
  headerAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A1A1F', justifyContent: 'center', alignItems: 'center' },
  tabBar: { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: '#1A1A1F' },
  tabBarContent: { paddingHorizontal: 12, gap: 4, alignItems: 'center' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  tabActive: { backgroundColor: '#1A1A1F' },
  tabLabel: { color: Colors.textTertiary, fontSize: 11, fontWeight: '600' as const },
  tabLabelActive: { color: Colors.primary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  loading: { paddingTop: 80, alignItems: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 13 },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' as const, marginBottom: 4 },
  sectionSub: { color: Colors.textTertiary, fontSize: 11, marginBottom: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { color: Colors.textTertiary, fontSize: 13 },

  nerveBanner: { marginTop: 16, borderRadius: 16, backgroundColor: '#0D0D12', borderWidth: 1, padding: 16 },
  nerveBannerTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  nerveLabel: { fontSize: 13, fontWeight: '800' as const, letterSpacing: 1.2 },
  nerveAssessment: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  nerveStatsRow: { flexDirection: 'row', alignItems: 'center' },
  nerveStat: { flex: 1, alignItems: 'center' },
  nerveStatVal: { color: Colors.text, fontSize: 18, fontWeight: '700' as const },
  nerveStatLbl: { color: Colors.textTertiary, fontSize: 8, fontWeight: '700' as const, marginTop: 2, letterSpacing: 0.5 },
  nerveStatDiv: { width: 1, height: 24, backgroundColor: '#1A1A1F' },
  nerveSection: { marginTop: 16, borderRadius: 14, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', padding: 14 },
  nerveSectionTitle: { color: Colors.text, fontSize: 13, fontWeight: '700' as const, marginBottom: 8 },
  nerveRiskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  nerveRiskText: { color: '#FF1744', fontSize: 11, lineHeight: 16, flex: 1 },
  nerveActionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  nerveActionText: { color: '#FFB300', fontSize: 11, lineHeight: 16, flex: 1 },
  nerveModGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nerveModChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#0A0A0E', borderWidth: 1, borderColor: '#1A1A1F' },
  nerveModLabel: { color: Colors.textSecondary, fontSize: 10, fontWeight: '500' as const, maxWidth: 80 },
  nerveModCount: { color: Colors.text, fontSize: 11, fontWeight: '700' as const },
  nerveRiskModule: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1A1A1F' },
  nerveRiskModLeft: { flex: 1 },
  nerveRiskModName: { color: Colors.text, fontSize: 12, fontWeight: '600' as const },
  nerveRiskModTrend: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  nerveRiskModTrendText: { fontSize: 10, fontWeight: '600' as const },
  nerveETI: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8 },
  nerveETIText: { color: '#FF1744', fontSize: 9, fontWeight: '600' as const },

  riskGauge: { justifyContent: 'center', alignItems: 'center' },
  riskGaugeOuter: { justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  riskGaugeInner: { justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
  riskGaugeText: { fontWeight: '800' as const },

  funnelTab: { marginTop: 16 },
  funnelOverview: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', padding: 14, marginBottom: 14 },
  funnelOverviewStat: { flex: 1, alignItems: 'center' },
  funnelOverviewVal: { color: Colors.text, fontSize: 18, fontWeight: '700' as const },
  funnelOverviewLbl: { color: Colors.textTertiary, fontSize: 9, fontWeight: '600' as const, marginTop: 2 },
  funnelOverviewDiv: { width: 1, height: 24, backgroundColor: '#1A1A1F' },
  funnelBars: { borderRadius: 14, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', padding: 14, gap: 10 },
  funnelBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  funnelBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 90 },
  funnelBarLabel: { color: Colors.textSecondary, fontSize: 11 },
  funnelBarTrack: { flex: 1, height: 6, backgroundColor: '#1A1A1F', borderRadius: 3, overflow: 'hidden' as const },
  funnelBarFill: { height: 6, borderRadius: 3 },
  funnelBarVal: { color: Colors.text, fontSize: 12, fontWeight: '700' as const, width: 36, textAlign: 'right' as const },
  funnelDropSection: { marginTop: 14, borderRadius: 14, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', padding: 14 },
  funnelDropTitle: { color: Colors.text, fontSize: 12, fontWeight: '700' as const, marginBottom: 10 },
  funnelDropRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  funnelDropStep: { color: Colors.textSecondary, fontSize: 11, width: 80 },
  funnelDropBarTrack: { flex: 1, height: 4, backgroundColor: '#1A1A1F', borderRadius: 2, overflow: 'hidden' as const },
  funnelDropBarFill: { height: 4, borderRadius: 2, backgroundColor: '#FF1744' },
  funnelDropRate: { color: Colors.textSecondary, fontSize: 11, fontWeight: '600' as const, width: 36, textAlign: 'right' as const },
  funnelRefSection: { marginTop: 14, borderRadius: 14, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', padding: 14 },
  funnelRefRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  funnelRefSource: { color: Colors.textSecondary, fontSize: 11, flex: 1 },
  funnelRefCount: { color: Colors.text, fontSize: 11, fontWeight: '600' as const },
  funnelLatency: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 4 },
  funnelLatencyText: { color: Colors.textTertiary, fontSize: 11 },

  predictTab: { marginTop: 16 },
  predictCard: { borderRadius: 14, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', borderLeftWidth: 3, padding: 14, marginBottom: 10 },
  predictCardHeader: { flexDirection: 'row', alignItems: 'center' },
  predictCardLeft: { flex: 1 },
  predictCardName: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  predictCardTrend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  predictCardTrendText: { fontSize: 10, fontWeight: '600' as const },
  predictCardETI: { color: '#FF1744', fontSize: 9, fontWeight: '600' as const, marginLeft: 6 },
  predictCardPrediction: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 8 },
  predictFactors: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  predictFactorChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  predictFactorDot: { width: 5, height: 5, borderRadius: 2.5 },
  predictFactorName: { fontSize: 9, fontWeight: '600' as const },
  predictConfidence: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  predictConfLabel: { color: Colors.textTertiary, fontSize: 9, fontWeight: '600' as const, width: 60 },
  predictConfBar: { flex: 1, height: 3, backgroundColor: '#1A1A1F', borderRadius: 1.5, overflow: 'hidden' as const },
  predictConfFill: { height: 3, borderRadius: 1.5, backgroundColor: '#448AFF' },
  predictConfVal: { color: Colors.textTertiary, fontSize: 9, fontWeight: '600' as const, width: 28, textAlign: 'right' as const },

  chatTab: { marginTop: 16 },
  chatCard: { borderRadius: 14, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', padding: 14, marginBottom: 10 },
  chatCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  chatCardName: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, flex: 1 },
  chatModeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  chatModeText: { fontSize: 9, fontWeight: '700' as const, letterSpacing: 0.4 },
  chatStatsGrid: { flexDirection: 'row', gap: 8 },
  chatStatCell: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 8, borderRadius: 8, backgroundColor: '#0A0A0E' },
  chatStatVal: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  chatStatLbl: { color: Colors.textTertiary, fontSize: 9, fontWeight: '600' as const },
  chatDegBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,179,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,179,0,0.2)' },
  chatDegText: { color: '#FFB300', fontSize: 11, fontWeight: '500' as const },
  chatTimestamps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  chatTimestamp: { color: Colors.textTertiary, fontSize: 10 },

  incTab: { marginTop: 16 },
  incCard: { borderRadius: 12, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', borderLeftWidth: 3, padding: 14, marginBottom: 10 },
  incHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  incTitle: { fontSize: 13, fontWeight: '700' as const, flex: 1, lineHeight: 18 },
  incDesc: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16, marginBottom: 8 },
  incMeta: { marginBottom: 8 },
  incMetaText: { color: Colors.textTertiary, fontSize: 10 },
  incAnalysisToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, marginBottom: 6 },
  incAnalysisToggleText: { color: '#E040FB', fontSize: 10, fontWeight: '600' as const },
  incAnalysis: { backgroundColor: '#0A0A0E', borderRadius: 10, padding: 12, marginBottom: 10, gap: 4 },
  incAnalysisLabel: { color: Colors.textTertiary, fontSize: 9, fontWeight: '700' as const, letterSpacing: 0.5, marginTop: 4 },
  incAnalysisValue: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16 },
  incActions: { flexDirection: 'row', gap: 8 },
  incActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  incActionText: { fontSize: 10, fontWeight: '600' as const },

  opPanel: { marginTop: 16 },
  opGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  opBtn: { width: CARD_WIDTH, borderRadius: 12, backgroundColor: '#0D0D12', borderWidth: 1, padding: 14, alignItems: 'center', gap: 8 },
  opBtnIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  opBtnLabel: { color: Colors.text, fontSize: 12, fontWeight: '600' as const, textAlign: 'center' as const },
  opSafeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,230,118,0.08)' },
  opSafeText: { color: '#00E676', fontSize: 8, fontWeight: '800' as const, letterSpacing: 0.5 },
  opExec: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: '#0D0D12' },
  opExecText: { color: Colors.textSecondary, fontSize: 12 },
  opResult: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: '#0D0D12', borderWidth: 1 },
  opResultText: { flex: 1 },
  opResultAction: { color: Colors.text, fontSize: 12, fontWeight: '600' as const },
  opResultMsg: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },

  autoTab: { marginTop: 16 },
  autoStatsRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', padding: 14, marginBottom: 14 },
  autoStat: { flex: 1, alignItems: 'center' },
  autoStatVal: { color: Colors.text, fontSize: 20, fontWeight: '700' as const },
  autoStatLbl: { color: Colors.textTertiary, fontSize: 9, fontWeight: '600' as const, marginTop: 2 },
  autoStatDiv: { width: 1, height: 24, backgroundColor: '#1A1A1F' },
  autoLogList: { gap: 8 },
  autoLogRow: { flexDirection: 'row', gap: 10, borderRadius: 12, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', padding: 12 },
  autoLogDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  autoLogContent: { flex: 1 },
  autoLogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  autoLogAction: { color: Colors.text, fontSize: 12, fontWeight: '600' as const },
  autoLogResult: { fontSize: 10, fontWeight: '700' as const },
  autoLogModule: { color: Colors.textTertiary, fontSize: 10, marginBottom: 2 },
  autoLogMsg: { color: Colors.textSecondary, fontSize: 11, lineHeight: 15 },
  autoLogTime: { color: Colors.textTertiary, fontSize: 9, marginTop: 3 },
});
