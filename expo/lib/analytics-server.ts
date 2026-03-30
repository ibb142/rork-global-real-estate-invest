import { supabase, isSupabaseConfigured } from './supabase';
import { isProduction } from './environment';

export interface ServerAnalyticsOverview {
  total_events: number;
  unique_sessions: number;
  page_views: number;
  form_submits: number;
  conversion_rate: number;
  bounce_rate: number;
  avg_session_duration: number;
}

export interface ServerGeoBreakdown {
  country: string;
  count: number;
  pct: number;
}

export interface ServerSourceBreakdown {
  source: string;
  sessions: number;
  leads: number;
  conversion_rate: number;
}

export interface ServerLeadSummary {
  total_leads: number;
  waitlist_count: number;
  registered_count: number;
  hot_leads: number;
  warm_leads: number;
}

export interface ServerAnalyticsResult<T> {
  data: T | null;
  error: string | null;
  source: 'server' | 'client_fallback';
}

async function callRpc<T>(fnName: string, params: Record<string, unknown>): Promise<ServerAnalyticsResult<T>> {
  if (!isSupabaseConfigured()) {
    const msg = `[AnalyticsServer] Supabase not configured. Cannot call RPC: ${fnName}`;
    if (isProduction()) {
      console.error(msg);
    } else {
      console.warn(msg);
    }
    return { data: null, error: 'Supabase not configured', source: 'client_fallback' };
  }

  try {
    const { data, error } = await supabase.rpc(fnName, params);

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42883') {
        console.warn(`[AnalyticsServer] RPC function "${fnName}" not found (code: ${error.code}). Deploy it to Supabase SQL editor to enable server-side aggregation. Falling back to client-side compute.`);
        return { data: null, error: `RPC ${fnName} not deployed — using client_fallback`, source: 'client_fallback' };
      }
      console.error(`[AnalyticsServer] RPC "${fnName}" failed (code: ${error.code}):`, error.message, '— falling back to client-side compute');
      return { data: null, error: error.message, source: 'client_fallback' };
    }

    console.log(`[AnalyticsServer] RPC "${fnName}" success`);
    return { data: data as T, error: null, source: 'server' };
  } catch (err) {
    console.error(`[AnalyticsServer] RPC "${fnName}" exception:`, (err as Error)?.message);
    return { data: null, error: (err as Error)?.message ?? 'Unknown error', source: 'client_fallback' };
  }
}

export async function fetchServerOverview(period: string): Promise<ServerAnalyticsResult<ServerAnalyticsOverview>> {
  return callRpc<ServerAnalyticsOverview>('analytics_overview', { p_period: period });
}

export async function fetchServerGeo(period: string): Promise<ServerAnalyticsResult<ServerGeoBreakdown[]>> {
  return callRpc<ServerGeoBreakdown[]>('analytics_geo_breakdown', { p_period: period });
}

export async function fetchServerSources(period: string): Promise<ServerAnalyticsResult<ServerSourceBreakdown[]>> {
  return callRpc<ServerSourceBreakdown[]>('analytics_source_breakdown', { p_period: period });
}

export async function fetchServerLeads(period: string): Promise<ServerAnalyticsResult<ServerLeadSummary>> {
  return callRpc<ServerLeadSummary>('analytics_lead_summary', { p_period: period });
}

export async function fetchServerLiveCount(): Promise<ServerAnalyticsResult<number>> {
  return callRpc<number>('analytics_live_count', {});
}

export const SUPABASE_RPC_SQL = `
-- Overview metrics (deploy to Supabase SQL editor)
CREATE OR REPLACE FUNCTION analytics_overview(p_period text)
RETURNS json AS $$
DECLARE
  cutoff timestamptz;
  result json;
BEGIN
  cutoff := CASE p_period
    WHEN '1h' THEN now() - interval '1 hour'
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d' THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    ELSE '1970-01-01'::timestamptz
  END;

  SELECT json_build_object(
    'total_events', COUNT(*),
    'unique_sessions', COUNT(DISTINCT session_id),
    'page_views', COUNT(*) FILTER (WHERE event IN ('page_view', 'pageview', 'landing_page_view', 'screen_view')),
    'form_submits', COUNT(*) FILTER (WHERE event IN ('form_submit', 'form_submitted', 'waitlist_join', 'waitlist_success')),
    'conversion_rate', CASE 
      WHEN COUNT(*) FILTER (WHERE event IN ('page_view', 'pageview', 'landing_page_view', 'screen_view')) > 0 
      THEN ROUND(
        (COUNT(*) FILTER (WHERE event IN ('form_submit', 'form_submitted', 'waitlist_join', 'waitlist_success'))::numeric /
         COUNT(*) FILTER (WHERE event IN ('page_view', 'pageview', 'landing_page_view', 'screen_view'))::numeric) * 100, 1
      )
      ELSE 0
    END
  ) INTO result
  FROM landing_analytics
  WHERE created_at >= cutoff;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Geo breakdown
CREATE OR REPLACE FUNCTION analytics_geo_breakdown(p_period text)
RETURNS json AS $$
DECLARE
  cutoff timestamptz;
  result json;
BEGIN
  cutoff := CASE p_period
    WHEN '1h' THEN now() - interval '1 hour'
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d' THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    ELSE '1970-01-01'::timestamptz
  END;

  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
  FROM (
    SELECT 
      geo->>'country' as country,
      COUNT(*) as count,
      ROUND((COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER(), 0)) * 100, 1) as pct
    FROM landing_analytics
    WHERE created_at >= cutoff AND geo->>'country' IS NOT NULL
    GROUP BY geo->>'country'
    ORDER BY count DESC
    LIMIT 50
  ) t;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lead summary
CREATE OR REPLACE FUNCTION analytics_lead_summary(p_period text)
RETURNS json AS $$
DECLARE
  cutoff timestamptz;
  result json;
BEGIN
  cutoff := CASE p_period
    WHEN '1h' THEN now() - interval '1 hour'
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d' THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    ELSE '1970-01-01'::timestamptz
  END;

  SELECT json_build_object(
    'total_leads', (SELECT COUNT(*) FROM waitlist) + (SELECT COUNT(*) FROM profiles),
    'waitlist_count', (SELECT COUNT(*) FROM waitlist),
    'registered_count', (SELECT COUNT(*) FROM profiles),
    'hot_leads', COUNT(DISTINCT session_id) FILTER (WHERE event IN ('form_submit', 'form_submitted', 'waitlist_join', 'waitlist_success')),
    'warm_leads', COUNT(DISTINCT session_id) FILTER (WHERE event LIKE 'cta_%' AND event NOT IN ('form_submit', 'form_submitted'))
  ) INTO result
  FROM landing_analytics
  WHERE created_at >= cutoff;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;
