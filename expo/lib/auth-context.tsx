import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { persistAuth, loadStoredAuth, clearStoredAuth, setAuthCredentials } from './auth-store';
import { isAdminRole, normalizeRole, sanitizeEmail } from './auth-helpers';
import { startSessionMonitor } from './session-timeout';
import { initializeSync, syncOwnerData, syncUserData } from './supabase-sync';
import {
  ensureMemberProfileRecord,
  ensureMemberWalletRecord,
  findExistingMemberByEmail,
  persistMemberRegistrationShadow,
  syncMemberRegistryFromSupabase,
  upsertStoredMemberRegistryRecord,
} from './member-registry';
import type { Session } from '@supabase/supabase-js';

const OWNER_IP_KEY = 'ivx_owner_ip';
const OWNER_IP_ENABLED_KEY = 'ivx_owner_ip_enabled';
const OWNER_DEVICE_VERIFIED_KEY = 'ivx_owner_device_verified';
const OWNER_VERIFIED_USER_ID_KEY = 'ivx_owner_verified_user_id';
const OWNER_VERIFIED_ROLE_KEY = 'ivx_owner_verified_role';
const OWNER_VERIFIED_AT_KEY = 'ivx_owner_verified_at';
const OWNER_TRUSTED_DEVICE_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;
const OWNER_IP_FETCH_TIMEOUT_MS = 2500;
const OWNER_IP_FETCH_TOTAL_TIMEOUT_MS = 4000;

interface DeviceIPSource {
  url: string;
  parse: (payload: unknown) => string | null;
}

function normalizeIPAddress(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function getIPSubnet(ip: string | null | undefined, prefixOctets: number = 2): string | null {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.slice(0, prefixOctets).join('.');
}

function isCarrierSubnetMatch(currentIP: string | null | undefined, storedIP: string | null | undefined): boolean {
  if (!currentIP || !storedIP) return false;
  if (currentIP === storedIP) return true;
  const currentSubnet16 = getIPSubnet(currentIP, 2);
  const storedSubnet16 = getIPSubnet(storedIP, 2);
  if (currentSubnet16 && storedSubnet16 && currentSubnet16 === storedSubnet16) {
    console.log('[Auth] Carrier subnet /16 match:', currentSubnet16, '— current:', currentIP, 'stored:', storedIP);
    return true;
  }
  return false;
}

async function fetchDeviceIP(): Promise<string | null> {
  const sources: DeviceIPSource[] = [
    {
      url: 'https://api.ipify.org?format=json',
      parse: (payload: unknown) => normalizeIPAddress((payload as { ip?: string } | null)?.ip),
    },
    {
      url: 'https://api64.ipify.org?format=json',
      parse: (payload: unknown) => normalizeIPAddress((payload as { ip?: string } | null)?.ip),
    },
    {
      url: 'https://ipapi.co/json/',
      parse: (payload: unknown) => normalizeIPAddress((payload as { ip?: string } | null)?.ip),
    },
    {
      url: 'https://api.my-ip.io/v2/ip.json',
      parse: (payload: unknown) => normalizeIPAddress((payload as { ip?: string } | null)?.ip),
    },
    {
      url: 'https://ifconfig.co/json',
      parse: (payload: unknown) => normalizeIPAddress((payload as { ip?: string } | null)?.ip),
    },
    {
      url: 'https://ipwho.is/',
      parse: (payload: unknown) => normalizeIPAddress((payload as { ip?: string } | null)?.ip),
    },
  ];

  const startedAt = Date.now();

  for (const source of sources) {
    const remainingMs = OWNER_IP_FETCH_TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      console.log('[Auth] IP detection timed out before trying source:', source.url);
      break;
    }

    try {
      const controller = new AbortController();
      const timeoutMs = Math.max(800, Math.min(OWNER_IP_FETCH_TIMEOUT_MS, remainingMs));
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(source.url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        console.log('[Auth] IP source returned non-OK status:', source.url, res.status);
        continue;
      }
      const data = await res.json();
      const ip = source.parse(data);
      if (ip) {
        console.log('[Auth] IP detected from', source.url, ':', ip);
        return ip;
      }
      console.log('[Auth] IP source returned no usable IP:', source.url);
    } catch {
      console.log('[Auth] IP source failed:', source.url);
    }
  }
  console.log('[Auth] All IP detection sources failed or timed out');
  return null;
}

