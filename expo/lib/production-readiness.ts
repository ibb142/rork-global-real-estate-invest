import { getPaymentProviderStatus } from '@/lib/payment-service';
import { getVerificationProviderStatus } from '@/lib/verification-service';
import { validateEnvironment } from '@/lib/env-validation';
import { isMockDataInUse, getMockDataReport } from '@/lib/mock-data-warning';

export interface ReadinessCheck {
  name: string;
  status: 'ready' | 'warning' | 'not_ready';
  message: string;
  action?: string;
}

export interface ProductionReadinessReport {
  overall: 'ready' | 'not_ready' | 'partial';
  checks: ReadinessCheck[];
  readyCount: number;
  warningCount: number;
  notReadyCount: number;
  timestamp: string;
}

export function checkProductionReadiness(): ProductionReadinessReport {
  const checks: ReadinessCheck[] = [];

  const envResult = validateEnvironment();
  checks.push({
    name: 'Environment Variables',
    status: envResult.valid ? (envResult.warnings.length > 0 ? 'warning' : 'ready') : 'not_ready',
    message: envResult.valid
      ? `${envResult.present.length} vars configured` + (envResult.warnings.length > 0 ? ` (${envResult.warnings.length} warnings)` : '')
      : `Missing required: ${envResult.missing.join(', ')}`,
    action: envResult.valid ? undefined : 'Set missing environment variables in project settings',
  });

  const paymentStatus = getPaymentProviderStatus();
  checks.push({
    name: 'Payment Provider',
    status: paymentStatus.configured ? 'ready' : 'not_ready',
    message: paymentStatus.configured
      ? `Payment provider configured (${paymentStatus.mode})`
      : 'No payment provider configured — transactions are simulated',
    action: paymentStatus.configured ? undefined : 'Connect Stripe, Plaid, or PayPal before accepting real payments',
  });

  const verificationStatus = getVerificationProviderStatus();
  checks.push({
    name: 'KYC Verification',
    status: verificationStatus.configured ? 'ready' : 'warning',
    message: verificationStatus.configured
      ? 'KYC verification via edge functions'
      : 'Using fallback simulation — deploy Supabase Edge Functions for real KYC',
    action: verificationStatus.configured ? undefined : 'Deploy kyc-liveness, kyc-face-match, kyc-sanctions-check edge functions',
  });

  const mockReport = getMockDataReport();
  checks.push({
    name: 'Mock Data Usage',
    status: !isMockDataInUse() ? 'ready' : (mockReport.productionCount > 0 ? 'not_ready' : 'warning'),
    message: !isMockDataInUse()
      ? 'No mock data in use'
      : `${mockReport.total} modules using mock data (${mockReport.productionCount} production screens)`,
    action: isMockDataInUse() ? 'Replace mock imports with real Supabase queries' : undefined,
  });

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const isRealSupabase = supabaseUrl.includes('.supabase.co') && !supabaseUrl.includes('localhost');
  checks.push({
    name: 'Database Connection',
    status: isRealSupabase ? 'ready' : (supabaseUrl ? 'warning' : 'not_ready'),
    message: isRealSupabase
      ? 'Connected to Supabase Cloud'
      : supabaseUrl ? 'Using non-production Supabase URL' : 'No Supabase URL configured',
  });

  checks.push({
    name: 'HTTPS / SSL',
    status: 'warning',
    message: 'CloudFront HTTPS pending — currently HTTP only for ivxholding.com',
    action: 'Request CloudFront verification from AWS Support, then run setup-cloudfront-landing.mjs',
  });

  checks.push({
    name: 'Email Service (SES)',
    status: 'warning',
    message: 'SES in sandbox mode — 200 emails/day, verified recipients only',
    action: 'Request SES Production Access from AWS Console',
  });

  checks.push({
    name: 'SMS Service (SNS)',
    status: 'warning',
    message: 'SNS spend limit is $1/month (~10 SMS)',
    action: 'Request SMS spend limit increase to $100/month via AWS Support',
  });

  const readyCount = checks.filter(c => c.status === 'ready').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;
  const notReadyCount = checks.filter(c => c.status === 'not_ready').length;

  let overall: 'ready' | 'not_ready' | 'partial' = 'ready';
  if (notReadyCount > 0) overall = 'not_ready';
  else if (warningCount > 0) overall = 'partial';

  return {
    overall,
    checks,
    readyCount,
    warningCount,
    notReadyCount,
    timestamp: new Date().toISOString(),
  };
}

export function logProductionReadiness(): void {
  if (!__DEV__) return;

  const report = checkProductionReadiness();

  const statusEmoji = { ready: 'PASS', warning: 'WARN', not_ready: 'FAIL' } as const;

  console.log(`[ProductionReadiness] Overall: ${report.overall.toUpperCase()} (${report.readyCount} ready, ${report.warningCount} warnings, ${report.notReadyCount} not ready)`);

  for (const check of report.checks) {
    const emoji = statusEmoji[check.status];
    console.log(`  [${emoji}] ${check.name}: ${check.message}`);
    if (check.action) {
      console.log(`         Action: ${check.action}`);
    }
  }
}
