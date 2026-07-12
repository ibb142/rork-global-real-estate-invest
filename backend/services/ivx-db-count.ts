/**
 * IVX Real Database Count Tool
 *
 * The IVX chat language model CANNOT run SQL mid-sentence. Any answer that says
 * "I'll run a query on the investors table… here are the results: 150" with no
 * tool behind it is fabricated. This service is the real tool: when a user asks
 * for a count of investors / buyers / JV-deals (projects), it executes an actual
 * `count=exact` query against Supabase over the REST API with the service-role
 * key and returns the TRUE number parsed from the PostgREST `content-range`
 * header.
 *
 * Truth policy, enforced in code:
 *   - Counts are NEVER invented. Every number comes from a real HTTP query.
 *   - If Supabase is not configured, the result is `ok:false` with the exact
 *     missing env var — not a guessed number.
 *   - If the table does not exist in this Supabase project, the result is
 *     `ok:false` with reason `table_not_found` — IVX states that honestly
 *     instead of fabricating a count.
 *
 * Pure helpers (`parseContentRangeCount`, `detectCountIntent`,
 * `buildCountGroundingBlock`) are deterministic and unit-tested. The async
 * `runDbCounts` performs the real network query and never throws.
 */

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const FETCH_TIMEOUT_MS = 12_000;

/** A countable IVX entity the chat can be asked about. */
export type CountTarget =
  | 'members'
  | 'waitlist'
  | 'investors'
  | 'buyers'
  | 'jv_deals'
  | 'private_lenders'
  | 'tokenized_investments'
  | 'wallets'
  | 'treasury'
  | 'ledger'
  | 'withdrawals'
  | 'wire_transfers'
  | 'notifications'
  | 'visitors'
  | 'landing_analytics'
  | 'analytics_events';

/**
 * Candidate Supabase table name(s) for each target, tried in order. The first
 * table that exists (does not 404) is used. The `selectColumn` is the PK or
 * first column used for the HEAD count request — some tables use `member_id`
 * instead of `id`, so we must use the right column or PostgREST returns 400.
 */
const TARGET_TABLES: Record<CountTarget, string[]> = {
  members: ['members'],
  waitlist: ['waitlist'],
  investors: ['investors', 'crm_investors'],
  buyers: ['buyers', 'crm_buyers'],
  jv_deals: ['jv_deals'],
  private_lenders: ['private_lenders'],
  tokenized_investments: ['tokenized_investments'],
  wallets: ['wallets'],
  treasury: ['treasury'],
  ledger: ['ledger'],
  withdrawals: ['withdrawals'],
  wire_transfers: ['wire_transfers'],
  notifications: ['notifications'],
  visitors: ['visitor_sessions'],
  landing_analytics: ['landing_analytics'],
  analytics_events: ['analytics_events'],
};

/** The column to select for the HEAD count. Most tables use `id`; `members` uses `member_id`. */
const TARGET_SELECT_COLUMN: Record<CountTarget, string> = {
  members: 'member_id',
  waitlist: 'id',
  investors: 'id',
  buyers: 'id',
  jv_deals: 'id',
  private_lenders: 'id',
  tokenized_investments: 'id',
  wallets: 'id',
  treasury: 'id',
  ledger: 'id',
  withdrawals: 'id',
  wire_transfers: 'id',
  notifications: 'id',
  visitors: 'session_id',
  landing_analytics: 'id',
  analytics_events: 'id',
};

const TARGET_LABEL: Record<CountTarget, string> = {
  members: 'members',
  waitlist: 'waitlist entries',
  investors: 'investors',
  buyers: 'buyers',
  jv_deals: 'JV deals (projects)',
  private_lenders: 'private lenders',
  tokenized_investments: 'tokenized investments',
  wallets: 'wallets',
  treasury: 'treasury records',
  ledger: 'ledger entries',
  withdrawals: 'withdrawals',
  wire_transfers: 'wire transfers',
  notifications: 'notifications',
  visitors: 'visitors (visitor_sessions)',
  landing_analytics: 'landing analytics events',
  analytics_events: 'analytics events',
};

export type CountQueryResult = {
  target: CountTarget;
  /** Whether a real, exact count was obtained. */
  ok: boolean;
  /** The true row count from Supabase, or null when it could not be obtained. */
  count: number | null;
  /** The Supabase table actually queried (null if none was reachable). */
  table: string | null;
  /** Last HTTP status seen from PostgREST. */
  httpStatus: number | null;
  /** Machine reason when ok is false. */
  reason:
    | 'ok'
    | 'not_configured'
    | 'table_not_found'
    | 'http_error'
    | 'network_error'
    | null;
  /** Human-readable detail (safe to log / surface). */
  detail: string;
  /** ISO timestamp the query ran. */
  queriedAt: string;
  /** True when a real HTTP query was actually executed (even if it failed). */
  executed: boolean;
};

export type DbCountReport = {
  results: CountQueryResult[];
  /** True when at least one real HTTP query was actually executed. */
  anyExecuted: boolean;
  /** True when at least one exact count was obtained. */
  anyOk: boolean;
};

