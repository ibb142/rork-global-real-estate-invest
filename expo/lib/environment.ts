export type Environment = 'development' | 'staging' | 'production';

export interface EnvironmentConfig {
  name: Environment;
  apiBaseUrl: string;
  enableDebugLogging: boolean;
  enableAnalytics: boolean;
  enableCrashReporting: boolean;
  enableMockData: boolean;
  stripeMode: 'test' | 'live';
  kycMode: 'sandbox' | 'production';
  paymentMode: 'sandbox' | 'production';
  featureFlags: {
    enableAdminPanel: boolean;
    enableCopyInvesting: boolean;
    enableAutoReinvest: boolean;
    enableGiftShares: boolean;
    enableVipTiers: boolean;
    enableAIChat: boolean;
    enablePushNotifications: boolean;
    enableBiometricAuth: boolean;
  };
}

const developmentConfig: EnvironmentConfig = {
  name: 'development',
  apiBaseUrl: process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000',
  enableDebugLogging: true,
  enableAnalytics: true,
  enableCrashReporting: false,
  enableMockData: true,
  stripeMode: 'test',
  kycMode: 'sandbox',
  paymentMode: 'sandbox',
  featureFlags: {
    enableAdminPanel: true,
    enableCopyInvesting: true,
    enableAutoReinvest: true,
    enableGiftShares: true,
    enableVipTiers: true,
    enableAIChat: true,
    enablePushNotifications: false,
    enableBiometricAuth: false,
  },
};

const stagingConfig: EnvironmentConfig = {
  name: 'staging',
  apiBaseUrl: process.env.EXPO_PUBLIC_STAGING_API_URL || 'https://staging.ivxholding.com',
  enableDebugLogging: true,
  enableAnalytics: true,
  enableCrashReporting: true,
  enableMockData: false,
  stripeMode: 'test',
  kycMode: 'sandbox',
  paymentMode: 'sandbox',
  featureFlags: {
    enableAdminPanel: true,
    enableCopyInvesting: true,
    enableAutoReinvest: true,
    enableGiftShares: true,
    enableVipTiers: true,
    enableAIChat: true,
    enablePushNotifications: true,
    enableBiometricAuth: true,
  },
};

const productionConfig: EnvironmentConfig = {
  name: 'production',
  apiBaseUrl: process.env.EXPO_PUBLIC_PRODUCTION_API_URL || 'https://ivxholding.com',
  enableDebugLogging: false,
  enableAnalytics: true,
  enableCrashReporting: true,
  enableMockData: false,
  stripeMode: 'live',
  kycMode: 'production',
  paymentMode: 'production',
  featureFlags: {
    enableAdminPanel: false,
    enableCopyInvesting: true,
    enableAutoReinvest: true,
    enableGiftShares: true,
    enableVipTiers: true,
    enableAIChat: true,
    enablePushNotifications: true,
    enableBiometricAuth: true,
  },
};

function detectEnvironment(): Environment {
  const envOverride = process.env.EXPO_PUBLIC_APP_ENV as Environment | undefined;
  if (envOverride && ['development', 'staging', 'production'].includes(envOverride)) {
    return envOverride;
  }

  if (__DEV__) {
    return 'development';
  }

  if (process.env.EXPO_PUBLIC_STAGING_API_URL) {
    return 'staging';
  }

  return 'production';
}

const ENV_MAP: Record<Environment, EnvironmentConfig> = {
  development: developmentConfig,
  staging: stagingConfig,
  production: productionConfig,
};

export const currentEnvironment = detectEnvironment();
export const envConfig = ENV_MAP[currentEnvironment];

export function getEnvConfig(): EnvironmentConfig {
  return envConfig;
}

export function isProduction(): boolean {
  return currentEnvironment === 'production';
}

export function isStaging(): boolean {
  return currentEnvironment === 'staging';
}

export function isDevelopment(): boolean {
  return currentEnvironment === 'development';
}

export function isFeatureEnabled(feature: keyof EnvironmentConfig['featureFlags']): boolean {
  return envConfig.featureFlags[feature];
}

export function getEnvironmentBadge(): { label: string; color: string } | null {
  switch (currentEnvironment) {
    case 'development':
      return { label: 'DEV', color: '#FF6B6B' };
    case 'staging':
      return { label: 'STAGING', color: '#FFB800' };
    case 'production':
      return null;
  }
}

export function logEnvironmentInfo(): void {
  if (!envConfig.enableDebugLogging) return;
  console.log(`[Environment] Running in ${currentEnvironment} mode`);
  console.log(`[Environment] API: ${envConfig.apiBaseUrl}`);
  console.log(`[Environment] Mock data: ${envConfig.enableMockData}`);
  console.log(`[Environment] Stripe: ${envConfig.stripeMode}`);
  console.log(`[Environment] Features:`, envConfig.featureFlags);
}
