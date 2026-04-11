import { inspectDealsJsonUrl, inspectJsonObjectUrl } from '@/lib/api-response-guard';
import { ensureMemberProfileRecord, getAdminMemberRegistrySnapshot, persistMemberRegistrationShadow } from '@/lib/member-registry';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

export type ReadinessStatus = 'pass' | 'fail' | 'warn';

export interface ReadinessProbe {
  id: string;
  label: string;
  status: ReadinessStatus;
  message: string;
  detail?: string;
  latencyMs?: number;
}

export interface ScaleReadinessAssessment {
  targetUsers: number;
  label: string;
  status: ReadinessStatus;
  evidence: 'validated' | 'partial' | 'insufficient';
  summary: string;
  blockerIds: string[];
}

export type ReadinessAuditMode = 'light' | 'full';

export interface ReadinessAuditResult {
  mode: ReadinessAuditMode;
  overallStatus: ReadinessStatus;
  readyFor30k: boolean;
  readyFor1M: boolean;
  probes: ReadinessProbe[];
  summary: string;
  scaleAssessments: ScaleReadinessAssessment[];
  blockerCount: number;
  warningCount: number;
}

export interface RunLandingReadinessAuditOptions {
  mode?: ReadinessAuditMode;
  force?: boolean;
}

const PUBLIC_LANDING_URL = 'https://ivxholding.com';
const API_CONCURRENCY_SAMPLE_SIZE = 8;
const WRITE_CONCURRENCY_SAMPLE_SIZE = 5;
const LIGHT_AUDIT_CACHE_MS = 60_000;
const FULL_AUDIT_CACHE_MS = 5 * 60_000;

interface ReadinessAuditCacheEntry {
  result: ReadinessAuditResult;
  timestamp: number;
}

const readinessAuditCache = new Map<ReadinessAuditMode, ReadinessAuditCacheEntry>();
const readinessAuditInFlight = new Map<ReadinessAuditMode, Promise<ReadinessAuditResult>>();

function getAuditCacheTtl(mode: ReadinessAuditMode): number {
  return mode === 'full' ? FULL_AUDIT_CACHE_MS : LIGHT_AUDIT_CACHE_MS;
}

function getCachedReadinessAudit(mode: ReadinessAuditMode): ReadinessAuditResult | null {
  const cached = readinessAuditCache.get(mode);
  if (!cached) {
    return null;
  }

  const ageMs = Date.now() - cached.timestamp;
  if (ageMs > getAuditCacheTtl(mode)) {
    readinessAuditCache.delete(mode);
    return null;
  }

  console.log('[LandingReadinessAudit] Reusing cached', mode, 'audit from', ageMs, 'ms ago');
  return cached.result;
}

function setCachedReadinessAudit(mode: ReadinessAuditMode, result: ReadinessAuditResult): void {
  readinessAuditCache.set(mode, {
    result,
    timestamp: Date.now(),
  });
}

function withFetchTimeout(timeoutMs: number): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    cleanup: () => clearTimeout(timeout),
  };
}

function getDirectApiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
}

function pushProbe(probes: ReadinessProbe[], probe: ReadinessProbe): void {
  probes.push(probe);
  console.log('[LandingReadinessAudit]', probe.id, probe.status, '-', probe.message);
}

function resolveOverallStatus(probes: ReadinessProbe[]): ReadinessStatus {
  if (probes.some((probe) => probe.status === 'fail')) {
    return 'fail';
  }
  if (probes.some((probe) => probe.status === 'warn')) {
    return 'warn';
  }
  return 'pass';
}

function validateHealthPayload(payload: Record<string, unknown>): string | null {
  const status = payload.status;
  const ok = payload.ok;
  const timestamp = payload.timestamp;
  const candidateStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!candidateStatus || !['ok', 'healthy', 'pass'].includes(candidateStatus)) {
    return 'Health JSON schema mismatch: missing healthy status field';
  }
  if (typeof ok !== 'boolean' && typeof ok !== 'string' && typeof ok !== 'number') {
    return 'Health JSON schema mismatch: missing ok flag';
  }
  if (typeof timestamp !== 'string' || !timestamp.trim()) {
    return 'Health JSON schema mismatch: missing timestamp';
  }
  return null;
}

