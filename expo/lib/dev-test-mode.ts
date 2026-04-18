import { getIVXAccessControlConfig } from '@/shared/ivx';
import { isOpenAccessModeEnabled } from './open-access';

const OWNER_ALLOWLIST_EMAILS: readonly string[] = [
  'owner@ivx.com',
  'admin@ivx.com',
];

const OWNER_ALLOWLIST_IDS: readonly string[] = [
  'ivx-dev-owner',
];

export type DevTestModeContext = {
  testModeActive: boolean;
  ownerAllowlisted: boolean;
  ownerRoomAuthenticated: boolean;
  backendAdminVerified: boolean;
  fallbackChatOnlyActive: boolean;
  confirmationRequired: boolean;
  requestClass: 'normal';
  auditLoggingEnabled: boolean;
  reason: string;
};

function isDevOrStagingEnvironment(): boolean {
  const env = process.env.NODE_ENV ?? 'development';
  return env === 'development' || env === 'test';
}

function isOwnerAllowlisted(userId: string | null | undefined, email: string | null | undefined): boolean {
  const trimmedUserId = (userId ?? '').trim().toLowerCase();
  const trimmedEmail = (email ?? '').trim().toLowerCase();

  if (trimmedUserId && OWNER_ALLOWLIST_IDS.some((id) => id.toLowerCase() === trimmedUserId)) {
    return true;
  }

  if (trimmedEmail && OWNER_ALLOWLIST_EMAILS.some((e) => e.toLowerCase() === trimmedEmail)) {
    return true;
  }

  return false;
}

export function isDevTestModeEnabled(): boolean {
  return getIVXAccessControlConfig().devTestModeEnabled;
}

export function resolveDevTestModeContext(options: {
  userId?: string | null;
  email?: string | null;
}): DevTestModeContext {
  const isDevEnv = isDevOrStagingEnvironment();
  const accessConfig = getIVXAccessControlConfig();
  const isOpenAccess = accessConfig.openAccessEnabled;
  const flagEnabled = accessConfig.devTestModeEnabled;
  const allowlisted = isOwnerAllowlisted(options.userId, options.email);

  const testModeActive = flagEnabled && (isDevEnv || isOpenAccess) && (allowlisted || accessConfig.ownerBypassEnabled);

  if (!testModeActive) {
    return {
      testModeActive: false,
      ownerAllowlisted: allowlisted,
      ownerRoomAuthenticated: false,
      backendAdminVerified: false,
      fallbackChatOnlyActive: true,
      confirmationRequired: true,
      requestClass: 'normal',
      auditLoggingEnabled: true,
      reason: 'Test mode inactive: explicit test-mode bypass is disabled, not dev/staging, or owner is not allowlisted.',
    };
  }

  console.log('[DevTestMode] Test mode ACTIVE for owner:', options.userId ?? options.email ?? 'open-access');

  return {
    testModeActive: true,
    ownerAllowlisted: true,
    ownerRoomAuthenticated: true,
    backendAdminVerified: true,
    fallbackChatOnlyActive: false,
    confirmationRequired: false,
    requestClass: 'normal',
    auditLoggingEnabled: true,
    reason: accessConfig.ownerBypassEnabled
      ? 'Explicit IVX test/open-access bypass is active for this build.'
      : 'Dev/staging test mode bypass active for allowlisted owner account.',
  };
}

export function shouldBypassOwnerReVerification(options: {
  userId?: string | null;
  email?: string | null;
}): boolean {
  const ctx = resolveDevTestModeContext(options);
  return ctx.testModeActive && ctx.ownerRoomAuthenticated;
}

export function shouldBypassChatRoomLimits(options: {
  userId?: string | null;
  email?: string | null;
}): boolean {
  const ctx = resolveDevTestModeContext(options);
  return ctx.testModeActive;
}

export function shouldBypassConfirmationGate(options: {
  userId?: string | null;
  email?: string | null;
}): boolean {
  const ctx = resolveDevTestModeContext(options);
  return ctx.testModeActive && !ctx.confirmationRequired;
}

export function getDevTestModeLabel(): string {
  const accessConfig = getIVXAccessControlConfig();
  if (!accessConfig.devTestModeEnabled) {
    return 'TEST_MODE: OFF';
  }

  if (!isDevOrStagingEnvironment() && !isOpenAccessModeEnabled()) {
    return 'TEST_MODE: OFF (production)';
  }

  return accessConfig.ownerBypassEnabled ? 'TEST_MODE: ON (explicit bypass)' : 'TEST_MODE: ON (dev/staging)';
}
