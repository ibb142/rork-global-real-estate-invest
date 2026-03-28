export type IntegrationPriority = 'critical' | 'high' | 'medium' | 'low';
export type IntegrationStatus = 'not_started' | 'in_progress' | 'ready' | 'mock_only';

export interface EnvVariable {
  name: string;
  description: string;
  example: string;
  required: boolean;
}

export interface IntegrationItem {
  id: string;
  name: string;
  provider: string;
  description: string;
  priority: IntegrationPriority;
  status: IntegrationStatus;
  category: string;
  envVariables: EnvVariable[];
  endpoints: string[];
  docsUrl: string;
  notes: string;
  estimatedHours: number;
}

export interface IntegrationCategory {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: IntegrationItem[];
}

export const DEVELOPER_HANDOFF_CATEGORIES: IntegrationCategory[] = [
  {
    id: 'database',
    title: 'Database & Infrastructure',
    icon: 'Database',
    color: '#3B82F6',
    items: [
      {
        id: 'db-1', name: 'Primary Database', provider: 'PostgreSQL (Supabase / Neon)',
        description: 'Main relational database for users, transactions, properties, KYC data.',
        priority: 'critical', status: 'not_started', category: 'database',
        envVariables: [
          { name: 'DATABASE_URL', description: 'PostgreSQL connection string', example: 'postgresql://user:pass@host:5432/ipx_db', required: true },
        ],
        endpoints: ['Supabase client queries'], docsUrl: 'https://supabase.com/docs',
        notes: 'Backend uses Supabase PostgreSQL with Row Level Security.', estimatedHours: 12,
      },
      {
        id: 'db-3', name: 'File Storage', provider: 'AWS S3 / Cloudflare R2',
        description: 'Store KYC documents, property images, user avatars, and generated PDFs.',
        priority: 'critical', status: 'not_started', category: 'database',
        envVariables: [
          { name: 'S3_BUCKET_NAME', description: 'S3 bucket name', example: 'ipx-uploads', required: true },
          { name: 'AWS_ACCESS_KEY_ID', description: 'AWS access key', example: 'AKIA...', required: true },
          { name: 'AWS_SECRET_ACCESS_KEY', description: 'AWS secret key', example: 'wJal...', required: true },
        ],
        endpoints: ['KYC document uploads', 'Property image uploads'], docsUrl: 'https://docs.aws.amazon.com/s3/',
        notes: 'Must implement signed URLs for secure access.', estimatedHours: 4,
      },
    ],
  },
  {
    id: 'auth',
    title: 'Authentication & Security',
    icon: 'Lock',
    color: '#6366F1',
    items: [
      {
        id: 'auth-1', name: 'Authentication Provider', provider: 'Firebase Auth / Auth0 / Clerk',
        description: 'Email/password auth, social login, session management, token refresh.',
        priority: 'critical', status: 'mock_only', category: 'auth',
        envVariables: [
          { name: 'AUTH_SECRET', description: 'JWT signing secret', example: 'your-jwt-secret-key-min-32-chars', required: true },
          { name: 'GOOGLE_CLIENT_ID', description: 'Google OAuth client ID', example: '123456.apps.googleusercontent.com', required: true },
        ],
        endpoints: ['users.login', 'users.register', 'users.resetPassword'], docsUrl: 'https://firebase.google.com/docs/auth',
        notes: 'Currently uses mock auth. Must replace with real JWT-based auth.', estimatedHours: 10,
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payment Processing',
    icon: 'CreditCard',
    color: '#10B981',
    items: [
      {
        id: 'pay-1', name: 'Stripe', provider: 'Stripe',
        description: 'Credit/debit card processing, Apple Pay, Google Pay, refunds, and webhooks.',
        priority: 'critical', status: 'mock_only', category: 'payments',
        envVariables: [
          { name: 'STRIPE_SECRET_KEY', description: 'Stripe secret key', example: 'sk_live_...', required: true },
          { name: 'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', description: 'Stripe publishable key', example: 'pk_live_...', required: true },
          { name: 'STRIPE_WEBHOOK_SECRET', description: 'Stripe webhook signing secret', example: 'whsec_...', required: true },
        ],
        endpoints: ['payments.createPaymentIntent', 'payments.processCardPayment'], docsUrl: 'https://stripe.com/docs',
        notes: 'Payment processing via Supabase Edge Functions.', estimatedHours: 8,
      },
      {
        id: 'pay-2', name: 'Plaid', provider: 'Plaid',
        description: 'Bank account linking, ACH transfers, bank verification.',
        priority: 'critical', status: 'mock_only', category: 'payments',
        envVariables: [
          { name: 'PLAID_CLIENT_ID', description: 'Plaid client ID', example: '5f1b0...', required: true },
          { name: 'PLAID_SECRET', description: 'Plaid secret key', example: '...', required: true },
        ],
        endpoints: ['payments.createPlaidLinkToken', 'payments.verifyBankAccount'], docsUrl: 'https://plaid.com/docs/',
        notes: 'Used for bank linking in wallet.', estimatedHours: 6,
      },
    ],
  },
  {
    id: 'kyc',
    title: 'KYC & Compliance',
    icon: 'ShieldCheck',
    color: '#F59E0B',
    items: [
      {
        id: 'kyc-1', name: 'Identity Verification (KYC)', provider: 'Jumio / Onfido / Persona',
        description: 'Government ID verification, selfie matching, face recognition, liveness detection.',
        priority: 'critical', status: 'mock_only', category: 'kyc',
        envVariables: [
          { name: 'KYC_API_KEY', description: 'KYC provider API key', example: 'persona_...', required: true },
        ],
        endpoints: ['kyc.getStatus', 'kyc.submitDocument', 'kyc.submitSelfie'], docsUrl: 'https://docs.withpersona.com/',
        notes: 'Full KYC flow built. Needs real provider SDK.', estimatedHours: 8,
      },
    ],
  },
  {
    id: 'communications',
    title: 'Communications & Notifications',
    icon: 'Bell',
    color: '#EC4899',
    items: [
      {
        id: 'comm-1', name: 'Push Notifications', provider: 'Expo Push / FCM',
        description: 'Real-time push notifications for transactions, KYC updates, dividends.',
        priority: 'critical', status: 'mock_only', category: 'communications',
        envVariables: [
          { name: 'EXPO_PUSH_ACCESS_TOKEN', description: 'Expo push notification access token', example: 'ExponentPushToken[...]', required: true },
        ],
        endpoints: ['notifications.list', 'notifications.send'], docsUrl: 'https://docs.expo.dev/push-notifications/overview/',
        notes: 'Notification system built. Needs real push delivery.', estimatedHours: 4,
      },
      {
        id: 'comm-2', name: 'Email Service', provider: 'SendGrid / AWS SES',
        description: 'Transactional emails, marketing emails, and admin email engine.',
        priority: 'critical', status: 'mock_only', category: 'communications',
        envVariables: [
          { name: 'SENDGRID_API_KEY', description: 'SendGrid API key', example: 'SG...', required: true },
          { name: 'EMAIL_FROM_ADDRESS', description: 'Sender email address', example: 'noreply@ipxholding.com', required: true },
        ],
        endpoints: ['emailEngine.getStats', 'emailEngine.sendCampaign'], docsUrl: 'https://docs.sendgrid.com/',
        notes: 'Admin email engine built. SMTP configs need real provider.', estimatedHours: 6,
      },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics & Monitoring',
    icon: 'BarChart3',
    color: '#0EA5E9',
    items: [
      {
        id: 'an-2', name: 'Error Tracking', provider: 'Sentry',
        description: 'Crash reporting, error tracking, performance monitoring.',
        priority: 'critical', status: 'not_started', category: 'analytics',
        envVariables: [
          { name: 'SENTRY_DSN', description: 'Sentry DSN', example: 'https://xxx@sentry.io/yyy', required: true },
        ],
        endpoints: ['Global error boundary', 'All API calls'], docsUrl: 'https://docs.sentry.io/platforms/react-native/',
        notes: 'Error boundary exists. Need @sentry/react-native.', estimatedHours: 4,
      },
    ],
  },
  {
    id: 'legal',
    title: 'Legal & Compliance',
    icon: 'FileCheck',
    color: '#78716C',
    items: [
      {
        id: 'legal-2', name: 'SEC Reg D / Reg CF Compliance', provider: 'DealMaker / Custom',
        description: 'Securities offering compliance, investor limits, filing automation.',
        priority: 'critical', status: 'not_started', category: 'legal',
        envVariables: [],
        endpoints: ['Investor prospectus', 'Investment limits'], docsUrl: 'https://www.sec.gov/education/smallbusiness/exemptofferings',
        notes: 'Critical for legal operation. Must implement investment limits.', estimatedHours: 8,
      },
    ],
  },
];

export function getAllIntegrations(): IntegrationItem[] {
  return DEVELOPER_HANDOFF_CATEGORIES.flatMap(c => c.items);
}

export function getAllEnvVariables(): EnvVariable[] {
  const seen = new Set<string>();
  const vars: EnvVariable[] = [];
  for (const cat of DEVELOPER_HANDOFF_CATEGORIES) {
    for (const item of cat.items) {
      for (const env of item.envVariables) {
        if (!seen.has(env.name)) { seen.add(env.name); vars.push(env); }
      }
    }
  }
  return vars;
}

export function getTotalEstimatedHours(): number {
  return getAllIntegrations().reduce((sum, i) => sum + i.estimatedHours, 0);
}

export function getCriticalCount(): number {
  return getAllIntegrations().filter(i => i.priority === 'critical').length;
}

export function getReadyCount(): number {
  return getAllIntegrations().filter(i => i.status === 'ready').length;
}

export function getMockOnlyCount(): number {
  return getAllIntegrations().filter(i => i.status === 'mock_only').length;
}

export function generateHandoffTextReport(): string {
  const allItems = getAllIntegrations();
  const allEnvs = getAllEnvVariables();
  const totalHours = getTotalEstimatedHours();
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  let report = `IVXHOLDINGS DEVELOPER INTEGRATION GUIDE\nGenerated: ${now}\nTotal: ${allItems.length} integrations | ${getCriticalCount()} critical | ${totalHours}h (~${Math.ceil(totalHours / 40)} weeks) | ${allEnvs.length} env vars\n\n`;
  for (const cat of DEVELOPER_HANDOFF_CATEGORIES) {
    report += `━━━ ${cat.title.toUpperCase()} ━━━\n`;
    for (const item of cat.items) {
      report += `  ${item.name} (${item.provider}) [${item.priority.toUpperCase()}] [${item.status}] ${item.estimatedHours}h\n`;
      report += `  ${item.description}\n`;
      if (item.envVariables.length > 0) {
        report += `  Env: ${item.envVariables.map(e => e.name).join(', ')}\n`;
      }
      report += '\n';
    }
  }
  return report;
}

export function generateHandoffHtmlReport(): string {
  const allItems = getAllIntegrations();
  const allEnvs = getAllEnvVariables();
  const totalHours = getTotalEstimatedHours();
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const priorityColor = (p: string) => {
    switch (p) { case 'critical': return '#DC2626'; case 'high': return '#F59E0B'; case 'medium': return '#3B82F6'; default: return '#6B7280'; }
  };
  const statusColor = (s: string) => {
    switch (s) { case 'ready': return '#10B981'; case 'mock_only': return '#F59E0B'; case 'in_progress': return '#3B82F6'; default: return '#6B7280'; }
  };
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>IVXHOLDINGS Developer Guide</title>
<style>body{font-family:system-ui;background:#0A0A0A;color:#fff;padding:40px}.header{text-align:center;margin-bottom:40px;border-bottom:2px solid #FFD700;padding-bottom:30px}h1{color:#FFD700}.stats{display:flex;gap:16px;margin-bottom:30px;flex-wrap:wrap}.stat{flex:1;min-width:120px;background:#1A1A1A;border:1px solid #2A2A2A;border-radius:12px;padding:16px;text-align:center}.stat-num{font-size:28px;font-weight:700;color:#FFD700}.stat-label{font-size:12px;color:#9A9A9A}.item{background:#1A1A1A;border:1px solid #2A2A2A;border-radius:12px;padding:20px;margin-bottom:12px}.badge{display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;color:#fff;margin-right:4px}.env-item{font-family:monospace;font-size:12px;color:#FFD700}</style></head><body>
<div class="header"><h1>IVXHOLDINGS Luxury Holdings</h1><p>Developer Integration Guide - ${now}</p></div>
<div class="stats"><div class="stat"><div class="stat-num">${allItems.length}</div><div class="stat-label">Integrations</div></div><div class="stat"><div class="stat-num">${getCriticalCount()}</div><div class="stat-label">Critical</div></div><div class="stat"><div class="stat-num">${totalHours}h</div><div class="stat-label">Est. Hours</div></div><div class="stat"><div class="stat-num">${allEnvs.length}</div><div class="stat-label">Env Variables</div></div></div>`;
  for (const cat of DEVELOPER_HANDOFF_CATEGORIES) {
    html += `<h2>${cat.title}</h2>`;
    for (const item of cat.items) {
      html += `<div class="item"><b>${item.name}</b> <span class="badge" style="background:${priorityColor(item.priority)}">${item.priority.toUpperCase()}</span><span class="badge" style="background:${statusColor(item.status)}">${item.status.replace(/_/g,' ')}</span><br><small>${item.provider} | ${item.estimatedHours}h</small><p>${item.description}</p>`;
      if (item.envVariables.length) { html += item.envVariables.map(e => `<div class="env-item">${e.name}=${e.example}</div>`).join(''); }
      html += `</div>`;
    }
  }
  html += `</body></html>`;
  return html;
}
