import React, { memo, useMemo, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import {
  Activity,
  Search,
  Megaphone,
  Music,
  MessageCircle,
  Mail,
  Globe,
  Link2,
  Star,
  HelpCircle,
  EyeOff,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  TrendingUp,
  PieChart,
  MessageSquare,
  Lock,
  AlertTriangle,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import type {
  TrafficIntelSnapshot,
  TrafficSourceSnapshot,
  TrafficPrediction,
  TrafficSourceId,
  UserIntent,
  JourneyStep,
} from './traffic-types';
import {
  TRAFFIC_SOURCE_META,
  JOURNEY_STEP_LABELS,
  INTENT_LABELS,
  INTENT_COLORS,
  FRICTION_LABELS,
} from './traffic-types';

const NODE_GRAPH_HEIGHT = 320;
const SOURCE_NODE_W = 110;
const MODULE_NODE_W = 80;

const SOURCE_ICON_MAP: Record<string, typeof Activity> = {
  Instagram: Activity,
  Search: Search,
  Megaphone: Megaphone,
  Music: Music,
  Facebook: Activity,
  MessageCircle: MessageCircle,
  Mail: Mail,
  Globe: Globe,
  Link2: Link2,
  Star: Star,
  HelpCircle: HelpCircle,
  EyeOff: EyeOff,
};

const SYSTEM_MODULES = [
  { id: 'landing', label: 'Landing', icon: Globe, color: '#448AFF' },
  { id: 'auth', label: 'Auth', icon: Lock, color: '#E040FB' },
  { id: 'app', label: 'App', icon: Activity, color: '#00E676' },
  { id: 'invest', label: 'Invest', icon: TrendingUp, color: '#FFB300' },
  { id: 'chat', label: 'Chat', icon: MessageSquare, color: '#00BCD4' },
  { id: 'portfolio', label: 'Portfolio', icon: PieChart, color: '#FF6D00' },
];

function getHealthNodeColor(state: string): string {
  switch (state) {
    case 'healthy': return '#00E676';
    case 'friction': return '#FFB300';
    case 'degraded': return '#FF6D00';
    case 'blocked': return '#FF1744';
    default: return '#555';
  }
}

function getRiskColor(score: number): string {
  if (score >= 0.7) return '#FF1744';
  if (score >= 0.4) return '#FFB300';
  if (score >= 0.2) return '#448AFF';
  return '#00E676';
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

const FlowLine = memo(function FlowLine({ color, opacity: opacityVal, thickness }: { color: string; opacity: number; thickness: number }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: opacityVal, duration: 1500, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.15, duration: 1500, useNativeDriver: true }),
      ]),
    ).start();
  }, [anim, opacityVal]);

  return (
    <Animated.View style={{
      height: thickness,
      flex: 1,
      backgroundColor: color,
      opacity: anim,
      borderRadius: thickness / 2,
    }} />
  );
});

const PulsingOrb = memo(function PulsingOrb({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 1200, useNativeDriver: true }),
      ]),
    ).start();
  }, [anim]);

  return (
    <View style={ts.pulseWrap}>
      <Animated.View style={[ts.pulseHalo, { backgroundColor: color, opacity: anim }]} />
      <View style={[ts.pulseDot, { backgroundColor: color }]} />
    </View>
  );
});

const QualityGauge = memo(function QualityGauge({ score, size = 36 }: { score: number; size?: number }) {
  const color = score >= 60 ? '#00E676' : score >= 30 ? '#FFB300' : '#FF1744';
  return (
    <View style={[ts.gauge, { width: size, height: size }]}>
      <View style={[ts.gaugeOuter, { width: size, height: size, borderRadius: size / 2, borderColor: color + '30' }]}>
        <View style={[ts.gaugeInner, { width: size - 6, height: size - 6, borderRadius: (size - 6) / 2, borderColor: color + '60' }]}>
          <Text style={[ts.gaugeText, { color, fontSize: size > 30 ? 11 : 9 }]}>{score}</Text>
        </View>
      </View>
    </View>
  );
});

