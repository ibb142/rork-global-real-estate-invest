import { getIVXAccessToken, getIVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';

export type IVXControlRoomItemStatus = 'verified' | 'connected' | 'available' | 'not_verified' | 'not_connected' | 'missing_access' | 'blocked';

export type IVXControlRoomItem = {
  id: string;
  label: string;
  status: IVXControlRoomItemStatus;
  detail: string;
  missingCredentialNames?: string[];
};

export type IVXControlRoomStatus = {
  ok: boolean;
  ownerOnly: boolean;
  readOnly: boolean;
  generatedAt: string;
  authenticatedUserId?: string;
  statusItems: IVXControlRoomItem[];
  missingCredentialNames: string[];
  tools?: string[];
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

function normalizeStatus(value: unknown): IVXControlRoomItemStatus {
  const normalized = readString(value);
  if (
    normalized === 'verified'
    || normalized === 'connected'
    || normalized === 'available'
    || normalized === 'not_verified'
    || normalized === 'not_connected'
    || normalized === 'missing_access'
    || normalized === 'blocked'
  ) {
    return normalized;
  }
  return 'not_verified';
}

function normalizeItem(value: unknown): IVXControlRoomItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value.id);
  const label = readString(value.label);
  if (!id || !label) {
    return null;
  }
  return {
    id,
    label,
    status: normalizeStatus(value.status),
    detail: readString(value.detail) || 'not verified',
    missingCredentialNames: readStringArray(value.missingCredentialNames),
  };
}

function normalizeControlRoomStatus(value: unknown): IVXControlRoomStatus {
  if (!isRecord(value)) {
    throw new Error('Control-room status response was not an object.');
  }
  const statusItems = Array.isArray(value.statusItems)
    ? value.statusItems.map(normalizeItem).filter((item): item is IVXControlRoomItem => item !== null)
    : [];
  return {
    ok: value.ok === true,
    ownerOnly: value.ownerOnly === true,
    readOnly: value.readOnly === true,
    generatedAt: readString(value.generatedAt) || new Date().toISOString(),
    authenticatedUserId: readString(value.authenticatedUserId) || undefined,
    statusItems,
    missingCredentialNames: readStringArray(value.missingCredentialNames),
    tools: readStringArray(value.tools),
    error: readString(value.error) || undefined,
  };
}

function buildControlRoomUrls(): string[] {
  const audit = getIVXOwnerAIConfigAudit();
  const urls: string[] = [];
  const pushUrl = (value: string | null | undefined) => {
    const normalized = value?.trim();
    if (!normalized || urls.includes(normalized)) {
      return;
    }
    urls.push(normalized);
  };

  if (audit.activeBaseUrl) {
    pushUrl(`${audit.activeBaseUrl.replace(/\/+$/, '')}/api/ivx/control-room/status`);
  }

  for (const endpoint of audit.candidateEndpoints) {
    const normalizedEndpoint = endpoint.replace(/\/+$/, '');
    if (normalizedEndpoint.endsWith('/api/ivx/owner-ai')) {
      pushUrl(`${normalizedEndpoint.slice(0, -'/api/ivx/owner-ai'.length)}/api/ivx/control-room/status`);
    } else if (normalizedEndpoint.endsWith('/ivx/owner-ai')) {
      pushUrl(`${normalizedEndpoint.slice(0, -'/ivx/owner-ai'.length)}/api/ivx/control-room/status`);
    }
  }

  return urls;
}

async function fetchControlRoomStatus(url: string, accessToken: string): Promise<IVXControlRoomStatus> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) as unknown : null;
  } catch {
    payload = { error: text.slice(0, 240) };
  }
  if (!response.ok) {
    const message = isRecord(payload) ? readString(payload.error) || readString(payload.detail) : '';
    throw new Error(message || `Control-room status failed with HTTP ${response.status}.`);
  }
  return normalizeControlRoomStatus(payload);
}

export async function getIVXControlRoomStatus(): Promise<IVXControlRoomStatus> {
  const accessToken = await getIVXAccessToken();
  const tokenPresent = !!accessToken;
  console.log('[IVXControlRoomService] Owner token check', { tokenPresent });
  if (!accessToken) {
    throw new Error('Owner session token is not connected.');
  }
  const urls = buildControlRoomUrls();
  if (urls.length === 0) {
    throw new Error('Owner AI backend URL is not configured.');
  }
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      console.log('[IVXControlRoomService] Fetching control-room status:', url, 'bearerHeaderPresent:', true);
      return await fetchControlRoomStatus(url, accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Control-room status request failed.';
      console.log('[IVXControlRoomService] Control-room endpoint failed:', { url, message });
      lastError = error instanceof Error ? error : new Error(message);
    }
  }
  throw lastError ?? new Error('Control-room status is not connected.');
}
