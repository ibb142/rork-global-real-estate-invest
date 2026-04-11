const OPEN_ACCESS_MODE_ENABLED = true;

export function isOpenAccessModeEnabled(): boolean {
  return OPEN_ACCESS_MODE_ENABLED;
}

export function getOpenAccessModeMessage(): string {
  return 'Login is temporarily disabled in this build. The app opens directly.';
}

export function getOpenAccessModeAdminMessage(): string {
  return 'Open access is active. Owner Access and Sign In are bypassed so you can open the app and admin routes directly.';
}
