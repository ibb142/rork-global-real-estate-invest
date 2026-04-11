import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { persistAuth, loadStoredAuth, clearStoredAuth, setAuthCredentials } from './auth-store';
import { canonicalizeRole, isAdminRole, normalizeRole, sanitizeEmail } from './auth-helpers';
import { signInWithEmailPassword } from './auth-password-sign-in';
import { extractChallengeId, extractFirstVerifiedMfaFactor, getMfaChallengeRequirement, type ParsedMfaFactor } from './auth-mfa';
import { startSessionMonitor } from './session-timeout';
import { initializeSync, syncOwnerData, syncUserData } from './supabase-sync';
import {
  ensureMemberProfileRecord,
  ensureMemberWalletRecord,
  findExistingRegisteredMemberByEmail,
  persistMemberRegistrationShadow,
  syncMemberRegistryFromSupabase,
  upsertStoredMemberRegistryRecord,
} from './member-registry';
import type { Session } from '@supabase/supabase-js';
import { fetchPublicIpAddress } from './public-geo';
import {
  getAdminAccessLockMessage,
  getConfiguredOwnerAdminEmail,
  isAdminAccessLocked,
  isOwnerAdminEmail,
  shouldBlockRoleForAdminAccess,
} from './admin-access-lock';

const OWNER_IP_KEY = 'ivx_owner_ip';
const OWNER_IP_ENABLED_KEY = 'ivx_owner_ip_enabled';
const OWNER_DEVICE_VERIFIED_KEY = 'ivx_owner_device_verified';
const OWNER_VERIFIED_USER_ID_KEY = 'ivx_owner_verified_user_id';
const OWNER_VERIFIED_ROLE_KEY = 'ivx_owner_verified_role';
const OWNER_VERIFIED_AT_KEY = 'ivx_owner_verified_at';
const OWNER_VERIFIED_EMAIL_KEY = 'ivx_owner_verified_email';
const OWNER_TRUSTED_DEVICE_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;
const AUTH_BOOTSTRAP_TIMEOUT_MS = 3500;
const AUTH_REFRESH_TIMEOUT_MS = 4000;
const AUTH_ROLE_RESOLUTION_TIMEOUT_MS = 2500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  try {
    const ip = await fetchPublicIpAddress({ requestTimeoutMs: 2500, totalTimeoutMs: 4000 });
    if (ip) {
      console.log('[Auth] IP detected:', ip);
      return ip;
    }
  } catch (error) {
    console.log('[Auth] IP detection exception:', (error as Error)?.message ?? 'Unknown error');
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
      SecureStore.deleteItemAsync(OWNER_VERIFIED_EMAIL_KEY),
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

async function setVerifiedOwnerDevice(userId: string, role: string, email: string): Promise<void> {
  try {
    const verifiedAt = new Date().toISOString();
    const normalizedEmail = sanitizeEmail(email);
    await Promise.all([
      SecureStore.setItemAsync(OWNER_DEVICE_VERIFIED_KEY, 'true'),
      SecureStore.setItemAsync(OWNER_VERIFIED_USER_ID_KEY, userId),
      SecureStore.setItemAsync(OWNER_VERIFIED_ROLE_KEY, role),
      SecureStore.setItemAsync(OWNER_VERIFIED_AT_KEY, verifiedAt),
      normalizedEmail
        ? SecureStore.setItemAsync(OWNER_VERIFIED_EMAIL_KEY, normalizedEmail)
        : SecureStore.deleteItemAsync(OWNER_VERIFIED_EMAIL_KEY),
    ]);
    console.log('[Auth] Trusted owner device verified for:', userId, 'role:', role, 'email:', normalizedEmail || 'missing', 'verifiedAt:', verifiedAt);
  } catch (error) {
    console.log('[Auth] Failed to verify trusted owner device:', error);
  }
}

interface TrustedOwnerDeviceMeta {
  userId: string | null;
  role: string | null;
  verifiedAt: string | null;
  email: string | null;
}

async function getVerifiedOwnerDeviceMeta(): Promise<TrustedOwnerDeviceMeta> {
  try {
    const [userId, role, verifiedAt, email] = await Promise.all([
      SecureStore.getItemAsync(OWNER_VERIFIED_USER_ID_KEY),
      SecureStore.getItemAsync(OWNER_VERIFIED_ROLE_KEY),
      SecureStore.getItemAsync(OWNER_VERIFIED_AT_KEY),
      SecureStore.getItemAsync(OWNER_VERIFIED_EMAIL_KEY),
    ]);
    return { userId, role, verifiedAt, email };
  } catch {
    return { userId: null, role: null, verifiedAt: null, email: null };
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

function isValidOwnerVerifiedUserId(userId: string | null | undefined): userId is string {
  const trimmedUserId = userId?.trim() ?? '';
  return UUID_PATTERN.test(trimmedUserId);
}

type ServerRoleResolutionSource = 'profiles' | 'rpc_get_user_role' | 'rpc_verify_admin_access' | 'trusted_device' | 'fallback';

interface ServerRoleResolution {
  role: string;
  source: ServerRoleResolutionSource;
}

type SessionRoleBootstrapSource = ServerRoleResolutionSource | 'timeout_fallback';

interface SessionRoleBootstrap {
  role: string;
  source: SessionRoleBootstrapSource;
  requiresBackgroundHydration: boolean;
}

interface NormalizedLoginFailure {
  message: string;
  failureReason: LoginFailureReason;
  isExpectedFailure: boolean;
}

function extractAuthErrorMessage(error: unknown): string | null {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (!error || typeof error !== 'object') {
    return null;
  }

  const record = error as Record<string, unknown>;
  const directKeys = ['message', 'msg', 'details', 'reason', 'error_description'] as const;

  for (const key of directKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  const nestedError = record.error;
  if (typeof nestedError === 'string' && nestedError.trim()) {
    return nestedError;
  }

  if (nestedError && typeof nestedError === 'object') {
    const nestedMessage = (nestedError as Record<string, unknown>).message;
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage;
    }
  }

  return null;
}

/** Full auth error shape for logs (no secrets). */
function serializeSupabaseAuthErrorForLog(error: unknown): string {
  if (error == null) {
    return 'null';
  }
  if (typeof error === 'string') {
    return JSON.stringify({ message: error });
  }
  if (error instanceof Error) {
    const ext = error as Error & { status?: number; code?: string };
    return JSON.stringify({
      name: error.name,
      message: error.message,
      status: ext.status,
      code: ext.code,
    });
  }
  if (typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function normalizeLoginFailureMessage(rawMessage: string | null | undefined): NormalizedLoginFailure {
  const message = rawMessage?.trim() || 'Login failed';
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('invalid login credentials') || lowerMessage.includes('invalid email or password')) {
    return {
      message: 'Invalid email or password.',
      failureReason: 'invalid_credentials',
      isExpectedFailure: true,
    };
  }

  if (lowerMessage.includes('email not confirmed')) {
    return {
      message: 'Your email is not confirmed yet. Check your inbox for the confirmation link or use Forgot? to reset access.',
      failureReason: 'email_not_confirmed',
      isExpectedFailure: true,
    };
  }

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests') || lowerMessage.includes('over_request_rate_limit')) {
    return {
      message: 'Too many sign-in attempts. Please wait a moment and try again.',
      failureReason: 'rate_limited',
      isExpectedFailure: true,
    };
  }

  if (
    lowerMessage.includes('failed to fetch')
    || lowerMessage.includes('fetch failed')
    || lowerMessage.includes('network request failed')
    || lowerMessage.includes('networkerror')
    || lowerMessage.includes('aborted')
    || lowerMessage.includes('timeout')
    || lowerMessage.includes('supabase url is required')
  ) {
    return {
      message: 'Live Supabase sign-in is temporarily unavailable. If this is a verified owner device, use the controlled owner recovery path.',
      failureReason: 'service_unavailable',
      isExpectedFailure: true,
    };
  }

  return {
    message,
    failureReason: 'unknown',
    isExpectedFailure: false,
  };
}

function shouldAcceptResolvedRole(rawRole: string | null | undefined, normalizedRole: string): boolean {
  const canonicalRole = canonicalizeRole(rawRole);
  if (!canonicalRole) {
    return false;
  }

  if (isAdminRole(normalizedRole)) {
    return true;
  }

  return canonicalRole === 'investor';
}

function extractRoleCandidate(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directKeys = ['role', 'user_role', 'app_role'] as const;
  for (const key of directKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  const nestedUser = record.user;
  if (nestedUser && typeof nestedUser === 'object') {
    const nestedRecord = nestedUser as Record<string, unknown>;
    const nestedRole = nestedRecord.role;
    if (typeof nestedRole === 'string' && nestedRole.trim()) {
      return nestedRole;
    }
  }

  return null;
}

function extractAdminAccessFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || isAdminRole(normalized);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  const booleanKeys = ['allowed', 'is_admin', 'isAdmin', 'verified', 'has_access'] as const;
  if (booleanKeys.some((key) => record[key] === true)) {
    return true;
  }

  const roleKeys = ['role', 'user_role', 'app_role', 'access_role'] as const;
  return roleKeys.some((key) => isAdminRole(typeof record[key] === 'string' ? record[key] : null));
}

async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number, label: string, fallbackValue: T): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      console.log('[Auth] Operation timed out:', label, timeoutMs, 'ms');
      resolve(fallbackValue);
    }, timeoutMs);

    void operation()
      .then((result) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
  });
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

