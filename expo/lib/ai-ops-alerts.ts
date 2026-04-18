import * as Linking from 'expo-linking';
import { scopedGetJSON, scopedSetJSON } from '@/lib/project-storage';
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { supabase } from '@/lib/supabase';
import type { AIOpsIncident, AIOpsOverallStatus, AIOpsRepairAction, AIOpsSeverity, AIOpsSnapshot } from '@/lib/ai-ops';

const OWNER_ALERT_SETTINGS_KEY = 'ai_ops_owner_alert_settings_v1';
const OWNER_ALERT_FEED_KEY = 'ai_ops_owner_alert_feed_v1';
const DEFAULT_OWNER_PHONE = '+15616443503';
const DEFAULT_OWNER_EMAIL = 'owner@ivxholding.com';
const DEFAULT_OWNER_NAME = 'IVX Owner';
const DEFAULT_COOLDOWN_MINUTES = 15;
const DEFAULT_FROM_EMAIL = 'investors@ivxholding.com';
const DEFAULT_FROM_NAME = 'IVX AI Ops';
const API_BASE = getDirectApiBaseUrl();
const FEED_LIMIT = 20;

export type OwnerAlertChannel = 'email' | 'whatsapp';
export type OwnerAlertDeliveryStatus = 'sent' | 'opened' | 'queued' | 'failed' | 'disabled';

export interface OwnerAlertSettings {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  enableEmail: boolean;
  enableWhatsApp: boolean;
  cooldownMinutes: number;
}

export interface OwnerAlertFeedItem {
  id: string;
  fingerprint: string;
  incidentId: string;
  title: string;
  summary: string;
  severity: AIOpsSeverity;
  overallStatus: AIOpsOverallStatus;
  recommendedAction?: AIOpsRepairAction;
  createdAt: string;
  updatedAt: string;
  lastChannel?: OwnerAlertChannel;
  lastDeliveryStatus?: OwnerAlertDeliveryStatus;
  lastDeliveryDetail?: string;
  lastNotifiedAt?: string;
}

export interface OwnerAlertDispatchResult {
  channel: OwnerAlertChannel;
  status: OwnerAlertDeliveryStatus;
  detail: string;
  target: string;
  timestamp: string;
  subject: string;
}

export interface OwnerAlertSyncResult {
  settings: OwnerAlertSettings;
  feed: OwnerAlertFeedItem[];
  dispatched: OwnerAlertDispatchResult | null;
}

interface AlertContent {
  subject: string;
  emailBody: string;
  whatsappBody: string;
}

interface SendEmailResponse {
  success?: boolean;
  messageId?: string;
  error?: string;
}

function sanitizeEmail(email: string | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function sanitizePhone(phone: string | undefined): string {
  return (phone ?? '').trim();
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

function buildFingerprint(incident: AIOpsIncident): string {
  return `${incident.id}::${incident.severity}::${incident.title}::${incident.summary}`;
}

function severityWeight(severity: AIOpsSeverity): number {
  if (severity === 'critical') {
    return 2;
  }
  if (severity === 'warning') {
    return 1;
  }
  return 0;
}

function pickFocusIncident(incidents: AIOpsIncident[]): AIOpsIncident | null {
  if (incidents.length === 0) {
    return null;
  }

  const sorted = [...incidents].sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity));
  return sorted[0] ?? null;
}

function isWithinCooldown(lastNotifiedAt: string | undefined, cooldownMinutes: number): boolean {
  if (!lastNotifiedAt) {
    return false;
  }

  const lastTime = new Date(lastNotifiedAt).getTime();
  const cooldownMs = cooldownMinutes * 60 * 1000;
  return Number.isFinite(lastTime) && Date.now() - lastTime < cooldownMs;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getStatusLabel(status: AIOpsOverallStatus): string {
  if (status === 'critical') {
    return 'CRITICAL';
  }
  if (status === 'degraded') {
    return 'DEGRADED';
  }
  return 'HEALTHY';
}

function getSeverityLabel(severity: AIOpsSeverity): string {
  if (severity === 'critical') {
    return 'Critical';
  }
  if (severity === 'warning') {
    return 'Warning';
  }
  return 'Healthy';
}

async function fetchStoredSettings(): Promise<Partial<OwnerAlertSettings> | null> {
  return scopedGetJSON<Partial<OwnerAlertSettings>>(OWNER_ALERT_SETTINGS_KEY, 'project');
}

async function persistFeed(feed: OwnerAlertFeedItem[]): Promise<OwnerAlertFeedItem[]> {
  const trimmed = [...feed]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, FEED_LIMIT);

  await scopedSetJSON(OWNER_ALERT_FEED_KEY, trimmed, 'project');
  return trimmed;
}

