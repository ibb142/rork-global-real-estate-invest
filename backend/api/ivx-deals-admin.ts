/**
 * IVX Deals Admin API — owner-only jv_deals management.
 *
 * Production RLS on `jv_deals` grants anon read access to published rows only;
 * authenticated owner sessions cannot read or patch rows directly through
 * PostgREST. These endpoints run with the service role key AFTER verifying the
 * caller is the IVX owner (same assertIVXOwnerOnly gate as the reels admin API).
 *
 * Routes:
 *   GET   /api/deals/admin/list      — every jv_deals row, any status
 *   PATCH /api/deals/admin/:dealId   — publish/unpublish/archive/status edits
 */

const DEALS_ADMIN_MARKER = 'ivx-deals-admin-v1';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

export function dealsAdminOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function supabaseBase(): string {
  return (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://kvclcdjmjghndxsngfzb.supabase.co')
    .trim()
    .replace(/\/+$/, '');
}

function serviceKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '').trim();
}

async function sbFetch(path: string, key: string, init?: RequestInit): Promise<Response> {
  return fetch(`${supabaseBase()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
}

async function requireOwner(request: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  try {
    const { assertIVXOwnerOnly } = await import('./owner-only');
    await assertIVXOwnerOnly(request);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner authorization failed.';
    return { ok: false, response: json({ ok: false, marker: DEALS_ADMIN_MARKER, error: message }, 401) };
  }
}

export async function handleDealsAdminList(request: Request): Promise<Response> {
  const owner = await requireOwner(request);
  if (!owner.ok) return owner.response;
  const svc = serviceKey();
  if (!svc) return json({ ok: false, marker: DEALS_ADMIN_MARKER, error: 'Service credentials not bound.' }, 503);

  const select = 'id,title,project_name,status,published,expected_roi,total_investment,min_investment,city,state,created_at';
  const res = await sbFetch(`jv_deals?select=${encodeURIComponent(select)}&order=created_at.desc&limit=200`, svc)
    .catch(() => null);
  if (!res || !res.ok) {
    const detail = res ? `HTTP ${res.status}` : 'network failure';
    return json({ ok: false, marker: DEALS_ADMIN_MARKER, error: `admin deals list failed: ${detail}` }, 502);
  }
  const deals = await res.json().catch(() => []) as unknown[];
  return json({
    ok: true,
    marker: DEALS_ADMIN_MARKER,
    total: Array.isArray(deals) ? deals.length : 0,
    deals,
    timestamp: new Date().toISOString(),
  });
}

const DEAL_ADMIN_EDITABLE_FIELDS = new Set(['published', 'status', 'published_at', 'display_order']);
const DEAL_ALLOWED_STATUSES = new Set(['active', 'draft', 'archived', 'closed', 'funded']);

export async function handleDealsAdminUpdate(request: Request, dealId: string): Promise<Response> {
  const owner = await requireOwner(request);
  if (!owner.ok) return owner.response;
  const svc = serviceKey();
  if (!svc) return json({ ok: false, marker: DEALS_ADMIN_MARKER, error: 'Service credentials not bound.' }, 503);

  const id = String(dealId ?? '').trim();
  if (!id) return json({ ok: false, marker: DEALS_ADMIN_MARKER, error: 'dealId is required.' }, 400);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(body)) {
    const key = rawKey.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (!DEAL_ADMIN_EDITABLE_FIELDS.has(key)) continue;
    patch[key] = value;
  }
  if ('status' in patch && !DEAL_ALLOWED_STATUSES.has(String(patch.status))) {
    return json({ ok: false, marker: DEALS_ADMIN_MARKER, error: `Invalid status. Valid: ${[...DEAL_ALLOWED_STATUSES].join(', ')}.` }, 400);
  }
  if (Object.keys(patch).length === 0) {
    return json({ ok: false, marker: DEALS_ADMIN_MARKER, error: `No editable fields in payload. Editable: ${[...DEAL_ADMIN_EDITABLE_FIELDS].join(', ')}.` }, 400);
  }

  const res = await sbFetch(`jv_deals?id=eq.${encodeURIComponent(id)}`, svc, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  }).catch(() => null);
  if (!res || !res.ok) {
    const detail = res ? `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 240)}` : 'network failure';
    return json({ ok: false, marker: DEALS_ADMIN_MARKER, error: `deal update failed: ${detail}` }, 502);
  }
  const rows = await res.json().catch(() => []) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return json({ ok: false, marker: DEALS_ADMIN_MARKER, error: `Deal "${id}" was not found — nothing was updated.` }, 404);
  }
  return json({ ok: true, marker: DEALS_ADMIN_MARKER, deal: rows[0], timestamp: new Date().toISOString() });
}