export type LoginFailureReason = 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' | 'service_unavailable' | 'admin_access_locked' | 'unknown';

export interface LoginResult {
  success: boolean;
  message: string;
  requiresTwoFactor?: boolean;
  failureReason?: LoginFailureReason;
  /** Supabase Auth API code when present (e.g. invalid_credentials). */
  supabaseErrorCode?: string;
}

interface RegisterResult {
  success: boolean;
  message: string;
  alreadyExists?: boolean;
  requiresLogin?: boolean;
  rateLimited?: boolean;
  email?: string;
}

interface AuthSessionResult {
  accepted: boolean;
  role: string;
  blockedReason: string | null;
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
  requestedEmail: string | null;
  verifiedEmail: string | null;
  hasStoredVerifiedEmail: boolean;
  emailCheckPassed: boolean;
  emailMismatch: boolean;
  trustedDeviceWindowActive: boolean;
  hasValidTrustedIdentity: boolean;
  exactIPMatch: boolean;
  subnetMatch: boolean;
  blockingReasons: string[];
  accessPath: 'none' | 'ip_match' | 'trusted_device';
}

type OwnerIdentityAuditStatus = 'verified_owner_authority' | 'trusted_device_owner_authority' | 'normal_user_account' | 'email_mismatch' | 'unverified';
type OwnerIdentityAuditSource = ServerRoleResolutionSource | 'owner_ip_access' | 'local_session' | 'not_authenticated';

export interface OwnerIdentityAuditResult {
  requestedEmail: string | null;
  authenticatedUserId: string | null;
  authenticatedEmail: string | null;
  authenticatedRole: string | null;
  authenticatedRoleSource: OwnerIdentityAuditSource;
  authenticatedAuthorityIsAdmin: boolean;
  trustedDeviceVerified: boolean;
  trustedDeviceVerifiedUserId: string | null;
  trustedDeviceVerifiedEmail: string | null;
  trustedDeviceVerifiedRole: string | null;
  trustedDeviceVerifiedAt: string | null;
  trustedDeviceWindowActive: boolean;
  trustedDeviceHasValidIdentity: boolean;
  trustedDeviceAuthorityIsAdmin: boolean;
  matchesAuthenticatedEmail: boolean;
  matchesTrustedDeviceEmail: boolean;
  status: OwnerIdentityAuditStatus;
  isVerifiedOwnerAuthority: boolean;
  isNormalUserOnly: boolean;
  message: string;
  warnings: string[];
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('investor');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState<boolean>(false);
  const [pendingTwoFactorEmail, setPendingTwoFactorEmail] = useState<string>('');
  const [pendingTwoFactorFactor, setPendingTwoFactorFactor] = useState<ParsedMfaFactor | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [verify2FALoading, setVerify2FALoading] = useState<boolean>(false);
  const [registerLoading, setRegisterLoading] = useState<boolean>(false);
  const [activatingOwner, setActivatingOwner] = useState(false);
  const [ownerAccessLoading, setOwnerAccessLoading] = useState(false);
  const [isOwnerIPAccess, setIsOwnerIPAccess] = useState(false);
  const [detectedIP, setDetectedIP] = useState<string | null>(null);
  const sessionMonitorCleanup = useRef<(() => void) | null>(null);
  const ownerIPActiveRef = useRef(false);
  const sessionWarmupKeyRef = useRef<string | null>(null);
  const activeSessionUserIdRef = useRef<string | null>(null);

  const resolveServerRole = useCallback(async (userId: string): Promise<ServerRoleResolution> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (!error && data?.role) {
        const rawProfileRole = typeof data.role === 'string' ? data.role : null;
        const normalizedProfileRole = normalizeRole(rawProfileRole);
        console.log('[Auth] Role from profiles table:', rawProfileRole, '=>', normalizedProfileRole);
        if (shouldAcceptResolvedRole(rawProfileRole, normalizedProfileRole)) {
          return { role: normalizedProfileRole, source: 'profiles' };
        }
        console.log('[Auth] Profiles role did not map cleanly to a trusted role. Continuing fallback checks for:', rawProfileRole);
      }

      console.log('[Auth] Could not fetch role from profiles:', error?.message ?? 'no role returned');
    } catch (error) {
      console.log('[Auth] Profile role fetch error:', (error as Error)?.message ?? 'unknown');
    }

    try {
      const { data, error } = await supabase.rpc('get_user_role');
      const rpcRole = extractRoleCandidate(data);
      if (!error && rpcRole) {
        const normalizedRpcRole = normalizeRole(rpcRole);
        console.log('[Auth] Role from get_user_role RPC:', rpcRole, '=>', normalizedRpcRole);
        if (shouldAcceptResolvedRole(rpcRole, normalizedRpcRole)) {
          return { role: normalizedRpcRole, source: 'rpc_get_user_role' };
        }
        console.log('[Auth] get_user_role RPC returned an untrusted role label. Continuing fallback checks for:', rpcRole);
      }

      console.log('[Auth] get_user_role RPC note:', error?.message ?? 'no role returned');
    } catch (error) {
      console.log('[Auth] get_user_role RPC error:', (error as Error)?.message ?? 'unknown');
    }

    try {
      const { data, error } = await supabase.rpc('verify_admin_access');
      if (!error && extractAdminAccessFlag(data)) {
        console.log('[Auth] verify_admin_access RPC confirmed admin access for user:', userId);
        return { role: 'admin', source: 'rpc_verify_admin_access' };
      }

      console.log('[Auth] verify_admin_access RPC note:', error?.message ?? 'admin access not confirmed');
    } catch (error) {
      console.log('[Auth] verify_admin_access RPC error:', (error as Error)?.message ?? 'unknown');
    }

    try {
      const trustedOwnerMeta = await getVerifiedOwnerDeviceMeta();
      const trustedWindowActive = isTrustedOwnerDeviceWithinWindow(trustedOwnerMeta.verifiedAt);
      const trustedRole = normalizeRole(trustedOwnerMeta.role);
      if (
        trustedWindowActive
        && isValidOwnerVerifiedUserId(trustedOwnerMeta.userId)
        && trustedOwnerMeta.userId === userId
        && isAdminRole(trustedRole)
      ) {
        console.log('[Auth] Falling back to trusted-device owner role for user:', userId, 'role:', trustedRole);
        return { role: trustedRole, source: 'trusted_device' };
      }
    } catch (error) {
      console.log('[Auth] Trusted-device role fallback note:', (error as Error)?.message ?? 'unknown');
    }

