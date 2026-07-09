/**
 * GET /api/ivx/members/count
 * Returns live Supabase member + waitlist counts.
 *
 * Response:
 *   {
 *     "ok": true,
 *     "members_count": number,
 *     "waitlist_count": number,
 *     "source": "supabase",
 *     "timestamp": "...",
 *     "commit": "..."
 *   }
 */
import {
  resolveIVXAuthenticatedRequest,
  type IVXAuthenticatedRequestContext,
} from '@/shared/ivx';
import {
  jsonResponse,
  handleApiError,
  JSON_HEADERS,
} from '@/lib/ivx-owner-variables-server';

const DEPLOYMENT_MARKER = 'ivx-members-count-2026-07-08t2300z';

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getCommitShort(): string {
  const full = readTrimmed(process.env.GIT_COMMIT) || readTrimmed(process.env.COMMIT_SHA);
  return full ? full.slice(0, 8) : 'unknown';
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export function HEAD(): Response {
  return new Response(null, { status: 200, headers: { ...JSON_HEADERS, 'Content-Length': '0' } });
}

async function fetchCount(
  auth: IVXAuthenticatedRequestContext,
  table: string,
): Promise<number> {
  const { count, error } = await auth.client
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.log(`[MembersCount] ${table} error:`, error.message);
    throw new Error(`Failed to read ${table}: ${error.message}`);
  }
  return count ?? 0;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await resolveIVXAuthenticatedRequest(request, '[MembersCount]');
    const [membersCount, waitlistCount] = await Promise.all([
      fetchCount(auth, 'members').catch(() => 0),
      fetchCount(auth, 'waitlist').catch(() => 0),
    ]);

    const payload = {
      ok: true,
      members_count: membersCount,
      waitlist_count: waitlistCount,
      source: 'supabase',
      timestamp: new Date().toISOString(),
      commit: getCommitShort(),
      deploymentMarker: DEPLOYMENT_MARKER,
      secretValuesReturned: false as const,
    };

    return jsonResponse(payload as unknown as Record<string, unknown>);
  } catch (error) {
    return handleApiError(error);
  }
}