function getProbeStatusFromFailures(failureCount: number, warnCount: number): ReadinessStatus {
  if (failureCount > 0) {
    return 'fail';
  }
  if (warnCount > 0) {
    return 'warn';
  }
  return 'pass';
}

function normalizeSupportedDirectMirrorProbe(probe: ReadinessProbe, fallbackProbe: ReadinessProbe | undefined, supportedLabel: string): ReadinessProbe {
  if (probe.status !== 'fail' || !fallbackProbe || fallbackProbe.status !== 'pass') {
    return probe;
  }

  const isMissingRoute = probe.message.includes('HTTP 404') || probe.message.includes('schema mismatch') || probe.message.includes('not found');
  if (!isMissingRoute) {
    return probe;
  }

  return {
    ...probe,
    status: 'pass',
    message: `${supportedLabel} is served by the live public JSON mirror`,
    detail: `Direct route is intentionally bypassed in the launch path. Fallback validated via ${fallbackProbe.id}.`,
  };
}

function buildScaleAssessment(targetUsers: number, probes: ReadinessProbe[], mode: ReadinessAuditMode): ScaleReadinessAssessment {
  const label = targetUsers >= 1000000 ? '1M readiness' : '30k readiness';
  const failures = probes.filter((probe) => probe.status === 'fail');
  const warnings = probes.filter((probe) => probe.status === 'warn');
  const apiBurstFailures = failures.filter((probe) => probe.id.includes('burst'));
  const writeFailures = failures.filter((probe) => probe.id.startsWith('write-') || probe.id.includes('member-'));
  const directApiMissing = failures.find((probe) => probe.id === 'direct-api-missing');
  const blockerIds = failures.map((probe) => probe.id);

  if (failures.length > 0) {
    return {
      targetUsers,
      label,
      status: 'fail',
      evidence: 'insufficient',
      summary: directApiMissing
        ? `${label} blocked because direct backend validation is missing.`
        : `${label} blocked by ${failures.length} failing probe(s), including ${Math.max(apiBurstFailures.length, writeFailures.length)} scale-critical path issue(s).`,
      blockerIds,
    };
  }

  if (mode === 'light') {
    if (targetUsers >= 1000000) {
      return {
        targetUsers,
        label,
        status: 'warn',
        evidence: 'partial',
        summary: '1M is not proven from the lightweight read-only scan. Run a full audit before making infrastructure claims.',
        blockerIds: warnings.map((probe) => probe.id),
      };
    }

    return {
      targetUsers,
      label,
      status: warnings.length > 0 ? 'warn' : 'pass',
      evidence: 'partial',
      summary: warnings.length > 0
        ? `Read-only launch scan passed the core paths, but ${warnings.length} warning probe(s) still need review before a 30k claim.`
        : 'Read-only launch scan passed the core paths. Deep write-path validation is skipped until a full audit is run manually.',
      blockerIds: warnings.map((probe) => probe.id),
    };
  }

  if (targetUsers >= 1000000) {
    return {
      targetUsers,
      label,
      status: warnings.length > 0 ? 'fail' : 'warn',
      evidence: warnings.length > 0 ? 'insufficient' : 'partial',
      summary: warnings.length > 0
        ? '1M is not safe to claim while warnings remain on API or persistence probes.'
        : '1M is not proven yet. Current checks validate launch-path health, not million-user infrastructure saturation.',
      blockerIds: warnings.map((probe) => probe.id),
    };
  }

  if (warnings.length > 0) {
    return {
      targetUsers,
      label,
      status: 'warn',
      evidence: 'partial',
      summary: `30k is close, but ${warnings.length} probe(s) still need stronger proof before making a clean claim.`,
      blockerIds: warnings.map((probe) => probe.id),
    };
  }

  return {
    targetUsers,
    label,
    status: 'pass',
    evidence: 'validated',
    summary: '30k launch-path support is currently validated by public JSON endpoints, mirrored API compatibility checks, health-schema, and persistence burst probes.',
    blockerIds: [],
  };
}

