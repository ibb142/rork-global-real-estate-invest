import type {
  TrafficSourceId,
  TrafficSourceSnapshot,
  TrafficPrediction,
  TrafficPredictiveFactor,
} from './traffic-types';
import { TRAFFIC_SOURCE_META } from './traffic-types';

const SCORE_HISTORY_SIZE = 20;
const HIGH_TRAFFIC_THRESHOLD = 10;

interface SourceScoreEntry {
  score: number;
  timestamp: number;
  activeNow: number;
  qualityScore: number;
  bounceRate: number;
  frictionCount: number;
}

const sourceScoreHistory = new Map<TrafficSourceId, SourceScoreEntry[]>();
let lastPredictionRun = 0;

function recordEntry(sourceId: TrafficSourceId, entry: SourceScoreEntry): void {
  if (!sourceScoreHistory.has(sourceId)) {
    sourceScoreHistory.set(sourceId, []);
  }
  const history = sourceScoreHistory.get(sourceId)!;
  history.push(entry);
  if (history.length > SCORE_HISTORY_SIZE) {
    history.splice(0, history.length - SCORE_HISTORY_SIZE);
  }
}

function computeTrend(sourceId: TrafficSourceId, currentScore: number): 'rising' | 'stable' | 'falling' {
  const history = sourceScoreHistory.get(sourceId) || [];
  if (history.length < 3) return 'stable';
  const recent = history.slice(-5);
  const avg = recent.reduce((s, e) => s + e.score, 0) / recent.length;
  const diff = currentScore - avg;
  if (diff > 0.1) return 'rising';
  if (diff < -0.1) return 'falling';
  return 'stable';
}

function getFactorStatus(value: number, normal: number, elevated: number, critical: number): 'normal' | 'elevated' | 'critical' {
  if (value >= critical) return 'critical';
  if (value >= elevated) return 'elevated';
  return 'normal';
}

function scoreFromRange(value: number, normal: number, critical: number): number {
  if (value <= normal) return 0;
  if (value >= critical) return 1;
  return (value - normal) / (critical - normal);
}

function detectVolumeQualityMismatch(source: TrafficSourceSnapshot): TrafficPredictiveFactor | null {
  if (source.last1h < 3) return null;
  const qualityDrop = source.qualityScore < 20 && source.last1h > 5;
  const highBounce = source.outcomes.bounceRate > 70 && source.last1h > 5;

  if (qualityDrop || highBounce) {
    return {
      name: 'Volume-Quality Mismatch',
      value: highBounce ? source.outcomes.bounceRate : 100 - source.qualityScore,
      status: qualityDrop ? 'critical' : 'elevated',
    };
  }
  return null;
}

function detectFunnelBlockage(source: TrafficSourceSnapshot): TrafficPredictiveFactor | null {
  if (source.journeySteps.cta_clicked && !source.journeySteps.form_started && (source.journeySteps.cta_clicked ?? 0) > 3) {
    return {
      name: 'CTA-to-Form Blockage',
      value: source.journeySteps.cta_clicked ?? 0,
      status: 'critical',
    };
  }

  if (source.journeySteps.form_started && !source.journeySteps.form_submitted && (source.journeySteps.form_started ?? 0) > 2) {
    return {
      name: 'Form Submit Failure',
      value: source.journeySteps.form_started ?? 0,
      status: 'elevated',
    };
  }

  return null;
}

function detectCampaignMismatch(source: TrafficSourceSnapshot): TrafficPredictiveFactor | null {
  const isPaid = source.sourceId === 'google_ads' || source.sourceId === 'influencer';
  if (!isPaid) return null;

  if (source.last1h > 3 && source.outcomes.investInitRate === 0 && source.outcomes.signupConversion < 10) {
    return {
      name: 'Campaign Mismatch',
      value: source.last1h,
      status: 'critical',
    };
  }
  return null;
}

