import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EmailMessage, EmailFolder, ComposeEmailData, EmailSource } from '@/types/email';
import { EMAIL_ACCOUNTS } from '@/constants/platform-config';
import { scopedKey } from '@/lib/project-storage';
import { getAuthToken } from '@/lib/auth-store';
import { Platform } from 'react-native';
import { useRealtimeTable } from '@/lib/realtime';

let _readAsBase64: ((uri: string) => Promise<string>) | null = null;
if (Platform.OS !== 'web') {
  _readAsBase64 = async (uri: string) => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1] || result;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('[Email] Failed to read file as base64:', (e as Error)?.message);
      return '';
    }
  };
}

function getApiBase(): string {
  const base = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (!base) {
    console.warn('[Email] API base URL not configured — emails will be saved locally only');
  }
  return base;
}

const STORAGE_KEY = scopedKey('emails_v3');
const ACTIVE_ACCOUNT_KEY = scopedKey('active_email_account');
const CACHE_MIGRATION_KEY = scopedKey('emails_cache_migration_v3');

export type InboxStatus = 'loading' | 'ready' | 'error' | 'no_backend' | 'no_auth' | 'not_configured';

export interface SesStatus {
  configured: boolean;
  status: 'active' | 'error' | 'unreachable' | 'unchecked' | 'checking';
  provider?: string;
  region?: string;
  quota?: {
    max24Hour: number;
    sentLast24Hours: number;
    maxSendRate: number;
  };
  sandboxMode?: boolean;
  error?: string;
  identities?: string[];
  verifiedEmails?: string[];
  pendingEmails?: string[];
  hasIvxDomain?: boolean;
  ivxDomainVerified?: boolean;
}

async function fetchSesStatus(): Promise<SesStatus> {
  const API_BASE = getApiBase();
  if (!API_BASE) {
    return { configured: false, status: 'unchecked', error: 'API not configured' };
  }
  try {
    const { headers } = getAuthHeaders();
    const [statusRes, identitiesRes] = await Promise.all([
      fetch(`${API_BASE}/api/ses-status`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/ses-identities`, { headers }).then(r => r.json()).catch(() => null),
    ]);

    const sesData = statusRes as Record<string, unknown> | null;
    const idData = identitiesRes as Record<string, unknown> | null;

    if (!sesData) {
      return { configured: false, status: 'unreachable', error: 'Backend not reachable' };
    }

    return {
      configured: sesData.configured as boolean ?? false,
      status: (sesData.status as SesStatus['status']) ?? 'error',
      provider: sesData.provider as string ?? 'aws_ses',
      region: sesData.region as string ?? '',
      quota: sesData.quota as SesStatus['quota'],
      sandboxMode: sesData.sandboxMode as boolean ?? undefined,
      error: sesData.error as string,
      identities: idData?.identities as string[] ?? [],
      verifiedEmails: idData?.verifiedEmails as string[] ?? [],
      pendingEmails: idData?.pendingEmails as string[] ?? [],
      hasIvxDomain: idData?.hasIvxDomain as boolean ?? false,
      ivxDomainVerified: idData?.ivxDomainVerified as boolean ?? false,
    };
  } catch (err: unknown) {
    console.log('[Email] SES status check failed:', (err as Error)?.message);
    return { configured: false, status: 'unreachable', error: (err as Error)?.message };
  }
}

function getAuthHeaders(): { headers: Record<string, string>; hasToken: boolean } {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    return { headers, hasToken: true };
  }
  console.warn('[Email] No auth token available — requests may be rejected. Please log in.');
  return { headers, hasToken: false };
}

async function storeEmailToBackend(email: EmailMessage, sesMessageId?: string): Promise<void> {
  const API_BASE = getApiBase();
  if (!API_BASE) return;
  try {
    const { headers } = getAuthHeaders();
    await fetch(`${API_BASE}/api/store-email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: email.id,
        accountId: email.accountId,
        folder: email.folder,
        fromName: email.from.name,
        fromEmail: email.from.email,
        toRecipients: email.to,
        ccRecipients: email.cc,
        subject: email.subject,
        body: email.body,
        date: email.date,
        isRead: email.isRead,
        isStarred: email.isStarred,
        isFlagged: email.isFlagged,
        hasAttachments: email.hasAttachments,
        labels: email.labels,
        priority: email.priority,
        sesMessageId,
      }),
    });
    console.log('[Email] Stored to backend:', email.id);
  } catch (err: unknown) {
    console.log('[Email] Backend store failed (local copy preserved):', (err as Error)?.message);
  }
}

