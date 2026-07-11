/**
 * QR URL utilities.
 *
 * Separates the three values that were previously conflated:
 * - QR_IMAGE_URL: a URL that points to a QR code PNG (e.g. api.qrserver.com) — must be
 *   rendered as an image inside the app, NEVER opened as a browser page.
 * - QR_DESTINATION_URL: the link encoded inside the QR — the only value that may ever
 *   be navigated to, and only on explicit user action.
 * - RETURN_URL: the in-app route the user returns to (handled by closing the modal).
 */

const QR_IMAGE_HOST_PATTERNS: RegExp[] = [
  /(^|\.)api\.qrserver\.com$/i,
  /(^|\.)qrserver\.com$/i,
  /(^|\.)chart\.googleapis\.com$/i,
  /(^|\.)quickchart\.io$/i,
];

const QR_IMAGE_PATH_PATTERNS: RegExp[] = [
  /create-qr-code/i,
  /\/qr(code)?([/?]|$)/i,
];

function tryParseUrl(value: string | null | undefined): URL | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

/** True when the URL points to a QR code image generator (raw QR PNG endpoint). */
export function isQrImageUrl(value: string | null | undefined): boolean {
  const url = tryParseUrl(value);
  if (!url) return false;
  const hostMatch = QR_IMAGE_HOST_PATTERNS.some((p) => p.test(url.hostname));
  if (hostMatch) return true;
  return QR_IMAGE_PATH_PATTERNS.some((p) => p.test(url.pathname)) && url.searchParams.has('data');
}

/**
 * Extracts the destination URL encoded inside a QR image URL (the `data` query param
 * used by api.qrserver.com and compatible services). Returns null when the payload is
 * not a plain http(s) URL — secrets/tokens/exp:// payloads are never surfaced as
 * navigable destinations.
 */
export function extractQrDestinationUrl(value: string | null | undefined): string | null {
  const url = tryParseUrl(value);
  if (!url) return null;
  const data = url.searchParams.get('data') ?? url.searchParams.get('text') ?? url.searchParams.get('chl');
  if (!data) return null;
  const decoded = data.trim();
  const destination = tryParseUrl(decoded);
  if (!destination) return null;
  if (destination.protocol !== 'https:' && destination.protocol !== 'http:') return null;
  return destination.toString();
}

/** True when the string parses as an http(s) URL. */
export function isProbablyHttpUrl(value: string | null | undefined): boolean {
  const url = tryParseUrl(value);
  return !!url && (url.protocol === 'https:' || url.protocol === 'http:');
}

const FORBIDDEN_DESTINATION_VALUES = /\b(PLACEHOLDER|UNKNOWN|PENDING|MOCK|TODO|CHANGEME|EXAMPLE\.COM)\b/i;

const FORBIDDEN_DESTINATION_HOSTS: RegExp[] = [
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /^0\.0\.0\.0$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /\.rork\.app$/i,
  /^rork\.app$/i,
  /\.rork\.com$/i,
  /\.exp\.direct$/i,
  /\.expo\.dev$/i,
  /\.exp\.host$/i,
  /\.ngrok(-free)?\.(io|app|dev)$/i,
  /\.local$/i,
];

/**
 * Attempts to detect expired signed URLs (e.g. Supabase/S3 presigned links with an
 * `Expires`/`X-Amz-Expires`-style deadline or a JWT `exp` in a `token` param).
 */
function isExpiredSignedUrl(url: URL): boolean {
  const expiresRaw = url.searchParams.get('Expires') ?? url.searchParams.get('expires');
  if (expiresRaw && /^\d{9,10}$/.test(expiresRaw)) {
    return Number.parseInt(expiresRaw, 10) * 1000 < Date.now();
  }
  const amzDate = url.searchParams.get('X-Amz-Date');
  const amzExpires = url.searchParams.get('X-Amz-Expires');
  if (amzDate && amzExpires && /^\d{8}T\d{6}Z$/.test(amzDate) && /^\d+$/.test(amzExpires)) {
    const start = Date.parse(
      `${amzDate.slice(0, 4)}-${amzDate.slice(4, 6)}-${amzDate.slice(6, 8)}T${amzDate.slice(9, 11)}:${amzDate.slice(11, 13)}:${amzDate.slice(13, 15)}Z`,
    );
    if (Number.isFinite(start)) {
      return start + Number.parseInt(amzExpires, 10) * 1000 < Date.now();
    }
  }
  const token = url.searchParams.get('token');
  if (token && token.split('.').length === 3) {
    try {
      const payloadPart = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(
        typeof atob === 'function' ? atob(payloadPart) : Buffer.from(payloadPart, 'base64').toString('utf8'),
      ) as { exp?: number };
      if (typeof payload.exp === 'number') {
        return payload.exp * 1000 < Date.now();
      }
    } catch {
      return false;
    }
  }
  return false;
}

