/**
 * IVX Global Opportunity Intelligence API — All 9 Engines (owner-only).
 *
 *   GET  /api/ivx/intelligence/state            → full engine state + daily targets
 *   POST /api/ivx/intelligence/run-all          → run all enabled engines
 *   POST /api/ivx/intelligence/run/:engineId    → run a single engine
 *   POST /api/ivx/intelligence/run-category/:category → run by category
 *   GET  /api/ivx/intelligence/report           → latest 5-hour report
 *   GET  /api/ivx/intelligence/reports          → list historical reports
 *   GET  /api/ivx/intelligence/targets          → daily target status
 *   GET  /api/ivx/intelligence/records          → list all records (paginated)
 *   GET  /api/ivx/intelligence/records/:category → records by category
 *   GET  /api/ivx/intelligence/top              → top 20 scored records
 *   POST /api/ivx/intelligence/jv-match         → JV matching against IVX projects
 *   POST /api/ivx/intelligence/zip-search       → ZIP code buyer search
 *   GET  /api/ivx/intelligence/engines          → list engine configs
 *   POST /api/ivx/intelligence/validate         → validate engines
 *
 * Owner-only. Every record includes source URL and confidence grade.
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import {
  runAllEngines,
  runEngine,
  runEngineByCategory,
  runJVMatching,
  runZipCodeEngine,
  generateFiveHourReport,
  getIntelligenceState,
  getLatestReport,
  getDailyTargets,
  loadAllRecords,
  loadRecordsByCategory,
  loadTodayRecords,
  scoreRecord,
  validateGlobalIntelligence,
  ENGINE_CONFIGS,
  ALL_ENGINE_IDS,
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  type IntelligenceCategory,
  type FiveHourReport,
  type EngineRunResult,
  type ZipCodeSearchParams,
} from '../services/ivx-global-opportunity-intelligence';

export const OPTIONS = (): Response => ownerOnlyOptions();

// ── Auth ───────────────────────────────────────────────────────────────────

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

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asString(value: unknown, fallback: string = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}

// ── Handlers ───────────────────────────────────────────────────────────────

export async function handleIntelligenceStateRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const state = await getIntelligenceState();
  const targets = await getDailyTargets();
  return ownerOnlyJson({ ok: true, state, targets });
}

export async function handleIntelligenceRunAllRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const result = await runAllEngines();
  // Also generate a report
  const report = await generateFiveHourReport();
  return ownerOnlyJson({
    ok: true,
    result: {
      results: result.results,
      totalFound: result.totalFound,
      totalSaved: result.totalSaved,
      errors: result.errors,
    },
    report,
  });
}

export async function handleIntelligenceRunEngineRequest(request: Request, engineId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  if (!ENGINE_CONFIGS[engineId]) {
    return ownerOnlyJson({ ok: false, error: `Unknown engine: ${engineId}. Valid: ${ALL_ENGINE_IDS.join(', ')}` }, 400);
  }
  const result = await runEngine(engineId);
  return ownerOnlyJson({ ok: true, result });
}

export async function handleIntelligenceRunCategoryRequest(request: Request, category: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  if (!ALL_CATEGORIES.includes(category as IntelligenceCategory)) {
    return ownerOnlyJson({ ok: false, error: `Unknown category: ${category}. Valid: ${ALL_CATEGORIES.join(', ')}` }, 400);
  }
  const result = await runEngineByCategory(category as IntelligenceCategory);
  return ownerOnlyJson({ ok: true, result });
}

export async function handleIntelligenceReportRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const report = await getLatestReport();
  if (!report) {
    // Generate one on demand
    const newReport = await generateFiveHourReport();
    return ownerOnlyJson({ ok: true, report: newReport });
  }
  return ownerOnlyJson({ ok: true, report });
}

export async function handleIntelligenceReportsListRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const state = await getIntelligenceState();
  return ownerOnlyJson({ ok: true, reports: state.reports.slice(0, 20) });
}

export async function handleIntelligenceTargetsRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const targets = await getDailyTargets();
  const state = await getIntelligenceState();
  return ownerOnlyJson({
    ok: true,
    date: state.todayDate,
    targets,
    totalFoundToday: Object.values(state.todayTotals).reduce((a, b) => a + b, 0),
  });
}

export async function handleIntelligenceRecordsRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const category = url.searchParams.get('category') as IntelligenceCategory | null;
  const limit = asNumber(url.searchParams.get('limit'), 100);
  const today = url.searchParams.get('today') === 'true';

  let records;
  if (category && ALL_CATEGORIES.includes(category)) {
    records = await loadRecordsByCategory(category);
  } else if (today) {
    records = await loadTodayRecords();
  } else {
    records = await loadAllRecords();
  }

  // Score and sort
  const scored = records.map((r) => ({ record: r, score: scoreRecord(r) }));
  scored.sort((a, b) => b.score - a.score);
  const limited = scored.slice(0, Math.min(limit, 500));

  return ownerOnlyJson({
    ok: true,
    total: records.length,
    returned: limited.length,
    records: limited.map((s) => s.record),
  });
}

export async function handleIntelligenceTopRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const records = await loadAllRecords();
  const scored = records.map((r) => ({ record: r, score: scoreRecord(r) }));
  scored.sort((a, b) => b.score - a.score);
  return ownerOnlyJson({
    ok: true,
    top20: scored.slice(0, 20).map((s) => s.record),
  });
}

export async function handleIntelligenceJVMatchRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const projects = body.projects as Array<{
    name: string;
    location: string;
    propertyType: string;
    capitalNeeded: string;
  }> | undefined;

  if (!projects || !Array.isArray(projects) || projects.length === 0) {
    return ownerOnlyJson({
      ok: false,
      error: 'Provide a "projects" array with { name, location, propertyType, capitalNeeded } objects.',
    }, 400);
  }

  const matches = await runJVMatching(projects);
  return ownerOnlyJson({ ok: true, matches, totalMatches: matches.length });
}

export async function handleIntelligenceZipSearchRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);

  const params: ZipCodeSearchParams = {
    propertyAddress: asString(body.propertyAddress),
    zipCode: asString(body.zipCode),
    radiusMiles: asNumber(body.radiusMiles, 25),
    propertyType: asString(body.propertyType) || undefined,
  };

  if (!params.zipCode || !params.propertyAddress) {
    return ownerOnlyJson({
      ok: false,
      error: 'Provide propertyAddress and zipCode.',
    }, 400);
  }

  const result = await runZipCodeEngine(params);
  return ownerOnlyJson({ ok: true, result });
}

export async function handleIntelligenceEnginesRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const engines = ALL_ENGINE_IDS.map((id) => {
    const cfg = ENGINE_CONFIGS[id];
    return {
      engineId: cfg.engineId,
      engineName: cfg.engineName,
      category: cfg.category,
      categoryLabel: CATEGORY_LABELS[cfg.category],
      enabled: cfg.enabled,
      dailyTarget: cfg.dailyTarget,
      searchIntervalHours: cfg.searchIntervalHours,
      queryCount: cfg.searchQueries.length,
    };
  });
  return ownerOnlyJson({ ok: true, engines });
}

export async function handleIntelligenceValidateRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const result = await validateGlobalIntelligence();
  return ownerOnlyJson({ ok: result.valid, ...result });
}
