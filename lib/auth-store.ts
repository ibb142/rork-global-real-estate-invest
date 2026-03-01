import * as SecureStore from 'expo-secure-store';
import logger from './logger';

let _token: string | null = null;
let _refreshToken: string | null = null;
let _userId: string | null = null;
let _userRole: string | null = null;

const KEYS = {
  TOKEN: 'ipx_auth_token',
  REFRESH_TOKEN: 'ipx_refresh_token',
  USER_ID: 'ipx_user_id',
  USER_ROLE: 'ipx_user_role',
} as const;

export function setAuthCredentials(token: string | null, userId: string | null, userRole: string | null, refreshToken?: string | null) {
  _token = token;
  _userId = userId;
  _userRole = userRole;
  if (refreshToken !== undefined) _refreshToken = refreshToken;
}

export function getAuthToken(): string | null {
  return _token;
}

export function getRefreshToken(): string | null {
  return _refreshToken;
}

export function setAuthToken(token: string) {
  _token = token;
}

export function getAuthUserId(): string {
  if (!_userId) {
    logger.authStore.warn('No userId available — user may not be authenticated');
  }
  return _userId || '';
}

export function getAuthUserRole(): string {
  return _userRole || 'investor';
}

const ADMIN_ROLES = ['owner', 'ceo', 'staff'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];
export type UserRole = AdminRole | 'investor';

export function isAdminRole(role: string | null): boolean {
  return ADMIN_ROLES.includes(role as AdminRole);
}

export async function persistAuth(data: {
  token: string;
  refreshToken: string;
  userId: string;
  userRole: string;
}): Promise<void> {
  setAuthCredentials(data.token, data.userId, data.userRole, data.refreshToken);
  try {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.TOKEN, data.token),
      SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, data.refreshToken),
      SecureStore.setItemAsync(KEYS.USER_ID, data.userId),
      SecureStore.setItemAsync(KEYS.USER_ROLE, data.userRole),
    ]);
    logger.authStore.log('Auth persisted');
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
    const [token, refreshToken, userId, userRole] = await Promise.all([
      SecureStore.getItemAsync(KEYS.TOKEN),
      SecureStore.getItemAsync(KEYS.REFRESH_TOKEN),
      SecureStore.getItemAsync(KEYS.USER_ID),
      SecureStore.getItemAsync(KEYS.USER_ROLE),
    ]);
    if (token && userId) {
      setAuthCredentials(token, userId, userRole, refreshToken);
      logger.authStore.log('Session restored for:', userId);
    }
    return { token, refreshToken, userId, userRole };
  } catch (error) {
    logger.authStore.error('Load error:', error);
    return { token: null, refreshToken: null, userId: null, userRole: null };
  }
}

export async function clearStoredAuth(): Promise<void> {
  setAuthCredentials(null, null, null, null);
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.TOKEN),
      SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
      SecureStore.deleteItemAsync(KEYS.USER_ID),
      SecureStore.deleteItemAsync(KEYS.USER_ROLE),
    ]);
    logger.authStore.log('Auth cleared');
  } catch (error) {
    logger.authStore.error('Clear error:', error);
  }
}
