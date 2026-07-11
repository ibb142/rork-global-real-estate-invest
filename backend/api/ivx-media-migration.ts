/**
 * IVX Media Migration API.
 *
 * GET  /api/ivx/media-migration/status — read-only migration + integrity state
 *      (no secrets; safe for public QA verification).
 * POST /api/ivx/media-migration/apply  — re-runs the fixed idempotent embedded
 *      migration. Requires the explicit confirm header so it cannot be
 *      triggered by accident; it can never execute request-supplied SQL.
 */
import {
  getMediaMigrationState,
  refreshMediaMigrationVerification,
  runCanonicalMediaMigration,
} from '../services/ivx-canonical-media-migration';

const CONFIRM_HEADER = 'x-ivx-migration-confirm';
const CONFIRM_VALUE = 'CONFIRM_CANONICAL_MEDIA_MIGRATION';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': `Content-Type, ${CONFIRM_HEADER}`,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}

async function readIntegrityView(): Promise<Record<string, unknown> | null> {
  const url = (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !key) return null;
  try {
    const response = await fetch(`${url}/rest/v1/ivx_project_integrity?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const rows = await response.json() as Record<string, unknown>[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function handleMediaMigrationStatusRequest(): Promise<Response> {
  const migrationState = await refreshMediaMigrationVerification();
  const integrity = await readIntegrityView();
  return json({
    ok: true,
    marker: 'ivx-canonical-media-migration-v1',
    migration: migrationState,
    integrity,
    timestamp: new Date().toISOString(),
  });
}

export async function handleMediaMigrationApplyRequest(request: Request): Promise<Response> {
  const confirm = request.headers.get(CONFIRM_HEADER)?.trim() ?? '';
  if (confirm !== CONFIRM_VALUE) {
    return json({
      ok: false,
      error: `Confirmation required. Send header ${CONFIRM_HEADER}: ${CONFIRM_VALUE}`,
      note: 'This endpoint only re-applies the fixed idempotent canonical media migration; it never executes request-supplied SQL.',
    }, 409);
  }
  const result = await runCanonicalMediaMigration();
  const integrity = await readIntegrityView();
  return json({
    ok: result.status === 'applied',
    marker: 'ivx-canonical-media-migration-v1',
    migration: result,
    integrity,
    timestamp: new Date().toISOString(),
  }, result.status === 'applied' ? 200 : 502);
}
