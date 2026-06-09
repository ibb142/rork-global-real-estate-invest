export interface DealsJsonFetchSuccess {
  ok: true;
  status: number;
  contentType: string;
  deals: Record<string, unknown>[];
  payload: unknown;
}

function isLikelyBase64Image(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('data:image/') || normalized.includes(';base64,');
}

function isRemoteUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('https://') || normalized.startsWith('http://');
}

function validateDealShape(deal: Record<string, unknown>, index: number): string[] {
  const errors: string[] = [];
  const id = typeof deal.id === 'string' ? deal.id.trim() : '';
  const title = typeof deal.title === 'string' ? deal.title.trim() : '';

  if (!id) {
    errors.push(`deal[${index}] missing id`);
  }

  if (!title) {
    errors.push(`deal[${index}] missing title`);
  }

  if ('photos' in deal) {
    const photos = deal.photos;
    if (!Array.isArray(photos)) {
      errors.push(`deal[${index}] photos must be an array`);
    } else {
      photos.forEach((photo, photoIndex) => {
        if (typeof photo !== 'string' || !photo.trim()) {
          errors.push(`deal[${index}] photo[${photoIndex}] missing url`);
          return;
        }

        if (isLikelyBase64Image(photo)) {
          errors.push(`deal[${index}] photo[${photoIndex}] uses base64 payload`);
          return;
        }

        if (!isRemoteUrl(photo)) {
          errors.push(`deal[${index}] photo[${photoIndex}] is not a remote url`);
        }
      });
    }
  }

  return errors;
}

function validateDeals(deals: Record<string, unknown>[]): string[] {
  const errors: string[] = [];
  deals.forEach((deal, index) => {
    errors.push(...validateDealShape(deal, index));
  });
  return errors;
}

export function getDealsFromPayload(payload: unknown): Record<string, unknown>[] | null {
  return extractDeals(payload);
}

export function validateDealsPayload(payload: unknown): { ok: true; deals: Record<string, unknown>[] } | { ok: false; error: string; deals: Record<string, unknown>[] } {
  const deals = extractDeals(payload);
  if (!deals) {
    return {
      ok: false,
      error: 'JSON schema mismatch: expected array or { deals: [] }',
      deals: [],
    };
  }

  if (deals.length === 0) {
    return {
      ok: false,
      error: 'JSON payload empty: expected at least one deal',
      deals,
    };
  }

  const dealErrors = validateDeals(deals);
  if (dealErrors.length > 0) {
    return {
      ok: false,
      error: `Deal validation failed: ${dealErrors.slice(0, 6).join(' | ')}`,
      deals,
    };
  }

  return { ok: true, deals };
}

export async function inspectDealsJsonResponse(
  response: Response,
  endpointName: string
): Promise<DealsJsonFetchResult> {
  const body = await response.text();
  const contentType = getContentType(response);
  const bodyPreview = body.slice(0, 240);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      contentType,
      error: `[${endpointName}] HTTP ${response.status}`,
      bodyPreview,
    };
  }

  if (!contentType.includes('application/json')) {
    return {
      ok: false,
      status: response.status,
      contentType,
      error: `[${endpointName}] Expected application/json but received ${contentType || 'unknown'}`,
      bodyPreview,
    };
  }

  if (isHtmlBody(body)) {
    return {
      ok: false,
      status: response.status,
      contentType,
      error: `[${endpointName}] HTML fallback detected in JSON endpoint`,
      bodyPreview,
    };
  }

  const parsed = safeParseJson(body);
  if (!parsed.ok) {
    return {
      ok: false,
      status: response.status,
      contentType,
      error: `[${endpointName}] ${parsed.error}`,
      bodyPreview,
    };
  }

  const validation = validateDealsPayload(parsed.value);
  if (!validation.ok) {
    return {
      ok: false,
      status: response.status,
      contentType,
      error: `[${endpointName}] ${validation.error}`,
      bodyPreview,
    };
  }

  return {
    ok: true,
    status: response.status,
    contentType,
    deals: validation.deals,
    payload: parsed.value,
  };
}