function upsertFeedItems(existingFeed: OwnerAlertFeedItem[], snapshot: AIOpsSnapshot): OwnerAlertFeedItem[] {
  const now = new Date().toISOString();
  const nextFeed = [...existingFeed];

  snapshot.incidents.forEach((incident) => {
    const fingerprint = buildFingerprint(incident);
    const currentIndex = nextFeed.findIndex((item) => item.fingerprint === fingerprint);

    if (currentIndex >= 0) {
      const current = nextFeed[currentIndex];
      nextFeed[currentIndex] = {
        ...current,
        title: incident.title,
        summary: incident.summary,
        severity: incident.severity,
        overallStatus: snapshot.overallStatus,
        recommendedAction: incident.recommendedAction,
        updatedAt: now,
      };
      return;
    }

    nextFeed.unshift({
      id: `aiops-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fingerprint,
      incidentId: incident.id,
      title: incident.title,
      summary: incident.summary,
      severity: incident.severity,
      overallStatus: snapshot.overallStatus,
      recommendedAction: incident.recommendedAction,
      createdAt: now,
      updatedAt: now,
    });
  });

  return nextFeed;
}

function applyDispatchToFeed(
  feed: OwnerAlertFeedItem[],
  incident: AIOpsIncident,
  snapshot: AIOpsSnapshot,
  dispatchResult: OwnerAlertDispatchResult,
): OwnerAlertFeedItem[] {
  const now = dispatchResult.timestamp;
  const fingerprint = buildFingerprint(incident);

  return feed.map((item) => {
    if (item.fingerprint !== fingerprint) {
      return item;
    }

    return {
      ...item,
      overallStatus: snapshot.overallStatus,
      updatedAt: now,
      lastChannel: dispatchResult.channel,
      lastDeliveryStatus: dispatchResult.status,
      lastDeliveryDetail: dispatchResult.detail,
      lastNotifiedAt: now,
    };
  });
}

function buildAlertContent(
  snapshot: AIOpsSnapshot,
  focusIncident: AIOpsIncident,
  settings: OwnerAlertSettings,
): AlertContent {
  const incidentLines = snapshot.incidents.slice(0, 4).map((incident, index) => {
    const actionSuffix = incident.recommendedAction ? ` | Recommended action: ${incident.recommendedAction}` : '';
    return `${index + 1}. [${getSeverityLabel(incident.severity)}] ${incident.title} — ${incident.summary}${actionSuffix}`;
  });

  const subject = `IVX AI Ops ${getStatusLabel(snapshot.overallStatus)} alert · ${snapshot.incidents.length} issue(s)`;
  const headerLine = `${focusIncident.title} — ${focusIncident.summary}`;
  const sharedBody = [
    `Owner: ${settings.ownerName}`,
    `Triggered: ${formatTimestamp(snapshot.scannedAt)}`,
    `Overall status: ${getStatusLabel(snapshot.overallStatus)}`,
    `Primary incident: ${headerLine}`,
    '',
    'Open incidents:',
    ...incidentLines,
    '',
    'Next owner actions:',
    '• Open System Blueprint to inspect the failing lane',
    '• Open AI Ops Control to run safe repairs',
    '• Review Supabase, landing, and infrastructure health before production changes',
  ].join('\n');

  return {
    subject,
    emailBody: `${sharedBody}\n\nThis alert was generated by the IVX AI Ops monitoring lane.`,
    whatsappBody: `${subject}\n\n${sharedBody}`,
  };
}

async function sendEmailThroughApi(
  settings: OwnerAlertSettings,
  content: AlertContent,
): Promise<OwnerAlertDispatchResult> {
  const timestamp = new Date().toISOString();
  const target = settings.ownerEmail;

  if (!target) {
    return {
      channel: 'email',
      status: 'failed',
      detail: 'Owner email is not configured.',
      target: '',
      timestamp,
      subject: content.subject,
    };
  }

  if (!API_BASE) {
    return {
      channel: 'email',
      status: 'queued',
      detail: 'Email API base is not configured. Alert is ready for manual email compose.',
      target,
      timestamp,
      subject: content.subject,
    };
  }

  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token ?? '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    console.log('[AIOpsAlerts] Sending owner email alert to:', target);
    const response = await fetch(`${API_BASE}/api/send-email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: DEFAULT_FROM_EMAIL,
        fromName: DEFAULT_FROM_NAME,
        to: target,
        subject: content.subject,
        body: content.emailBody,
        replyTo: DEFAULT_FROM_EMAIL,
      }),
    });

    const rawResponse = await response.text();
    let parsed: SendEmailResponse | null = null;

    try {
      parsed = JSON.parse(rawResponse) as SendEmailResponse;
    } catch (error) {
      console.log('[AIOpsAlerts] Email endpoint returned non-JSON response:', rawResponse.slice(0, 120));
      console.log('[AIOpsAlerts] Email response parse note:', (error as Error)?.message ?? 'unknown');
    }

    if (response.ok && parsed?.success) {
      return {
        channel: 'email',
        status: 'sent',
        detail: `Owner email alert delivered${parsed.messageId ? ` (${parsed.messageId})` : ''}.`,
        target,
        timestamp,
        subject: content.subject,
      };
    }

    return {
      channel: 'email',
      status: 'queued',
      detail: parsed?.error || `Email delivery returned HTTP ${response.status}.`,
      target,
      timestamp,
      subject: content.subject,
    };
  } catch (error) {
    console.log('[AIOpsAlerts] Email alert error:', (error as Error)?.message ?? 'unknown');
    return {
      channel: 'email',
      status: 'queued',
      detail: (error as Error)?.message ?? 'Email alert request failed.',
      target,
      timestamp,
      subject: content.subject,
    };
  }
}