function buildPredictionText(
  source: TrafficSourceSnapshot,
  score: number,
  trend: 'rising' | 'stable' | 'falling',
  factors: TrafficPredictiveFactor[],
): string {
  const label = TRAFFIC_SOURCE_META[source.sourceId].label;
  const criticals = factors.filter(f => f.status === 'critical');
  const elevated = factors.filter(f => f.status === 'elevated');

  if (score >= 0.7 && criticals.length > 0) {
    return `${label} traffic degraded — ${criticals[0]!.name}`;
  }
  if (score >= 0.5 && trend === 'rising') {
    return `${label} quality declining — monitor conversion path`;
  }
  if (score >= 0.3 && elevated.length > 0) {
    return `${label} showing elevated risk: ${elevated.map(f => f.name).join(', ')}`;
  }
  if (trend === 'falling' && score > 0.1) {
    return `${label} recovering — risk declining`;
  }
  if (source.last1h > 0 && source.qualityScore > 60) {
    return `${label} healthy — high-quality traffic`;
  }
  return `${label} stable`;
}

export function computeSourcePrediction(source: TrafficSourceSnapshot): TrafficPrediction {
  const factors: TrafficPredictiveFactor[] = [];

  factors.push({
    name: 'Bounce Rate',
    value: source.outcomes.bounceRate,
    status: getFactorStatus(source.outcomes.bounceRate, 30, 60, 80),
  });

  factors.push({
    name: 'Friction Count',
    value: source.frictions.length,
    status: getFactorStatus(source.frictions.length, 0, 2, 4),
  });

  factors.push({
    name: 'Quality Score',
    value: 100 - source.qualityScore,
    status: getFactorStatus(100 - source.qualityScore, 40, 70, 90),
  });

  const vqm = detectVolumeQualityMismatch(source);
  if (vqm) factors.push(vqm);

  const funnel = detectFunnelBlockage(source);
  if (funnel) factors.push(funnel);

  const campaign = detectCampaignMismatch(source);
  if (campaign) factors.push(campaign);

  let weightedScore = 0;
  const critCount = factors.filter(f => f.status === 'critical').length;
  const elevCount = factors.filter(f => f.status === 'elevated').length;

  weightedScore += scoreFromRange(source.outcomes.bounceRate, 30, 80) * 0.25;
  weightedScore += scoreFromRange(source.frictions.length, 0, 4) * 0.2;
  weightedScore += scoreFromRange(100 - source.qualityScore, 40, 90) * 0.2;
  weightedScore += critCount * 0.15;
  weightedScore += elevCount * 0.05;

  const score = Math.min(1, Math.max(0, weightedScore));
  const trend = computeTrend(source.sourceId, score);

  recordEntry(source.sourceId, {
    score,
    timestamp: Date.now(),
    activeNow: source.activeNow,
    qualityScore: source.qualityScore,
    bounceRate: source.outcomes.bounceRate,
    frictionCount: source.frictions.length,
  });

  const history = sourceScoreHistory.get(source.sourceId) || [];
  const confidence = Math.min(0.95, 0.4 + history.length * 0.025);

  const prediction = buildPredictionText(source, score, trend, factors);

  return {
    sourceId: source.sourceId,
    score,
    trend,
    prediction,
    confidence,
    factors,
  };
}

export function computeAllSourcePredictions(sources: TrafficSourceSnapshot[]): TrafficPrediction[] {
  return sources
    .filter(s => s.last1h > 0 || s.activeNow > 0)
    .map(s => computeSourcePrediction(s));
}

export function shouldRunPredictions(totalActiveVisitors: number): boolean {
  const now = Date.now();
  const isHighTraffic = totalActiveVisitors >= HIGH_TRAFFIC_THRESHOLD;
  const interval = isHighTraffic ? 10_000 : 60_000;

  if (now - lastPredictionRun < interval) return false;
  lastPredictionRun = now;
  return true;
}

export function getSourceRisks(predictions: TrafficPrediction[], threshold: number = 0.3): TrafficPrediction[] {
  return predictions.filter(p => p.score >= threshold).sort((a, b) => b.score - a.score);
}

export function getRisingSourceRisks(predictions: TrafficPrediction[]): TrafficPrediction[] {
  return predictions.filter(p => p.trend === 'rising' && p.score > 0.2).sort((a, b) => b.score - a.score);
}