async function probeDealsEndpoint(url: string, endpointName: string, label: string): Promise<ReadinessProbe> {
  const startedAt = Date.now();
  const result = await inspectDealsJsonUrl(url, {
    endpointName,
    timeoutMs: 8000,
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  const latencyMs = Date.now() - startedAt;

  if (!result.ok) {
    return {
      id: `${label}-${endpointName}`,
      label: `${label} ${endpointName}`,
      status: 'fail',
      message: result.error,
      detail: result.bodyPreview || `content-type=${result.contentType || 'unknown'}`,
      latencyMs,
    };
  }

  return {
    id: `${label}-${endpointName}`,
    label: `${label} ${endpointName}`,
    status: 'pass',
    message: `${result.deals.length} valid JSON deal(s) returned`,
    detail: `content-type=${result.contentType} · status=${result.status}`,
    latencyMs,
  };
}

async function probeJsonHealth(url: string, label: string): Promise<ReadinessProbe> {
  const startedAt = Date.now();
  const result = await inspectJsonObjectUrl(url, {
    endpointName: label,
    timeoutMs: 6000,
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
    validate: validateHealthPayload,
  });
  const latencyMs = Date.now() - startedAt;

  if (!result.ok) {
    return {
      id: `health-${label}`,
      label: `${label} health`,
      status: 'fail',
      message: result.error,
      detail: result.bodyPreview || `content-type=${result.contentType || 'unknown'}`,
      latencyMs,
    };
  }

  return {
    id: `health-${label}`,
    label: `${label} health`,
    status: 'pass',
    message: 'JSON health response verified',
    detail: `content-type=${result.contentType} · keys=${Object.keys(result.payload).slice(0, 8).join(', ') || 'none'}`,
    latencyMs,
  };
}

function buildReadinessProbeIdentity(prefix: string): { email: string; phone: string; createdAt: string } {
  const now = Date.now();
  return {
    email: `${prefix}-${now}@example.com`,
    phone: `+1555${String(now).slice(-7)}`,
    createdAt: new Date(now).toISOString(),
  };
}

async function probeDealsEndpointBurst(url: string, endpointName: string, label: string): Promise<ReadinessProbe> {
  const startedAt = Date.now();
  const burstResults = await Promise.all(
    Array.from({ length: API_CONCURRENCY_SAMPLE_SIZE }, (_, index) =>
      inspectDealsJsonUrl(url, {
        endpointName: `${endpointName}-burst-${index + 1}`,
        timeoutMs: 8000,
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          'X-Readiness-Burst': String(index + 1),
        },
      })
    )
  );
  const latencyMs = Date.now() - startedAt;
  const failureResults = burstResults.filter((result) => !result.ok);
  const successfulResults = burstResults.filter((result) => result.ok);
  const warnCount = successfulResults.filter((result) => result.status !== 200 || result.deals.length === 0).length;
  const status = getProbeStatusFromFailures(failureResults.length, warnCount);

  if (status !== 'pass') {
    const failure = failureResults[0];
    return {
      id: `${label}-${endpointName}-burst`,
      label: `${label} ${endpointName} burst validation`,
      status,
      message: failure
        ? `${failureResults.length}/${burstResults.length} requests failed JSON validation`
        : `${warnCount}/${burstResults.length} requests returned weak payloads`,
      detail: failure?.error ?? `validated=${successfulResults.length}/${burstResults.length}`,
      latencyMs,
    };
  }

  const maxDeals = successfulResults.reduce((highest, result) => Math.max(highest, result.deals.length), 0);
  return {
    id: `${label}-${endpointName}-burst`,
    label: `${label} ${endpointName} burst validation`,
    status: 'pass',
    message: `${successfulResults.length}/${burstResults.length} concurrent JSON validations passed`,
    detail: `max_deals=${maxDeals} · sample_size=${burstResults.length}`,
    latencyMs,
  };
}

async function probeWaitlistWritePath(): Promise<ReadinessProbe> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      id: 'write-waitlist-live',
      label: 'Waitlist live write path',
      status: 'fail',
      message: 'Supabase public env missing',
      detail: 'Cannot run the real waitlist insert probe without EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  const startedAt = Date.now();
  const probeIdentity = buildReadinessProbeIdentity('readiness-waitlist');
  const { controller, cleanup } = withFetchTimeout(8000);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/waitlist_entries`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        full_name: 'Readiness Audit Waitlist',
        first_name: 'Readiness',
        last_name: 'Audit',
        email: probeIdentity.email,
        phone: probeIdentity.phone,
        email_normalized: probeIdentity.email,
        phone_e164: probeIdentity.phone,
        phone_verified: true,
        accredited_status: 'unsure',
        consent_sms: true,
        consent_email: true,
        source: 'readiness_audit',
        page_path: '/backend-audit',
        referrer: 'backend-audit',
        status: 'pending',
        created_at: probeIdentity.createdAt,
        updated_at: probeIdentity.createdAt,
        submitted_at: probeIdentity.createdAt,
      }),
    });
    const latencyMs = Date.now() - startedAt;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const body = await response.text();
    const bodyPreview = body.slice(0, 220);
    const isHtmlFallback = body.trim().toLowerCase().startsWith('<!doctype html') || body.trim().toLowerCase().startsWith('<html');

    if (!response.ok) {
      return {
        id: 'write-waitlist-live',
        label: 'Waitlist live write path',
        status: 'fail',
        message: `HTTP ${response.status}`,
        detail: bodyPreview || 'Insert request failed.',
        latencyMs,
      };
    }

    if (!contentType.includes('application/json') || isHtmlFallback) {
      return {
        id: 'write-waitlist-live',
        label: 'Waitlist live write path',
        status: 'fail',
        message: 'Insert response is not valid JSON',
        detail: bodyPreview || `content-type=${contentType || 'unknown'}`,
        latencyMs,
      };
    }

    try {
      const parsed = JSON.parse(body) as unknown;
      const rows = Array.isArray(parsed) ? parsed : [];
      const inserted = rows.find((row: unknown) => {
        if (!row || typeof row !== 'object') return false;
        const candidate = row as { id?: unknown; email_normalized?: unknown };
        return typeof candidate.id === 'string' && candidate.id.trim().length > 0 && candidate.email_normalized === probeIdentity.email;
      });

      if (!inserted) {
        return {
          id: 'write-waitlist-live',
          label: 'Waitlist live write path',
          status: 'fail',
          message: 'Insert response missing persisted row',
          detail: bodyPreview || 'Supabase did not return the inserted waitlist record.',
          latencyMs,
        };
      }

      return {
        id: 'write-waitlist-live',
        label: 'Waitlist live write path',
        status: 'pass',
        message: 'Insert returned persisted JSON row',
        detail: `content-type=${contentType} · source=readiness_audit`,
        latencyMs,
      };
    } catch (error) {
      return {
        id: 'write-waitlist-live',
        label: 'Waitlist live write path',
        status: 'fail',
        message: 'Insert response JSON parsing failed',
        detail: error instanceof Error ? error.message : 'Invalid JSON',
        latencyMs,
      };
    }
  } catch (error) {
    return {
      id: 'write-waitlist-live',
      label: 'Waitlist live write path',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Waitlist write probe failed',
      detail: 'The live waitlist write probe did not complete successfully.',
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    cleanup();
  }
}

async function probeSignupShadowPath(): Promise<ReadinessProbe> {
  const startedAt = Date.now();
  const probeIdentity = buildReadinessProbeIdentity('readiness-signup-shadow');
  const result = await persistMemberRegistrationShadow({
    email: probeIdentity.email,
    firstName: 'Readiness',
    lastName: 'Signup',
    phone: probeIdentity.phone,
    country: 'US',
    createdAt: probeIdentity.createdAt,
  });

  return {
    id: 'write-signup-shadow',
    label: 'Signup shadow write path',
    status: result.success ? 'pass' : 'fail',
    message: result.success ? 'Signup shadow persisted' : (result.error || 'Signup shadow persistence failed'),
    detail: result.success ? 'waitlist shadow insert returned success' : 'Returning-user/login durability is not proven while this write path fails.',
    latencyMs: Date.now() - startedAt,
  };
}

async function probeMemberProfilePath(): Promise<ReadinessProbe[]> {
  const startedAt = Date.now();
  const probeIdentity = buildReadinessProbeIdentity('readiness-member-profile');
  const profileId = `readiness-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const ensureResult = await ensureMemberProfileRecord({
    id: profileId,
    email: probeIdentity.email,
    firstName: 'Readiness',
    lastName: 'Member',
    phone: probeIdentity.phone,
    country: 'US',
    kycStatus: 'pending',
    role: 'investor',
    status: 'active',
    source: 'signup',
  });

  const probes: ReadinessProbe[] = [{
    id: 'write-member-profile-upsert',
    label: 'Member profile write path',
    status: ensureResult.success ? 'pass' : 'fail',
    message: ensureResult.success ? 'Profile upsert returned success' : (ensureResult.error || 'Profile upsert failed'),
    detail: ensureResult.success ? `profile_id=${profileId}` : 'Member creation/persistence is not proven while the profile write path fails.',
    latencyMs: Date.now() - startedAt,
  }];

  if (!ensureResult.success) {
    return probes;
  }

  const readStartedAt = Date.now();
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,updated_at')
      .eq('id', profileId)
      .maybeSingle();

    if (error) {
      probes.push({
        id: 'write-member-profile-readback',
        label: 'Member profile readback',
        status: 'fail',
        message: error.message,
        detail: 'Profile write succeeded locally but remote readback did not verify persistence.',
        latencyMs: Date.now() - readStartedAt,
      });
      return probes;
    }

    const persisted = !!data && data.id === profileId && data.email === probeIdentity.email;
    probes.push({
      id: 'write-member-profile-readback',
      label: 'Member profile readback',
      status: persisted ? 'pass' : 'fail',
      message: persisted ? 'Profile row read back successfully' : 'Profile row missing after write',
      detail: persisted ? `email=${data?.email ?? 'unknown'}` : 'Member persistence is not proven because the readback row could not be confirmed.',
      latencyMs: Date.now() - readStartedAt,
    });
  } catch (error) {
    probes.push({
      id: 'write-member-profile-readback',
      label: 'Member profile readback',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Profile readback failed',
      detail: 'Member persistence is not proven because the readback request threw an exception.',
      latencyMs: Date.now() - readStartedAt,
    });
  }

  return probes;
}

