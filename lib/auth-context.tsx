import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback } from 'react';
import { trpc } from './trpc';
import { persistAuth, loadStoredAuth, clearStoredAuth, isAdminRole, getRefreshToken, setAuthToken } from './auth-store';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  kycStatus: string;
  role: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
}

interface LoginResult {
  success: boolean;
  message: string;
  requiresTwoFactor?: boolean;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('investor');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);

  const loginMutation = trpc.users.login.useMutation();
  const registerMutation = trpc.users.register.useMutation();
  const logoutMutation = trpc.users.logout.useMutation();
  const verify2FAMutation = trpc.users.verify2FA.useMutation();
  const refreshTokenMutation = trpc.users.refreshToken.useMutation();

  const profileQuery = trpc.users.getProfile.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 1,
  });

  useEffect(() => {
    (async () => {
      try {
        const stored = await loadStoredAuth();
        if (stored.token && stored.userId) {
          setIsAuthenticated(true);
          if (stored.userRole) setUserRole(stored.userRole);
          console.log('[Auth] Session restored for:', stored.userId);
        }
      } catch (e) {
        console.log('[Auth] Restore failed:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (profileQuery.data) {
      const role = (profileQuery.data as any).role || userRole;
      setUser({
        id: profileQuery.data.id,
        email: profileQuery.data.email,
        firstName: profileQuery.data.firstName,
        lastName: profileQuery.data.lastName,
        kycStatus: profileQuery.data.kycStatus,
        role,
        emailVerified: (profileQuery.data as any).emailVerified,
        twoFactorEnabled: (profileQuery.data as any).twoFactorEnabled,
      });
      setUserRole(role);
    }
  }, [profileQuery.data]);

  const handleAuthSuccess = useCallback(async (token: string, refreshToken: string, userData: any) => {
    const role = userData.role || 'investor';
    await persistAuth({
      token,
      refreshToken,
      userId: userData.id,
      userRole: role,
    });
    setUser({
      id: userData.id,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      kycStatus: userData.kycStatus,
      role,
      emailVerified: userData.emailVerified,
      twoFactorEnabled: userData.twoFactorEnabled,
    });
    setUserRole(role);
    setIsAuthenticated(true);
    setRequiresTwoFactor(false);
    setTwoFactorToken(null);
    console.log('[Auth] Auth success for:', userData.id);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const result = await loginMutation.mutateAsync({ email, password });

      if (result.requiresTwoFactor && result.twoFactorToken) {
        setTwoFactorToken(result.twoFactorToken);
        setRequiresTwoFactor(true);
        console.log('[Auth] 2FA required for login');
        return { success: true, requiresTwoFactor: true, message: 'Enter your 2FA code' };
      }

      if (result.success && result.token && result.user) {
        await handleAuthSuccess(result.token, result.refreshToken || '', result.user);
        return { success: true, message: 'Login successful' };
      }

      return { success: false, message: (result as any).message || 'Invalid credentials' };
    } catch (error: any) {
      console.error('[Auth] Login error:', error);
      return { success: false, message: error?.message || 'Login failed' };
    }
  }, [loginMutation, handleAuthSuccess]);

  const verify2FA = useCallback(async (code: string): Promise<LoginResult> => {
    if (!twoFactorToken) {
      return { success: false, message: 'No 2FA session active' };
    }

    try {
      const result = await verify2FAMutation.mutateAsync({
        twoFactorToken,
        code,
      });

      if (result.success && result.token && result.user) {
        await handleAuthSuccess(result.token, result.refreshToken || '', result.user);
        return { success: true, message: 'Login successful' };
      }

      return { success: false, message: result.message || 'Invalid code' };
    } catch (error: any) {
      console.error('[Auth] 2FA verify error:', error);
      return { success: false, message: error?.message || '2FA verification failed' };
    }
  }, [twoFactorToken, verify2FAMutation, handleAuthSuccess]);

  const cancelTwoFactor = useCallback(() => {
    setRequiresTwoFactor(false);
    setTwoFactorToken(null);
    console.log('[Auth] 2FA cancelled');
  }, []);

  const register = useCallback(async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    country: string;
    referralCode?: string;
  }) => {
    try {
      const result = await registerMutation.mutateAsync(data);
      if (result.success) {
        return { success: true, message: result.message || 'Registration successful. Please verify your email to log in.' };
      }
      return { success: false, message: result.message || 'Registration failed' };
    } catch (error) {
      console.error('[Auth] Register error:', error);
      return { success: false, message: 'Registration failed' };
    }
  }, [registerMutation, login]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const storedRefresh = getRefreshToken();
    if (!storedRefresh) {
      console.log('[Auth] No refresh token available');
      return false;
    }

    try {
      const result = await refreshTokenMutation.mutateAsync({ refreshToken: storedRefresh });
      if (result.success && result.token && result.refreshToken) {
        setAuthToken(result.token);
        await persistAuth({
          token: result.token,
          refreshToken: result.refreshToken,
          userId: user?.id || '',
          userRole,
        });
        console.log('[Auth] Session refreshed');
        return true;
      }
      console.log('[Auth] Refresh failed');
      return false;
    } catch (error) {
      console.error('[Auth] Refresh error:', error);
      return false;
    }
  }, [refreshTokenMutation, user, userRole]);

  const logout = useCallback(async () => {
    try {
      if (isAuthenticated) await logoutMutation.mutateAsync();
    } catch (e) {
      console.log('[Auth] Logout API error:', e);
    }
    await clearStoredAuth();
    setUser(null);
    setIsAuthenticated(false);
    setUserRole('investor');
    setRequiresTwoFactor(false);
    setTwoFactorToken(null);
    console.log('[Auth] Logged out');
  }, [isAuthenticated, logoutMutation]);

  return {
    user,
    isAuthenticated,
    isLoading,
    isAdmin: isAdminRole(userRole),
    userRole,
    login,
    register,
    logout,
    verify2FA,
    cancelTwoFactor,
    requiresTwoFactor,
    refreshSession,
    loginLoading: loginMutation.isPending,
    registerLoading: registerMutation.isPending,
    verify2FALoading: verify2FAMutation.isPending,
    profileData: profileQuery.data,
    refetchProfile: profileQuery.refetch,
  };
});