async function syncEmailAction(emailId: string, action: string, folder?: string): Promise<void> {
  const API_BASE = getApiBase();
  if (!API_BASE) return;
  try {
    const { headers } = getAuthHeaders();
    await fetch(`${API_BASE}/api/email-action`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ emailId, action, folder }),
    });
    console.log('[Email] Synced action:', action, emailId);
  } catch (err: unknown) {
    console.log('[Email] Action sync failed:', (err as Error)?.message);
  }
}

function tagEmailSource(emails: EmailMessage[], source: EmailSource): EmailMessage[] {
  return emails.map(e => ({ ...e, source: e.source || source }));
}

async function fetchEmailsFromBackend(accountId: string, folder: string): Promise<{ emails: EmailMessage[]; source: EmailSource } | null> {
  const API_BASE = getApiBase();
  if (!API_BASE) {
    console.log('[Email] FETCH SKIPPED — no API_BASE configured');
    return null;
  }

  const { headers, hasToken } = getAuthHeaders();
  if (!hasToken) {
    console.log('[Email] FETCH SKIPPED — no auth token');
    return null;
  }

  try {
    const res = await fetch(`${API_BASE}/api/emails?accountId=${encodeURIComponent(accountId)}&folder=${encodeURIComponent(folder)}&limit=100`, {
      headers,
    });

    if (!res.ok) {
      console.log(`[Email] Backend returned ${res.status} for email fetch`);
      return null;
    }

    const data = await res.json() as { success: boolean; emails: EmailMessage[]; source?: string };

    if (data.success && Array.isArray(data.emails)) {
      const backendSource: EmailSource = (data.source as EmailSource) || 'backend';
      const tagged = tagEmailSource(data.emails, backendSource);
      console.log(`[Email] FETCHED ${tagged.length} emails from backend | source=${backendSource} | account=${accountId} | folder=${folder}`);
      return { emails: tagged, source: backendSource };
    }

    console.log('[Email] Backend returned success=false or no emails array');
    return null;
  } catch (err: unknown) {
    console.log('[Email] Backend fetch FAILED:', (err as Error)?.message);
    return null;
  }
}

async function runCacheMigration(): Promise<void> {
  try {
    const migrated = await AsyncStorage.getItem(CACHE_MIGRATION_KEY);
    if (migrated) return;

    console.log('[Email] Running cache migration v3 — clearing all stale email caches');

    const allKeys = await AsyncStorage.getAllKeys();
    const staleKeys = allKeys.filter(k =>
      k.includes('::emails') && !k.includes('emails_v3') && !k.includes('cache_migration')
    );

    if (staleKeys.length > 0) {
      await AsyncStorage.multiRemove(staleKeys);
      console.log('[Email] Cleared', staleKeys.length, 'stale email cache keys:', staleKeys);
    }

    await AsyncStorage.setItem(CACHE_MIGRATION_KEY, JSON.stringify({
      migratedAt: new Date().toISOString(),
      clearedKeys: staleKeys,
    }));

    console.log('[Email] Cache migration v3 complete');
  } catch (err) {
    console.log('[Email] Cache migration error:', (err as Error)?.message);
  }
}

