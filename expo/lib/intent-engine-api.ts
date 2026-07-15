/**
 * IVX Intent Engine API client — admin & public helpers for the 8-phase
 * Global Intent Capture Engine. Uses the same auth pattern as other admin
 * screens (Supabase session → Bearer token).
 */
import { supabase } from '@/lib/supabase';
import { getIVXOwnerAIResolvedEndpoint } from '@/lib/ivx-supabase-client';

const API_BASE = getIVXOwnerAIResolvedEndpoint() ?? 'https://api.ivxholding.com';

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export interface IntentDashboard {
  metrics: {
    total_keywords: number;
    total_landing_pages: number;
    total_content: number;
    total_visitors: number;
    total_conversations: number;
    total_registrations: number;
    total_qualified_investors: number;
    total_meetings: number;
    capital_pipeline: number;
    ai_conversation_volume: number;
    conversion_rate: number;
  };
  top_keywords: { keyword: string; volume: number; intent_score: number; cluster: string; country: string }[];
  top_landing_pages: { slug: string; title: string; visitors: number; registrations: number; language: string }[];
  top_countries: { country: string; keyword_count: number; visitor_count: number }[];
  cluster_summary: { cluster: string; keyword_count: number; total_volume: number; avg_intent_score: number }[];
  recent_optimizations: {
    id: string;
    run_type: string;
    keywords_discovered: number;
    pages_created: number;
    pages_updated: number;
    pages_declined: number;
    new_countries: number;
    campaigns_recommended: number;
    status: string;
    completed_at: string;
  }[];
  languages_active: string[];
}

export interface PhaseResult {
  phase: number;
  keywords_discovered?: number;
  keywords_upserted?: number;
  total_keywords_in_db?: number;
  categories_covered?: number;
  countries_covered?: number;
  clusters_computed?: number;
  cluster_summary?: { cluster: string; keyword_count: number; total_volume: number; avg_intent_score: number; estimated_capital: number }[];
  pages_created?: number;
  total_pages?: number;
  pages?: { slug: string; title: string; language: string }[];
  content_created?: number;
  content_types?: string[];
  pieces?: { type: string; title: string; slug: string }[];
  pages_updated?: number;
  pages_declined?: number;
  new_countries?: number;
  campaigns_recommended?: number;
  executive_report?: {
    date: string;
    top_keywords: { keyword: string; volume: number; intent_score: number }[];
    top_landing_pages: { slug: string; visitors: number; registrations: number }[];
    visitors_today: number;
    registrations: number;
    qualified_investors: number;
    meetings: number;
    capital_pipeline: number;
    seo_growth: string;
    ai_conversation_volume: number;
    conversion_rate: number;
    recommendations: string[];
  };
}

async function ownerPost(path: string): Promise<Record<string, unknown>> {
  const token = await getAuthToken();
  if (!token) throw new Error('Owner session required. Sign in first.');
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok || !json.ok) {
    throw new Error((json.error as string) ?? `HTTP ${res.status}`);
  }
  return json;
}

export async function fetchIntentDashboard(): Promise<IntentDashboard> {
  const token = await getAuthToken();
  if (!token) throw new Error('Owner session required. Sign in first.');
  const res = await fetch(`${API_BASE}/api/ivx/intent-engine/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok || !json.ok) {
    throw new Error((json.error as string) ?? `HTTP ${res.status}`);
  }
  return (json.result ?? json) as IntentDashboard;
}

export async function runPhase1(): Promise<PhaseResult> {
  const json = await ownerPost('/api/ivx/intent-engine/phase1');
  return json.result as PhaseResult;
}

export async function runPhase2(): Promise<PhaseResult> {
  const json = await ownerPost('/api/ivx/intent-engine/phase2');
  return json.result as PhaseResult;
}

export async function runPhase3(): Promise<PhaseResult> {
  const json = await ownerPost('/api/ivx/intent-engine/phase3');
  return json.result as PhaseResult;
}

export async function runPhase4(): Promise<PhaseResult> {
  const json = await ownerPost('/api/ivx/intent-engine/phase4');
  return json.result as PhaseResult;
}

export async function runPhase8(): Promise<PhaseResult> {
  const json = await ownerPost('/api/ivx/intent-engine/phase8');
  return json.result as PhaseResult;
}

export async function fetchIntentStatus(): Promise<{ configured: boolean; engine: string; phases: string[] }> {
  const res = await fetch(`${API_BASE}/api/ivx/intent-engine/status`);
  const json = await res.json() as Record<string, unknown>;
  return {
    configured: Boolean(json.configured),
    engine: (json.engine as string) ?? 'unknown',
    phases: (json.phases as string[]) ?? [],
  };
}
