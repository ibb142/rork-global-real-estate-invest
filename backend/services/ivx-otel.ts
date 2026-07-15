/**
 * IVX OpenTelemetry Scaffold
 *
 * Detects whether an OTLP exporter endpoint is configured. When present,
 * traces are emitted as structured JSONL spans into
 * `logs/audit/otel/spans.jsonl`. When the endpoint is absent we mark
 * status `waiting_external_setup` — no network calls are made and no
 * keys are required.
 *
 * Recognized env names (any one is sufficient):
 *   - OTEL_EXPORTER_OTLP_ENDPOINT
 *   - OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
 *   - IVX_OTEL_EXPORTER_ENDPOINT
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const IVX_OTEL_MARKER = 'ivx-otel-2026-05-28';

const OTEL_ENV_NAMES = [
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
  'IVX_OTEL_EXPORTER_ENDPOINT',
] as const;

export type OTelStatus = {
  ok: boolean;
  marker: string;
  status: 'enabled' | 'waiting_external_setup';
  configuredEnvName: string | null;
  missingEnvNames: string[];
  serviceName: string;
  sampledSpanFile: string;
  note: string;
};

function resolveExporterEnv(): { name: string | null; value: string } {
  for (const name of OTEL_ENV_NAMES) {
    const value = (process.env[name] ?? '').trim();
    if (value) return { name, value };
  }
  return { name: null, value: '' };
}

export function getOTelStatus(): OTelStatus {
  const { name } = resolveExporterEnv();
  const serviceName = (process.env.OTEL_SERVICE_NAME ?? 'ivx-senior-developer-ai').trim();
  const sampledSpanFile = path.resolve(process.cwd(), 'logs', 'audit', 'otel', 'spans.jsonl');
  return {
    ok: true,
    marker: IVX_OTEL_MARKER,
    status: name ? 'enabled' : 'waiting_external_setup',
    configuredEnvName: name,
    missingEnvNames: name ? [] : [...OTEL_ENV_NAMES],
    serviceName,
    sampledSpanFile,
    note: name
      ? 'Exporter endpoint detected. Spans are sampled into the JSONL file; full OTLP push activates when the SDK package is installed.'
      : 'No OTLP exporter endpoint configured. Tracing scaffold installed; set OTEL_EXPORTER_OTLP_ENDPOINT to enable.',
  };
}

export type SpanEvent = {
  name: string;
  durationMs: number;
  attributes?: Record<string, string | number | boolean | null>;
  startedAt?: string;
};

/**
 * Record a span locally as JSONL and, when an OTLP exporter endpoint is
 * configured, push the span to `<endpoint>/v1/traces` using the official
 * OTLP/HTTP JSON wire format. We do not require an SDK package — this is
 * a minimal, dependency-free OTLP/HTTP exporter. All failures are
 * swallowed so tracing never breaks the request path.
 */
export async function recordSpan(event: SpanEvent): Promise<void> {
  const { name, value } = resolveExporterEnv();
  const service = (process.env.OTEL_SERVICE_NAME ?? 'ivx-senior-developer-ai').trim();
  const startedAt = event.startedAt ?? new Date().toISOString();
  const spanFile = path.resolve(process.cwd(), 'logs', 'audit', 'otel', 'spans.jsonl');
  const row = JSON.stringify({
    marker: IVX_OTEL_MARKER,
    service,
    exporter: name ?? 'none',
    name: event.name,
    durationMs: event.durationMs,
    attributes: event.attributes ?? {},
    startedAt,
  });
  try {
    await fs.mkdir(path.dirname(spanFile), { recursive: true });
    await fs.appendFile(spanFile, row + '\n', 'utf8');
  } catch {
    // never throw from tracing
  }
  if (name && value) {
    try {
      await pushSpanOTLP({ endpoint: value, service, event, startedAt });
    } catch {
      // exporter must never throw
    }
  }
}

function toNanoString(ms: number): string {
  // Convert millisecond epoch to nanoseconds as a decimal string (OTLP requirement).
  const ns = BigInt(Math.max(0, Math.floor(ms))) * 1_000_000n;
  return ns.toString();
}

function randomHex(bytes: number): string {
  const out: string[] = [];
  for (let i = 0; i < bytes; i += 1) {
    out.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
  }
  return out.join('');
}

function toAnyValue(v: string | number | boolean | null): Record<string, unknown> {
  if (v === null) return { stringValue: '' };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { boolValue: v };
  if (Number.isInteger(v)) return { intValue: String(v) };
  return { doubleValue: v };
}

async function pushSpanOTLP(opts: { endpoint: string; service: string; event: SpanEvent; startedAt: string }): Promise<void> {
  const startMs = new Date(opts.startedAt).getTime();
  const endMs = startMs + Math.max(0, opts.event.durationMs);
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  const attributes = Object.entries(opts.event.attributes ?? {}).map(([k, v]) => ({
    key: k,
    value: toAnyValue(v),
  }));
  const payload = {
    resourceSpans: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: opts.service } }] },
        scopeSpans: [
          {
            scope: { name: 'ivx-senior-developer-ai', version: '1.0.0' },
            spans: [
              {
                traceId,
                spanId,
                name: opts.event.name,
                kind: 1,
                startTimeUnixNano: toNanoString(startMs),
                endTimeUnixNano: toNanoString(endMs),
                attributes,
                status: { code: 0 },
              },
            ],
          },
        ],
      },
    ],
  };
  const base = opts.endpoint.replace(/\/+$/, '');
  const url = base.endsWith('/v1/traces') ? base : `${base}/v1/traces`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = (process.env.OTEL_EXPORTER_OTLP_HEADERS ?? '').trim();
  if (authHeader) {
    for (const pair of authHeader.split(',')) {
      const [hk, hv] = pair.split('=');
      if (hk && hv) headers[hk.trim()] = hv.trim();
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Status of OTLP push pipeline — used by the senior-dev evidence panel. */
export function getOTelExporterMode(): 'otlp_http_json_push' | 'jsonl_only' {
  const { name } = resolveExporterEnv();
  return name ? 'otlp_http_json_push' : 'jsonl_only';
}