function resolveConfig(): { url: string; key: string; missing: string[] } {
  const url = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL).replace(/\/+$/, '');
  const key = readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_KEY);
  const missing: string[] = [];
  if (!url) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return { url, key, missing };
}

/**
 * Parse the exact total row count from a PostgREST `content-range` header.
 * The header looks like `0-24/573` or `(star)/0` (for an empty range). Returns the
 * integer after the slash, or null when it is unparseable / unknown (`*`).
 *
 * Pure function — deterministic.
 */
export function parseContentRangeCount(contentRange: string | null): number | null {
  const value = readTrimmed(contentRange);
  if (!value) return null;
  const slash = value.lastIndexOf('/');
  if (slash === -1) return null;
  const totalPart = value.slice(slash + 1).trim();
  if (!totalPart || totalPart === '*') return null;
  const total = Number.parseInt(totalPart, 10);
  return Number.isFinite(total) && total >= 0 ? total : null;
}

const COUNT_QUESTION_REGEX =
  /\b(how\s+many|number\s+of|count\s+of|total\s+(?:number\s+of\s+)?|#\s*of)\b/i;

/**
 * Detect which count targets a user message is asking about. Returns the
 * de-duplicated list of targets, or an empty array when the message is not a
 * count question (so the tool only runs when it is actually needed).
 *
 * Pure function — deterministic.
 */
export function detectCountIntent(message: string): CountTarget[] {
  const normalized = readTrimmed(message).toLowerCase();
  if (!normalized) return [];

  const mentionsMembers = /\bmembers?\b/.test(normalized);
  const mentionsWaitlist = /\bwaitlist\b/.test(normalized);
  const mentionsInvestors = /\binvestors?\b/.test(normalized);
  const mentionsBuyers = /\bbuyers?\b/.test(normalized);
  const mentionsDeals = /\b(jv\s*deals?|joint\s*ventures?|deals?|projects?|properties|property)\b/.test(normalized);
  const mentionsLenders = /\b(private\s+)?lenders?\b/.test(normalized);
  const mentionsTokenized = /\btokeni[sz]ed\b/.test(normalized);
  const mentionsWallets = /\bwallets?\b/.test(normalized);
  const mentionsTreasury = /\btreasury\b/.test(normalized);
  const mentionsLedger = /\bledger\b/.test(normalized);
  const mentionsWithdrawals = /\bwithdrawals?\b/.test(normalized);
  const mentionsWires = /\b(wire\s+transfers?|wires?|transfers?)\b/.test(normalized);
  const mentionsNotifications = /\bnotifications?\b/.test(normalized);
  const mentionsVisitors = /\bvisitors?\b/.test(normalized);
  const mentionsAnalytics = /\banalytics?\b/.test(normalized);

  // Only treat as a count request when count language is present, OR a clear
  // "do I have / are there ... X" phrasing is used.
  const hasCountLanguage =
    COUNT_QUESTION_REGEX.test(normalized) ||
    /\b(?:do\s+(?:i|we)\s+have|are\s+there|have\s+(?:i|we)\s+got)\b/.test(normalized);

  if (!hasCountLanguage) return [];

  const targets: CountTarget[] = [];
  if (mentionsMembers) targets.push('members');
  if (mentionsWaitlist) targets.push('waitlist');
  if (mentionsInvestors) targets.push('investors');
  if (mentionsBuyers) targets.push('buyers');
  if (mentionsDeals) targets.push('jv_deals');
  if (mentionsLenders) targets.push('private_lenders');
  if (mentionsTokenized) targets.push('tokenized_investments');
  if (mentionsWallets) targets.push('wallets');
  if (mentionsTreasury) targets.push('treasury');
  if (mentionsLedger) targets.push('ledger');
  if (mentionsWithdrawals) targets.push('withdrawals');
  if (mentionsWires) targets.push('wire_transfers');
  if (mentionsNotifications) targets.push('notifications');
  if (mentionsVisitors) targets.push('visitors');
  if (mentionsAnalytics) { targets.push('visitors'); targets.push('landing_analytics'); targets.push('analytics_events'); }

  // If the user asks "how many X do we have" without naming a specific entity,
  // or asks a broad audit question, run the full set so the answer is complete.
  if (targets.length === 0 && /\b(?:everything|all|full|audit|overview|summary|status\s+of)\b/.test(normalized)) {
    return ['members', 'waitlist', 'investors', 'buyers', 'jv_deals', 'private_lenders', 'wallets', 'visitors'];
  }

  return Array.from(new Set(targets));
}

async function countOneTable(
  baseUrl: string,
  key: string,
  table: string,
  selectColumn: string = 'id',
): Promise<{ count: number | null; httpStatus: number | null; notFound: boolean; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // HEAD request with count=exact: PostgREST returns the exact total in the
    // content-range header without transferring any rows.
    const response = await fetch(`${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(selectColumn)}`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        Prefer: 'count=exact',
        // Ask for an empty row range — we only want the header count.
        Range: '0-0',
      },
    });
    clearTimeout(timeout);
    const httpStatus = response.status;
    if (response.status === 404) {
      return { count: null, httpStatus, notFound: true, error: `Table "${table}" not found.` };
    }
    if (!response.ok) {
      return { count: null, httpStatus, notFound: false, error: `HTTP ${response.status}` };
    }
    const count = parseContentRangeCount(response.headers.get('content-range'));
    return { count, httpStatus, notFound: false, error: count === null ? 'Count header missing.' : null };
  } catch (error) {
    clearTimeout(timeout);
    const reason = controller.signal.aborted ? `Timed out after ${FETCH_TIMEOUT_MS}ms.` : error instanceof Error ? error.message : 'network error';
    return { count: null, httpStatus: null, notFound: false, error: reason };
  }
}

