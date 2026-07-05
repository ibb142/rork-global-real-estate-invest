/**
 * IVX Canonical Members API
 *
 * Routes:
 *   GET  /api/ivx/members/registry   → canonical members list (search/type/verified filters)
 *   GET  /api/ivx/members/summary    → counts by type/source/verification
 *   POST /api/ivx/members/backfill   → sync every landing registration into public.members
 */

import {
  listCanonicalMembers,
  backfillCanonicalMembers,
  countCanonicalMembers,
  isCanonicalMembersConfigured,
  type ListMembersOptions,
} from '../services/ivx-canonical-members';

const DEPLOYMENT_MARKER = 'ivx-canonical-members-api-v1';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function handleCanonicalMembersRegistry(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const options: ListMembersOptions = {
    search: url.searchParams.get('search') || undefined,
    memberType: url.searchParams.get('type') || undefined,
    verified: (url.searchParams.get('verified') as ListMembersOptions['verified']) || undefined,
    limit: Number(url.searchParams.get('limit') || '1000') || 1000,
  };
  const members = await listCanonicalMembers(options);
  return jsonResponse({
    ok: true,
    configured: isCanonicalMembersConfigured(),
    total: members.length,
    members,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

export async function handleCanonicalMembersSummary(): Promise<Response> {
  const members = await listCanonicalMembers({ limit: 2000 });
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let smsVerified = 0;
  let verified = 0;
  for (const member of members) {
    byType[member.member_type] = (byType[member.member_type] ?? 0) + 1;
    bySource[member.source] = (bySource[member.source] ?? 0) + 1;
    if (member.sms_verified) smsVerified += 1;
    if (member.verification_status === 'verified') verified += 1;
  }
  return jsonResponse({
    ok: true,
    total: await countCanonicalMembers(),
    byType,
    bySource,
    smsVerified,
    verified,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

export async function handleCanonicalMembersBackfill(): Promise<Response> {
  const result = await backfillCanonicalMembers();
  return jsonResponse({ ...result, deploymentMarker: DEPLOYMENT_MARKER }, result.ok ? 200 : 207);
}
