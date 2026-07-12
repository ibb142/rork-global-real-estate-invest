export type IVXFriendlyStateId =
  | 'ai_live'
  | 'backend_degraded'
  | 'fallback_active'
  | 'ai_unavailable'
  | 'sync_delayed'
  | 'upload_failed'
  | 'route_missing'
  | 'auth_expired'
  | 'no_network'
  | 'service_unavailable'
  | 'ready';

export type IVXFriendlyStateTone = 'success' | 'warn' | 'error' | 'info' | 'neutral';

export type IVXFriendlyState = {
  id: IVXFriendlyStateId;
  tone: IVXFriendlyStateTone;
  title: string;
  detail: string;
  badge: string;
};

const STATE_LIBRARY: Record<IVXFriendlyStateId, IVXFriendlyState> = {
  ai_live: {
    id: 'ai_live',
    tone: 'success',
    title: 'AI live',
    detail: 'IVX Owner AI is online. Messages are routed through the main backend.',
    badge: 'AI live',
  },
  backend_degraded: {
    id: 'backend_degraded',
    tone: 'warn',
    title: 'Backend degraded',
    detail: 'The main backend is slow or partially responding. Room stays usable; replies may take longer.',
    badge: 'Degraded',
  },
  fallback_active: {
    id: 'fallback_active',
    tone: 'warn',
    title: 'Fallback path active',
    detail: 'Main AI route unavailable. Reply sent through fallback path.',
    badge: 'Fallback',
  },
  ai_unavailable: {
    id: 'ai_unavailable',
    tone: 'error',
    title: 'AI temporarily unavailable',
    detail: 'AI temporarily unavailable. Retry or use fallback.',
    badge: 'AI unavailable',
  },
  sync_delayed: {
    id: 'sync_delayed',
    tone: 'warn',
    title: 'Sync delayed',
    detail: 'Inbox sync is catching up. New messages will appear shortly.',
    badge: 'Sync delayed',
  },
  upload_failed: {
    id: 'upload_failed',
    tone: 'error',
    title: 'Upload failed',
    detail: 'The attachment could not be uploaded. Check your connection and try again.',
    badge: 'Upload failed',
  },
  route_missing: {
    id: 'route_missing',
    tone: 'error',
    title: 'Route missing',
    detail: 'Backend route missing. Check API deployment.',
    badge: 'Route missing',
  },
  auth_expired: {
    id: 'auth_expired',
    tone: 'error',
    title: 'Session expired',
    detail: 'Your owner session expired. Sign in again to restore secure access.',
    badge: 'Auth expired',
  },
  no_network: {
    id: 'no_network',
    tone: 'error',
    title: 'No network',
    detail: 'Your device is offline. Reconnect to reach IVX Owner AI.',
    badge: 'Offline',
  },
  service_unavailable: {
    id: 'service_unavailable',
    tone: 'error',
    title: 'Service unavailable',
    detail: 'IVX Owner AI service is temporarily unavailable. Please try again.',
    badge: 'Unavailable',
  },
  ready: {
    id: 'ready',
    tone: 'success',
    title: 'Ready',
    detail: 'All IVX Owner AI systems are ready.',
    badge: 'Ready',
  },
};

export function getIVXFriendlyState(id: IVXFriendlyStateId): IVXFriendlyState {
  return STATE_LIBRARY[id];
}

export type ClassifyFriendlyStateInput = {
  httpStatus?: number | null;
  classification?: string | null;
  detail?: string | null;
  source?: 'remote_api' | 'local_app_brain' | 'provider_fallback' | 'pending' | 'unknown' | null;
  aiHealth?: 'active' | 'degraded' | 'inactive' | null;
  hasNetwork?: boolean;
};

export function classifyIVXFriendlyState(input: ClassifyFriendlyStateInput): IVXFriendlyState {
  const detailText = (input.detail ?? '').toLowerCase();

  if (input.hasNetwork === false) {
    return STATE_LIBRARY.no_network;
  }

  if (input.httpStatus === 401 || input.httpStatus === 403 || input.classification === 'auth_missing' || input.classification === 'auth_rejected') {
    return STATE_LIBRARY.auth_expired;
  }

  if (input.httpStatus === 404 || input.httpStatus === 405 || input.classification === 'route_unavailable') {
    return STATE_LIBRARY.route_missing;
  }

  if (input.httpStatus === 503 || input.httpStatus === 429 || input.classification === 'service_unavailable_html') {
    return STATE_LIBRARY.service_unavailable;
  }

  if (
    input.classification === 'network_unreachable'
    || detailText.includes('network request failed')
    || detailText.includes('failed to fetch')
    || detailText.includes('load failed')
  ) {
    return STATE_LIBRARY.no_network;
  }

  if (input.source === 'provider_fallback') {
    return STATE_LIBRARY.fallback_active;
  }

  if (input.aiHealth === 'active' && (input.source === 'remote_api' || input.source === 'local_app_brain')) {
    return STATE_LIBRARY.ai_live;
  }

  if (input.aiHealth === 'degraded') {
    return STATE_LIBRARY.backend_degraded;
  }

  if (input.aiHealth === 'inactive' && (input.classification || input.httpStatus)) {
    return STATE_LIBRARY.ai_unavailable;
  }

  return STATE_LIBRARY.ready;
}

export function getFriendlyUploadErrorCopy(): IVXFriendlyState {
  return STATE_LIBRARY.upload_failed;
}

export function getFriendlySyncDelayedCopy(): IVXFriendlyState {
  return STATE_LIBRARY.sync_delayed;
}