    console.log('[Auth] Falling back to investor role because no verified admin role source passed for user:', userId);
    return { role: 'investor', source: 'fallback' };
  }, []);

  const fetchProfileRole = useCallback(async (userId: string): Promise<string> => {
    const resolvedRole = await resolveServerRole(userId);
    console.log('[Auth] Role resolution complete for user:', userId, 'role:', resolvedRole.role, 'source:', resolvedRole.source);
    return resolvedRole.role;
  }, [resolveServerRole]);

  const resolveLocalSessionRoleFallback = useCallback(async (userId: string): Promise<SessionRoleBootstrap> => {
    try {
      const [storedAuth, ownerDeviceVerified, trustedOwnerMeta] = await Promise.all([
        loadStoredAuth(),
        isOwnerDeviceVerified(),
        getVerifiedOwnerDeviceMeta(),
      ]);

      const trustedRole = normalizeRole(trustedOwnerMeta.role);
      const trustedWindowActive = isTrustedOwnerDeviceWithinWindow(trustedOwnerMeta.verifiedAt);
      const sameVerifiedUser = ownerDeviceVerified
        && isValidOwnerVerifiedUserId(trustedOwnerMeta.userId)
        && trustedOwnerMeta.userId === userId;

      if (sameVerifiedUser && trustedWindowActive && isAdminRole(trustedRole)) {
        console.log('[Auth] Role resolution timeout fallback: using trusted-device role for:', userId, 'role:', trustedRole);
        return {
          role: trustedRole,
          source: 'timeout_fallback',
          requiresBackgroundHydration: true,
        };
      }

      const storedRole = normalizeRole(storedAuth.userRole);
      if (storedAuth.userId === userId && storedRole === 'investor') {
        console.log('[Auth] Role resolution timeout fallback: keeping stored investor role for:', userId);
      }
    } catch (error) {
      console.log('[Auth] Local session role fallback note:', (error as Error)?.message ?? 'unknown');
    }

    console.log('[Auth] Role resolution timeout fallback: defaulting to investor for:', userId);
    return {
      role: 'investor',
      source: 'timeout_fallback',
      requiresBackgroundHydration: true,
    };
  }, []);

  const hydrateResolvedRoleInBackground = useCallback((session: Session, optimisticRole: string): void => {
    const sessionUserId = session.user.id;
    console.log('[Auth] Scheduling background role hydration for:', sessionUserId, 'optimisticRole:', optimisticRole);

    void Promise.resolve().then(async () => {
      try {
        const resolvedRole = await resolveServerRole(sessionUserId);
        const normalizedResolvedRole = normalizeRole(resolvedRole.role);

        if (activeSessionUserIdRef.current !== sessionUserId) {
          console.log('[Auth] Background role hydration cancelled because active user changed:', sessionUserId);
          return;
        }

        if (ownerIPActiveRef.current) {
          console.log('[Auth] Background role hydration skipped because trusted owner mode is active for:', sessionUserId);
          return;
        }

        if (normalizedResolvedRole === optimisticRole) {
          console.log('[Auth] Background role hydration confirmed existing role for:', sessionUserId, 'role:', normalizedResolvedRole);
          return;
        }

        console.log('[Auth] Background role hydration updating role for:', sessionUserId, 'from:', optimisticRole, 'to:', normalizedResolvedRole, 'source:', resolvedRole.source);
        setUserRole(normalizedResolvedRole);
        setUser((previousUser) => previousUser?.id === sessionUserId
          ? { ...previousUser, role: normalizedResolvedRole }
          : previousUser);
        setAuthCredentials(null, sessionUserId, normalizedResolvedRole);
        await persistAuth({
          token: session.access_token,
          refreshToken: session.refresh_token || '',
          userId: sessionUserId,
          userRole: normalizedResolvedRole,
        });
      } catch (error) {
        console.log('[Auth] Background role hydration note:', (error as Error)?.message ?? 'unknown');
      }
    });
  }, [resolveServerRole]);

  const clearTwoFactorState = useCallback(() => {
    setRequiresTwoFactor(false);
    setPendingTwoFactorEmail('');
    setPendingTwoFactorFactor(null);
  }, []);

  const requireTwoFactorIfNeeded = useCallback(async (session: Session, source: string): Promise<boolean> => {
    try {
      const requirement = await getMfaChallengeRequirement(supabase);
      if (!requirement.required) {
        clearTwoFactorState();
        return false;
      }

      console.log('[Auth] MFA challenge required after', source, 'email:', session.user.email ?? session.user.id, 'factor:', requirement.factor?.friendlyName ?? 'unknown');
      activeSessionUserIdRef.current = null;
      setUser(null);
      setIsAuthenticated(false);
      setUserRole('investor');
      await clearStoredAuth();
      setPendingTwoFactorEmail(session.user.email ?? '');
      setPendingTwoFactorFactor(requirement.factor);
      setRequiresTwoFactor(true);
      return true;
    } catch (error) {
      console.log('[Auth] MFA requirement check note:', (error as Error)?.message ?? 'unknown');
      return false;
    }
  }, [clearTwoFactorState]);

  const doLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.log('[Auth] Logout error:', e);
    }
    ownerIPActiveRef.current = false;
    sessionWarmupKeyRef.current = null;
    activeSessionUserIdRef.current = null;
    await clearStoredAuth();
    setUser(null);
    setIsAuthenticated(false);
    setUserRole('investor');
    clearTwoFactorState();
    setIsOwnerIPAccess(false);
    if (sessionMonitorCleanup.current) {
      sessionMonitorCleanup.current();
      sessionMonitorCleanup.current = null;
    }
    console.log('[Auth] Logged out');
  }, [clearTwoFactorState]);

  const startMonitor = useCallback(() => {
    if (sessionMonitorCleanup.current) {
      sessionMonitorCleanup.current();
    }
    sessionMonitorCleanup.current = startSessionMonitor(() => {
      console.log('[Auth] Session timed out — logging out');
      void doLogout();
    });
  }, [doLogout]);

  const warmSessionInBackground = useCallback((session: Session, authUser: AuthUser, role: string) => {
    const supaUser = session.user;
    const warmupKey = `${supaUser.id}:${role}`;

    if (sessionWarmupKeyRef.current === warmupKey) {
      console.log('[Auth] Session warmup already scheduled for:', warmupKey);
      return;
    }

    sessionWarmupKeyRef.current = warmupKey;
    console.log('[Auth] Scheduling non-blocking session warmup for:', warmupKey);

    const runWarmup = async (): Promise<void> => {
      if (activeSessionUserIdRef.current !== supaUser.id) {
        console.log('[Auth] Session warmup cancelled because active user changed:', supaUser.id);
        return;
      }

      const registryTimestamp = new Date().toISOString();
      const sessionCreatedAt = supaUser.created_at || registryTimestamp;

      try {
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
        console.log('[Auth] Member registry warmup complete for:', supaUser.id);
      } catch (error) {
        console.log('[Auth] Member registry warmup note:', (error as Error)?.message ?? 'unknown');
      }

      if (activeSessionUserIdRef.current !== supaUser.id) {
        console.log('[Auth] Session warmup stopped after member registry because active user changed:', supaUser.id);
        return;
      }

      try {
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
          console.log('[Auth] Profile warmup note:', profileEnsureResult.error || 'unknown');
        } else {
          console.log('[Auth] Profile warmup complete for:', supaUser.id);
        }
      } catch (error) {
        console.log('[Auth] Profile warmup exception:', (error as Error)?.message ?? 'unknown');
      }

      if (activeSessionUserIdRef.current !== supaUser.id) {
        console.log('[Auth] Session warmup stopped before sync because active user changed:', supaUser.id);
        return;
      }

      try {
        const status = await initializeSync();
        console.log('[Auth] Supabase sync initialized. Connected:', status.connected);
        await syncUserData(supaUser.id);
        console.log('[Auth] User sync warmup complete for:', supaUser.id);
      } catch (error) {
        console.log('[Auth] User sync warmup note:', (error as Error)?.message ?? 'unknown');
      }
    };

    void Promise.resolve().then(runWarmup);
  }, []);

  const handleSession = useCallback(async (session: Session): Promise<AuthSessionResult> => {
    const supaUser = session.user;
    const meta = supaUser.user_metadata || {};

    if (ownerIPActiveRef.current) {
      console.log('[Auth] Replacing transient trusted-owner session with real Supabase session for:', supaUser.id);
    }
    ownerIPActiveRef.current = false;
    setIsOwnerIPAccess(false);

    const roleBootstrap = await withTimeout<SessionRoleBootstrap | null>(
      async () => {
        const resolvedRole = await resolveServerRole(supaUser.id);
        return {
          role: normalizeRole(resolvedRole.role),
          source: resolvedRole.source,
          requiresBackgroundHydration: false,
        };
      },
      AUTH_ROLE_RESOLUTION_TIMEOUT_MS,
      'resolveServerRole',
      null,
    );
    const resolvedSessionRole = roleBootstrap ?? await resolveLocalSessionRoleFallback(supaUser.id);
    const role = normalizeRole(resolvedSessionRole.role);

    if (resolvedSessionRole.source === 'timeout_fallback') {
      console.log('[Auth] Session role bootstrap used timeout fallback for:', supaUser.id, 'role:', role);
    }

    if (!role) {
      console.log('[Auth] No server role found for user:', supaUser.id, '— defaulting to investor. JWT metadata role is NOT trusted for authorization.');
    }

    if (shouldBlockRoleForAdminAccess(role, supaUser.email)) {
      const blockedReason = getAdminAccessLockMessage();
      console.log('[Auth] Admin access lock blocked authenticated session for:', supaUser.id, 'role:', role, 'email:', sanitizeEmail(supaUser.email ?? 'unknown'));
      ownerIPActiveRef.current = false;
      sessionWarmupKeyRef.current = null;
      activeSessionUserIdRef.current = null;
      setUser(null);
      setUserRole('investor');
      setIsAuthenticated(false);
      setIsOwnerIPAccess(false);
      setDetectedIP(null);
      clearTwoFactorState();
      setAuthCredentials(null, null, 'investor');
      await clearStoredAuth();
      if (sessionMonitorCleanup.current) {
        sessionMonitorCleanup.current();
        sessionMonitorCleanup.current = null;
      }
      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.log('[Auth] Admin access lock signOut note:', extractAuthErrorMessage(error) ?? 'unknown');
      }
      return { accepted: false, role, blockedReason };
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

    clearTwoFactorState();
    activeSessionUserIdRef.current = supaUser.id;
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
    console.log('[Auth] Session set for:', supaUser.id, 'role:', role, 'source:', resolvedSessionRole.source);
    warmSessionInBackground(session, authUser, role);

    if (resolvedSessionRole.requiresBackgroundHydration) {
      hydrateResolvedRoleInBackground(session, role);
    }

    return { accepted: true, role, blockedReason: null };
  }, [clearTwoFactorState, hydrateResolvedRoleInBackground, resolveLocalSessionRoleFallback, resolveServerRole, startMonitor, warmSessionInBackground]);

  const activateOwnerIPSession = useCallback((ip: string, verifiedRole: string = 'owner', verifiedUserId?: string | null, verifiedEmail?: string | null) => {
    if (shouldBlockRoleForAdminAccess(verifiedRole, verifiedEmail)) {
      console.log('[Auth] Trusted owner IP activation blocked because owner-only admin access is enabled for another email:', sanitizeEmail(verifiedEmail ?? 'unknown'));
      return;
    }

    const normalizedVerifiedRole = normalizeRole(verifiedRole);
    const effectiveRole = isAdminRole(normalizedVerifiedRole) ? normalizedVerifiedRole : 'owner';
    const normalizedVerifiedEmail = sanitizeEmail(verifiedEmail ?? '');
    const ownerUser: AuthUser = {
      id: verifiedUserId || 'owner-ip-' + ip.replace(/\./g, '-'),
      email: normalizedVerifiedEmail || 'owner@ivxholding.com',
      firstName: 'Owner',
      lastName: '(Trusted Device)',
      kycStatus: 'approved',
      role: effectiveRole,
      emailVerified: true,
    };
    ownerIPActiveRef.current = true;
    sessionWarmupKeyRef.current = null;
    activeSessionUserIdRef.current = ownerUser.id;
    setUser(ownerUser);
    setUserRole(effectiveRole);
    setIsAuthenticated(true);
    setIsOwnerIPAccess(true);
    setDetectedIP(ip);
    setAuthCredentials(null, ownerUser.id, effectiveRole);
    console.log('[Auth] Trusted owner IP access activated for IP:', ip, 'role:', effectiveRole, 'userId:', ownerUser.id);

    initializeSync().then((status) => {
      console.log('[Auth] Supabase sync initialized for owner. Connected:', status.connected, '| Channels:', status.realtimeChannels);
      syncOwnerData().then((stats) => {
        console.log('[Auth] Owner data stats:', JSON.stringify(stats));
      }).catch(() => {});
    }).catch((err) => {
      console.log('[Auth] Sync init failed (non-blocking):', (err as Error)?.message);
    });
  }, []);

  const restoreTrustedOwnerSession = useCallback(async (): Promise<boolean> => {
    try {
      const [ipEnabled, ownerDeviceVerified, ownerDeviceMeta, storedIP] = await Promise.all([
        isStoredOwnerIPEnabled(),
        isOwnerDeviceVerified(),
        getVerifiedOwnerDeviceMeta(),
        getStoredOwnerIP(),
      ]);
      const hasValidTrustedIdentity = isValidOwnerVerifiedUserId(ownerDeviceMeta.userId);
      const normalizedTrustedEmail = sanitizeEmail(ownerDeviceMeta.email ?? '');

      if (isAdminAccessLocked() && !isOwnerAdminEmail(normalizedTrustedEmail)) {
        console.log('[Auth] Trusted owner auto-restore skipped because the verified device email is not the configured owner email:', normalizedTrustedEmail || 'missing');
        return false;
      }

      if (ownerDeviceVerified && !hasValidTrustedIdentity) {
        console.log('[Auth] Trusted owner restore blocked because stored verified user id is invalid:', ownerDeviceMeta.userId);
        await clearOwnerIP();
        return false;
      }

      const shouldVerifyOwnerNetwork = ipEnabled && ownerDeviceVerified;
      const currentIP = shouldVerifyOwnerNetwork ? await fetchDeviceIP() : null;
      setDetectedIP(currentIP ?? storedIP ?? null);
      const trustedDeviceWindowActive = isTrustedOwnerDeviceWithinWindow(ownerDeviceMeta.verifiedAt);
      const hasTrustedWindowAccess = ipEnabled && ownerDeviceVerified && trustedDeviceWindowActive && isValidOwnerVerifiedUserId(ownerDeviceMeta.userId);
      const trustedRole = normalizeRole(ownerDeviceMeta.role);
      console.log('[Auth] Owner trusted-device check — current:', currentIP, 'stored:', storedIP, 'enabled:', ipEnabled, 'verified:', ownerDeviceVerified, 'verifiedUserId:', ownerDeviceMeta.userId, 'verifiedRole:', ownerDeviceMeta.role, 'verifiedAt:', ownerDeviceMeta.verifiedAt, 'trustedWindow:', trustedDeviceWindowActive, 'trustedWindowAccess:', hasTrustedWindowAccess);

      if (ipEnabled && ownerDeviceVerified && storedIP && currentIP && isCarrierSubnetMatch(currentIP, storedIP)) {
        console.log('[Auth] Trusted owner device matched carrier subnet — restoring owner access. Current:', currentIP, 'Stored:', storedIP);
        if (currentIP !== storedIP) {
          await setOwnerIP(currentIP);
          console.log('[Auth] Updated stored owner IP to current:', currentIP);
        }
        activateOwnerIPSession(currentIP, trustedRole, ownerDeviceMeta.userId, ownerDeviceMeta.email);
        return true;
      }

      if (hasTrustedWindowAccess && ownerDeviceMeta.userId) {
        const restoreIdentity = currentIP ?? storedIP ?? 'trusted-device';
        if (currentIP && currentIP !== storedIP) {
          await setOwnerIP(currentIP);
          console.log('[Auth] Updated stored owner IP during trusted-window restore:', currentIP, 'previous:', storedIP ?? 'none');
        }
        console.log('[Auth] Trusted owner device is still inside the verification window — restoring owner access without blocking on exact IP match. Current:', currentIP ?? 'unavailable', 'Stored:', storedIP ?? 'none', 'Role:', trustedRole, 'User:', ownerDeviceMeta.userId);
        activateOwnerIPSession(restoreIdentity, trustedRole, ownerDeviceMeta.userId, ownerDeviceMeta.email);
        return true;
      }

      if (ipEnabled && ownerDeviceVerified && trustedDeviceWindowActive && ownerDeviceMeta.userId && storedIP && currentIP && !isCarrierSubnetMatch(currentIP, storedIP)) {
        console.log('[Auth] Trusted owner device within window but IP subnet mismatch — manual restore remains available. Current:', currentIP, 'stored:', storedIP);
      }

      if (ipEnabled && ownerDeviceVerified && storedIP && !currentIP) {
        console.log('[Auth] Trusted owner device enabled but IP detection failed — exact IP restore is blocked, but verified-window restore may still be used when eligible');
      }
    } catch (error) {
      console.log('[Auth] Trusted owner restore note:', (error as Error)?.message ?? 'unknown');
    }

    return false;
  }, [activateOwnerIPSession]);

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      try {
        const session = await withTimeout(
          async () => {
            const result = await supabase.auth.getSession();
            return result.data.session;
          },
          AUTH_BOOTSTRAP_TIMEOUT_MS,
          'getSession',
          null,
        );

        if (session) {
          if (!cancelled) {
            const challengeRequired = await requireTwoFactorIfNeeded(session, 'startup restore');
            if (!challengeRequired) {
              const handledSession = await handleSession(session);
              if (!handledSession.accepted) {
                console.log('[Auth] Startup restore blocked:', handledSession.blockedReason ?? 'admin access lock');
              }
            }
          }
          return;
        }

        const stored = await loadStoredAuth();
        if (stored.userId) {
          setAuthCredentials(null, stored.userId, stored.userRole);
          const refreshedSession = await withTimeout(
            async () => {
              const refreshResult = await supabase.auth.refreshSession();
              return refreshResult.data.session;
            },
            AUTH_REFRESH_TIMEOUT_MS,
            'refreshSession',
            null,
          );

          if (refreshedSession) {
            if (!cancelled) {
              const challengeRequired = await requireTwoFactorIfNeeded(refreshedSession, 'session refresh');
              if (!challengeRequired) {
                const handledSession = await handleSession(refreshedSession);
                if (handledSession.accepted) {
                  console.log('[Auth] Session restored via refresh for:', stored.userId);
                } else {
                  console.log('[Auth] Session refresh blocked:', handledSession.blockedReason ?? 'admin access lock');
                }
              }
            }
            return;
          }

          console.log('[Auth] Stored userId found but session refresh failed or timed out — clearing');
          await clearStoredAuth();
        }

        if (!cancelled) {
          await restoreTrustedOwnerSession();
        }
      } catch (e) {
        console.log('[Auth] Init error:', (e as Error)?.message);
        console.log('[Auth] Trusted owner auto-restore skipped because startup verification did not complete safely');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void initAuth();

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const result = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (cancelled) {
          return;
        }
        if (ownerIPActiveRef.current) {
          console.log('[Auth] State changed:', _event, '— IGNORED (owner IP active)');
          return;
        }
        console.log('[Auth] State changed:', _event);
        if (session) {
          const challengeRequired = await requireTwoFactorIfNeeded(session, `auth event ${String(_event)}`);
          if (!challengeRequired) {
            const handledSession = await handleSession(session);
            if (!handledSession.accepted) {
              console.log('[Auth] Auth state session blocked:', handledSession.blockedReason ?? 'admin access lock');
            }
          }
        } else if (_event === 'SIGNED_OUT') {
          sessionWarmupKeyRef.current = null;
          activeSessionUserIdRef.current = null;
          setUser(null);
          setIsAuthenticated(false);
          setUserRole('investor');
          clearTwoFactorState();
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
      cancelled = true;
      try { subscription?.unsubscribe(); } catch {}
      if (sessionMonitorCleanup.current) {
        sessionMonitorCleanup.current();
        sessionMonitorCleanup.current = null;
      }
    };
  }, [clearTwoFactorState, handleSession, requireTwoFactorIfNeeded, restoreTrustedOwnerSession]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    setLoginLoading(true);
    try {
      if (ownerIPActiveRef.current || isOwnerIPAccess) {
        console.log('[Auth] Clearing transient trusted-owner access before password sign-in');
        ownerIPActiveRef.current = false;
        setIsOwnerIPAccess(false);
      }

      const signInResult = await signInWithEmailPassword(supabase, email, password);
      const { credentials } = signInResult;
      console.log(
        '[Auth] Password sign-in attempt: email=',
        credentials.email,
        'passwordLength=',
        credentials.passwordLength,
      );

      if (!signInResult.ok) {
        const { error } = signInResult;
        const authErrorMessage = extractAuthErrorMessage(error);
        const errorCode = typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: string }).code ?? '')
          : '';
        console.log('[Auth] Supabase signInWithPassword error (full):', serializeSupabaseAuthErrorForLog(error));
        const normalizedFailure = normalizeLoginFailureMessage(authErrorMessage);
        const displayMessage = (authErrorMessage?.trim() || normalizedFailure.message).trim();
        if (normalizedFailure.isExpectedFailure) {
          console.log('[Auth] Login rejected:', normalizedFailure.failureReason, 'email:', credentials.email, 'displayMessage:', displayMessage);
        } else {
          console.log('[Auth] Login rejection handled:', authErrorMessage ?? 'unknown login rejection', 'email:', credentials.email);
        }
        return {
          success: false,
          message: displayMessage,
          failureReason: normalizedFailure.failureReason,
          ...(errorCode ? { supabaseErrorCode: errorCode } : {}),
        };
      }

      const { session: dataSession } = signInResult;
      const resolvedSession = dataSession ?? (await supabase.auth.getSession()).data.session;
      if (resolvedSession) {
        console.log('[Auth] Direct password sign-in produced a real session for:', credentials.email, 'user:', resolvedSession.user.id);
        const challengeRequired = await requireTwoFactorIfNeeded(resolvedSession, 'password sign-in');
        if (challengeRequired) {
          return {
            success: false,
            requiresTwoFactor: true,
            message: 'Enter the 6-digit code from your authenticator app to finish signing in.',
          };
        }
        const handledSession = await handleSession(resolvedSession);
        if (!handledSession.accepted) {
          return {
            success: false,
            message: handledSession.blockedReason ?? getAdminAccessLockMessage(),
            failureReason: 'admin_access_locked',
          };
        }
        return { success: true, message: 'Login successful' };
      }

      console.log('[Auth] Login finished without a recoverable session for:', credentials.email);
      return { success: false, message: 'Login failed because no active session was returned.', failureReason: 'unknown' };
    } catch (error: unknown) {
      const authErrorMessage = extractAuthErrorMessage(error);
      console.log('[Auth] Login exception (full):', serializeSupabaseAuthErrorForLog(error));
      const normalizedFailure = normalizeLoginFailureMessage(authErrorMessage);
      const displayMessage = (authErrorMessage?.trim() || normalizedFailure.message).trim();
      if (normalizedFailure.isExpectedFailure) {
        console.log('[Auth] Login exception treated as auth rejection:', normalizedFailure.failureReason, 'email:', sanitizeEmail(email));
      } else {
        console.log('[Auth] Login exception handled:', authErrorMessage ?? 'unknown login exception', 'email:', sanitizeEmail(email));
      }
      return {
        success: false,
        message: displayMessage,
        failureReason: normalizedFailure.failureReason,
      };
    } finally {
      setLoginLoading(false);
    }
  }, [handleSession, isOwnerIPAccess, requireTwoFactorIfNeeded]);

  const verify2FA = useCallback(async (code: string): Promise<LoginResult> => {
    setVerify2FALoading(true);
    try {
      let factor = pendingTwoFactorFactor;
      if (!factor) {
        const factorsResult = await supabase.auth.mfa.listFactors();
        if (factorsResult.error) {
          throw factorsResult.error;
        }
        factor = extractFirstVerifiedMfaFactor(factorsResult.data);
      }

      if (!factor) {
        return { success: false, message: 'No verified authenticator factor was found for this account.' };
      }

      console.log('[Auth] Verifying MFA challenge for:', pendingTwoFactorEmail || 'current session', 'factor:', factor.friendlyName);
      const challengeResult = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeResult.error) {
        throw challengeResult.error;
      }

      const challengeId = extractChallengeId(challengeResult.data);
      if (!challengeId) {
        throw new Error('Supabase did not return an MFA challenge id.');
      }

      const verifyResult = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId,
        code: code.trim(),
      });
      if (verifyResult.error) {
        return { success: false, message: verifyResult.error.message || 'Invalid two-factor code.' };
      }

      clearTwoFactorState();
      const sessionResult = await supabase.auth.getSession();
      const verifiedSession = sessionResult.data.session;
      if (!verifiedSession) {
        throw new Error('Two-factor verification finished but no authenticated session was returned.');
      }

      const handledSession = await handleSession(verifiedSession);
      if (!handledSession.accepted) {
        return {
          success: false,
          message: handledSession.blockedReason ?? getAdminAccessLockMessage(),
          failureReason: 'admin_access_locked',
        };
      }
      return { success: true, message: 'Two-factor verification complete.' };
    } catch (error: unknown) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to verify the two-factor code.',
      };
    } finally {
      setVerify2FALoading(false);
    }
  }, [clearTwoFactorState, handleSession, pendingTwoFactorEmail, pendingTwoFactorFactor]);

  const cancelTwoFactor = useCallback(() => {
    clearTwoFactorState();
    void supabase.auth.signOut().catch((error: unknown) => {
      console.log('[Auth] cancelTwoFactor signOut note:', error instanceof Error ? error.message : 'unknown');
    });
  }, [clearTwoFactorState]);

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
      const existingStoredRecord = await findExistingRegisteredMemberByEmail(normalizedEmail);
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
        console.log('[Auth] Register rejection handled:', error.message, 'email:', normalizedEmail);
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
          const handledSession = await handleSession(authData.session);
          if (!handledSession.accepted) {
            return {
              success: false,
              message: handledSession.blockedReason ?? getAdminAccessLockMessage(),
              requiresLogin: false,
              email: normalizedEmail,
            };
          }
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
    } catch (error: unknown) {
      const exceptionMessage = extractAuthErrorMessage(error) || 'Registration failed';
      const normalizedEmail = sanitizeEmail(data.email);
      console.log('[Auth] Register exception handled:', exceptionMessage, 'email:', normalizedEmail);
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
        const handledSession = await handleSession(data.session);
        if (!handledSession.accepted) {
          console.log('[Auth] Session refresh blocked:', handledSession.blockedReason ?? 'admin access lock');
          return false;
        }
        console.log('[Auth] Session refreshed');
        return true;
      }
      return false;
    } catch (error) {
      console.log('[Auth] Refresh exception handled:', extractAuthErrorMessage(error) ?? 'unknown refresh error');
      return false;
    }
  }, [handleSession]);

  const auditOwnerDirectAccess = useCallback(async (requestedEmail?: string): Promise<OwnerDirectAccessAuditResult> => {
    const normalizedRequestedEmail = sanitizeEmail(requestedEmail ?? '');

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

      const hasValidTrustedIdentity = isValidOwnerVerifiedUserId(ownerDeviceMeta.userId);
      const verifiedEmail = sanitizeEmail(ownerDeviceMeta.email ?? '');
      const hasStoredVerifiedEmail = verifiedEmail.length > 0;
      const emailMismatch = normalizedRequestedEmail.length > 0 && hasStoredVerifiedEmail && normalizedRequestedEmail !== verifiedEmail;
      const emailCheckPassed = !emailMismatch;
      const effectiveOwnerEmail = normalizedRequestedEmail || verifiedEmail;

      if (isAdminAccessLocked() && !isOwnerAdminEmail(effectiveOwnerEmail)) {
        const configuredOwnerEmail = getConfiguredOwnerAdminEmail();
        const message = configuredOwnerEmail
          ? `Admin access is temporarily limited to ${configuredOwnerEmail} while testing.`
          : getAdminAccessLockMessage();
        const audit: OwnerDirectAccessAuditResult = {
          eligible: false,
          message,
          currentIP,
          storedIP,
          ipEnabled,
          ownerDeviceVerified,
          verifiedUserId: ownerDeviceMeta.userId,
          verifiedRole: ownerDeviceMeta.role,
          verifiedAt: ownerDeviceMeta.verifiedAt,
          requestedEmail: normalizedRequestedEmail || null,
          verifiedEmail: verifiedEmail || null,
          hasStoredVerifiedEmail,
          emailCheckPassed: false,
          emailMismatch: normalizedRequestedEmail.length > 0,
          trustedDeviceWindowActive: isTrustedOwnerDeviceWithinWindow(ownerDeviceMeta.verifiedAt),
          hasValidTrustedIdentity,
          exactIPMatch: !!(ipEnabled && ownerDeviceVerified && storedIP && currentIP && storedIP === currentIP),
          subnetMatch: !!(ipEnabled && ownerDeviceVerified && storedIP && currentIP && isCarrierSubnetMatch(currentIP, storedIP)),
          blockingReasons: [message],
          accessPath: 'none',
        };
        console.log('[Auth] Owner direct-access audit blocked by temporary owner-only admin lock:', JSON.stringify(audit));
        return audit;
      }

      if (ownerDeviceVerified && !hasValidTrustedIdentity) {
        console.log('[Auth] Owner direct-access audit found invalid trusted owner metadata. Clearing legacy owner-claim state:', ownerDeviceMeta.userId);
        await clearOwnerIP();
        const audit: OwnerDirectAccessAuditResult = {
          eligible: false,
          message: 'This device has legacy owner claim data from an older broken flow. Sign in with your verified owner account once, then verify this device again in Owner Controls.',
          currentIP,
          storedIP,
          ipEnabled: false,
          ownerDeviceVerified: false,
          verifiedUserId: null,
          verifiedRole: null,
          verifiedAt: null,
          requestedEmail: normalizedRequestedEmail || null,
          verifiedEmail: null,
          hasStoredVerifiedEmail: false,
          emailCheckPassed,
          emailMismatch,
          trustedDeviceWindowActive: false,
          hasValidTrustedIdentity: false,
          exactIPMatch: false,
          subnetMatch: false,
          blockingReasons: [
            'Legacy trusted-device metadata was found on this device and was cleared because the verified owner id was invalid.',
          ],
          accessPath: 'none',
        };
        console.log('[Auth] Owner direct-access audit reset invalid trusted metadata:', JSON.stringify(audit));
        return audit;
      }

      const trustedDeviceWindowActive = isTrustedOwnerDeviceWithinWindow(ownerDeviceMeta.verifiedAt);
      const hasExactIPMatch = !!(ipEnabled && ownerDeviceVerified && storedIP && currentIP && storedIP === currentIP);
      const hasSubnetMatch = !!(ipEnabled && ownerDeviceVerified && storedIP && currentIP && isCarrierSubnetMatch(currentIP, storedIP));
      const hasTrustedWindowAccess = !!(ipEnabled && ownerDeviceVerified && trustedDeviceWindowActive && ownerDeviceMeta.userId);
      const eligibleByTrustSignal = hasExactIPMatch || hasSubnetMatch || hasTrustedWindowAccess;
      const eligible = eligibleByTrustSignal && emailCheckPassed;
      const accessPath: 'none' | 'ip_match' | 'trusted_device' = hasExactIPMatch || hasSubnetMatch ? 'ip_match' : hasTrustedWindowAccess ? 'trusted_device' : 'none';
      const blockingReasons: string[] = [];

      if (!ipEnabled) {
        blockingReasons.push('Trusted owner mode is disabled on this device.');
      }
      if (!ownerDeviceVerified) {
        blockingReasons.push('This device has not been verified from a signed-in owner/admin session yet.');
      }
      if (ownerDeviceVerified && !hasValidTrustedIdentity) {
        blockingReasons.push('The stored verified owner id is missing or invalid.');
      }
      if (emailMismatch) {
        blockingReasons.push(`Entered email ${normalizedRequestedEmail} does not match verified owner email ${verifiedEmail}.`);
      }
      if (ipEnabled && ownerDeviceVerified && !storedIP) {
        blockingReasons.push('No trusted owner network is stored on this device.');
      }
      if (ipEnabled && ownerDeviceVerified && !trustedDeviceWindowActive) {
        blockingReasons.push('The trusted-device verification window is no longer active.');
      }
      if (ipEnabled && ownerDeviceVerified && storedIP && !currentIP && !hasTrustedWindowAccess) {
        blockingReasons.push('The current network identity could not be detected, so exact trusted restore could not be confirmed.');
      }
      if (ipEnabled && ownerDeviceVerified && storedIP && currentIP && !hasExactIPMatch && !hasSubnetMatch && !hasTrustedWindowAccess) {
        blockingReasons.push(`Current network ${currentIP} does not match trusted network ${storedIP}.`);
      }

      const message = emailMismatch
        ? `The entered email (${normalizedRequestedEmail}) does not match the verified owner email (${verifiedEmail}) saved on this trusted device.`
        : !ipEnabled
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
                    ? 'Trusted device verified within 30-day window. Tap to restore access.'
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
        requestedEmail: normalizedRequestedEmail || null,
        verifiedEmail: verifiedEmail || null,
        hasStoredVerifiedEmail,
        emailCheckPassed,
        emailMismatch,
        trustedDeviceWindowActive,
        hasValidTrustedIdentity,
        exactIPMatch: hasExactIPMatch,
        subnetMatch: hasSubnetMatch,
        blockingReasons,
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
        requestedEmail: normalizedRequestedEmail || null,
        verifiedEmail: null,
        hasStoredVerifiedEmail: false,
        emailCheckPassed: false,
        emailMismatch: false,
        trustedDeviceWindowActive: false,
        hasValidTrustedIdentity: false,
        exactIPMatch: false,
        subnetMatch: false,
        blockingReasons: [message],
        accessPath: 'none',
      };
      console.log('[Auth] Owner direct-access audit failed:', JSON.stringify(audit));
      return audit;
    }
  }, []);

  const auditOwnerIdentity = useCallback(async (requestedEmail?: string): Promise<OwnerIdentityAuditResult> => {
    const normalizedRequestedEmail = sanitizeEmail(requestedEmail ?? user?.email ?? '');

    try {
      const [ownerDeviceVerified, ownerDeviceMeta, sessionResult] = await Promise.all([
        isOwnerDeviceVerified(),
        getVerifiedOwnerDeviceMeta(),
        supabase.auth.getSession(),
      ]);

      const trustedDeviceVerifiedEmail = sanitizeEmail(ownerDeviceMeta.email ?? '');
      const trustedDeviceVerifiedRole = normalizeRole(ownerDeviceMeta.role);
      const trustedDeviceHasValidIdentity = isValidOwnerVerifiedUserId(ownerDeviceMeta.userId);
      const trustedDeviceWindowActive = isTrustedOwnerDeviceWithinWindow(ownerDeviceMeta.verifiedAt);
      const trustedDeviceAuthorityIsAdmin = ownerDeviceVerified
        && trustedDeviceHasValidIdentity
        && isAdminRole(trustedDeviceVerifiedRole);

      const session = sessionResult.data.session;
      const authenticatedEmail = sanitizeEmail(session?.user.email ?? user?.email ?? '');
      const authenticatedUserId = session?.user.id ?? user?.id ?? null;
      let authenticatedRole = normalizeRole(userRole);
      let authenticatedRoleSource: OwnerIdentityAuditSource = 'not_authenticated';

      if (session?.user.id) {
        const resolvedRole = await resolveServerRole(session.user.id);
        authenticatedRole = normalizeRole(resolvedRole.role);
        authenticatedRoleSource = resolvedRole.source;
      } else if (isOwnerIPAccess && user?.id) {
        authenticatedRole = normalizeRole(userRole);
        authenticatedRoleSource = 'owner_ip_access';
      } else if (isAuthenticated && user?.id) {
        authenticatedRole = normalizeRole(userRole);
        authenticatedRoleSource = 'local_session';
      }

      const matchesAuthenticatedEmail = normalizedRequestedEmail.length > 0
        && authenticatedEmail.length > 0
        && normalizedRequestedEmail === authenticatedEmail;
      const matchesTrustedDeviceEmail = normalizedRequestedEmail.length > 0
        && trustedDeviceVerifiedEmail.length > 0
        && normalizedRequestedEmail === trustedDeviceVerifiedEmail;
      const authenticatedAuthorityIsAdmin = matchesAuthenticatedEmail
        && isAdminRole(authenticatedRole)
        && authenticatedRoleSource !== 'owner_ip_access';
      const trustedOwnerAuthorityBySession = matchesAuthenticatedEmail
        && isAdminRole(authenticatedRole)
        && authenticatedRoleSource === 'owner_ip_access';

      const warnings: string[] = [];

      if (!normalizedRequestedEmail) {
        warnings.push('No owner email is being audited yet. Carry or enter the owner email first.');
      }
      if (matchesAuthenticatedEmail && authenticatedEmail && !isAdminRole(authenticatedRole)) {
        warnings.push(`Authenticated role for ${authenticatedEmail} is ${authenticatedRole || 'unknown'}, so it is not owner-capable authority.`);
      }
      if (ownerDeviceVerified && !trustedDeviceHasValidIdentity) {
        warnings.push('Trusted-device metadata exists, but the verified owner id is invalid.');
      }
      if (ownerDeviceVerified && trustedDeviceVerifiedEmail.length === 0) {
        warnings.push('Trusted-device verification exists, but the verified owner email is missing.');
      }
      if (ownerDeviceVerified && !trustedDeviceWindowActive) {
        warnings.push('Trusted-device verification exists, but the 30-day trusted-device window has expired.');
      }
      if (normalizedRequestedEmail && authenticatedEmail && !matchesAuthenticatedEmail) {
        warnings.push(`Authenticated session email ${authenticatedEmail} does not match audited email ${normalizedRequestedEmail}.`);
      }
      if (normalizedRequestedEmail && trustedDeviceVerifiedEmail && !matchesTrustedDeviceEmail) {
        warnings.push(`Trusted-device owner email ${trustedDeviceVerifiedEmail} does not match audited email ${normalizedRequestedEmail}.`);
      }
      if (!session?.user && !isOwnerIPAccess) {
        warnings.push('No live authenticated session is active, so owner authority can only be proven from trusted-device evidence right now.');
      }

      let status: OwnerIdentityAuditStatus = 'unverified';
      let message = normalizedRequestedEmail
        ? `No verified owner authority was found for ${normalizedRequestedEmail} in the current session or trusted-device records.`
        : 'Carry or enter the owner email to compare it against the current session and trusted-device records.';

      if (authenticatedAuthorityIsAdmin) {
        status = 'verified_owner_authority';
        message = `${normalizedRequestedEmail || authenticatedEmail} is authenticated with verified ${authenticatedRole} authority from ${authenticatedRoleSource}.`;
      } else if (trustedOwnerAuthorityBySession || (matchesTrustedDeviceEmail && trustedDeviceAuthorityIsAdmin)) {
        status = 'trusted_device_owner_authority';
        message = `${normalizedRequestedEmail || trustedDeviceVerifiedEmail || authenticatedEmail} matches the verified owner authority anchored to this trusted device.`;
      } else if (matchesAuthenticatedEmail && authenticatedEmail) {
        status = 'normal_user_account';
        message = `${normalizedRequestedEmail || authenticatedEmail} is authenticated, but the verified role is ${authenticatedRole || 'unknown'}. This is a normal user account, not owner authority.`;
      } else if (normalizedRequestedEmail && trustedDeviceVerifiedEmail && !matchesTrustedDeviceEmail) {
        status = 'email_mismatch';
        message = `${normalizedRequestedEmail} does not match the verified owner email ${trustedDeviceVerifiedEmail} saved on this device.`;
      }

      const audit: OwnerIdentityAuditResult = {
        requestedEmail: normalizedRequestedEmail || null,
        authenticatedUserId,
        authenticatedEmail: authenticatedEmail || null,
        authenticatedRole: authenticatedRole || null,
        authenticatedRoleSource,
        authenticatedAuthorityIsAdmin: authenticatedAuthorityIsAdmin || trustedOwnerAuthorityBySession,
        trustedDeviceVerified: ownerDeviceVerified,
        trustedDeviceVerifiedUserId: ownerDeviceMeta.userId,
        trustedDeviceVerifiedEmail: trustedDeviceVerifiedEmail || null,
        trustedDeviceVerifiedRole: trustedDeviceVerifiedRole || null,
        trustedDeviceVerifiedAt: ownerDeviceMeta.verifiedAt,
        trustedDeviceWindowActive,
        trustedDeviceHasValidIdentity,
        trustedDeviceAuthorityIsAdmin,
        matchesAuthenticatedEmail,
        matchesTrustedDeviceEmail,
        status,
        isVerifiedOwnerAuthority: status === 'verified_owner_authority' || status === 'trusted_device_owner_authority',
        isNormalUserOnly: status === 'normal_user_account',
        message,
        warnings,
      };

      console.log('[Auth] Owner identity audit:', JSON.stringify(audit));
      return audit;
    } catch (error) {
      const message = extractAuthErrorMessage(error) || 'Failed to audit owner identity';
      const audit: OwnerIdentityAuditResult = {
        requestedEmail: normalizedRequestedEmail || null,
        authenticatedUserId: user?.id ?? null,
        authenticatedEmail: sanitizeEmail(user?.email ?? '') || null,
        authenticatedRole: normalizeRole(userRole) || null,
        authenticatedRoleSource: isOwnerIPAccess ? 'owner_ip_access' : isAuthenticated && user?.id ? 'local_session' : 'not_authenticated',
        authenticatedAuthorityIsAdmin: isAdminRole(normalizeRole(userRole)) && !!user?.id,
        trustedDeviceVerified: false,
        trustedDeviceVerifiedUserId: null,
        trustedDeviceVerifiedEmail: null,
        trustedDeviceVerifiedRole: null,
        trustedDeviceVerifiedAt: null,
        trustedDeviceWindowActive: false,
        trustedDeviceHasValidIdentity: false,
        trustedDeviceAuthorityIsAdmin: false,
        matchesAuthenticatedEmail: normalizedRequestedEmail.length > 0 && sanitizeEmail(user?.email ?? '') === normalizedRequestedEmail,
        matchesTrustedDeviceEmail: false,
        status: 'unverified',
        isVerifiedOwnerAuthority: false,
        isNormalUserOnly: false,
        message,
        warnings: [message],
      };
      console.log('[Auth] Owner identity audit failed:', JSON.stringify(audit));
      return audit;
    }
  }, [isAuthenticated, isOwnerIPAccess, resolveServerRole, user?.email, user?.id, userRole]);

  const activateOwnerAccess = useCallback(async (explicitOwnerEmail?: string) => {
    if (shouldBlockRoleForAdminAccess(userRole, explicitOwnerEmail || user?.email)) {
      return { success: false, message: getAdminAccessLockMessage() };
    }

    setActivatingOwner(true);
    try {
      if (!user?.id) {
        return { success: false, message: 'Not authenticated' };
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        console.log('[Auth] activateOwnerAccess blocked: no active Supabase session is available for verification');
        return { success: false, message: 'No active session. Please log in again.' };
      }

      const roleResolution = await resolveServerRole(user.id);
      let serverRole = normalizeRole(roleResolution.role);
      let roleSource: ServerRoleResolutionSource = roleResolution.source;
      console.log('[Auth] activateOwnerAccess role resolution:', serverRole, 'source:', roleSource, 'user:', user.id);

      if (!isAdminRole(serverRole)) {
        const [ownerDeviceVerified, trustedOwnerMeta] = await Promise.all([
          isOwnerDeviceVerified(),
          getVerifiedOwnerDeviceMeta(),
        ]);
        const trustedRole = normalizeRole(trustedOwnerMeta.role);
        const sameVerifiedUser = ownerDeviceVerified
          && isValidOwnerVerifiedUserId(trustedOwnerMeta.userId)
          && trustedOwnerMeta.userId === user.id;

        if (sameVerifiedUser && isAdminRole(trustedRole)) {
          serverRole = trustedRole;
          roleSource = 'trusted_device';
          console.log('[Auth] activateOwnerAccess recovered admin role from previously verified trusted device:', trustedRole, 'user:', user.id);
        }
      }

      if (!isAdminRole(serverRole)) {
        console.log('[Auth] activateOwnerAccess denied — server role is:', serverRole, 'source:', roleSource, 'for user:', user.id);
        return { success: false, message: `Access denied. Verified role is ${serverRole}.` };
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
      const verifiedOwnerEmail = sanitizeEmail(explicitOwnerEmail || currentSession.user.email || user?.email || '');
      await setVerifiedOwnerDevice(currentSession.user.id, serverRole, verifiedOwnerEmail);

      console.log('[Auth] Owner access verified from server and trusted device updated. Role:', serverRole, 'source:', roleSource, 'IP:', currentIP ?? 'unavailable');
      return {
        success: true,
        message: currentIP
          ? `Trusted owner device updated for ${currentIP}`
          : `Trusted owner device verified with role: ${serverRole}`,
      };
    } catch (error: unknown) {
      const msg = extractAuthErrorMessage(error) || 'Failed to activate owner access';
      console.log('[Auth] activateOwnerAccess exception handled:', msg);
      return { success: false, message: msg };
    } finally {
      setActivatingOwner(false);
    }
  }, [user, userRole, detectedIP, resolveServerRole]);

  const claimOwnerDevice = useCallback(async (ownerEmail?: string): Promise<LoginResult> => {
    setOwnerAccessLoading(true);
    try {
      console.log('[Auth] Owner device verification requested from owner-access hub. Email:', ownerEmail || 'none', 'authenticated:', !!user?.id, 'role:', userRole);
      if (!user?.id || !isAdminRole(userRole)) {
        return {
          success: false,
          message: ownerEmail
            ? `Sign in with ${ownerEmail} first, then verify this device in Owner Controls.`
            : 'Sign in with your verified owner account first, then verify this device in Owner Controls.',
        };
      }

      const result = await activateOwnerAccess(ownerEmail);
      if (!result.success) {
        return result;
      }

      return {
        success: true,
        message: result.message,
      };
    } catch (e: any) {
      console.log('[Auth] claimOwnerDevice error:', e?.message);
      return { success: false, message: e?.message || 'Failed to verify trusted owner device' };
    } finally {
      setOwnerAccessLoading(false);
    }
  }, [activateOwnerAccess, user?.id, userRole]);

  const ownerDirectAccess = useCallback(async (requestedEmail?: string): Promise<LoginResult> => {
    setOwnerAccessLoading(true);
    try {
      const audit = await auditOwnerDirectAccess(requestedEmail);
      if (!audit.eligible) {
        return {
          success: false,
          message: audit.message,
        };
      }

      const accessIdentity = audit.currentIP ?? audit.storedIP ?? 'trusted-device';
      const normalizedTrustedRole = normalizeRole(audit.verifiedRole);
      const trustedRole = isAdminRole(normalizedTrustedRole) ? normalizedTrustedRole : 'owner';
      if (audit.currentIP && audit.storedIP && audit.currentIP !== audit.storedIP) {
        await setOwnerIP(audit.currentIP);
        console.log('[Auth] ownerDirectAccess: Updated stored IP to current:', audit.currentIP);
      }
      console.log('[Auth] ownerDirectAccess: restoring via path:', audit.accessPath, 'identity:', accessIdentity, 'role:', trustedRole, 'verifiedUserId:', audit.verifiedUserId);
      activateOwnerIPSession(accessIdentity, trustedRole, audit.verifiedUserId, audit.verifiedEmail);
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
      if (session) {
        const challengeRequired = await requireTwoFactorIfNeeded(session, 'profile refetch');
        if (!challengeRequired) {
          const handledSession = await handleSession(session);
          if (!handledSession.accepted) {
            console.log('[Auth] Profile refetch blocked:', handledSession.blockedReason ?? 'admin access lock');
          }
        }
      }
    } catch (e) {
      console.log('[Auth] refetchProfile error:', (e as Error)?.message);
    }
  }, [handleSession, requireTwoFactorIfNeeded]);

  return useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    isAdmin: isAdminRole(userRole) && !shouldBlockRoleForAdminAccess(userRole, user?.email),
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
    auditOwnerIdentity,
    ownerDirectAccess,
    claimOwnerDevice,
    ownerAccessLoading,
    isOwnerIPAccess,
    detectedIP,
    loginLoading,
    registerLoading,
    verify2FALoading,
    pendingTwoFactorEmail,
    pendingTwoFactorFactorLabel: pendingTwoFactorFactor?.friendlyName ?? 'Authenticator app',
    profileData: user,
    refetchProfile,
  }), [
    user, isAuthenticated, isLoading, userRole, login, register, doLogout,
    verify2FA, cancelTwoFactor, requiresTwoFactor, refreshSession,
    activateOwnerAccess, activatingOwner, auditOwnerDirectAccess, auditOwnerIdentity, ownerDirectAccess, claimOwnerDevice, ownerAccessLoading, loginLoading, verify2FALoading, registerLoading,
    refetchProfile, isOwnerIPAccess, detectedIP, pendingTwoFactorEmail, pendingTwoFactorFactor,
  ]);
});