async function openMailComposer(settings: OwnerAlertSettings, content: AlertContent): Promise<OwnerAlertDispatchResult> {
  const timestamp = new Date().toISOString();
  const target = settings.ownerEmail;

  if (!target) {
    return {
      channel: 'email',
      status: 'failed',
      detail: 'Owner email is not configured.',
      target: '',
      timestamp,
      subject: content.subject,
    };
  }

  const url = `mailto:${encodeURIComponent(target)}?subject=${encodeURIComponent(content.subject)}&body=${encodeURIComponent(content.emailBody)}`;
  await Linking.openURL(url);

  return {
    channel: 'email',
    status: 'opened',
    detail: 'Opened the owner email composer with the AI Ops incident summary.',
    target,
    timestamp,
    subject: content.subject,
  };
}

async function deliverOwnerEmailAlert(
  snapshot: AIOpsSnapshot,
  focusIncident: AIOpsIncident,
  settings: OwnerAlertSettings,
  allowComposeFallback: boolean,
): Promise<OwnerAlertDispatchResult> {
  if (!settings.enableEmail) {
    return {
      channel: 'email',
      status: 'disabled',
      detail: 'Owner email alerts are disabled.',
      target: settings.ownerEmail,
      timestamp: new Date().toISOString(),
      subject: '',
    };
  }

  const content = buildAlertContent(snapshot, focusIncident, settings);
  const apiResult = await sendEmailThroughApi(settings, content);

  if ((apiResult.status === 'sent' || apiResult.status === 'queued') || !allowComposeFallback) {
    return apiResult;
  }

  try {
    return await openMailComposer(settings, content);
  } catch (error) {
    return {
      ...apiResult,
      status: 'failed',
      detail: (error as Error)?.message ?? apiResult.detail,
    };
  }
}

export async function getOwnerAlertSettings(): Promise<OwnerAlertSettings> {
  const stored = await fetchStoredSettings();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const resolvedSettings: OwnerAlertSettings = {
    ownerName: (stored?.ownerName ?? user?.email?.split('@')[0] ?? DEFAULT_OWNER_NAME).trim() || DEFAULT_OWNER_NAME,
    ownerEmail: sanitizeEmail(stored?.ownerEmail ?? user?.email ?? DEFAULT_OWNER_EMAIL) || DEFAULT_OWNER_EMAIL,
    ownerPhone: sanitizePhone(stored?.ownerPhone ?? DEFAULT_OWNER_PHONE) || DEFAULT_OWNER_PHONE,
    enableEmail: stored?.enableEmail ?? true,
    enableWhatsApp: stored?.enableWhatsApp ?? true,
    cooldownMinutes: stored?.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES,
  };

  return resolvedSettings;
}

function normalizeCooldownMinutes(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(120, Math.max(1, Math.round(value)));
}