export const [EmailProvider, useEmail] = createContextHook(() => {
  const [activeAccountId, setActiveAccountId] = useState<string>('admin');
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<EmailFolder>('inbox');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sesStatus, setSesStatus] = useState<SesStatus>({ configured: false, status: 'unchecked' });
  const [inboxStatus, setInboxStatus] = useState<InboxStatus>('loading');
  const [lastFetchSource, setLastFetchSource] = useState<EmailSource | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const initialLoadDone = useRef(false);

  const emailQueryKeys = useMemo(() => [['emails', 'backend'], ['ses-status']], []);
  useRealtimeTable('emails', emailQueryKeys);

  const sesStatusQuery = useQuery({
    queryKey: ['ses-status'],
    queryFn: fetchSesStatus,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  useEffect(() => {
    if (sesStatusQuery.data) {
      setSesStatus(sesStatusQuery.data);
      console.log('[Email] SES status updated:', sesStatusQuery.data.status, '| configured:', sesStatusQuery.data.configured);
    }
  }, [sesStatusQuery.data]);

  const backendEmailsQuery = useQuery({
    queryKey: ['emails', 'backend', activeAccountId],
    queryFn: async () => {
      await runCacheMigration();

      const API_BASE = getApiBase();
      if (!API_BASE) {
        console.log('[Email] STATUS: no_backend — API_BASE not configured');
        setInboxStatus('no_backend');
        setBackendError('Email backend not configured');
        return { emails: [] as EmailMessage[], source: 'unknown' as EmailSource, fromCache: false };
      }

      const { hasToken } = getAuthHeaders();
      if (!hasToken) {
        console.log('[Email] STATUS: no_auth — missing auth token');
        setInboxStatus('no_auth');
        setBackendError('Please log in to access inbox');
        return { emails: [] as EmailMessage[], source: 'unknown' as EmailSource, fromCache: false };
      }

      const result = await fetchEmailsFromBackend(activeAccountId, 'all');

      if (result && result.emails.length > 0) {
        console.log(`[Email] STATUS: ready — ${result.emails.length} emails from source=${result.source}`);
        setInboxStatus('ready');
        setLastFetchSource(result.source);
        setBackendError(null);

        try {
          const MAX_CACHE = 500;
          const toCache = result.emails.length > MAX_CACHE
            ? result.emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, MAX_CACHE)
            : result.emails;
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toCache));
          console.log('[Email] Cached', toCache.length, 'verified backend emails');
        } catch {}

        return { emails: result.emails, source: result.source, fromCache: false };
      }

      console.log('[Email] Backend returned 0 emails — trying cache as fallback');
      try {
        const cached = await AsyncStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsedCache = JSON.parse(cached) as EmailMessage[];
          const taggedCache = tagEmailSource(parsedCache, 'cache');
          if (taggedCache.length > 0) {
            console.log(`[Email] STATUS: ready (cache fallback) — ${taggedCache.length} cached emails`);
            setInboxStatus('ready');
            setLastFetchSource('cache');
            setBackendError(null);
            return { emails: taggedCache, source: 'cache' as EmailSource, fromCache: true };
          }
        }
      } catch {}

      console.log('[Email] STATUS: ready — inbox is empty (no backend emails, no cache)');
      setInboxStatus('ready');
      setLastFetchSource('backend');
      setBackendError(null);
      return { emails: [] as EmailMessage[], source: 'backend' as EmailSource, fromCache: false };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (backendEmailsQuery.error) {
      console.log('[Email] STATUS: error —', (backendEmailsQuery.error as Error)?.message);
      setInboxStatus('error');
      setBackendError((backendEmailsQuery.error as Error)?.message || 'Failed to load emails');
    }
  }, [backendEmailsQuery.error]);

  useEffect(() => {
    if (!backendEmailsQuery.data || initialLoadDone.current) return;
    initialLoadDone.current = true;

    const backendEmails = backendEmailsQuery.data.emails;
    setEmails(prev => {
      const localOnly = prev.filter(e => e.source === 'local-draft' || e.source === 'local-sent');
      const localIds = new Set(localOnly.map(e => e.id));
      const nonDuplicate = backendEmails.filter(e => !localIds.has(e.id));
      const merged = [...nonDuplicate, ...localOnly];
      console.log(`[Email] Initial load — backend=${nonDuplicate.length} local=${localOnly.length} total=${merged.length}`);
      return merged;
    });
  }, [backendEmailsQuery.data]);

  useEffect(() => {
    if (!backendEmailsQuery.data || !initialLoadDone.current) return;

    const backendEmails = backendEmailsQuery.data.emails;
    setEmails(prev => {
      const localOnly = prev.filter(e => e.source === 'local-draft' || e.source === 'local-sent');
      const localIds = new Set(localOnly.map(e => e.id));
      const nonDuplicate = backendEmails.filter(e => !localIds.has(e.id));
      const merged = [...nonDuplicate, ...localOnly];

      if (merged.length === prev.length && merged.every((e, i) => e.id === prev[i]?.id)) {
        return prev;
      }

      console.log(`[Email] Refresh merge — backend=${nonDuplicate.length} local=${localOnly.length} total=${merged.length}`);
      return merged;
    });
  }, [backendEmailsQuery.data]);

  const persistEmails = useCallback(async (updated: EmailMessage[]) => {
    try {
      const verifiedOnly = updated.filter(e => e.source !== 'cache' || e.source === undefined);
      const MAX_STORED_EMAILS = 500;
      const toStore = verifiedOnly.length > MAX_STORED_EMAILS
        ? verifiedOnly.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, MAX_STORED_EMAILS)
        : verifiedOnly;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.log('[Email] Failed to persist emails:', e);
    }
  }, []);

  const switchAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
      return accountId;
    },
    onSuccess: (accountId) => {
      setActiveAccountId(accountId);
      setSelectedFolder('inbox');
      setSearchQuery('');
      initialLoadDone.current = false;
      void queryClient.invalidateQueries({ queryKey: ['emails', 'backend', accountId] });
    },
  });

  const activeAccount = useMemo(() => {
    const found = EMAIL_ACCOUNTS.find(a => a.id === activeAccountId);
    const fallback = EMAIL_ACCOUNTS[0];
    if (found) return found;
    if (fallback) return fallback;
    return { id: 'admin', email: 'admin@ivxholding.com', displayName: 'Admin', role: 'Administrator', avatar: 'A', color: '#FFD700', unreadCount: 0 };
  }, [activeAccountId]);

  const accounts = EMAIL_ACCOUNTS;

  const accountsWithUnread = useMemo(() => {
    return EMAIL_ACCOUNTS.map(account => ({
      ...account,
      unreadCount: emails.filter(e => e.accountId === account.id && e.folder === 'inbox' && !e.isRead).length,
    }));
  }, [emails]);

  const filteredEmails = useMemo(() => {
    let filtered = emails.filter(e => e.accountId === activeAccountId && e.folder === selectedFolder);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.from.name.toLowerCase().includes(q) ||
        e.from.email.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q)
      );
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [emails, activeAccountId, selectedFolder, searchQuery]);

  const folderCounts = useMemo(() => {
    const accountEmails = emails.filter(e => e.accountId === activeAccountId);
    return {
      inbox: accountEmails.filter(e => e.folder === 'inbox').length,
      inboxUnread: accountEmails.filter(e => e.folder === 'inbox' && !e.isRead).length,
      sent: accountEmails.filter(e => e.folder === 'sent').length,
      drafts: accountEmails.filter(e => e.folder === 'drafts').length,
      trash: accountEmails.filter(e => e.folder === 'trash').length,
      starred: accountEmails.filter(e => e.isStarred).length,
      spam: accountEmails.filter(e => e.folder === 'spam').length,
      archive: accountEmails.filter(e => e.folder === 'archive').length,
    };
  }, [emails, activeAccountId]);

  const markAsRead = useCallback((emailId: string) => {
    setEmails(prev => {
      const updated = prev.map(e => e.id === emailId ? { ...e, isRead: true } : e);
      void persistEmails(updated);
      return updated;
    });
    void syncEmailAction(emailId, 'read');
  }, [persistEmails]);

  const toggleStar = useCallback((emailId: string) => {
    setEmails(prev => {
      const email = prev.find(e => e.id === emailId);
      const updated = prev.map(e => e.id === emailId ? { ...e, isStarred: !e.isStarred } : e);
      void persistEmails(updated);
      void syncEmailAction(emailId, email?.isStarred ? 'unstar' : 'star');
      return updated;
    });
  }, [persistEmails]);

  const toggleFlag = useCallback((emailId: string) => {
    setEmails(prev => {
      const email = prev.find(e => e.id === emailId);
      const updated = prev.map(e => e.id === emailId ? { ...e, isFlagged: !e.isFlagged } : e);
      void persistEmails(updated);
      void syncEmailAction(emailId, email?.isFlagged ? 'unflag' : 'flag');
      return updated;
    });
  }, [persistEmails]);

  const moveToFolder = useCallback((emailId: string, folder: EmailFolder) => {
    setEmails(prev => {
      const updated = prev.map(e => e.id === emailId ? { ...e, folder } : e);
      void persistEmails(updated);
      return updated;
    });
    void syncEmailAction(emailId, 'move', folder);
  }, [persistEmails]);

  const deleteEmail = useCallback((emailId: string) => {
    setEmails(prev => {
      const email = prev.find(e => e.id === emailId);
      let updated: EmailMessage[];
      if (email?.folder === 'trash') {
        updated = prev.filter(e => e.id !== emailId);
      } else {
        updated = prev.map(e => e.id === emailId ? { ...e, folder: 'trash' as EmailFolder } : e);
      }
      void persistEmails(updated);
      return updated;
    });
    void syncEmailAction(emailId, 'delete');
  }, [persistEmails]);

  const sendEmail = useCallback(async (data: ComposeEmailData): Promise<{ success: boolean; messageId?: string; error?: string; deliveryStatus: 'sent' | 'queued_locally' }> => {
    const hasAttachments = (data.attachments && data.attachments.length > 0) || false;
    const newEmail: EmailMessage = {
      id: `sent-${Date.now()}`,
      accountId: activeAccountId,
      folder: 'sent',
      from: { name: activeAccount.displayName, email: activeAccount.email },
      to: data.to.split(',').map(e => ({ name: e.trim(), email: e.trim() })),
      cc: data.cc ? data.cc.split(',').map(e => ({ name: e.trim(), email: e.trim() })) : undefined,
      subject: data.subject,
      body: data.body,
      date: new Date().toISOString(),
      isRead: true,
      isStarred: false,
      isFlagged: false,
      hasAttachments,
      attachments: data.attachments,
      source: 'local-sent',
    };

    setEmails(prev => {
      const updated = [...prev, newEmail];
      void persistEmails(updated);
      return updated;
    });

    try {
      console.log('[Email] Sending via AWS SES:', activeAccount.email, '->', data.to);

      const API_BASE = getApiBase();
      if (!API_BASE) {
        console.warn('[Email] API_BASE not configured — email saved locally only');
        return { success: true, messageId: newEmail.id, deliveryStatus: 'queued_locally' };
      }

      const { headers: authHeaders, hasToken } = getAuthHeaders();
      if (!hasToken) {
        console.warn('[Email] No auth token — email saved locally. Please log in to send via SES.');
        return { success: true, messageId: newEmail.id, error: 'Not authenticated — please log in to send emails via SES', deliveryStatus: 'queued_locally' };
      }

      let attachmentsPayload: Array<{ name: string; mimeType: string; base64Data: string }> | undefined;

      if (hasAttachments && data.attachments) {
        console.log(`[Email] Converting ${data.attachments.length} attachment(s) to base64...`);
        attachmentsPayload = [];
        for (const att of data.attachments) {
          try {
            let b64 = '';
            if (att.uri && Platform.OS !== 'web' && _readAsBase64) {
              b64 = await _readAsBase64(att.uri);
            } else if (att.uri && Platform.OS === 'web') {
              try {
                const resp = await fetch(att.uri);
                const blob = await resp.blob();
                b64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const result = reader.result as string;
                    resolve(result.includes(',') ? (result.split(',')[1] ?? result) : result);
                  };
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
              } catch (webErr) {
                console.warn('[Email] Web base64 conversion failed for', att.name, webErr);
                continue;
              }
            }
            if (b64) {
              attachmentsPayload.push({
                name: att.name,
                mimeType: att.mimeType || 'application/octet-stream',
                base64Data: b64,
              });
              console.log(`[Email] Attachment ready: ${att.name} (${Math.round(b64.length * 0.75 / 1024)}KB)`);
            }
          } catch (attErr) {
            console.warn('[Email] Failed to convert attachment:', att.name, attErr);
          }
        }
        if (attachmentsPayload.length === 0) attachmentsPayload = undefined;
      }

      const sendPayload = JSON.stringify({
        from: activeAccount.email,
        fromName: activeAccount.displayName,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        body: data.body,
        replyTo: activeAccount.email,
        attachments: attachmentsPayload,
      });

      const MAX_RETRIES = 2;
      let lastError = '';
      let lastResult: { success: boolean; messageId?: string; error?: string; provider?: string } | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[Email] Retry attempt ${attempt}/${MAX_RETRIES}...`);
            await new Promise(r => setTimeout(r, attempt * 1500));
          }

          const response = await fetch(`${API_BASE}/api/send-email`, {
            method: 'POST',
            headers: authHeaders,
            body: sendPayload,
          });

          const result = await response.json() as {
            success: boolean;
            messageId?: string;
            error?: string;
            provider?: string;
            retryAfterMs?: number;
            autoVerify?: {
              senderVerificationSent: boolean;
              senderEmail: string;
              unverifiedRecipients: string[];
              recipientVerificationsSent: number;
              domainVerificationToken?: string;
            };
          };
          lastResult = result;
          console.log(`[Email] AWS SES response (attempt ${attempt + 1}):`, JSON.stringify(result));

          if (result.success) {
            setEmails(prev => prev.map(e => e.id === newEmail.id ? { ...e, source: 'backend' as EmailSource } : e));
            void storeEmailToBackend(newEmail, result.messageId);
            console.log('[Email] Delivered via AWS SES. MessageId:', result.messageId, 'Provider:', result.provider);
            return { success: true, messageId: result.messageId ?? undefined, deliveryStatus: 'sent' as const };
          }

          if (response.status === 401) {
            console.warn('[Email] Auth rejected (401) — token may be expired or user not authenticated');
            return { success: true, messageId: newEmail.id, error: 'Authentication failed — please log in again', deliveryStatus: 'queued_locally' };
          }

          if (result.autoVerify) {
            console.log('[Email] SES auto-verification triggered:', JSON.stringify(result.autoVerify));
            const verifyMsg = result.autoVerify.unverifiedRecipients?.length > 0
              ? `Verification emails sent to: ${result.autoVerify.senderEmail}, ${result.autoVerify.unverifiedRecipients.join(', ')}. Check inboxes and click verification links.`
              : `Verification email sent to ${result.autoVerify.senderEmail}. Check inbox and click the verification link.`;
            return { success: true, messageId: newEmail.id, error: verifyMsg, deliveryStatus: 'queued_locally' };
          }

          if (response.status === 429 && attempt < MAX_RETRIES) {
            const waitMs = result.retryAfterMs ?? 3000;
            console.log(`[Email] Rate limited, waiting ${waitMs}ms before retry...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }

          if (response.status >= 500 && attempt < MAX_RETRIES) {
            lastError = result.error || `Server error ${response.status}`;
            continue;
          }

          lastError = result.error || 'Send failed';
          break;
        } catch (fetchErr: unknown) {
          lastError = (fetchErr as Error)?.message || 'Network error';
          if (attempt < MAX_RETRIES) continue;
        }
      }

      void storeEmailToBackend(newEmail, lastResult?.messageId);
      console.warn('[Email] AWS SES delivery failed after retries:', lastError, '— email saved locally');
      return { success: true, messageId: newEmail.id, error: lastError, deliveryStatus: 'queued_locally' };
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || 'Unknown error';
      console.warn('[Email] AWS SES request failed — email saved locally:', errMsg);
      void storeEmailToBackend(newEmail);
      return { success: true, messageId: newEmail.id, deliveryStatus: 'queued_locally' };
    }
  }, [activeAccountId, activeAccount, persistEmails]);

  const saveDraft = useCallback((data: ComposeEmailData) => {
    const hasAttachments = (data.attachments && data.attachments.length > 0) || false;
    const draft: EmailMessage = {
      id: `draft-${Date.now()}`,
      accountId: activeAccountId,
      folder: 'drafts',
      from: { name: activeAccount.displayName, email: activeAccount.email },
      to: data.to ? data.to.split(',').map(e => ({ name: e.trim(), email: e.trim() })) : [],
      subject: data.subject || '(No Subject)',
      body: data.body,
      date: new Date().toISOString(),
      isRead: true,
      isStarred: false,
      isFlagged: false,
      hasAttachments,
      attachments: data.attachments,
      source: 'local-draft',
    };
    setEmails(prev => {
      const updated = [...prev, draft];
      void persistEmails(updated);
      return updated;
    });
    void storeEmailToBackend(draft);
  }, [activeAccountId, activeAccount, persistEmails]);

  const markAllAsRead = useCallback(() => {
    setEmails(prev => {
      const updated = prev.map(e =>
        e.accountId === activeAccountId && e.folder === selectedFolder ? { ...e, isRead: true } : e
      );
      void persistEmails(updated);
      return updated;
    });
  }, [activeAccountId, selectedFolder, persistEmails]);

  const getEmailById = useCallback((id: string) => {
    return emails.find(e => e.id === id);
  }, [emails]);

  const totalUnread = useMemo(() => {
    return emails.filter(e => e.folder === 'inbox' && !e.isRead).length;
  }, [emails]);

  const refreshEmails = useCallback(async (): Promise<boolean> => {
    try {
      initialLoadDone.current = false;
      await queryClient.invalidateQueries({ queryKey: ['emails', 'backend', activeAccountId] });
      return true;
    } catch {
      return false;
    }
  }, [activeAccountId, queryClient]);

  const checkSesStatus = useCallback(async () => {
    void queryClient.invalidateQueries({ queryKey: ['ses-status'] });
  }, [queryClient]);

  const sourceStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const e of emails) {
      const src = e.source || 'unknown';
      stats[src] = (stats[src] || 0) + 1;
    }
    return stats;
  }, [emails]);

  useEffect(() => {
    if (emails.length > 0) {
      console.log('[Email] SOURCE STATS:', JSON.stringify(sourceStats), '| total:', emails.length, '| lastFetch:', lastFetchSource);
    }
  }, [sourceStats, emails.length, lastFetchSource]);

  return useMemo(() => ({
    accounts,
    accountsWithUnread,
    activeAccount,
    activeAccountId,
    switchAccount: switchAccountMutation.mutate,
    emails: filteredEmails,
    allEmails: emails,
    selectedFolder,
    setSelectedFolder,
    searchQuery,
    setSearchQuery,
    folderCounts,
    markAsRead,
    toggleStar,
    toggleFlag,
    moveToFolder,
    deleteEmail,
    sendEmail,
    saveDraft,
    markAllAsRead,
    getEmailById,
    totalUnread,
    isLoading: backendEmailsQuery.isLoading,
    sesStatus,
    checkSesStatus,
    refreshEmails,
    inboxStatus,
    lastFetchSource,
    backendError,
    sourceStats,
  }), [
    accounts, accountsWithUnread, activeAccount, activeAccountId,
    switchAccountMutation.mutate, filteredEmails, emails, selectedFolder,
    setSelectedFolder, searchQuery, setSearchQuery, folderCounts,
    markAsRead, toggleStar, toggleFlag, moveToFolder, deleteEmail,
    sendEmail, saveDraft, markAllAsRead, getEmailById, totalUnread,
    backendEmailsQuery.isLoading, sesStatus, checkSesStatus, refreshEmails,
    inboxStatus, lastFetchSource, backendError, sourceStats,
  ]);
});