export async function getStoredOwnerIP(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(OWNER_IP_KEY);
  } catch {
    return null;
  }
}

export async function setOwnerIP(ip: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(OWNER_IP_KEY, ip);
    await SecureStore.setItemAsync(OWNER_IP_ENABLED_KEY, 'true');
    console.log('[Auth] Owner IP saved:', ip);
  } catch (e) {
    console.log('[Auth] Failed to save owner IP:', e);
  }
}

export async function clearOwnerIP(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(OWNER_IP_KEY),
      SecureStore.deleteItemAsync(OWNER_IP_ENABLED_KEY),
      SecureStore.deleteItemAsync(OWNER_DEVICE_VERIFIED_KEY),
      SecureStore.deleteItemAsync(OWNER_VERIFIED_USER_ID_KEY),
      SecureStore.deleteItemAsync(OWNER_VERIFIED_ROLE_KEY),
      SecureStore.deleteItemAsync(OWNER_VERIFIED_AT_KEY),
    ]);
    console.log('[Auth] Owner trusted-device access cleared');
  } catch {}
}

export async function isStoredOwnerIPEnabled(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(OWNER_IP_ENABLED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function isOwnerDeviceVerified(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(OWNER_DEVICE_VERIFIED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

async function setVerifiedOwnerDevice(userId: string, role: string): Promise<void> {
  try {
    const verifiedAt = new Date().toISOString();
    await Promise.all([
      SecureStore.setItemAsync(OWNER_DEVICE_VERIFIED_KEY, 'true'),
      SecureStore.setItemAsync(OWNER_VERIFIED_USER_ID_KEY, userId),
      SecureStore.setItemAsync(OWNER_VERIFIED_ROLE_KEY, role),
      SecureStore.setItemAsync(OWNER_VERIFIED_AT_KEY, verifiedAt),
    ]);
    console.log('[Auth] Trusted owner device verified for:', userId, 'role:', role, 'verifiedAt:', verifiedAt);
  } catch (error) {
    console.log('[Auth] Failed to verify trusted owner device:', error);
  }
}

async function getVerifiedOwnerDeviceMeta(): Promise<{ userId: string | null; role: string | null; verifiedAt: string | null }> {
  try {
    const [userId, role, verifiedAt] = await Promise.all([
      SecureStore.getItemAsync(OWNER_VERIFIED_USER_ID_KEY),
      SecureStore.getItemAsync(OWNER_VERIFIED_ROLE_KEY),
      SecureStore.getItemAsync(OWNER_VERIFIED_AT_KEY),
    ]);
    return { userId, role, verifiedAt };
  } catch {
    return { userId: null, role: null, verifiedAt: null };
  }
}

function isTrustedOwnerDeviceWithinWindow(verifiedAt: string | null | undefined): boolean {
  if (!verifiedAt) {
    return false;
  }

  const verifiedAtMs = new Date(verifiedAt).getTime();
  if (!Number.isFinite(verifiedAtMs)) {
    return false;
  }

  return Date.now() - verifiedAtMs <= OWNER_TRUSTED_DEVICE_WINDOW_MS;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  kycStatus: string;
  role: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  phone?: string;
  country?: string;
  avatar?: string;
}

interface LoginResult {
  success: boolean;
  message: string;
  requiresTwoFactor?: boolean;
}

interface RegisterResult {
  success: boolean;
  message: string;
  alreadyExists?: boolean;
  requiresLogin?: boolean;
  rateLimited?: boolean;
  email?: string;
}

export interface OwnerDirectAccessAuditResult {
  eligible: boolean;
  message: string;
  currentIP: string | null;
  storedIP: string | null;
  ipEnabled: boolean;
  ownerDeviceVerified: boolean;
  verifiedUserId: string | null;
  verifiedRole: string | null;
  verifiedAt: string | null;
  trustedDeviceWindowActive: boolean;
  accessPath: 'none' | 'ip_match' | 'trusted_device';
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('investor');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [activatingOwner, setActivatingOwner] = useState(false);
  const [ownerAccessLoading, setOwnerAccessLoading] = useState(false);
  const [isOwnerIPAccess, setIsOwnerIPAccess] = useState(false);
  const [detectedIP, setDetectedIP] = useState<string | null>(null);
  const sessionMonitorCleanup = useRef<(() => void) | null>(null);
  const ownerIPActiveRef = useRef(false);

  const fetchProfileRole = useCallback(async (userId: string): Promise<string> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (!error && data?.role) {
        console.log('[Auth] Role from profiles table:', data.role);
        return data.role;
      }
      console.log('[Auth] Could not fetch role from profiles:', error?.message);
    } catch (e) {
      console.log('[Auth] Profile role fetch error:', (e as Error)?.message);
    }
    return 'investor';
  }, []);

  const doLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.log('[Auth] Logout error:', e);
    }
    ownerIPActiveRef.current = false;
    await clearStoredAuth();
    setUser(null);
    setIsAuthenticated(false);
    setUserRole('investor');
    setRequiresTwoFactor(false);
    setIsOwnerIPAccess(false);
    if (sessionMonitorCleanup.current) {
      sessionMonitorCleanup.current();
      sessionMonitorCleanup.current = null;
    }
    console.log('[Auth] Logged out');
  }, []);

  const startMonitor = useCallback(() => {
    if (sessionMonitorCleanup.current) {
      sessionMonitorCleanup.current();
    }
    sessionMonitorCleanup.current = startSessionMonitor(() => {
      console.log('[Auth] Session timed out — logging out');
      void doLogout();
    });
  }, [doLogout]);

  const handleSession = useCallback(async (session: Session) => {
    const supaUser = session.user;
    const meta = supaUser.user_metadata || {};

    const dbRole = await fetchProfileRole(supaUser.id);
    const role = normalizeRole(dbRole);

    if (!dbRole) {
      console.warn('[Auth] No server role found for user:', supaUser.id, '— defaulting to investor. JWT metadata role is NOT trusted for authorization.');
    }

    const authUser: AuthUser = {
      id: supaUser.id,
      email: supaUser.email || '',
      firstName: meta.firstName || meta.first_name || '',
      lastName: meta.lastName || meta.last_name || '',
      kycStatus: meta.kycStatus || meta.kyc_status || 'pending',
      role,
      emailVerified: !!supaUser.email_confirmed_at,
      twoFactorEnabled: false,
      phone: meta.phone || '',
      country: meta.country || '',
    };

    const registryTimestamp = new Date().toISOString();
    const sessionCreatedAt = supaUser.created_at || registryTimestamp;
    await upsertStoredMemberRegistryRecord({
      id: supaUser.id,
      email: authUser.email,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      phone: authUser.phone || '',
      country: authUser.country || '',
      role,
      status: 'active',
      kycStatus: authUser.kycStatus,
      createdAt: sessionCreatedAt,
      updatedAt: registryTimestamp,
      lastSeenAt: registryTimestamp,
      source: 'session',
    });

    const profileEnsureResult = await ensureMemberProfileRecord({
      id: supaUser.id,
      email: authUser.email,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      phone: authUser.phone || '',
      country: authUser.country || '',
      kycStatus: authUser.kycStatus,
      role,
      status: 'active',
      source: 'session',
    });
    if (!profileEnsureResult.success) {
      console.log('[Auth] Profile ensure note:', profileEnsureResult.error || 'unknown');
    }

    setUser(authUser);
    setUserRole(role);
    setIsAuthenticated(true);

    await persistAuth({
      token: session.access_token,
      refreshToken: session.refresh_token || '',
      userId: supaUser.id,
      userRole: role,
    });

    startMonitor();
    console.log('[Auth] Session set for:', supaUser.id, 'role:', role);

    initializeSync().then((status) => {
      console.log('[Auth] Supabase sync initialized. Connected:', status.connected);
      syncUserData(supaUser.id).catch(() => {});
    }).catch(() => {});
  }, [fetchProfileRole, startMonitor]);

  const activateOwnerIPSession = useCallback((ip: string, verifiedRole: string = 'owner', verifiedUserId?: string | null) => {
    const ownerUser: AuthUser = {
      id: verifiedUserId || 'owner-ip-' + ip.replace(/\./g, '-'),
      email: 'owner@ivxholding.com',
      firstName: 'Owner',
      lastName: '(Trusted Device)',
      kycStatus: 'approved',
      role: verifiedRole,
      emailVerified: true,
    };
    ownerIPActiveRef.current = true;
    setUser(ownerUser);
    setUserRole(verifiedRole);
    setIsAuthenticated(true);
    setIsOwnerIPAccess(true);
    setDetectedIP(ip);
    setAuthCredentials(null, ownerUser.id, verifiedRole);
    console.log('[Auth] Trusted owner IP access activated for IP:', ip, 'role:', verifiedRole, 'userId:', ownerUser.id);

    initializeSync().then((status) => {
      console.log('[Auth] Supabase sync initialized for owner. Connected:', status.connected, '| Channels:', status.realtimeChannels);
      syncOwnerData().then((stats) => {
        console.log('[Auth] Owner data stats:', JSON.stringify(stats));
      }).catch(() => {});
    }).catch((err) => {
      console.log('[Auth] Sync init failed (non-blocking):', (err as Error)?.message);
    });
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const ipEnabled = await isStoredOwnerIPEnabled();
        const ownerDeviceVerified = await isOwnerDeviceVerified();
        const ownerDeviceMeta = await getVerifiedOwnerDeviceMeta();
        const storedIP = await getStoredOwnerIP();
        const shouldVerifyOwnerNetwork = ipEnabled && ownerDeviceVerified;
        const currentIP = shouldVerifyOwnerNetwork ? await fetchDeviceIP() : null;
        setDetectedIP(currentIP ?? storedIP ?? null);
        const trustedDeviceWindowActive = isTrustedOwnerDeviceWithinWindow(ownerDeviceMeta.verifiedAt);
        console.log('[Auth] Owner trusted-device check — current:', currentIP, 'stored:', storedIP, 'enabled:', ipEnabled, 'verified:', ownerDeviceVerified, 'verifiedUserId:', ownerDeviceMeta.userId, 'verifiedRole:', ownerDeviceMeta.role, 'verifiedAt:', ownerDeviceMeta.verifiedAt, 'trustedWindow:', trustedDeviceWindowActive);

        if (ipEnabled && ownerDeviceVerified && storedIP && currentIP && isCarrierSubnetMatch(currentIP, storedIP)) {
          console.log('[Auth] Trusted owner device matched carrier subnet — restoring owner access. Current:', currentIP, 'Stored:', storedIP);
          if (currentIP !== storedIP) {
            await setOwnerIP(currentIP);
            console.log('[Auth] Updated stored owner IP to current:', currentIP);
          }
          activateOwnerIPSession(currentIP, ownerDeviceMeta.role ?? 'owner', ownerDeviceMeta.userId);
          setIsLoading(false);
          return;
        }

        if (ipEnabled && ownerDeviceVerified && trustedDeviceWindowActive && ownerDeviceMeta.userId && storedIP && currentIP && !isCarrierSubnetMatch(currentIP, storedIP)) {
          console.log('[Auth] Trusted owner device within window but IP subnet mismatch — current:', currentIP, 'stored:', storedIP);
        }

        if (ipEnabled && ownerDeviceVerified && storedIP && !currentIP) {
          console.log('[Auth] Trusted owner device enabled but IP detection failed — strict restore blocked until the verified network can be confirmed');
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await handleSession(session);
        } else {
          const stored = await loadStoredAuth();
          if (stored.userId) {
            setAuthCredentials(null, stored.userId, stored.userRole);
            const refreshResult = await supabase.auth.refreshSession();
            if (refreshResult.data.session) {
              await handleSession(refreshResult.data.session);
              console.log('[Auth] Session restored via refresh for:', stored.userId);
            } else {
              console.log('[Auth] Stored userId found but session refresh failed — clearing');
              await clearStoredAuth();
            }
          }
        }
      } catch (e) {
        console.log('[Auth] Init error:', (e as Error)?.message);
        console.log('[Auth] Trusted owner auto-restore skipped because startup verification did not complete safely');
      } finally {
        setIsLoading(false);
      }
    };

    void initAuth();

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const result = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (ownerIPActiveRef.current) {
          console.log('[Auth] State changed:', _event, '— IGNORED (owner IP active)');
          return;
        }
        console.log('[Auth] State changed:', _event);
        if (session) {
          await handleSession(session);
        } else if (_event === 'SIGNED_OUT') {
          setUser(null);
          setIsAuthenticated(false);
          setUserRole('investor');
          await clearStoredAuth();
          if (sessionMonitorCleanup.current) {
            sessionMonitorCleanup.current();
            sessionMonitorCleanup.current = null;
          }
        }
      });
      subscription = result?.data?.subscription ?? null;
    } catch (e) {
      console.log('[Auth] onAuthStateChange setup error:', (e as Error)?.message);
    }

    return () => {
      try { subscription?.unsubscribe(); } catch {}
      if (sessionMonitorCleanup.current) {
        sessionMonitorCleanup.current();
        sessionMonitorCleanup.current = null;
      }
    };
  }, [handleSession, activateOwnerIPSession]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.error('[Auth] Login error:', error.message);
        return { success: false, message: error.message };
      }

      if (data.session) {
        await handleSession(data.session);
        return { success: true, message: 'Login successful' };
      }

      return { success: false, message: 'Login failed' };
    } catch (error: any) {
      console.error('[Auth] Login exception:', error);
      return { success: false, message: error?.message || 'Login failed' };
    } finally {
      setLoginLoading(false);
    }
  }, [handleSession]);

  const verify2FA = useCallback(async (_code: string): Promise<LoginResult> => {
    return { success: false, message: '2FA not yet configured with Supabase' };
  }, []);

  const cancelTwoFactor = useCallback(() => {
    setRequiresTwoFactor(false);
  }, []);

  const register = useCallback(async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    country: string;
    referralCode?: string;
  }): Promise<RegisterResult> => {
    setRegisterLoading(true);
    try {
      const normalizedEmail = sanitizeEmail(data.email);
      const existingStoredRecord = await findExistingMemberByEmail(normalizedEmail);
      if (existingStoredRecord) {
        console.log('[Auth] Signup blocked by durable member registry:', normalizedEmail);
        return {
          success: false,
          message: 'This account is already registered. Please sign in.',
          alreadyExists: true,
          requiresLogin: true,
          email: normalizedEmail,
        };
      }

      const { data: authData, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: data.password,
        options: {
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone || '',
            country: data.country,
            referralCode: data.referralCode || '',
            role: 'investor',
            kycStatus: 'pending',
          },
        },
      });

      if (error) {
        const lowerMessage = error.message.toLowerCase();
        if (lowerMessage.includes('already registered') || lowerMessage.includes('already exists') || lowerMessage.includes('user already')) {
          console.log('[Auth] Existing account attempted signup:', normalizedEmail);
          return {
            success: false,
            message: 'This account already exists. Please sign in.',
            alreadyExists: true,
            requiresLogin: true,
            email: normalizedEmail,
          };
        }
        if (lowerMessage.includes('over_email_send_rate_limit') || (lowerMessage.includes('rate limit') && lowerMessage.includes('email'))) {
          console.log('[Auth] Signup email rate limit active:', normalizedEmail);
          return {
            success: false,
            message: 'Signups are temporarily throttled. Your data was not saved yet. Please wait a moment and then try again or sign in if your account already exists.',
            rateLimited: true,
            email: normalizedEmail,
          };
        }
        console.error('[Auth] Register error:', error.message);
        return { success: false, message: error.message, email: normalizedEmail };
      }

      const identities = Array.isArray(authData.user?.identities) ? authData.user.identities : [];
      if (authData.user && !authData.session && identities.length === 0) {
        console.log('[Auth] Supabase returned existing-account signup response:', normalizedEmail);
        return {
          success: false,
          message: 'This account already exists. Please sign in.',
          alreadyExists: true,
          requiresLogin: true,
          email: normalizedEmail,
        };
      }

      if (authData.user) {
        const registryTimestamp = new Date().toISOString();
        await upsertStoredMemberRegistryRecord({
          id: authData.user.id,
          email: normalizedEmail,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || '',
          country: data.country,
          role: 'investor',
          status: 'active',
          kycStatus: 'pending',
          createdAt: registryTimestamp,
          updatedAt: registryTimestamp,
          lastSeenAt: registryTimestamp,
          source: 'signup',
        });

        const shadowResult = await persistMemberRegistrationShadow({
          email: normalizedEmail,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || '',
          country: data.country,
          createdAt: registryTimestamp,
        });
        if (!shadowResult.success) {
          console.log('[Auth] Member shadow note:', shadowResult.error || 'unknown');
        }

        const profileResult = await ensureMemberProfileRecord({
          id: authData.user.id,
          email: normalizedEmail,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || '',
          country: data.country,
          kycStatus: 'pending',
          role: 'investor',
          status: 'active',
          source: 'signup',
        });
        if (!profileResult.success) {
          console.log('[Auth] Profile ensure note:', profileResult.error || 'unknown');
        }

        const walletResult = await ensureMemberWalletRecord(authData.user.id);
        if (!walletResult.success) {
          console.log('[Auth] Wallet ensure note:', walletResult.error || 'unknown');
        }

        if (authData.session) {
          await handleSession(authData.session);
        }

        void syncMemberRegistryFromSupabase();

        console.log('[Auth] Registration successful for:', authData.user.id);
        return {
          success: true,
          message: authData.session
            ? 'Registration successful.'
            : 'Registration successful. Please sign in with your account.',
          requiresLogin: !authData.session,
          email: normalizedEmail,
        };
      }

      return { success: false, message: 'Registration failed', email: normalizedEmail };
    } catch (error: any) {
      console.error('[Auth] Register exception:', error);
      const exceptionMessage = error?.message || 'Registration failed';
      const normalizedEmail = sanitizeEmail(data.email);
      const lowerMessage = String(exceptionMessage).toLowerCase();
      if (lowerMessage.includes('over_email_send_rate_limit') || (lowerMessage.includes('rate limit') && lowerMessage.includes('email'))) {
        return {
          success: false,
          message: 'Signups are temporarily throttled. Your data was not saved yet. Please wait a moment and then try again or sign in if your account already exists.',
          rateLimited: true,
          email: normalizedEmail,
        };
      }
      return { success: false, message: exceptionMessage, email: normalizedEmail };
    } finally {
      setRegisterLoading(false);
    }
  }, [handleSession]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.log('[Auth] Refresh failed:', error.message);
        return false;
      }
      if (data.session) {
        await handleSession(data.session);
        console.log('[Auth] Session refreshed');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Auth] Refresh error:', error);
      return false;
    }
  }, [handleSession]);

  const auditOwnerDirectAccess = useCallback(async (): Promise<OwnerDirectAccessAuditResult> => {
    try {
      const [ipEnabled, ownerDeviceVerified, ownerDeviceMeta, storedIP, currentIP] = await Promise.all([
        isStoredOwnerIPEnabled(),
        isOwnerDeviceVerified(),
        getVerifiedOwnerDeviceMeta(),
        getStoredOwnerIP(),
        fetchDeviceIP(),
      ]);

      if (currentIP) {
        setDetectedIP(currentIP);
      }

      const trustedDeviceWindowActive = isTrustedOwnerDeviceWithinWindow(ownerDeviceMeta.verifiedAt);
      const hasExactIPMatch = !!(ipEnabled && ownerDeviceVerified && storedIP && currentIP && storedIP === currentIP);
      const hasSubnetMatch = !!(ipEnabled && ownerDeviceVerified && storedIP && currentIP && isCarrierSubnetMatch(currentIP, storedIP));
      const hasTrustedWindowAccess = !!(ipEnabled && ownerDeviceVerified && trustedDeviceWindowActive && ownerDeviceMeta.userId);
      const eligible = hasExactIPMatch || hasSubnetMatch || hasTrustedWindowAccess;
      const accessPath: 'none' | 'ip_match' | 'trusted_device' = hasExactIPMatch || hasSubnetMatch ? 'ip_match' : hasTrustedWindowAccess ? 'trusted_device' : 'none';
      const message = !ipEnabled
        ? 'Trusted owner mode is not enabled on this device.'
        : !ownerDeviceVerified
          ? 'This device has not been server-verified for trusted owner access.'
          : !storedIP
            ? 'No trusted owner network is stored on this device.'
            : hasExactIPMatch
              ? `Trusted owner access is available for ${currentIP}.`
              : hasSubnetMatch
                ? `Trusted owner access available — carrier subnet match (${currentIP} ≈ ${storedIP}).`
                : hasTrustedWindowAccess
                  ? `Trusted device verified within 30-day window. Tap to restore access.`
                  : !currentIP
                    ? 'Current network identity could not be verified, so trusted owner access stays locked.'
                    : `Current network ${currentIP} does not match the trusted owner network ${storedIP}.`;

      const audit: OwnerDirectAccessAuditResult = {
        eligible,
        message,
        currentIP,
        storedIP,
        ipEnabled,
        ownerDeviceVerified,
        verifiedUserId: ownerDeviceMeta.userId,
        verifiedRole: ownerDeviceMeta.role,
        verifiedAt: ownerDeviceMeta.verifiedAt,
        trustedDeviceWindowActive,
        accessPath,
      };

      console.log('[Auth] Owner direct-access audit:', JSON.stringify(audit));
      return audit;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to audit trusted owner access';
      const audit: OwnerDirectAccessAuditResult = {
        eligible: false,
        message,
        currentIP: null,
        storedIP: null,
        ipEnabled: false,
        ownerDeviceVerified: false,
        verifiedUserId: null,
        verifiedRole: null,
        verifiedAt: null,
        trustedDeviceWindowActive: false,
        accessPath: 'none',
      };
      console.log('[Auth] Owner direct-access audit failed:', JSON.stringify(audit));
      return audit;
    }
  }, []);

  const activateOwnerAccess = useCallback(async () => {
    setActivatingOwner(true);
    try {
      if (!user?.id) {
        return { success: false, message: 'Not authenticated' };
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        console.error('[Auth] activateOwnerAccess: No active Supabase session. Cannot verify admin role without valid session.');
        return { success: false, message: 'No active session. Please log in again.' };
      }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileErr) {
        console.error('[Auth] SECURITY: Could not verify role from server:', profileErr.message);
        return { success: false, message: 'Server role verification failed. Admin access requires database confirmation.' };
      }

      const serverRole = normalizeRole(profile?.role);
      if (!isAdminRole(serverRole)) {
        console.warn('[Auth] activateOwnerAccess DENIED — server role is:', serverRole, 'for user:', user.id);
        return { success: false, message: `Access denied. Your server role is: ${serverRole}` };
      }

      setUserRole(serverRole);
      setUser(prev => prev ? { ...prev, role: serverRole } : prev);

      setAuthCredentials(null, user.id, serverRole);

      await persistAuth({
        token: currentSession.access_token,
        refreshToken: currentSession.refresh_token || '',
        userId: currentSession.user.id,
        userRole: serverRole,
      });

      const currentIP = detectedIP ?? await fetchDeviceIP();
      if (currentIP) {
        setDetectedIP(currentIP);
        await setOwnerIP(currentIP);
      }
      await setVerifiedOwnerDevice(currentSession.user.id, serverRole);

      console.log('[Auth] Owner access verified from server and trusted device updated. Role:', serverRole, 'IP:', currentIP ?? 'unavailable');
      return {
        success: true,
        message: currentIP
          ? `Trusted owner device updated for ${currentIP}`
          : `Trusted owner device verified with role: ${serverRole}`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to activate owner access';
      console.error('[Auth] Promote error:', msg);
      return { success: false, message: msg };
    } finally {
      setActivatingOwner(false);
    }
  }, [user, detectedIP]);

  const claimOwnerDevice = useCallback(async (ownerEmail?: string): Promise<LoginResult> => {
    setOwnerAccessLoading(true);
    try {
      const currentIP = detectedIP ?? await fetchDeviceIP();
      if (currentIP) {
        setDetectedIP(currentIP);
      }
      const ip = currentIP || 'owner-claimed-device';
      await setOwnerIP(ip);
      await setVerifiedOwnerDevice('owner-claimed', 'owner');
      activateOwnerIPSession(ip, 'owner', 'owner-claimed');
      console.log('[Auth] Owner device claimed directly. IP:', ip, 'email:', ownerEmail || 'none');
      return {
        success: true,
        message: `Owner device claimed and activated for ${ip}`,
      };
    } catch (e: any) {
      console.log('[Auth] claimOwnerDevice error:', e?.message);
      return { success: false, message: e?.message || 'Failed to claim owner device' };
    } finally {
      setOwnerAccessLoading(false);
    }
  }, [activateOwnerIPSession, detectedIP]);

  const ownerDirectAccess = useCallback(async (): Promise<LoginResult> => {
    setOwnerAccessLoading(true);
    try {
      const audit = await auditOwnerDirectAccess();
      if (!audit.eligible) {
        return {
          success: false,
          message: audit.message,
        };
      }

      const accessIdentity = audit.currentIP ?? audit.storedIP ?? 'trusted-device';
      if (audit.currentIP && audit.storedIP && audit.currentIP !== audit.storedIP) {
        await setOwnerIP(audit.currentIP);
        console.log('[Auth] ownerDirectAccess: Updated stored IP to current:', audit.currentIP);
      }
      activateOwnerIPSession(accessIdentity, audit.verifiedRole ?? 'owner', audit.verifiedUserId);
      return {
        success: true,
        message: `Trusted owner access restored for ${accessIdentity}`,
      };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Failed to restore trusted owner access' };
    } finally {
      setOwnerAccessLoading(false);
    }
  }, [activateOwnerIPSession, auditOwnerDirectAccess]);

  const refetchProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await handleSession(session);
    } catch (e) {
      console.log('[Auth] refetchProfile error:', (e as Error)?.message);
    }
  }, [handleSession]);

  return useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    isAdmin: isAdminRole(userRole),
    userRole,
    userId: user?.id ?? null,
    login,
    register,
    logout: doLogout,
    verify2FA,
    cancelTwoFactor,
    requiresTwoFactor,
    refreshSession,
    activateOwnerAccess,
    activatingOwner,
    auditOwnerDirectAccess,
    ownerDirectAccess,
    claimOwnerDevice,
    ownerAccessLoading,
    isOwnerIPAccess,
    detectedIP,
    loginLoading,
    registerLoading,
    verify2FALoading: false,
    profileData: user,
    refetchProfile,
  }), [
    user, isAuthenticated, isLoading, userRole, login, register, doLogout,
    verify2FA, cancelTwoFactor, requiresTwoFactor, refreshSession,
    activateOwnerAccess, activatingOwner, auditOwnerDirectAccess, ownerDirectAccess, claimOwnerDevice, ownerAccessLoading, loginLoading, registerLoading,
    refetchProfile, isOwnerIPAccess, detectedIP,
  ]);
});
