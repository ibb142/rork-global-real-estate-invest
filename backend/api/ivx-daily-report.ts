/**
 * IVX Daily Executive Report API (owner-only).
 *
 *   GET  /api/ivx/daily-report          → latest stored report (generates one on
 *                                          first call if none exists today).
 *   POST /api/ivx/daily-report          → force-generate a fresh report now.
 *   GET  /api/ivx/daily-report/history  → recent report history (proof trail).
 *
 * Owner-only. Read/derive only — composes existing engines; never fabricates and
 * never deploys. The report itself is the proof: it carries reportId, timestamp,
 * trigger, and the exact sources scanned.
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import {
  generateAndStoreDailyReport,
  getLatestReport,
  listReportHistory,
} from '../services/ivx-daily-executive-report';

export const OPTIONS = (): Response => ownerOnlyOptions();

async function requireOwner(request: Request): Promise<Response | null> {
  try {
    const owner = await assertIVXOwnerOnly(request);
    if (!owner.userId) {
      return ownerOnlyJson({ ok: false, error: 'IVX owner authentication required.' }, 401);
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX owner authentication failed.';
    const status = /missing bearer/i.test(message) || /invalid or expired/i.test(message) ? 401 : 403;
    return ownerOnlyJson({ ok: false, error: message }, status);
  }
}

/** GET — latest report; generate one if none exists yet. */
export async function handleDailyReportLatest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  let latest = await getLatestReport();
  if (!latest) {
    latest = await generateAndStoreDailyReport({ trigger: 'owner' });
  }
  return ownerOnlyJson({ ok: true, report: latest.report as unknown as Record<string, unknown> });
}

/** POST — force a fresh report now. */
export async function handleDailyReportGenerate(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const entry = await generateAndStoreDailyReport({ trigger: 'owner' });
  return ownerOnlyJson({ ok: true, report: entry.report as unknown as Record<string, unknown> });
}

/** GET — report history (proof trail). */
export async function handleDailyReportHistory(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const history = await listReportHistory(30);
  return ownerOnlyJson({
    ok: true,
    history: history.map((h) => ({
      reportId: h.reportId,
      reportDate: h.reportDate,
      generatedAt: h.generatedAt,
      trigger: h.trigger,
      headline: h.headline,
    })),
  });
}
