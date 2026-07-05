/**
 * IVX Senior Developer Proof Ledger — client service.
 *
 * Talks to the no-token, in-process production self-proof endpoints on the live
 * IVX backend:
 *   - GET /api/ivx/senior-developer/self-proof          → run a real end-to-end task
 *   - GET /api/ivx/senior-developer/self-proof/latest   → read the last persisted proof
 *
 * Every field rendered in the ledger comes straight from this live payload. The
 * service never fabricates a SHA, deploy id, or production marker — a missing
 * value is surfaced as `null` so the screen can render an honest "—".
 */

const SELF_PROOF_MARKER = 'ivx-senior-developer-self-proof-v1';

/** Compact, secret-free proof payload returned by the live backend. */
export type IVXProofLedger = {
  marker: string;
  ok: boolean;
  endToEndProductionComplete: boolean;
  goal: string;
  jobId: string;
  feature: {
    built: boolean;
    slug: string | null;
    title: string | null;
    liveRoute: string | null;
    liveUrl: string | null;
  };
  github: {
    committed: boolean;
    commitSha: string | null;
    commitUrl: string | null;
    branch: string | null;
    committedPaths: string[];
  };
  render: {
    deployTriggered: boolean;
    deployId: string | null;
    deployStatus: string | null;
  };
  production: {
    healthHttpStatus: number | null;
    healthOk: boolean;
    featuresRouteHttpStatus: number | null;
    featuresRouteOk: boolean;
    featuresRouteEndpoint: string | null;
  };
  validationPassed: boolean;
  changedFiles: string[];
  blocker: string | null;
  ranAt: string;
  cached: boolean;
  cooldownMs: number;
  nextEligibleAt: string | null;
};

/** Live request/transport metadata captured on the device (not from the backend). */
export type IVXProofLedgerEnvelope = {
  ledger: IVXProofLedger | null;
  httpStatus: number | null;
  endpoint: string;
  source: 'production-backend' | 'no-proof-yet' | 'transport-error';
  fetchedAt: string;
  error: string | null;
  /** Latest read = read-only; run = a fresh real commit+deploy was attempted. */
  mode: 'latest' | 'run';
};

/** Final verdict mapped from the live proof, shown as the ledger's headline. */
export type IVXProofFinalStatus = 'VERIFIED LIVE' | 'PARTIAL' | 'FAILED' | 'REPO ONLY';

const RUN_TIMEOUT_MS = 180000;
const READ_TIMEOUT_MS = 15000;

function nowIso(): string {
  return new Date().toISOString();
}

