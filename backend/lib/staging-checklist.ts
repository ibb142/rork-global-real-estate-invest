

export interface StagingCheckResult {
  ready: boolean;
  checks: {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
  }[];
  summary: string;
}

export function runStagingChecklist(): StagingCheckResult {
  const checks: StagingCheckResult['checks'] = [];

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    checks.push({ name: 'JWT_SECRET', status: 'fail', message: 'Not set — authentication will not work' });
  } else if (jwtSecret.length < 32) {
    checks.push({ name: 'JWT_SECRET', status: 'warn', message: 'Too short (min 32 chars recommended)' });
  } else if (jwtSecret === 'ipx-holding-jwt-secret-key-change-in-production-2024') {
    checks.push({ name: 'JWT_SECRET', status: 'fail', message: 'Still using default value — must change for staging' });
  } else {
    checks.push({ name: 'JWT_SECRET', status: 'pass', message: 'Configured' });
  }

  const nodeEnv: string | undefined = process.env.NODE_ENV ?? undefined;
  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    checks.push({ name: 'NODE_ENV', status: 'pass', message: `Set to ${nodeEnv}` });
  } else {
    checks.push({ name: 'NODE_ENV', status: 'warn', message: `Set to "${nodeEnv || 'undefined'}" — should be "staging" or "production"` });
  }

  const corsOrigins = process.env.ALLOWED_ORIGINS;
  if (corsOrigins && corsOrigins !== '*') {
    checks.push({ name: 'CORS', status: 'pass', message: `Restricted to: ${corsOrigins}` });
  } else if (!corsOrigins) {
    checks.push({ name: 'CORS', status: 'warn', message: 'ALLOWED_ORIGINS not set — will block all in production' });
  } else {
    checks.push({ name: 'CORS', status: 'warn', message: 'Set to wildcard — restrict for staging' });
  }

  const stripe = process.env.STRIPE_SECRET_KEY;
  if (stripe?.startsWith('sk_test_')) {
    checks.push({ name: 'Stripe', status: 'pass', message: 'Test mode configured' });
  } else if (stripe?.startsWith('sk_live_')) {
    checks.push({ name: 'Stripe', status: 'warn', message: 'Live mode — ensure this is intentional for staging' });
  } else {
    checks.push({ name: 'Stripe', status: 'warn', message: 'Not configured — payments will use mock mode' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (webhookSecret) {
    checks.push({ name: 'Stripe Webhook', status: 'pass', message: 'Webhook secret configured' });
  } else {
    checks.push({ name: 'Stripe Webhook', status: 'warn', message: 'Not configured — webhook verification disabled' });
  }

  const hasEmail = process.env.SENDGRID_API_KEY || process.env.MAILGUN_API_KEY;
  if (hasEmail) {
    checks.push({ name: 'Email Provider', status: 'pass', message: 'Configured' });
  } else {
    checks.push({ name: 'Email Provider', status: 'warn', message: 'Not configured — emails will be logged only' });
  }

  const hasSMS = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
  if (hasSMS) {
    checks.push({ name: 'SMS Provider', status: 'pass', message: 'AWS SNS configured' });
  } else {
    checks.push({ name: 'SMS Provider', status: 'warn', message: 'AWS SNS not configured — SMS will be logged only' });
  }

  const hasStorage = process.env.STORAGE_PROVIDER;
  if (hasStorage) {
    checks.push({ name: 'File Storage', status: 'pass', message: `Provider: ${hasStorage}` });
  } else {
    checks.push({ name: 'File Storage', status: 'warn', message: 'Not configured — uploads will use local storage' });
  }

  const hasSentry = process.env.SENTRY_DSN;
  if (hasSentry) {
    checks.push({ name: 'Error Monitoring', status: 'pass', message: 'Sentry configured' });
  } else {
    checks.push({ name: 'Error Monitoring', status: 'warn', message: 'Sentry not configured — errors logged only' });
  }

  const hasKYC = process.env.ONFIDO_API_KEY || process.env.JUMIO_API_KEY;
  if (hasKYC) {
    checks.push({ name: 'KYC Provider', status: 'pass', message: 'Configured' });
  } else {
    checks.push({ name: 'KYC Provider', status: 'warn', message: 'Not configured — KYC will use mock mode' });
  }

  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  const passCount = checks.filter(c => c.status === 'pass').length;
  const ready = failCount === 0;

  const lines = [
    '=== Staging Environment Checklist ===',
    `Pass: ${passCount} | Warn: ${warnCount} | Fail: ${failCount}`,
    `Status: ${ready ? 'READY (with warnings)' : 'NOT READY — fix failures first'}`,
    '',
    ...checks.map(c => {
      const icon = c.status === 'pass' ? 'PASS' : c.status === 'warn' ? 'WARN' : 'FAIL';
      return `[${icon}] ${c.name}: ${c.message}`;
    }),
  ];

  return {
    ready,
    checks,
    summary: lines.join('\n'),
  };
}

export function logStagingStatus(): void {
  const result = runStagingChecklist();
  console.log(result.summary);
}