const SourceNodeGraph = memo(function SourceNodeGraph({ intel }: { intel: TrafficIntelSnapshot }) {
  const activeSources = useMemo(() =>
    intel.sources.filter(s => s.last1h > 0 || s.activeNow > 0).sort((a, b) => b.last1h - a.last1h).slice(0, 8),
    [intel.sources],
  );

  const maxVolume = useMemo(() =>
    Math.max(1, ...activeSources.map(s => s.last1h)),
    [activeSources],
  );

  if (activeSources.length === 0) {
    return (
      <View style={ts.graphEmpty}>
        <Target size={28} color={Colors.textTertiary} />
        <Text style={ts.graphEmptyText}>No active traffic sources</Text>
        <Text style={ts.graphEmptySub}>Sessions will appear here as visitors arrive</Text>
      </View>
    );
  }

  return (
    <View style={ts.graphContainer}>
      <Text style={ts.graphTitle}>World Origin Map</Text>
      <View style={ts.graphBody}>
        <View style={ts.graphLeftCol}>
          {activeSources.map((source) => {
            const meta = TRAFFIC_SOURCE_META[source.sourceId];
            const Icon = SOURCE_ICON_MAP[meta.icon] || Activity;
            const healthColor = getHealthNodeColor(source.healthState);

            return (
              <View key={source.sourceId} style={[ts.sourceNode, { borderColor: healthColor + '40' }]}>
                <PulsingOrb color={healthColor} />
                <Icon size={11} color={meta.color} />
                <View style={ts.sourceNodeCopy}>
                  <Text style={ts.sourceNodeLabel} numberOfLines={1}>{meta.label}</Text>
                  <Text style={ts.sourceNodeMeta} numberOfLines={1}>Q{source.qualityScore} · B{source.businessOutcomeScore}</Text>
                </View>
                <Text style={[ts.sourceNodeCount, { color: meta.color }]}>{source.activeNow || source.last1h}</Text>
              </View>
            );
          })}
        </View>

        <View style={ts.graphCenter}>
          {activeSources.map((source) => {
            const meta = TRAFFIC_SOURCE_META[source.sourceId];
            const volumeRatio = Math.max(0.2, source.last1h / maxVolume);
            const thickness = Math.max(2, Math.round(volumeRatio * 8));
            return (
              <View key={source.sourceId} style={ts.flowLineRow}>
                <FlowLine color={meta.color} opacity={volumeRatio} thickness={thickness} />
              </View>
            );
          })}
        </View>

        <View style={ts.graphRightCol}>
          {SYSTEM_MODULES.map((mod) => {
            const Icon = mod.icon;
            const connectionCount = intel.connections.filter(c => c.toModuleId === mod.id).reduce((s, c) => s + c.volume, 0);
            const hasTraffic = connectionCount > 0;
            return (
              <View key={mod.id} style={[ts.moduleNode, { borderColor: hasTraffic ? mod.color + '50' : '#1A1A1F' }]}>
                <Icon size={12} color={hasTraffic ? mod.color : '#555'} />
                <Text style={[ts.moduleNodeLabel, hasTraffic ? { color: mod.color } : {}]}>{mod.label}</Text>
                {hasTraffic && <Text style={[ts.moduleNodeCount, { color: mod.color }]}>{connectionCount}</Text>}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
});

const SourceCard = memo(function SourceCard({ source }: { source: TrafficSourceSnapshot }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TRAFFIC_SOURCE_META[source.sourceId];
  const Icon = SOURCE_ICON_MAP[meta.icon] || Activity;
  const healthColor = getHealthNodeColor(source.healthState);

  const topIntents = useMemo(() => {
    return Object.entries(source.intents)
      .filter(([, count]) => (count ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 3);
  }, [source.intents]);

  const journeySteps = useMemo(() => {
    const steps: JourneyStep[] = [
      'landing_visit', 'cta_clicked', 'form_started', 'form_submitted',
      'auth_signup', 'app_opened', 'deal_browse', 'invest_flow', 'portfolio_view',
    ];
    return steps
      .map(step => ({ step, count: source.journeySteps[step] ?? 0 }))
      .filter(s => s.count > 0);
  }, [source.journeySteps]);

  const maxJourney = Math.max(1, ...journeySteps.map(s => s.count));

  return (
    <View style={[ts.sourceCard, { borderLeftColor: meta.color }]}>
      <TouchableOpacity
        style={ts.sourceCardHeader}
        onPress={() => setExpanded(p => !p)}
        activeOpacity={0.7}
        testID={`traffic-source-${source.sourceId}`}
      >
        <View style={[ts.sourceCardIconWrap, { backgroundColor: meta.color + '12' }]}>
          <Icon size={16} color={meta.color} />
        </View>
        <View style={ts.sourceCardInfo}>
          <Text style={ts.sourceCardName}>{meta.label}</Text>
          <View style={ts.sourceCardMeta}>
            <View style={[ts.sourceCardHealthDot, { backgroundColor: healthColor }]} />
            <Text style={ts.sourceCardHealthText}>{source.healthState}</Text>
            <Text style={ts.sourceCardSep}>·</Text>
            <Text style={ts.sourceCardIntentText}>{INTENT_LABELS[source.topIntent]}</Text>
          </View>
        </View>
        <View style={ts.sourceCardRight}>
          <Text style={[ts.sourceCardActiveCount, { color: meta.color }]}>{source.activeNow}</Text>
          <QualityGauge score={source.qualityScore} size={32} />
        </View>
        {expanded ? <ChevronUp size={14} color={Colors.textTertiary} /> : <ChevronDown size={14} color={Colors.textTertiary} />}
      </TouchableOpacity>

      {expanded && (
        <View style={ts.sourceCardBody}>
          <View style={ts.sourceCardStatsRow}>
            <View style={ts.sourceCardStat}>
              <Text style={ts.sourceCardStatVal}>{source.last5m}</Text>
              <Text style={ts.sourceCardStatLbl}>5m</Text>
            </View>
            <View style={ts.sourceCardStatDiv} />
            <View style={ts.sourceCardStat}>
              <Text style={ts.sourceCardStatVal}>{source.last1h}</Text>
              <Text style={ts.sourceCardStatLbl}>1h</Text>
            </View>
            <View style={ts.sourceCardStatDiv} />
            <View style={ts.sourceCardStat}>
              <Text style={ts.sourceCardStatVal}>{source.last24h}</Text>
              <Text style={ts.sourceCardStatLbl}>24h</Text>
            </View>
            <View style={ts.sourceCardStatDiv} />
            <View style={ts.sourceCardStat}>
              <Text style={[ts.sourceCardStatVal, { color: '#00E676' }]}>{source.ctaClickRate}%</Text>
              <Text style={ts.sourceCardStatLbl}>CTR</Text>
            </View>
            <View style={ts.sourceCardStatDiv} />
            <View style={ts.sourceCardStat}>
              <Text style={[ts.sourceCardStatVal, { color: '#E040FB' }]}>{source.signupRate}%</Text>
              <Text style={ts.sourceCardStatLbl}>Sign</Text>
            </View>
            <View style={ts.sourceCardStatDiv} />
            <View style={ts.sourceCardStat}>
              <Text style={[ts.sourceCardStatVal, { color: '#00BCD4' }]}>{source.appOpenRate}%</Text>
              <Text style={ts.sourceCardStatLbl}>App</Text>
            </View>
          </View>

          {journeySteps.length > 0 && (
            <View style={ts.journeySection}>
              <Text style={ts.journeySectionTitle}>Journey</Text>
              {journeySteps.map(({ step, count }) => {
                const barW = Math.max(8, (count / maxJourney) * 100);
                return (
                  <View key={step} style={ts.journeyRow}>
                    <Text style={ts.journeyLabel}>{JOURNEY_STEP_LABELS[step] ?? step}</Text>
                    <View style={ts.journeyBarTrack}>
                      <View style={[ts.journeyBarFill, { width: `${barW}%`, backgroundColor: meta.color }]} />
                    </View>
                    <Text style={ts.journeyCount}>{count}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {topIntents.length > 0 && (
            <View style={ts.intentSection}>
              <Text style={ts.journeySectionTitle}>Intent</Text>
              <View style={ts.intentChips}>
                {topIntents.map(([intent, count]) => {
                  const intentColor = INTENT_COLORS[intent as UserIntent] || '#555';
                  return (
                    <View key={intent} style={[ts.intentChip, { borderColor: intentColor + '30' }]}>
                      <View style={[ts.intentChipDot, { backgroundColor: intentColor }]} />
                      <Text style={[ts.intentChipLabel, { color: intentColor }]}>
                        {INTENT_LABELS[intent as UserIntent] ?? intent}
                      </Text>
                      <Text style={ts.intentChipCount}>{count}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <View style={ts.outcomeSection}>
            <Text style={ts.journeySectionTitle}>Outcomes</Text>
            <View style={ts.outcomeGrid}>
              {[
                { label: 'Bounce', value: source.outcomes.bounceRate, bad: source.outcomes.bounceRate > 60 },
                { label: 'Lead', value: source.outcomes.leadConversion, bad: false },
                { label: 'Signup', value: source.outcomes.signupConversion, bad: false },
                { label: 'Handoff', value: source.outcomes.appHandoffSuccess, bad: false },
                { label: 'Deal View', value: source.outcomes.dealViewRate, bad: false },
                { label: 'Invest', value: source.outcomes.investInitRate, bad: false },
              ].map(o => (
                <View key={o.label} style={ts.outcomeCell}>
                  <Text style={[ts.outcomeCellVal, o.bad ? { color: '#FF1744' } : {}]}>{o.value}%</Text>
                  <Text style={ts.outcomeCellLbl}>{o.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {source.frictions.length > 0 && (
            <View style={ts.frictionSection}>
              <Text style={[ts.journeySectionTitle, { color: '#FF6D00' }]}>Friction Points</Text>
              {source.frictions.map(f => {
                const sevColor = f.severity === 'critical' ? '#FF1744'
                  : f.severity === 'high' ? '#FF6D00'
                  : f.severity === 'medium' ? '#FFB300'
                  : '#546E7A';
                return (
                  <View key={f.type} style={ts.frictionRow}>
                    <View style={[ts.frictionDot, { backgroundColor: sevColor }]} />
                    <Text style={ts.frictionLabel}>{FRICTION_LABELS[f.type]}</Text>
                    <Text style={[ts.frictionCount, { color: sevColor }]}>{f.count} users</Text>
                    <Text style={[ts.frictionSev, { color: sevColor }]}>{f.severity}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
});

const PredictionChip = memo(function PredictionChip({ prediction }: { prediction: TrafficPrediction }) {
  const meta = TRAFFIC_SOURCE_META[prediction.sourceId];
  const rc = getRiskColor(prediction.score);
  const TrendIcon = prediction.trend === 'rising' ? ArrowUpRight
    : prediction.trend === 'falling' ? ArrowDownRight : Minus;
  const tc = prediction.trend === 'rising' ? '#FF1744'
    : prediction.trend === 'falling' ? '#00E676' : '#555';

  return (
    <View style={[ts.predChip, { borderLeftColor: rc }]}>
      <View style={ts.predChipHeader}>
        <Text style={[ts.predChipSource, { color: meta.color }]}>{meta.label}</Text>
        <View style={ts.predChipTrend}>
          <TrendIcon size={10} color={tc} />
          <Text style={[ts.predChipTrendText, { color: tc }]}>{prediction.trend}</Text>
        </View>
        <QualityGauge score={Math.round(prediction.score * 100)} size={28} />
      </View>
      <Text style={ts.predChipText}>{prediction.prediction}</Text>
      {prediction.factors.filter(f => f.status !== 'normal').length > 0 && (
        <View style={ts.predFactors}>
          {prediction.factors.filter(f => f.status !== 'normal').map(f => {
            const fc = f.status === 'critical' ? '#FF1744' : '#FFB300';
            return (
              <View key={f.name} style={[ts.predFactorBadge, { borderColor: fc + '30' }]}>
                <View style={[ts.predFactorDot, { backgroundColor: fc }]} />
                <Text style={[ts.predFactorName, { color: fc }]}>{f.name}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
});

interface TrafficOperatorGuide {
  sourceId: TrafficSourceId;
  impactedUsers: number;
  impactedStep: string;
  likelyCause: string;
  nextAction: string;
  severityColor: string;
}

function getFrictionStepLabel(source: TrafficSourceSnapshot): string {
  const topFriction = source.frictions[0];
  if (!topFriction) {
    return 'Conversion quality';
  }

  switch (topFriction.type) {
    case 'slow_landing':
    case 'broken_cta':
      return 'Landing CTA';
    case 'failed_form':
      return 'Lead form';
    case 'auth_failure':
      return 'Auth';
    case 'handoff_failure':
      return 'App handoff';
    case 'api_failure':
      return 'API call';
    case 'chat_degradation':
      return 'Chat';
    case 'upload_failure':
      return 'Upload';
    case 'invest_stall':
      return 'Invest flow';
    default:
      return 'Traffic path';
  }
}

function getSafeAction(source: TrafficSourceSnapshot, prediction?: TrafficPrediction): string {
  const topFriction = source.frictions[0];

  switch (topFriction?.type) {
    case 'slow_landing':
      return 'Throttle this source and shift to the lighter landing path';
    case 'broken_cta':
      return 'Fail over to the safest CTA route and notify owner';
    case 'failed_form':
      return 'Reroute leads to backup capture while the form is checked';
    case 'auth_failure':
      return 'Alert owner/admin and keep traffic on landing until auth stabilizes';
    case 'handoff_failure':
      return 'Hold users on landing and retry the app handoff path';
    case 'api_failure':
      return 'Retry the backend path and shift new visitors to safe lead capture';
    case 'chat_degradation':
      return 'Keep chat in fallback mode and notify operators';
    case 'upload_failure':
      return 'Pause upload-heavy journeys and route to support';
    case 'invest_stall':
      return 'Monitor checkout friction and route users back to deals safely';
    default:
      break;
  }

  if ((prediction?.score ?? 0) >= 0.6) {
    return 'Watch this campaign closely and throttle if quality keeps falling';
  }

  return 'Monitor the source and keep traffic on the healthy path';
}

function deriveOperatorGuides(intel: TrafficIntelSnapshot): TrafficOperatorGuide[] {
  const predictionMap = new Map<TrafficSourceId, TrafficPrediction>();
  for (const prediction of intel.predictions) {
    predictionMap.set(prediction.sourceId, prediction);
  }

  return intel.sources
    .map((source) => {
      const prediction = predictionMap.get(source.sourceId);
      const topFriction = source.frictions[0];
      const hasIncident = Boolean(topFriction) || (prediction?.score ?? 0) >= 0.3;

      if (!hasIncident) {
        return null;
      }

      const severityColor = topFriction?.severity === 'critical' ? '#FF1744'
        : topFriction?.severity === 'high' ? '#FF6D00'
          : (prediction?.score ?? 0) >= 0.7 ? '#FF1744'
            : '#FFB300';

      return {
        sourceId: source.sourceId,
        impactedUsers: Math.max(source.activeNow, source.last5m, topFriction?.affectedUsers ?? 0),
        impactedStep: getFrictionStepLabel(source),
        likelyCause: topFriction ? FRICTION_LABELS[topFriction.type] : prediction?.prediction ?? 'Quality drift detected',
        nextAction: getSafeAction(source, prediction),
        severityColor,
      } satisfies TrafficOperatorGuide;
    })
    .filter((guide): guide is TrafficOperatorGuide => guide !== null)
    .sort((a, b) => b.impactedUsers - a.impactedUsers)
    .slice(0, 4);
}

export const TrafficIntelTab = memo(function TrafficIntelTab({ intel }: { intel: TrafficIntelSnapshot }) {
  const activeSources = useMemo(() =>
    intel.sources.filter(s => s.last1h > 0 || s.activeNow > 0).sort((a, b) => b.last1h - a.last1h),
    [intel.sources],
  );

  const activePredictions = useMemo(() =>
    intel.predictions.filter(p => p.score > 0.1).sort((a, b) => b.score - a.score),
    [intel.predictions],
  );

  const overallHealthColor = intel.overallQualityScore >= 60 ? '#00E676'
    : intel.overallQualityScore >= 30 ? '#FFB300' : '#FF1744';

  const operatorGuides = useMemo(() => deriveOperatorGuides(intel), [intel]);

  return (
    <View style={ts.root} testID="traffic-intel-tab">
      <View style={ts.overviewBanner}>
        <View style={ts.overviewRow}>
          <View style={ts.overviewStat}>
            <Text style={ts.overviewVal}>{formatNum(intel.totalVisitors)}</Text>
            <Text style={ts.overviewLbl}>ACTIVE</Text>
          </View>
          <View style={ts.overviewDiv} />
          <View style={ts.overviewStat}>
            <Text style={ts.overviewVal}>{formatNum(intel.totalAuthenticated)}</Text>
            <Text style={ts.overviewLbl}>AUTH</Text>
          </View>
          <View style={ts.overviewDiv} />
          <View style={ts.overviewStat}>
            <Text style={ts.overviewVal}>{formatNum(intel.totalAnonymous)}</Text>
            <Text style={ts.overviewLbl}>ANON</Text>
          </View>
          <View style={ts.overviewDiv} />
          <View style={ts.overviewStat}>
            <Text style={ts.overviewVal}>{activeSources.length}</Text>
            <Text style={ts.overviewLbl}>SOURCES</Text>
          </View>
          <View style={ts.overviewDiv} />
          <View style={ts.overviewStat}>
            <Text style={[ts.overviewVal, { color: overallHealthColor }]}>{intel.overallQualityScore}</Text>
            <Text style={ts.overviewLbl}>QUALITY</Text>
          </View>
        </View>
        <View style={ts.overviewMeta}>
          <View style={ts.overviewMetaChip}>
            <Text style={ts.overviewMetaLabel}>Top Source</Text>
            <Text style={[ts.overviewMetaVal, { color: TRAFFIC_SOURCE_META[intel.topSource].color }]}>
              {TRAFFIC_SOURCE_META[intel.topSource].label}
            </Text>
          </View>
          <View style={ts.overviewMetaChip}>
            <Text style={ts.overviewMetaLabel}>Top Intent</Text>
            <Text style={[ts.overviewMetaVal, { color: INTENT_COLORS[intel.topIntent] }]}>
              {INTENT_LABELS[intel.topIntent]}
            </Text>
          </View>
        </View>
      </View>

      <SourceNodeGraph intel={intel} />

      {activePredictions.length > 0 && (
        <View style={ts.predSection}>
          <Text style={ts.sectionTitle}>Predictive Alerts</Text>
          {activePredictions.slice(0, 5).map(p => (
            <PredictionChip key={p.sourceId} prediction={p} />
          ))}
        </View>
      )}

      {operatorGuides.length > 0 && (
        <View style={ts.opsSection} testID="traffic-operator-controls">
          <Text style={ts.sectionTitle}>Operator Controls</Text>
          {operatorGuides.map((guide) => {
            const meta = TRAFFIC_SOURCE_META[guide.sourceId];
            return (
              <View
                key={guide.sourceId}
                style={[ts.opsCard, { borderLeftColor: guide.severityColor }]}
                testID={`traffic-incident-${guide.sourceId}`}
              >
                <View style={ts.opsHeader}>
                  <View style={[ts.opsSourceBadge, { backgroundColor: meta.color + '12' }]}>
                    <AlertTriangle size={12} color={guide.severityColor} />
                    <Text style={[ts.opsSourceText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <View style={ts.opsUsers}>
                    <Users size={11} color={Colors.textTertiary} />
                    <Text style={ts.opsUsersText}>{guide.impactedUsers}</Text>
                  </View>
                </View>

                <View style={ts.opsRow}>
                  <Text style={ts.opsLabel}>Impacted Step</Text>
                  <Text style={ts.opsValue}>{guide.impactedStep}</Text>
                </View>

                <View style={ts.opsRow}>
                  <Text style={ts.opsLabel}>Likely Cause</Text>
                  <Text style={ts.opsValue}>{guide.likelyCause}</Text>
                </View>

                <View style={ts.opsAction}>
                  <Zap size={11} color="#00E676" />
                  <Text style={ts.opsActionText}>{guide.nextAction}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {activeSources.length > 0 && (
        <View style={ts.sourcesSection}>
          <Text style={ts.sectionTitle}>Traffic Sources ({activeSources.length})</Text>
          {activeSources.map(source => (
            <SourceCard key={source.sourceId} source={source} />
          ))}
        </View>
      )}

      {activeSources.length === 0 && (
        <View style={ts.emptyState}>
          <Target size={32} color={Colors.textTertiary} />
          <Text style={ts.emptyText}>No active traffic detected</Text>
          <Text style={ts.emptySub}>Traffic intelligence will populate as visitors arrive</Text>
        </View>
      )}
    </View>
  );
});

const ts = StyleSheet.create({
  root: { marginTop: 16 },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: '700' as const, marginBottom: 10 },

  overviewBanner: {
    borderRadius: 16, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', padding: 14, marginBottom: 14,
  },
  overviewRow: { flexDirection: 'row', alignItems: 'center' },
  overviewStat: { flex: 1, alignItems: 'center' },
  overviewVal: { color: Colors.text, fontSize: 17, fontWeight: '700' as const },
  overviewLbl: { color: Colors.textTertiary, fontSize: 8, fontWeight: '700' as const, marginTop: 2, letterSpacing: 0.5 },
  overviewDiv: { width: 1, height: 22, backgroundColor: '#1A1A1F' },
  overviewMeta: { flexDirection: 'row', gap: 10, marginTop: 12 },
  overviewMetaChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0A0A0E', borderWidth: 1, borderColor: '#1A1A1F',
  },
  overviewMetaLabel: { color: Colors.textTertiary, fontSize: 9, fontWeight: '600' as const },
  overviewMetaVal: { fontSize: 10, fontWeight: '700' as const },

  graphContainer: {
    borderRadius: 16, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F', padding: 14, marginBottom: 14,
  },
  graphTitle: { color: Colors.text, fontSize: 13, fontWeight: '700' as const, marginBottom: 10, letterSpacing: 0.3 },
  graphBody: { flexDirection: 'row', alignItems: 'flex-start', minHeight: NODE_GRAPH_HEIGHT },
  graphLeftCol: { width: SOURCE_NODE_W, gap: 6 },
  graphCenter: { flex: 1, paddingHorizontal: 6, paddingTop: 10, gap: 6, justifyContent: 'center' },
  graphRightCol: { width: MODULE_NODE_W, gap: 6 },
  graphEmpty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  graphEmptyText: { color: Colors.textTertiary, fontSize: 12, fontWeight: '600' as const },
  graphEmptySub: { color: Colors.textTertiary, fontSize: 10 },

  sourceNode: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 7,
    borderRadius: 10, backgroundColor: '#0A0A0E', borderWidth: 1,
  },
  sourceNodeCopy: { flex: 1 },
  sourceNodeLabel: { color: Colors.textSecondary, fontSize: 9, fontWeight: '600' as const },
  sourceNodeMeta: { color: Colors.textTertiary, fontSize: 8, marginTop: 1 },
  sourceNodeCount: { fontSize: 10, fontWeight: '700' as const },

  flowLineRow: { flexDirection: 'row', alignItems: 'center', height: 18 },

  moduleNode: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 7,
    borderRadius: 10, backgroundColor: '#0A0A0E', borderWidth: 1,
  },
  moduleNodeLabel: { color: Colors.textTertiary, fontSize: 9, fontWeight: '500' as const, flex: 1 },
  moduleNodeCount: { fontSize: 10, fontWeight: '700' as const },

  predSection: { marginBottom: 14 },
  predChip: {
    borderRadius: 12, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F',
    borderLeftWidth: 3, padding: 12, marginBottom: 8,
  },
  predChipHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  predChipSource: { fontSize: 12, fontWeight: '700' as const },
  predChipTrend: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  predChipTrendText: { fontSize: 9, fontWeight: '600' as const },
  predChipText: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16 },
  predFactors: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  predFactorBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1,
  },
  predFactorDot: { width: 4, height: 4, borderRadius: 2 },
  predFactorName: { fontSize: 8, fontWeight: '600' as const },

  opsSection: { marginBottom: 14 },
  opsCard: {
    borderRadius: 12, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F',
    borderLeftWidth: 3, padding: 12, marginBottom: 8,
  },
  opsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  opsSourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  opsSourceText: { fontSize: 11, fontWeight: '700' as const },
  opsUsers: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  opsUsersText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' as const },
  opsRow: { marginBottom: 6 },
  opsLabel: { color: Colors.textTertiary, fontSize: 8, fontWeight: '700' as const, letterSpacing: 0.4, marginBottom: 2 },
  opsValue: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16 },
  opsAction: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1A1A1F' },
  opsActionText: { color: '#00E676', fontSize: 11, fontWeight: '600' as const, flex: 1 },

  sourcesSection: { marginBottom: 14 },
  sourceCard: {
    borderRadius: 14, backgroundColor: '#0D0D12', borderWidth: 1, borderColor: '#1A1A1F',
    borderLeftWidth: 3, marginBottom: 10, overflow: 'hidden' as const,
  },
  sourceCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
  },
  sourceCardIconWrap: {
    width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  sourceCardInfo: { flex: 1 },
  sourceCardName: { color: Colors.text, fontSize: 13, fontWeight: '600' as const },
  sourceCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sourceCardHealthDot: { width: 5, height: 5, borderRadius: 2.5 },
  sourceCardHealthText: { color: Colors.textTertiary, fontSize: 9, fontWeight: '500' as const },
  sourceCardSep: { color: Colors.textTertiary, fontSize: 9 },
  sourceCardIntentText: { color: Colors.textTertiary, fontSize: 9 },
  sourceCardRight: { alignItems: 'center', gap: 4 },
  sourceCardActiveCount: { fontSize: 16, fontWeight: '800' as const },

  sourceCardBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  sourceCardStatsRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, backgroundColor: '#0A0A0E', padding: 10 },
  sourceCardStat: { flex: 1, alignItems: 'center' },
  sourceCardStatVal: { color: Colors.text, fontSize: 14, fontWeight: '700' as const },
  sourceCardStatLbl: { color: Colors.textTertiary, fontSize: 8, fontWeight: '600' as const, marginTop: 1 },
  sourceCardStatDiv: { width: 1, height: 20, backgroundColor: '#1A1A1F' },

  journeySection: { gap: 5 },
  journeySectionTitle: { color: Colors.textSecondary, fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.4, marginBottom: 4 },
  journeyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  journeyLabel: { color: Colors.textTertiary, fontSize: 9, width: 70 },
  journeyBarTrack: { flex: 1, height: 4, backgroundColor: '#1A1A1F', borderRadius: 2, overflow: 'hidden' as const },
  journeyBarFill: { height: 4, borderRadius: 2 },
  journeyCount: { color: Colors.text, fontSize: 9, fontWeight: '600' as const, width: 24, textAlign: 'right' as const },

  intentSection: { gap: 4 },
  intentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  intentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  intentChipDot: { width: 5, height: 5, borderRadius: 2.5 },
  intentChipLabel: { fontSize: 9, fontWeight: '600' as const },
  intentChipCount: { color: Colors.textTertiary, fontSize: 9, fontWeight: '600' as const },

  outcomeSection: { gap: 4 },
  outcomeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  outcomeCell: {
    width: '30%' as any, alignItems: 'center', paddingVertical: 6,
    borderRadius: 8, backgroundColor: '#0A0A0E',
  },
  outcomeCellVal: { color: Colors.text, fontSize: 13, fontWeight: '700' as const },
  outcomeCellLbl: { color: Colors.textTertiary, fontSize: 8, fontWeight: '600' as const, marginTop: 1 },

  frictionSection: { gap: 4 },
  frictionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  frictionDot: { width: 5, height: 5, borderRadius: 2.5 },
  frictionLabel: { color: Colors.textSecondary, fontSize: 10, flex: 1 },
  frictionCount: { fontSize: 10, fontWeight: '600' as const },
  frictionSev: { fontSize: 8, fontWeight: '700' as const, width: 44, textAlign: 'right' as const },

  pulseWrap: { width: 10, height: 10, justifyContent: 'center', alignItems: 'center' },
  pulseHalo: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  pulseDot: { width: 5, height: 5, borderRadius: 2.5 },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { color: Colors.textTertiary, fontSize: 13, fontWeight: '600' as const },
  emptySub: { color: Colors.textTertiary, fontSize: 11 },

  gauge: { justifyContent: 'center', alignItems: 'center' },
  gaugeOuter: { justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  gaugeInner: { justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
  gaugeText: { fontWeight: '800' as const },
});