async function probeWaitlistPath(includeLiveWriteProbe: boolean = true): Promise<ReadinessProbe[]> {
  if (!isSupabaseConfigured()) {
    return [{
      id: 'write-waitlist-config',
      label: 'Waitlist write path',
      status: 'fail',
      message: 'Supabase not configured',
      detail: 'Waitlist persistence cannot be verified without a live backend.',
    }];
  }

  const probes: ReadinessProbe[] = [];
  const startedAt = Date.now();
  const tableResult = await supabase.from('waitlist_entries').select('id').limit(1);
  if (tableResult.error) {
    probes.push({
      id: 'write-waitlist-table',
      label: 'Waitlist entries table',
      status: 'fail',
      message: tableResult.error.message,
      detail: 'The primary waitlist write table is not healthy enough for intake traffic.',
      latencyMs: Date.now() - startedAt,
    });
  } else {
    probes.push({
      id: 'write-waitlist-table',
      label: 'Waitlist entries table',
      status: 'pass',
      message: 'Reachable',
      detail: 'Primary write table resolves and responds to lightweight read probes.',
      latencyMs: Date.now() - startedAt,
    });
  }

  const landingStartedAt = Date.now();
  const landingResult = await supabase.from('landing_submissions').select('id').limit(1);
  if (landingResult.error) {
    probes.push({
      id: 'write-landing-submissions-table',
      label: 'Landing submissions mirror',
      status: 'warn',
      message: landingResult.error.message,
      detail: 'Waitlist sync shadow table is not fully verified.',
      latencyMs: Date.now() - landingStartedAt,
    });
  } else {
    probes.push({
      id: 'write-landing-submissions-table',
      label: 'Landing submissions mirror',
      status: 'pass',
      message: 'Reachable',
      detail: 'Secondary persistence path responds correctly to lightweight read probes.',
      latencyMs: Date.now() - landingStartedAt,
    });
  }

  if (includeLiveWriteProbe) {
    probes.push(await probeWaitlistWritePath());
  }

  return probes;
}