export type DestinationValidationResult = {
  ok: boolean;
  reason:
    | 'ok'
    | 'empty'
    | 'forbidden-value'
    | 'invalid-protocol'
    | 'forbidden-host'
    | 'expired-signed-url'
    | 'not-a-url';
};

/**
 * Validates a QR destination URL before a QR code is generated from it.
 * Rejects empty values, placeholder text, localhost/loopback/LAN hosts,
 * Rork preview URLs, temporary Expo tunnel URLs, expired signed URLs, and
 * non-http(s) protocols. Only validated destinations may be encoded into QRs.
 */
export function validateDestinationUrl(value: string | null | undefined): DestinationValidationResult {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (FORBIDDEN_DESTINATION_VALUES.test(trimmed)) return { ok: false, reason: 'forbidden-value' };
  const url = tryParseUrl(trimmed);
  if (!url) return { ok: false, reason: 'not-a-url' };
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'invalid-protocol' };
  if (FORBIDDEN_DESTINATION_HOSTS.some((p) => p.test(url.hostname))) return { ok: false, reason: 'forbidden-host' };
  if (isExpiredSignedUrl(url)) return { ok: false, reason: 'expired-signed-url' };
  return { ok: true, reason: 'ok' };
}

const SENSITIVE_PAYLOAD_PATTERNS: RegExp[] = [
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /eyJhbGciOi[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /\b(password|passwd|secret|api[_-]?key|access[_-]?token|session[_-]?token|service[_-]?role)=[^&\s]+/i,
];

/** True when a QR payload contains token/secret material and must never be encoded. */
export function containsSensitivePayload(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return false;
  const decoded = (() => {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  })();
  return SENSITIVE_PAYLOAD_PATTERNS.some((p) => p.test(trimmed) || p.test(decoded));
}

/** Host-only view of a URL, safe for diagnostics logs (never logs the QR payload). */
export function safeUrlHost(value: string | null | undefined): string {
  const url = tryParseUrl(value);
  return url ? url.hostname : 'invalid-url';
}

/** Short trace id for QR diagnostics correlation. */
export function newQrTraceId(): string {
  return `qr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type QrImageValidationResult = {
  ok: boolean;
  status: number | null;
  contentType: string | null;
  reason: 'ok' | 'http-error' | 'not-image' | 'timeout' | 'network-error' | 'invalid-url';
};

/**
 * Validates that a remote QR image URL actually serves an image (HTTP 200 + image/*
 * Content-Type) before rendering it, with a hard timeout. Fetch is used strictly as an
 * image probe — the URL is never handed to the browser or navigation stack.
 */
export async function validateQrImageUrl(
  imageUrl: string,
  timeoutMs = 10000,
): Promise<QrImageValidationResult> {
  if (!isProbablyHttpUrl(imageUrl)) {
    return { ok: false, status: null, contentType: null, reason: 'invalid-url' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(imageUrl, { method: 'GET', signal: controller.signal });
    const contentType = response.headers.get('content-type');
    if (!response.ok) {
      return { ok: false, status: response.status, contentType, reason: 'http-error' };
    }
    if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
      return { ok: false, status: response.status, contentType, reason: 'not-image' };
    }
    return { ok: true, status: response.status, contentType, reason: 'ok' };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, status: null, contentType: null, reason: aborted ? 'timeout' : 'network-error' };
  } finally {
    clearTimeout(timer);
  }
}

function detectPlatform(): string {
  const nav = (globalThis as { navigator?: { product?: string } }).navigator;
  if (nav?.product === 'ReactNative') return 'react-native';
  if (typeof (globalThis as { document?: unknown }).document !== 'undefined') return 'web';
  return 'node';
}

/** Structured, payload-free diagnostics for the QR flow. */
export function logQrDiagnostics(entry: {
  traceId: string;
  route: string;
  component: string;
  action: string;
  imageRequestStatus?: string;
  destinationValid?: boolean;
  navigationTarget?: 'in-app-modal' | 'external-browser' | 'none';
}): void {
  console.log('[QRFlow]', JSON.stringify({ ...entry, platform: detectPlatform() }));
}