async function countTarget(baseUrl: string, key: string, target: CountTarget): Promise<CountQueryResult> {
  const queriedAt = new Date().toISOString();
  const candidates = TARGET_TABLES[target];
  const selectColumn = TARGET_SELECT_COLUMN[target] ?? 'id';
  let lastHttpStatus: number | null = null;
  let allNotFound = true;
  let lastError: string | null = null;

  for (const table of candidates) {
    const result = await countOneTable(baseUrl, key, table, selectColumn);
    lastHttpStatus = result.httpStatus ?? lastHttpStatus;
    if (result.notFound) {
      lastError = result.error;
      continue;
    }
    allNotFound = false;
    if (result.count !== null) {
      return {
        target,
        ok: true,
        count: result.count,
        table,
        httpStatus: result.httpStatus,
        reason: 'ok',
        detail: `Live count=exact on public.${table}: ${result.count} ${TARGET_LABEL[target]}.`,
        queriedAt,
        executed: true,
      };
    }
    lastError = result.error;
  }

  if (allNotFound) {
    return {
      target,
      ok: false,
      count: null,
      table: null,
      httpStatus: lastHttpStatus,
      reason: 'table_not_found',
      detail: `No Supabase table for ${TARGET_LABEL[target]} exists in this project (tried: ${candidates.join(', ')}). I will not invent a number.`,
      queriedAt,
      executed: true,
    };
  }

  return {
    target,
    ok: false,
    count: null,
    table: null,
    httpStatus: lastHttpStatus,
    reason: lastHttpStatus === null ? 'network_error' : 'http_error',
    detail: `Could not get an exact count for ${TARGET_LABEL[target]}: ${lastError ?? 'unknown error'}.`,
    queriedAt,
    executed: true,
  };
}

/**
 * Run real `count=exact` queries for the requested targets. Never throws — a
 * missing configuration or failed query is captured in an honest `ok:false`
 * result with a machine reason, never a fabricated number.
 */
export async function runDbCounts(targets: CountTarget[]): Promise<DbCountReport> {
  const unique = Array.from(new Set(targets));
  if (unique.length === 0) {
    return { results: [], anyExecuted: false, anyOk: false };
  }

  const { url, key, missing } = resolveConfig();
  if (missing.length > 0) {
    const queriedAt = new Date().toISOString();
    const results = unique.map<CountQueryResult>((target) => ({
      target,
      ok: false,
      count: null,
      table: null,
      httpStatus: null,
      reason: 'not_configured',
      detail: `Cannot count ${TARGET_LABEL[target]} — Supabase is not configured. Missing backend env: ${missing.join(', ')}.`,
      queriedAt,
      executed: false,
    }));
    return { results, anyExecuted: false, anyOk: false };
  }

  const results = await Promise.all(unique.map((target) => countTarget(url, key, target)));
  return {
    results,
    anyExecuted: results.some((r) => r.executed),
    anyOk: results.some((r) => r.ok),
  };
}

/**
 * Render the real count results into an authoritative grounding block injected
 * into the chat prompt. The block instructs the model to use ONLY these exact
 * numbers and to never narrate "running a query".
 *
 * Pure function — deterministic.
 */
export function buildCountGroundingBlock(report: DbCountReport): string | null {
  if (report.results.length === 0) return null;

  const lines = report.results.map((result) => {
    if (result.ok && result.count !== null) {
      return `- ${TARGET_LABEL[result.target]}: ${result.count} (exact, from public.${result.table}, count=exact at ${result.queriedAt}).`;
    }
    return `- ${TARGET_LABEL[result.target]}: NO LIVE COUNT — ${result.detail}`;
  });

  return [
    'LIVE DATABASE COUNTS (already executed by the IVX count tool — these are REAL count=exact results, not a request to run a query):',
    ...lines,
    '',
    'Rules for answering this count question:',
    '- Use ONLY the exact numbers above. Do NOT estimate, round, or invent any count.',
    '- Do NOT write "I will run a query", "I am running these queries now", or "let me query the table" — the query already ran and its results are above.',
    '- For any target marked "NO LIVE COUNT", state the honest reason (not configured / table not found) instead of giving a number.',
  ].join('\n');
}