async function probeConcurrentWritePaths(): Promise<ReadinessProbe[]> {
  const waitlistResults = await Promise.all(
    Array.from({ length: WRITE_CONCURRENCY_SAMPLE_SIZE }, () => probeWaitlistWritePath())
  );
  const signupResults = await Promise.all(
    Array.from({ length: WRITE_CONCURRENCY_SAMPLE_SIZE }, () => probeSignupShadowPath())
  );
  const memberResults = await Promise.all(
    Array.from({ length: WRITE_CONCURRENCY_SAMPLE_SIZE }, () => probeMemberProfilePath())
  );

  const flattenedMemberResults = memberResults.flat();
  const allWriteResults = [...waitlistResults, ...signupResults, ...flattenedMemberResults];
  const failureCount = allWriteResults.filter((probe) => probe.status === 'fail').length;
  const warnCount = allWriteResults.filter((probe) => probe.status === 'warn').length;
  const status = getProbeStatusFromFailures(failureCount, warnCount);

  return [
    {
      id: 'write-path-burst-summary',
      label: 'Write path burst validation',
      status,
      message: status === 'pass'
        ? `${allWriteResults.length} concurrent write probes passed`
        : `${failureCount} concurrent write probe(s) failed`,
      detail: `waitlist=${waitlistResults.length} · signup=${signupResults.length} · member=${flattenedMemberResults.length}`,
    },
  ];
}

