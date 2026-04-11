import { controlTowerEmitter } from './event-emitter';
import type {
  CTModuleId,
  CTModuleHealth,
  CTPredictiveScore,
  CTPredictiveFactor,
  CTHealthState,
} from './types';
import { CT_MODULE_LABELS } from './types';

const WINDOW_MS = 300_000;
const SCORE_HISTORY_SIZE = 30;
const RISK_THRESHOLDS = {
  latency: { normal: 500, elevated: 1500, critical: 3000 },
  errorRate: { normal: 0.02, elevated: 0.08, critical: 0.2 },
  retryRate: { normal: 0.05, elevated: 0.15, critical: 0.3 },
  fallbackRate: { normal: 0, elevated: 1, critical: 3 },
  stuckCount: { normal: 0, elevated: 2, critical: 5 },
  errorBurst: { normal: 1, elevated: 3, critical: 6 },
  reconnectLoops: { normal: 0, elevated: 2, critical: 5 },
};

interface ScoreHistoryEntry {
  score: number;
  timestamp: number;
}

const scoreHistory = new Map<CTModuleId, ScoreHistoryEntry[]>();

function getFactorStatus(value: number, thresholds: { normal: number; elevated: number; critical: number }): 'normal' | 'elevated' | 'critical' {
  if (value >= thresholds.critical) return 'critical';
  if (value >= thresholds.elevated) return 'elevated';
  return 'normal';
}

function computeFactorScore(value: number, thresholds: { normal: number; elevated: number; critical: number }): number {
  if (value <= thresholds.normal) return 0;
  if (value >= thresholds.critical) return 1;
  const range = thresholds.critical - thresholds.normal;
  return Math.min(1, (value - thresholds.normal) / range);
}

function getEventBurstCount(moduleId: CTModuleId): number {
  const events = controlTowerEmitter.getEventsByModule(moduleId);
  const now = Date.now();
  return events.filter(e => {
    const age = now - new Date(e.timestamp).getTime();
    return age <= WINDOW_MS && (e.type === 'action_fail' || e.type === 'critical_detected');
  }).length;
}

function getRetryCount(moduleId: CTModuleId): number {
  const events = controlTowerEmitter.getEventsByModule(moduleId);
  const now = Date.now();
  return events.filter(e => {
    const age = now - new Date(e.timestamp).getTime();
    return age <= WINDOW_MS && e.type === 'retry_triggered';
  }).length;
}

function getFallbackCount(moduleId: CTModuleId): number {
  const events = controlTowerEmitter.getEventsByModule(moduleId);
  const now = Date.now();
  return events.filter(e => {
    const age = now - new Date(e.timestamp).getTime();
    return age <= WINDOW_MS && e.type === 'fallback_entered';
  }).length;
}

function getReconnectCount(moduleId: CTModuleId): number {
  const events = controlTowerEmitter.getEventsByModule(moduleId);
  const now = Date.now();
  return events.filter(e => {
    const age = now - new Date(e.timestamp).getTime();
    return age <= WINDOW_MS && (e.type === 'recovered' || e.type === 'autoheal_triggered');
  }).length;
}

function computeTrend(moduleId: CTModuleId, currentScore: number): 'rising' | 'stable' | 'falling' {
  const history = scoreHistory.get(moduleId) || [];
  if (history.length < 3) return 'stable';

  const recent = history.slice(-5);
  const avgRecent = recent.reduce((s, e) => s + e.score, 0) / recent.length;
  const diff = currentScore - avgRecent;

  if (diff > 0.08) return 'rising';
  if (diff < -0.08) return 'falling';
  return 'stable';
}

function recordScore(moduleId: CTModuleId, score: number): void {
  if (!scoreHistory.has(moduleId)) {
    scoreHistory.set(moduleId, []);
  }
  const history = scoreHistory.get(moduleId)!;
  history.push({ score, timestamp: Date.now() });
  if (history.length > SCORE_HISTORY_SIZE) {
    history.splice(0, history.length - SCORE_HISTORY_SIZE);
  }
}

function estimateTimeToIncident(trend: 'rising' | 'stable' | 'falling', score: number): number | null {
  if (trend !== 'rising' || score < 0.3) return null;
  const remaining = 1.0 - score;
  const history = Array.from(scoreHistory.values()).flat();
  if (history.length < 5) return null;

  const sorted = history.sort((a, b) => a.timestamp - b.timestamp);
  const recent = sorted.slice(-10);
  if (recent.length < 2) return null;

  const timeDelta = (recent[recent.length - 1]!.timestamp - recent[0]!.timestamp) / 1000;
  const scoreDelta = recent[recent.length - 1]!.score - recent[0]!.score;

  if (scoreDelta <= 0 || timeDelta <= 0) return null;
  const rate = scoreDelta / timeDelta;
  const seconds = remaining / rate;
  return Math.max(30, Math.min(3600, Math.round(seconds)));
}

function buildPrediction(moduleId: CTModuleId, score: number, trend: 'rising' | 'stable' | 'falling', factors: CTPredictiveFactor[]): string {
  const label = CT_MODULE_LABELS[moduleId];
  const criticalFactors = factors.filter(f => f.status === 'critical');
  const elevatedFactors = factors.filter(f => f.status === 'elevated');

  if (score >= 0.7) {
    const top = criticalFactors[0]?.name || elevatedFactors[0]?.name || 'multiple signals';
    return `${label} likely to enter critical state — ${top}`;
  }
  if (score >= 0.4 && trend === 'rising') {
    return `${label} instability rising — monitor closely`;
  }
  if (score >= 0.3) {
    return `${label} showing elevated risk from ${elevatedFactors.length} factor(s)`;
  }
  if (trend === 'falling' && score > 0.1) {
    return `${label} recovering — risk declining`;
  }
  return `${label} stable`;
}