export async function saveOwnerAlertSettings(input: Partial<OwnerAlertSettings>): Promise<OwnerAlertSettings> {
  const current = await getOwnerAlertSettings();
  const nextSettings: OwnerAlertSettings = {
    ownerName: (input.ownerName ?? current.ownerName).trim() || DEFAULT_OWNER_NAME,
    ownerEmail: sanitizeEmail(input.ownerEmail ?? current.ownerEmail) || current.ownerEmail || DEFAULT_OWNER_EMAIL,
    ownerPhone: sanitizePhone(input.ownerPhone ?? current.ownerPhone) || current.ownerPhone || DEFAULT_OWNER_PHONE,
    enableEmail: input.enableEmail ?? current.enableEmail,
    enableWhatsApp: input.enableWhatsApp ?? current.enableWhatsApp,
    cooldownMinutes: normalizeCooldownMinutes(input.cooldownMinutes, current.cooldownMinutes),
  };

  await scopedSetJSON(OWNER_ALERT_SETTINGS_KEY, nextSettings, 'project');
  return nextSettings;
}

export async function getOwnerAlertFeed(): Promise<OwnerAlertFeedItem[]> {
  const feed = await scopedGetJSON<OwnerAlertFeedItem[]>(OWNER_ALERT_FEED_KEY, 'project');
  return Array.isArray(feed) ? feed : [];
}

export async function syncAIOpsOwnerAlerts(snapshot: AIOpsSnapshot): Promise<OwnerAlertSyncResult> {
  const settings = await getOwnerAlertSettings();
  let feed = upsertFeedItems(await getOwnerAlertFeed(), snapshot);
  let dispatched: OwnerAlertDispatchResult | null = null;
  const focusIncident = pickFocusIncident(snapshot.incidents);

  if (focusIncident) {
    const feedItem = feed.find((item) => item.fingerprint === buildFingerprint(focusIncident));
    const canNotify = !isWithinCooldown(feedItem?.lastNotifiedAt, settings.cooldownMinutes);

    if (canNotify) {
      dispatched = await deliverOwnerEmailAlert(snapshot, focusIncident, settings, false);
      feed = applyDispatchToFeed(feed, focusIncident, snapshot, dispatched);
    }
  }

  const persistedFeed = await persistFeed(feed);
  await scopedSetJSON(OWNER_ALERT_SETTINGS_KEY, settings, 'project');

  return {
    settings,
    feed: persistedFeed,
    dispatched,
  };
}

export async function sendOwnerAlertEmail(snapshot: AIOpsSnapshot): Promise<OwnerAlertDispatchResult> {
  const settings = await getOwnerAlertSettings();
  const focusIncident = pickFocusIncident(snapshot.incidents);

  if (!focusIncident) {
    throw new Error('No active AI Ops incidents are available for owner email alerts.');
  }

  const result = await deliverOwnerEmailAlert(snapshot, focusIncident, settings, true);
  const updatedFeed = applyDispatchToFeed(upsertFeedItems(await getOwnerAlertFeed(), snapshot), focusIncident, snapshot, result);
  await persistFeed(updatedFeed);
  await scopedSetJSON(OWNER_ALERT_SETTINGS_KEY, settings, 'project');
  return result;
}

export async function openOwnerAlertWhatsApp(snapshot: AIOpsSnapshot): Promise<OwnerAlertDispatchResult> {
  const settings = await getOwnerAlertSettings();
  const focusIncident = pickFocusIncident(snapshot.incidents);

  if (!focusIncident) {
    throw new Error('No active AI Ops incidents are available for WhatsApp alerts.');
  }

  if (!settings.enableWhatsApp) {
    return {
      channel: 'whatsapp',
      status: 'disabled',
      detail: 'Owner WhatsApp alerts are disabled.',
      target: settings.ownerPhone,
      timestamp: new Date().toISOString(),
      subject: '',
    };
  }

  const phone = digitsOnly(settings.ownerPhone);
  if (!phone) {
    throw new Error('Owner phone number is not configured for WhatsApp alerts.');
  }

  const content = buildAlertContent(snapshot, focusIncident, settings);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(content.whatsappBody)}`;
  console.log('[AIOpsAlerts] Opening owner WhatsApp alert for:', phone);
  await Linking.openURL(url);

  const result: OwnerAlertDispatchResult = {
    channel: 'whatsapp',
    status: 'opened',
    detail: 'Opened WhatsApp with the AI Ops incident summary for the owner.',
    target: settings.ownerPhone,
    timestamp: new Date().toISOString(),
    subject: content.subject,
  };

  const updatedFeed = applyDispatchToFeed(upsertFeedItems(await getOwnerAlertFeed(), snapshot), focusIncident, snapshot, result);
  await persistFeed(updatedFeed);
  await scopedSetJSON(OWNER_ALERT_SETTINGS_KEY, settings, 'project');
  return result;
}