export async function inspectDealsJsonUrl(
  url: string,
  options: {
    endpointName: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
  }
): Promise<DealsJsonFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });

    return await inspectDealsJsonResponse(response, options.endpointName);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      error: `[${options.endpointName}] ${error instanceof Error ? error.message : 'Request failed'}`,
      bodyPreview: '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface DealsJsonFetchFailure {
  ok: false;
  status: number;
  contentType: string;
  error: string;
  bodyPreview: string;
}

export type DealsJsonFetchResult = DealsJsonFetchSuccess | DealsJsonFetchFailure;

export interface JsonObjectFetchSuccess {
  ok: true;
  status: number;
  contentType: string;
  payload: Record<string, unknown>;
}

export interface JsonObjectSchemaValidationOptions {
  validate?: (payload: Record<string, unknown>) => string | null;
}

export interface JsonObjectFetchFailure {
  ok: false;
  status: number;
  contentType: string;
  error: string;
  bodyPreview: string;
}

export type JsonObjectFetchResult = JsonObjectFetchSuccess | JsonObjectFetchFailure;

function getContentType(response: Response): string {
  return (response.headers.get('content-type') || '').toLowerCase();
}

function validateJsonContentType(response: Response, endpointName: string, bodyPreview: string): JsonObjectFetchFailure | null {
  const contentType = getContentType(response);
  if (response.ok && contentType.includes('application/json')) {
    return null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      contentType,
      error: `[${endpointName}] HTTP ${response.status}`,
      bodyPreview,
    };
  }

  return {
    ok: false,
    status: response.status,
    contentType,
    error: `[${endpointName}] Expected application/json but received ${contentType || 'unknown'}`,
    bodyPreview,
  };
}

function isHtmlBody(body: string): boolean {
  const normalized = body.trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html') || normalized.includes('<body');
}

function safeParseJson(body: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}

function extractDeals(payload: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  }

  if (payload && typeof payload === 'object' && 'deals' in payload) {
    const deals = (payload as { deals?: unknown }).deals;
    if (Array.isArray(deals)) {
      return deals.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
  }

  return null;
}

export async function inspectJsonObjectResponse(
  response: Response,
  endpointName: string,
  options?: JsonObjectSchemaValidationOptions
): Promise<JsonObjectFetchResult> {
  const body = await response.text();
  const bodyPreview = body.slice(0, 240);
  const contentTypeFailure = validateJsonContentType(response, endpointName, bodyPreview);
  if (contentTypeFailure) {
    return contentTypeFailure;
  }

  if (isHtmlBody(body)) {
    return {
      ok: false,
      status: response.status,
      contentType: getContentType(response),
      error: `[${endpointName}] HTML fallback detected in JSON endpoint`,
      bodyPreview,
    };
  }

  const parsed = safeParseJson(body);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return {
      ok: false,
      status: response.status,
      contentType: getContentType(response),
      error: `[${endpointName}] JSON payload must be a non-array object`,
      bodyPreview,
    };
  }

  const payload = parsed.value as Record<string, unknown>;
  const schemaError = options?.validate?.(payload) ?? null;
  if (schemaError) {
    return {
      ok: false,
      status: response.status,
      contentType: getContentType(response),
      error: `[${endpointName}] ${schemaError}`,
      bodyPreview,
    };
  }

  return {
    ok: true,
    status: response.status,
    contentType: getContentType(response),
    payload,
  };
}

export async function inspectJsonObjectUrl(
  url: string,
  options: {
    endpointName: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
    validate?: (payload: Record<string, unknown>) => string | null;
  }
): Promise<JsonObjectFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });

    return await inspectJsonObjectResponse(response, options.endpointName, { validate: options.validate });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      error: `[${options.endpointName}] ${error instanceof Error ? error.message : 'Request failed'}`,
      bodyPreview: '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDealsJsonEndpoint(
  url: string,
  options: {
    endpointName: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
  }
): Promise<DealsJsonFetchResult> {
  return inspectDealsJsonUrl(url, options);
}