export function computePredictiveScore(moduleId: CTModuleId, health: CTModuleHealth | undefined): CTPredictiveScore {
  const latency = health?.latencyMs ?? 0;
  const errorRate = health?.errorRate ?? 0;
  const retryRate = health?.retryRate ?? 0;
  const errorBurst = getEventBurstCount(moduleId);
  const retryCount = getRetryCount(moduleId);
  const fallbackCount = getFallbackCount(moduleId);
  const reconnectCount = getReconnectCount(moduleId);

  const factors: CTPredictiveFactor[] = [
    {
      name: 'Latency',
      weight: 0.2,
      value: latency,
      threshold: RISK_THRESHOLDS.latency.critical,
      status: getFactorStatus(latency, RISK_THRESHOLDS.latency),
    },
    {
      name: 'Error Rate',
      weight: 0.25,
      value: errorRate,
      threshold: RISK_THRESHOLDS.errorRate.critical,
      status: getFactorStatus(errorRate, RISK_THRESHOLDS.errorRate),
    },
    {
      name: 'Retry Rate',
      weight: 0.15,
      value: retryCount,
      threshold: RISK_THRESHOLDS.retryRate.critical,
      status: getFactorStatus(retryCount, RISK_THRESHOLDS.retryRate),
    },
    {
      name: 'Error Bursts',
      weight: 0.2,
      value: errorBurst,
      threshold: RISK_THRESHOLDS.errorBurst.critical,
      status: getFactorStatus(errorBurst, RISK_THRESHOLDS.errorBurst),
    },
    {
      name: 'Fallback Activations',
      weight: 0.1,
      value: fallbackCount,
      threshold: RISK_THRESHOLDS.fallbackRate.critical,
      status: getFactorStatus(fallbackCount, RISK_THRESHOLDS.fallbackRate),
    },
    {
      name: 'Reconnect Loops',
      weight: 0.1,
      value: reconnectCount,
      threshold: RISK_THRESHOLDS.reconnectLoops.critical,
      status: getFactorStatus(reconnectCount, RISK_THRESHOLDS.reconnectLoops),
    },
  ];

  let weightedScore = 0;
  for (const f of factors) {
    const rawScore = computeFactorScore(f.value, {
      normal: f.name === 'Latency' ? RISK_THRESHOLDS.latency.normal :
              f.name === 'Error Rate' ? RISK_THRESHOLDS.errorRate.normal :
              f.name === 'Retry Rate' ? RISK_THRESHOLDS.retryRate.normal :
              f.name === 'Error Bursts' ? RISK_THRESHOLDS.errorBurst.normal :
              f.name === 'Fallback Activations' ? RISK_THRESHOLDS.fallbackRate.normal :
              RISK_THRESHOLDS.reconnectLoops.normal,
      elevated: f.name === 'Latency' ? RISK_THRESHOLDS.latency.elevated :
                f.name === 'Error Rate' ? RISK_THRESHOLDS.errorRate.elevated :
                f.name === 'Retry Rate' ? RISK_THRESHOLDS.retryRate.elevated :
                f.name === 'Error Bursts' ? RISK_THRESHOLDS.errorBurst.elevated :
                f.name === 'Fallback Activations' ? RISK_THRESHOLDS.fallbackRate.elevated :
                RISK_THRESHOLDS.reconnectLoops.elevated,
      critical: f.threshold,
    });
    weightedScore += rawScore * f.weight;
  }

  const score = Math.min(1, Math.max(0, weightedScore));
  const trend = computeTrend(moduleId, score);
  recordScore(moduleId, score);

  const eti = estimateTimeToIncident(trend, score);
  const prediction = buildPrediction(moduleId, score, trend, factors);

  const confidence = Math.min(0.95, 0.5 + (scoreHistory.get(moduleId)?.length ?? 0) * 0.015);

  console.log(`[CT:Predict] ${moduleId}: score=${score.toFixed(2)} trend=${trend} eti=${eti ?? 'n/a'}s confidence=${confidence.toFixed(2)}`);

  return {
    moduleId,
    score,
    trend,
    factors,
    prediction,
    confidence,
    estimatedTimeToIncident: eti,
  };
}

export function computeAllPredictions(
  moduleIds: CTModuleId[],
  healthMap: Map<CTModuleId, CTModuleHealth>,
): CTPredictiveScore[] {
  return moduleIds.map(id => computePredictiveScore(id, healthMap.get(id)));
}

export function computeSystemRiskScore(predictions: CTPredictiveScore[]): number {
  if (predictions.length === 0) return 0;
  const max = Math.max(...predictions.map(p => p.score));
  const avg = predictions.reduce((s, p) => s + p.score, 0) / predictions.length;
  return Math.min(1, max * 0.6 + avg * 0.4);
}

export function getHighRiskModules(predictions: CTPredictiveScore[], threshold: number = 0.4): CTPredictiveScore[] {
  return predictions.filter(p => p.score >= threshold).sort((a, b) => b.score - a.score);
}

export function getRisingRisks(predictions: CTPredictiveScore[]): CTPredictiveScore[] {
  return predictions.filter(p => p.trend === 'rising' && p.score > 0.2).sort((a, b) => b.score - a.score);
}
