/**
 * IVX Members Count API Handler
 *
 * Endpoint:
 *   GET /api/ivx/members/count  - Returns live member and waitlist counts from Supabase.
 *
 * This is a public read-only endpoint (no owner auth required) that returns
 * aggregate counts only — no PII or secret values.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEPLOYMENT_MARKER = 'ivx-members-count-v1';

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    },
  });
}

export function membersCountOptions(): Response {
  return jsonResponse({ deploymentMarker: DEPLOYMENT_MARKER }, 204);
}

export async function handleMembersCountRequest(request: Request): Promise<Response> {
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return membersCountOptions();
  }

  if (method === 'HEAD') {
    return new Response(null, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (method !== 'GET') {
    return jsonResponse(
      { ok: false, error: 'Method not allowed', deploymentMarker: DEPLOYMENT_MARKER },
      405,
    );
  }

  const supabase = getSupabaseAdmin();

  let membersCount = 0;
  let waitlistCount = 0;
  const errors: string[] = [];

  // Count registered members from profiles table
  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[MembersCount] profiles count error:', error.message);
      errors.push(`profiles: ${error.message}`);
    } else {
      membersCount = count ?? 0;
    }
  } catch (err) {
    console.error('[MembersCount] profiles count exception:', err);
    errors.push(`profiles: ${err instanceof Error ? err.message : 'exception'}`);
  }

  // Count waitlist entries (try waitlist_entries first, then waitlist as fallback)
  try {
    const { count: wlCount, error: wlError } = await supabase
      .from('waitlist_entries')
      .select('*', { count: 'exact', head: true });

    if (wlError) {
      console.error('[MembersCount] waitlist_entries count error:', wlError.message);
      // Fallback to waitlist table
      const { count: wlCount2, error: wlError2 } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true });

      if (wlError2) {
        console.error('[MembersCount] waitlist count error:', wlError2.message);
        errors.push(`waitlist: ${wlError2.message}`);
      } else {
        waitlistCount = wlCount2 ?? 0;
      }
    } else {
      waitlistCount = wlCount ?? 0;
    }
  } catch (err) {
    console.error('[MembersCount] waitlist count exception:', err);
    errors.push(`waitlist: ${err instanceof Error ? err.message : 'exception'}`);
  }

  return jsonResponse({
    ok: true,
    members_count: membersCount,
    waitlist_count: waitlistCount,
    source: 'supabase',
    timestamp: new Date().toISOString(),
    deploymentMarker: DEPLOYMENT_MARKER,
    ...(errors.length > 0 ? { warnings: errors } : {}),
  });
}
