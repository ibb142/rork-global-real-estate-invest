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
