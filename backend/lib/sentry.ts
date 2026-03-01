const SENTRY_DSN = process.env.SENTRY_DSN;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const APP_VERSION = '1.0.0';

interface SentryEvent {
  level: 'fatal' | 'error' | 'warning' | 'info';
  message: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id: string; email?: string };
  fingerprint?: string[];
  timestamp?: number;
}

interface SentryResult {
  success: boolean;
  eventId?: string;
}

function parseDSN(dsn: string): { publicKey: string; projectId: string; host: string } | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace('/', '');
    const host = url.host;
    return { publicKey, projectId, host };
  } catch {
    console.error('[Sentry] Invalid DSN format');
    return null;
  }
}

async function sendToSentry(event: SentryEvent): Promise<SentryResult> {
  if (!SENTRY_DSN) {
    if (event.level === 'error' || event.level === 'fatal') {
      console.error(`[Sentry] [${event.level.toUpperCase()}] ${event.message}`, event.extra || '');
    } else {
      console.warn(`[Sentry] [${event.level.toUpperCase()}] ${event.message}`);
    }
    return { success: false };
  }

  const parsed = parseDSN(SENTRY_DSN);
  if (!parsed) return { success: false };

  const sentryPayload = {
    event_id: crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: event.timestamp || Date.now() / 1000,
    level: event.level,
    platform: 'node',
    server_name: 'ipx-api',
    release: `ipx-api@${APP_VERSION}`,
    environment: IS_PRODUCTION ? 'production' : 'development',
    message: { formatted: event.message },
    tags: { ...event.tags, runtime: 'bun' },
    extra: event.extra,
    user: event.user,
    fingerprint: event.fingerprint,
  };

  try {
    const url = `https://${parsed.host}/api/${parsed.projectId}/store/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=ipx-api/${APP_VERSION}, sentry_key=${parsed.publicKey}`,
      },
      body: JSON.stringify(sentryPayload),
    });

    if (response.ok) {
      const data = await response.json() as { id?: string };
      return { success: true, eventId: data.id || sentryPayload.event_id };
    }

    console.error(`[Sentry] Failed to send event (${response.status})`);
    return { success: false };
  } catch (error) {
    console.error('[Sentry] Request failed:', error);
    return { success: false };
  }
}

export function captureError(error: Error, context?: { userId?: string; email?: string; tags?: Record<string, string>; extra?: Record<string, unknown> }): Promise<SentryResult> {
  return sendToSentry({
    level: 'error',
    message: error.message,
    tags: { ...context?.tags, errorName: error.name },
    extra: {
      ...context?.extra,
      stack: error.stack,
    },
    user: context?.userId ? { id: context.userId, email: context.email } : undefined,
  });
}

export function captureMessage(message: string, level: SentryEvent['level'] = 'info', context?: { userId?: string; tags?: Record<string, string>; extra?: Record<string, unknown> }): Promise<SentryResult> {
  return sendToSentry({
    level,
    message,
    tags: context?.tags,
    extra: context?.extra,
    user: context?.userId ? { id: context.userId } : undefined,
  });
}

export function captureWarning(message: string, context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }): Promise<SentryResult> {
  return captureMessage(message, 'warning', context);
}

export function captureSecurityEvent(event: string, details: Record<string, unknown>): Promise<SentryResult> {
  return sendToSentry({
    level: 'warning',
    message: `[SECURITY] ${event}`,
    tags: { category: 'security', event },
    extra: details,
    fingerprint: ['security', event],
  });
}

export function isConfigured(): boolean {
  return !!SENTRY_DSN;
}

export function logSentryStatus(): void {
  if (SENTRY_DSN) {
    console.log(`[Sentry] Configured (env: ${IS_PRODUCTION ? 'production' : 'development'})`);
  } else {
    console.warn('[Sentry] Not configured — errors will be logged to console only');
  }
}