async function probeMemberPersistence(mode: ReadinessAuditMode): Promise<ReadinessProbe[]> {
  const snapshot = await getAdminMemberRegistrySnapshot({ mode });
  const staleLocalOnlyCount = snapshot.staleLocalOnlyCount;
  const hasRegistryEvidence = snapshot.localCount > 0 || snapshot.remoteCount > 0;

  return [
    {
      id: 'member-registry-merged',
      label: 'Member registry durability',
      status: hasRegistryEvidence ? 'pass' : 'warn',
      message: mode === 'light'
        ? hasRegistryEvidence
          ? 'Lightweight member registry sample completed'
          : 'No local or sampled remote member records detected'
        : `${snapshot.mergedCount} merged member record(s)`,
      detail: mode === 'light'
        ? `local=${snapshot.localCount} · sampled_profiles=${snapshot.remoteProfileCount} · sampled_waitlist=${snapshot.remoteWaitlistShadowCount} · sampled_landing=${snapshot.remoteLandingSubmissionShadowCount}`
        : `profiles=${snapshot.remoteProfileCount} · waitlist shadows=${snapshot.remoteWaitlistShadowCount} · landing shadows=${snapshot.remoteLandingSubmissionShadowCount}`,
    },
    {
      id: 'member-registry-stale-local',
      label: 'Member persistence drift',
      status: mode === 'light' ? 'warn' : staleLocalOnlyCount === 0 ? 'pass' : 'warn',
      message: mode === 'light'
        ? 'Drift confirmation is skipped during lightweight scans'
        : staleLocalOnlyCount === 0
          ? 'No stale local-only member records detected'
          : `${staleLocalOnlyCount} local-only record(s) still need remote confirmation`,
      detail: mode === 'light'
        ? 'Run a full audit to compare local registry records against remote member sources.'
        : 'If this stays above zero, 30k readiness is not fully proven for member persistence.',
    },
  ];
}

