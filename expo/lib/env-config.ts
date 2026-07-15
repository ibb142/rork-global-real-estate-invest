type Environment = 'development' | 'staging' | 'production';

interface EnvironmentConfig {
  environment: Environment;
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  aws: {
    region: string;
    s3Bucket: string;
    cloudfrontDistributionId: string;
    cloudfrontDomain: string;
  };
  api: {
    baseUrl: string;
    timeout: number;
  };
  features: {
    enableRealtime: boolean;
    enablePresence: boolean;
    enableTypingIndicators: boolean;
    enableAttachments: boolean;
    enableAnalytics: boolean;
    enablePushNotifications: boolean;
  };
  limits: {
    realtimeEventsPerSecond: number;
    heartbeatIntervalMs: number;
    healthCheckIntervalMs: number;
    maxUploadSizeMb: number;
    chatHistoryPageSize: number;
  };
}

function detectEnvironment(): Environment {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return 'development';
  }

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  if (supabaseUrl.includes('staging') || supabaseUrl.includes('dev')) {
    return 'staging';
  }

  return 'production';
}

function buildConfig(env: Environment): EnvironmentConfig {
  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const awsRegion = (process.env.AWS_REGION || 'us-east-1').trim();
  const s3Bucket = (process.env.S3_BUCKET_NAME || 'ivx-holdings-prod').trim();
  const cfDistId = (process.env.CLOUDFRONT_DISTRIBUTION_ID || '').trim();
  const apiBase = (process.env.EXPO_PUBLIC_API_BASE_URL || supabaseUrl || '').trim();

  const baseConfig: EnvironmentConfig = {
    environment: env,
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: serviceRoleKey,
    },
    aws: {
      region: awsRegion,
      s3Bucket: s3Bucket,
      cloudfrontDistributionId: cfDistId,
      cloudfrontDomain: 'cdn.ivxholding.com',
    },
    api: {
      baseUrl: apiBase,
      timeout: 15000,
    },
    features: {
      enableRealtime: true,
      enablePresence: true,
      enableTypingIndicators: true,
      enableAttachments: true,
      enableAnalytics: true,
      enablePushNotifications: true,
    },
    limits: {
      realtimeEventsPerSecond: 2,
      heartbeatIntervalMs: 45000,
      healthCheckIntervalMs: 120000,
      maxUploadSizeMb: 50,
      chatHistoryPageSize: 50,
    },
  };

  if (env === 'development') {
    baseConfig.api.timeout = 20000;
    baseConfig.limits.realtimeEventsPerSecond = 5;
    baseConfig.limits.heartbeatIntervalMs = 30000;
    baseConfig.limits.healthCheckIntervalMs = 60000;
  }

  if (env === 'staging') {
    baseConfig.limits.realtimeEventsPerSecond = 3;
    baseConfig.limits.healthCheckIntervalMs = 90000;
  }

  return baseConfig;
}

const _env = detectEnvironment();
const _config = buildConfig(_env);

console.log(`[EnvConfig] Environment: ${_env} | Supabase: ${_config.supabase.url ? 'configured' : 'NOT configured'} | AWS region: ${_config.aws.region}`);

export function getEnvConfig(): EnvironmentConfig {
  return _config;
}

export function getEnvironment(): Environment {
  return _env;
}

export function isProduction(): boolean {
  return _env === 'production';
}

export function isDevelopment(): boolean {
  return _env === 'development';
}

export function isStaging(): boolean {
  return _env === 'staging';
}

export interface SecretAuditResult {
  safe: boolean;
  issues: string[];
  warnings: string[];
}

export function auditSecretExposure(): SecretAuditResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  const serviceKey = _config.supabase.serviceRoleKey;
  const anonKey = _config.supabase.anonKey;

  if (serviceKey && serviceKey === anonKey) {
    issues.push('SUPABASE_SERVICE_ROLE_KEY matches anon key — admin operations will fail');
  }

  if (!serviceKey && _env === 'production') {
    warnings.push('SUPABASE_SERVICE_ROLE_KEY not set — server-side admin ops unavailable');
  }

  const awsAccessKey = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const awsSecretKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();

  if (_env === 'production' && (!awsAccessKey || !awsSecretKey)) {
    warnings.push('AWS credentials not configured — S3/CloudFront operations unavailable');
  }

  if (!_config.supabase.url) {
    issues.push('EXPO_PUBLIC_SUPABASE_URL not set — database unavailable');
  }

  if (!_config.supabase.anonKey) {
    issues.push('EXPO_PUBLIC_SUPABASE_ANON_KEY not set — authentication unavailable');
  }

  return {
    safe: issues.length === 0,
    issues,
    warnings,
  };
}

export function getRequiredEnvVars(env: Environment): string[] {
  const base = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ];

  if (env === 'staging' || env === 'production') {
    base.push(
      'SUPABASE_SERVICE_ROLE_KEY',
      'JWT_SECRET',
    );
  }

  if (env === 'production') {
    base.push(
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_REGION',
      'S3_BUCKET_NAME',
      'CLOUDFRONT_DISTRIBUTION_ID',
    );
  }

  return base;
}

export type { Environment, EnvironmentConfig };
