import * as SecureStore from 'expo-secure-store';
import logger from './logger';
import { isAdminRole as _isAdminRole } from './auth-helpers';
import type { AdminRole, UserRole } from './auth-helpers';

export type { AdminRole, UserRole };
export const isAdminRole = _isAdminRole;

let _userId: string | null = null;
let _userRole: string | null = null;

const KEYS = {
  USER_ID: 'ipx_user_id',
  USER_ROLE: 'ipx_user_role',
} as const;

export function setAuthCredentials(
  _token: string | null,
  userId: string | null,
  userRole: string | null,
  _refreshToken?: string | null,
) {
  _userId = userId;
  _userRole = userRole;
}

export function getAuthToken(): string | null {
  console.log('[AuthStore] getAuthToken() is deprecated — use supabase.auth.getSession() instead');
  return null;
}

export function getRefreshToken(): string | null {
  console.log('[AuthStore] getRefreshToken() is deprecated — use supabase.auth.getSession() instead');
  return null;
}

export function setAuthToken(_token: string) {
  console.log('[AuthStore] setAuthToken() is deprecated — Supabase manages tokens');
}

export function getAuthUserId(): string | null {
  if (!_userId) {
    logger.authStore.warn('No userId available — user may not be authenticated');
  }
  return _userId;
}

export function getAuthUserRole(): string {
  return _userRole || 'investor';
}

export async function persistAuth(data: {
  token: string;
  refreshToken: string;
  userId: string;
  userRole: string;
}): Promise<void> {
  _userId = data.userId;
  _userRole = data.userRole;
  try {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.USER_ID, data.userId),
      SecureStore.setItemAsync(KEYS.USER_ROLE, data.userRole),
    ]);
    logger.authStore.log('Auth persisted for:', data.userId);
  } catch (error) {
    logger.authStore.error('Persist error:', error);
  }
}

export async function loadStoredAuth(): Promise<{
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
  userRole: string | null;
}> {
  try {
    const [userId, userRole] = await Promise.all([
      SecureStore.getItemAsync(KEYS.USER_ID),
      SecureStore.getItemAsync(KEYS.USER_ROLE),
    ]);
    if (userId) {
      _userId = userId;
      _userRole = userRole;
      logger.authStore.log('Stored auth loaded for:', userId);
    }
    return { token: null, refreshToken: null, userId, userRole };
  } catch (error) {
    logger.authStore.error('Load error:', error);
    return { token: null, refreshToken: null, userId: null, userRole: null };
  }
}

export async function clearStoredAuth(): Promise<void> {
  _userId = null;
  _userRole = null;
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.USER_ID),
      SecureStore.deleteItemAsync(KEYS.USER_ROLE),
      SecureStore.deleteItemAsync('ipx_auth_token').catch(() => {}),
      SecureStore.deleteItemAsync('ipx_refresh_token').catch(() => {}),
    ]);
    logger.authStore.log('Auth cleared');
  } catch (error) {
    logger.authStore.error('Clear error:', error);
  }
}