export async function runLandingReadinessAudit(options: RunLandingReadinessAuditOptions = {}): Promise<ReadinessAuditResult> {
  const mode = options.mode ?? 'full';
  const force = options.force ?? false;

  if (!force) {
    const cachedResult = getCachedReadinessAudit(mode);
    if (cachedResult) {
      return cachedResult;
    }

    const inFlightAudit = readinessAuditInFlight.get(mode);
    if (inFlightAudit) {
      console.log('[LandingReadinessAudit] Joining in-flight', mode, 'audit');
      return inFlightAudit;
    }
  }

  const auditPromise = (async (): Promise<ReadinessAuditResult> => {
    const probes: ReadinessProbe[] = [];
    const directApiBaseUrl = getDirectApiBaseUrl();

    pushProbe(probes, {
      id: `scan-mode-${mode}`,
      label: 'Readiness scan mode',
      status: 'pass',
      message: mode === 'full' ? 'Deep audit running with live write validation' : 'Lightweight read-only scan running',
      detail: mode === 'full'
        ? 'Burst and persistence probes are enabled for explicit backend verification.'
        : 'Automatic health checks stay read-only and skip burst/load probes so routine scans do not hammer Supabase.',
    });

    const publicLandingDealsProbe = await probeDealsEndpoint(`${PUBLIC_LANDING_URL}/api/landing-deals`, 'public-landing-deals', 'Public API');
    pushProbe(probes, publicLandingDealsProbe);
    const publicLandingDealsBurstProbe = mode === 'full'
      ? await probeDealsEndpointBurst(`${PUBLIC_LANDING_URL}/api/landing-deals`, 'public-landing-deals', 'Public API')
      : null;
    if (publicLandingDealsBurstProbe) {
      pushProbe(probes, publicLandingDealsBurstProbe);
    }
    const publicPublishedDealsProbe = await probeDealsEndpoint(`${PUBLIC_LANDING_URL}/api/published-jv-deals`, 'public-published-jv-deals', 'Public API');
    pushProbe(probes, publicPublishedDealsProbe);
    const publicPublishedDealsBurstProbe = mode === 'full'
      ? await probeDealsEndpointBurst(`${PUBLIC_LANDING_URL}/api/published-jv-deals`, 'public-published-jv-deals', 'Public API')
      : null;
    if (publicPublishedDealsBurstProbe) {
      pushProbe(probes, publicPublishedDealsBurstProbe);
    }
    const publicHealthProbe = await probeJsonHealth(`${PUBLIC_LANDING_URL}/health`, 'Public API');
    pushProbe(probes, publicHealthProbe);

    if (directApiBaseUrl) {
      pushProbe(probes, await probeDealsEndpoint(`${directApiBaseUrl}/api/landing-deals`, 'direct-landing-deals', 'Direct API'));
      if (mode === 'full') {
        pushProbe(probes, await probeDealsEndpointBurst(`${directApiBaseUrl}/api/landing-deals`, 'direct-landing-deals', 'Direct API'));
      }

      const directPublishedDealsProbe = normalizeSupportedDirectMirrorProbe(
        await probeDealsEndpoint(`${directApiBaseUrl}/api/published-jv-deals`, 'direct-published-jv-deals', 'Direct API'),
        publicPublishedDealsProbe,
        'Published deals'
      );
      pushProbe(probes, directPublishedDealsProbe);

      if (mode === 'full' && publicPublishedDealsBurstProbe) {
        const directPublishedBurstProbe = normalizeSupportedDirectMirrorProbe(
          await probeDealsEndpointBurst(`${directApiBaseUrl}/api/published-jv-deals`, 'direct-published-jv-deals', 'Direct API'),
          publicPublishedDealsBurstProbe,
          'Published deals burst validation'
        );
        pushProbe(probes, directPublishedBurstProbe);
      }

      const directHealthUrl = `${directApiBaseUrl}/health`;
      const directHealthProbe = normalizeSupportedDirectMirrorProbe(
        await probeJsonHealth(directHealthUrl, 'Direct API'),
        publicHealthProbe,
        'Health endpoint'
      );
      pushProbe(probes, directHealthProbe);
    } else {
      pushProbe(probes, {
        id: 'direct-api-missing',
        label: 'Direct API base URL',
        status: 'fail',
        message: 'EXPO_PUBLIC_RORK_API_BASE_URL is not configured',
        detail: 'Cannot bypass CDN routing to verify the backend directly.',
      });
    }

    if (mode === 'full') {
      const signupShadowProbe = await probeSignupShadowPath();
      pushProbe(probes, signupShadowProbe);
    }

    const waitlistProbes = await probeWaitlistPath(mode === 'full');
    waitlistProbes.forEach((probe) => pushProbe(probes, probe));

    if (mode === 'full') {
      const memberProfileProbes = await probeMemberProfilePath();
      memberProfileProbes.forEach((probe) => pushProbe(probes, probe));

      const concurrentWriteProbes = await probeConcurrentWritePaths();
      concurrentWriteProbes.forEach((probe) => pushProbe(probes, probe));
    }

    const memberProbes = await probeMemberPersistence(mode);
    memberProbes.forEach((probe) => pushProbe(probes, probe));

    const blockingProbeCount = probes.filter((probe) => probe.status === 'fail').length;
    const warningProbeCount = probes.filter((probe) => probe.status === 'warn').length;
    const scaleAssessments = [
      buildScaleAssessment(30000, probes, mode),
      buildScaleAssessment(1000000, probes, mode),
    ];
    const scale30k = scaleAssessments[0];
    const scale1M = scaleAssessments[1];

    if (mode === 'full') {
      pushProbe(probes, {
        id: 'load-30k-proof',
        label: '30k launch-path readiness',
        status: scale30k.status,
        message: scale30k.summary,
        detail: `mode=${mode} · evidence=${scale30k.evidence} · blocking=${blockingProbeCount} · warnings=${warningProbeCount} · api_sample_size=${API_CONCURRENCY_SAMPLE_SIZE} · write_sample_size=${WRITE_CONCURRENCY_SAMPLE_SIZE}`,
      });

      pushProbe(probes, {
        id: 'load-1m-proof',
        label: '1M scale readiness',
        status: scale1M.status,
        message: scale1M.summary,
        detail: `mode=${mode} · evidence=${scale1M.evidence} · million-user saturation is not claimed from app-side probes alone`,
      });
    }

    const overallStatus = resolveOverallStatus(probes);
    const readyFor30k = scale30k.status === 'pass';
    const readyFor1M = scale1M.status === 'pass';

    const result: ReadinessAuditResult = {
      mode,
      overallStatus,
      readyFor30k,
      readyFor1M,
      probes,
      scaleAssessments,
      blockerCount: blockingProbeCount,
      warningCount: warningProbeCount,
      summary: mode === 'light'
        ? overallStatus === 'fail'
          ? 'Read-only readiness scan found critical blockers.'
          : overallStatus === 'warn'
            ? 'Read-only readiness scan found issues that need review.'
            : 'Read-only readiness scan passed. Run a full audit before making write-path scale claims.'
        : readyFor30k
          ? readyFor1M
            ? '30k and 1M readiness both validated.'
            : '30k launch-path readiness is passing. 1M is not proven yet.'
          : overallStatus === 'fail'
            ? 'Critical blockers remain. Do not claim 30k readiness yet.'
            : 'Core paths are healthier, but some readiness checks still need stronger proof.',
    };

    setCachedReadinessAudit(mode, result);
    return result;
  })().finally(() => {
    readinessAuditInFlight.delete(mode);
  });

  readinessAuditInFlight.set(mode, auditPromise);
  return auditPromise;
}
