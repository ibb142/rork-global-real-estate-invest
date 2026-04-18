import { getIVXAccessControlConfig } from '@/shared/ivx';

export function isOpenAccessModeEnabled(): boolean {
  return getIVXAccessControlConfig().openAccessEnabled;
}

export function getOpenAccessModeMessage(): string {
  const config = getIVXAccessControlConfig();
  return config.openAccessEnabled
    ? 'Login is temporarily disabled in this build. The app opens directly.'
    : 'Open access is disabled in this build. Sign in is required.';
}

export function getOpenAccessModeAdminMessage(): string {
  const config = getIVXAccessControlConfig();
  return config.openAccessEnabled
    ? 'Open access is active. Owner Access and Sign In are bypassed so you can open the app and admin routes directly.'
    : 'Open access is disabled. Admin routes require a verified session.';
}