function resolveApiBaseUrl(): string {
  const base =
    process.env.EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL ??
    process.env.EXPO_PUBLIC_IVX_API_BASE_URL ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    'https://api.ivxholding.com';
  // Owner-AI base may already include `/api/ivx/owner-ai`; strip any path suffix.
  return base.replace(/\/+$/, '').replace(/\/api\/ivx\/owner-ai$/i, '');
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Map a raw backend payload onto the strict ledger shape, null-safe everywhere. */
function parseLedger(raw: unknown): IVXProofLedger | null {
  const body = readRecord(raw);
  if (asString(body.marker) !== SELF_PROOF_MARKER) {
    return null;
  }
  const feature = readRecord(body.feature);
  const github = readRecord(body.github);
  const render = readRecord(body.render);
  const production = readRecord(body.production);

  return {
    marker: SELF_PROOF_MARKER,
    ok: Boolean(body.ok),
    endToEndProductionComplete: Boolean(body.endToEndProductionComplete),
    goal: asString(body.goal) ?? '',
    jobId: asString(body.jobId) ?? '',
    feature: {
      built: Boolean(feature.built),
      slug: asString(feature.slug),
      title: asString(feature.title),
      liveRoute: asString(feature.liveRoute),
      liveUrl: asString(feature.liveUrl),
    },
    github: {
      committed: Boolean(github.committed),
      commitSha: asString(github.commitSha),
      commitUrl: asString(github.commitUrl),
      branch: asString(github.branch),
      committedPaths: asStringArray(github.committedPaths),
    },
    render: {
      deployTriggered: Boolean(render.deployTriggered),
      deployId: asString(render.deployId),
      deployStatus: asString(render.deployStatus),
    },
    production: {
      healthHttpStatus: asNumber(production.healthHttpStatus),
      healthOk: Boolean(production.healthOk),
      featuresRouteHttpStatus: asNumber(production.featuresRouteHttpStatus),
      featuresRouteOk: Boolean(production.featuresRouteOk),
      featuresRouteEndpoint: asString(production.featuresRouteEndpoint),
    },
    validationPassed: Boolean(body.validationPassed),
    changedFiles: asStringArray(body.changedFiles),
    blocker: asString(body.blocker),
    ranAt: asString(body.ranAt) ?? '',
    cached: Boolean(body.cached),
    cooldownMs: asNumber(body.cooldownMs) ?? 0,
    nextEligibleAt: asString(body.nextEligibleAt),
  };
}

/**
 * Derive the single final classification the owner asked for, strictly from the
 * live proof. No proof at all → REPO ONLY (nothing has been verified live yet).
 */
export function deriveFinalStatus(envelope: IVXProofLedgerEnvelope): IVXProofFinalStatus {
  const ledger = envelope.ledger;
  if (!ledger) {
    return 'REPO ONLY';
  }
  if (ledger.ok && ledger.endToEndProductionComplete && ledger.production.healthOk) {
    return 'VERIFIED LIVE';
  }
  // Some real artifact exists (commit / deploy / production check) but the full
  // chain did not complete → PARTIAL. Otherwise the run outright FAILED.
  const hasRealArtifact =
    ledger.github.committed ||
    ledger.render.deployTriggered ||
    ledger.production.healthOk ||
    ledger.production.featuresRouteOk;
  return hasRealArtifact ? 'PARTIAL' : 'FAILED';
}

async function callSelfProof(
  pathSuffix: string,
  mode: 'latest' | 'run',
  timeoutMs: number,
): Promise<IVXProofLedgerEnvelope> {
  const endpoint = `${resolveApiBaseUrl()}/api/ivx/senior-developer/self-proof${pathSuffix}`;
  const fetchedAt = nowIso();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let parsedBody: unknown = null;
    try {
      parsedBody = text ? JSON.parse(text) : null;
    } catch {
      parsedBody = null;
    }

    const ledger = parseLedger(parsedBody);
    if (!ledger) {
      const bodyError = asString(readRecord(parsedBody).error);
      return {
        ledger: null,
        httpStatus: response.status,
        endpoint,
        source: response.status === 404 ? 'no-proof-yet' : 'transport-error',
        fetchedAt,
        error: bodyError ?? (response.ok ? 'Backend returned no proof marker.' : `Backend returned HTTP ${response.status}.`),
        mode,
      };
    }

    return {
      ledger,
      httpStatus: response.status,
      endpoint,
      source: 'production-backend',
      fetchedAt,
      error: null,
      mode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    return {
      ledger: null,
      httpStatus: null,
      endpoint,
      source: 'transport-error',
      fetchedAt,
      error: /abort/i.test(message) ? 'Self-proof request timed out.' : message,
      mode,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Read the last persisted proof without triggering a new commit/deploy. */
export async function fetchLatestProofLedger(): Promise<IVXProofLedgerEnvelope> {
  return callSelfProof('/latest', 'latest', READ_TIMEOUT_MS);
}

/**
 * Run ONE real end-to-end senior-developer task against the live backend:
 * detect → inspect → patch → test → commit → deploy → verify production.
 * Cooldown-guarded server-side, so repeated taps return the cached real proof.
 */
export async function runProofLedgerTask(): Promise<IVXProofLedgerEnvelope> {
  return callSelfProof('', 'run', RUN_TIMEOUT_MS);
}
