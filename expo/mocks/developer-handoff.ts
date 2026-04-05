export type IntegrationPriority = 'critical' | 'high' | 'medium' | 'low';
export type IntegrationStatus = 'not_started' | 'in_progress' | 'ready' | 'mock_only';
export type IntegrationOwner = 'rork' | 'user' | 'shared';

export interface EnvVariable {
  name: string;
  description: string;
  example: string;
  required: boolean;
  configured: boolean;
}

export interface IntegrationItem {
  id: string;
  name: string;
  provider: string;
  description: string;
  priority: IntegrationPriority;
  status: IntegrationStatus;
  owner: IntegrationOwner;
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

export interface DeliverySummaryBucket {
  owner: IntegrationOwner;
  totalItems: number;
  remainingItems: number;
  remainingHours: number;
}

const CONFIGURED_ENV_NAMES = new Set<string>([
  'JWT_SECRET',
  'EXPO_PUBLIC_GOOGLE_ADS_API_KEY',
  'EXPO_PUBLIC_SUPABASE_URL',
  'SUPABASE_DB_PASSWORD',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GITHUB_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'S3_BUCKET_NAME',
  'CLOUDFRONT_DISTRIBUTION_ID',
  'EXPO_PUBLIC_RORK_AUTH_URL',
  'EXPO_PUBLIC_RORK_API_BASE_URL',
  'EXPO_PUBLIC_TOOLKIT_URL',
  'EXPO_PUBLIC_PROJECT_ID',
  'EXPO_PUBLIC_TEAM_ID',
]);

function isEnvConfigured(name: string): boolean {
  return CONFIGURED_ENV_NAMES.has(name);
}

function env(name: string, description: string, example: string, required = true): EnvVariable {
  return {
    name,
    description,
    example,
    required,
    configured: isEnvConfigured(name),
  };
}

export const DEVELOPER_HANDOFF_CATEGORIES: IntegrationCategory[] = [
  {
    id: 'platform-security',
    title: 'Platform & Security',
    icon: 'Lock',
    color: '#6366F1',
    items: [
      {
        id: 'platform-supabase-client',
        name: 'Supabase Public Client',
        provider: 'Supabase',
        description: 'Client app connectivity for landing, waitlist, and authenticated product flows.',
        priority: 'critical',
        status: 'ready',
        owner: 'rork',
        category: 'platform-security',
        envVariables: [
          env('EXPO_PUBLIC_SUPABASE_URL', 'Supabase project URL used by the client app', 'https://project.supabase.co'),
          env('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'Supabase public anon key for client-side access', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'),
        ],
        endpoints: ['/landing', '/waitlist', '/admin'],
        docsUrl: 'https://supabase.com/docs/guides/getting-started',
        notes: 'Configured and already wired in the app code.',
        estimatedHours: 0,
      },
      {
        id: 'platform-supabase-audit',
        name: 'Supabase Schema + RLS Audit',
        provider: 'Supabase PostgreSQL',
        description: 'Validate live tables, access policies, and role separation for admin, public landing, and signed-in app usage.',
        priority: 'critical',
        status: 'in_progress',
        owner: 'rork',
        category: 'platform-security',
        envVariables: [],
        endpoints: ['/admin/supabase-scripts', '/backend-audit', '/system-health'],
        docsUrl: 'https://supabase.com/docs/guides/database/postgres/row-level-security',
        notes: 'This is app-side audit work I can finish directly.',
        estimatedHours: 6,
      },
      {
        id: 'platform-jwt-session',
        name: 'JWT Session Security',
        provider: 'App Auth Layer',
        description: 'Finalize token validation, expiry handling, and server/client trust boundaries for protected routes.',
        priority: 'critical',
        status: 'in_progress',
        owner: 'shared',
        category: 'platform-security',
        envVariables: [
          env('JWT_SECRET', 'JWT signing secret used by the auth layer', 'a-very-long-random-secret-value'),
          env('EXPO_PUBLIC_RORK_AUTH_URL', 'Hosted auth endpoint used by the app', 'https://auth.example.com'),
        ],
        endpoints: ['/login', '/signup', '/admin'],
        docsUrl: 'https://supabase.com/docs/guides/auth',
        notes: 'The code path exists. Final validation depends on the production auth rules you want enforced.',
        estimatedHours: 4,
      },
      {
        id: 'platform-rork-bridge',
        name: 'Rork Platform Bridge',
        provider: 'Rork API',
        description: 'Project-scoped API endpoints and auth bridge used by platform services already present in the app.',
        priority: 'critical',
        status: 'ready',
        owner: 'rork',
        category: 'platform-security',
        envVariables: [
          env('EXPO_PUBLIC_RORK_API_BASE_URL', 'Base URL for Rork platform API requests', 'https://api.rork.com'),
          env('EXPO_PUBLIC_PROJECT_ID', 'Current project identifier', 'jh1qrutuhy6vu1bkysoln'),
          env('EXPO_PUBLIC_TEAM_ID', 'Current team identifier', 'team_123'),
        ],
        endpoints: ['/app-guide', '/system-health', '/analytics-report'],
        docsUrl: 'https://rork.com',
        notes: 'Configured in the project and available to the app.',
        estimatedHours: 0,
      },
    ],
  },
  {
    id: 'storage-delivery',
    title: 'Storage & Delivery',
    icon: 'Database',
    color: '#3B82F6',
    items: [
      {
        id: 'storage-s3-pipeline',
        name: 'AWS S3 Upload Pipeline',
        provider: 'Amazon S3',
        description: 'Production document and asset storage for uploads, backups, and generated files.',
        priority: 'critical',
        status: 'in_progress',
        owner: 'shared',
        category: 'storage-delivery',
        envVariables: [
          env('AWS_ACCESS_KEY_ID', 'AWS IAM access key used for bucket access', 'AKIA...'),
          env('AWS_SECRET_ACCESS_KEY', 'AWS IAM secret for bucket access', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCY...'),
          env('AWS_REGION', 'Primary AWS region for storage services', 'us-east-1'),
          env('S3_BUCKET_NAME', 'Bucket used for documents and image assets', 'ivxholding-assets'),
        ],
        endpoints: ['/admin/image-backup', '/admin/data-recovery', '/contract-generator'],
        docsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
        notes: 'Credentials are present. Final bucket policies and production path verification still need completion.',
        estimatedHours: 6,
      },
      {
        id: 'storage-cloudfront',
        name: 'CloudFront Asset Delivery',
        provider: 'Amazon CloudFront',
        description: 'CDN delivery and cache invalidation for public images and documents.',
        priority: 'high',
        status: 'in_progress',
        owner: 'shared',
        category: 'storage-delivery',
        envVariables: [
          env('CLOUDFRONT_DISTRIBUTION_ID', 'CloudFront distribution ID for cache invalidation', 'E123ABC456DEF'),
        ],
        endpoints: ['/landing', '/admin/banners', '/admin/image-backup'],
        docsUrl: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html',
        notes: 'Needs final production cache rules and invalidation flow confirmation.',
        estimatedHours: 4,
      },
    ],
  },
  {
    id: 'growth-intelligence',
    title: 'Growth & Intelligence',
    icon: 'BarChart3',
    color: '#0EA5E9',
    items: [
      {
        id: 'growth-toolkit',
        name: 'Rork Toolkit Services',
        provider: 'Rork Toolkit',
        description: 'AI-capable project services and utilities configured for this project scope.',
        priority: 'high',
        status: 'ready',
        owner: 'rork',
        category: 'growth-intelligence',
        envVariables: [
          env('EXPO_PUBLIC_TOOLKIT_URL', 'Toolkit base URL used by the app', 'https://toolkit.rork.com'),
          env('EXPO_PUBLIC_PROJECT_ID', 'Project identifier for toolkit-scoped requests', 'jh1qrutuhy6vu1bkysoln'),
          env('EXPO_PUBLIC_TEAM_ID', 'Team identifier for toolkit-scoped requests', 'team_123'),
        ],
        endpoints: ['/ai-gallery', '/ai-automation-report', '/global-intelligence'],
        docsUrl: 'https://rork.com',
        notes: 'Configured and available for project-scoped services.',
        estimatedHours: 0,
      },
      {
        id: 'growth-analytics-sync',
        name: 'Analytics Report Sync',
        provider: 'Internal Analytics Module',
        description: 'Refresh analytics surfaces so the admin reports and landing metrics reflect the same active data path.',
        priority: 'high',
        status: 'in_progress',
        owner: 'rork',
        category: 'growth-intelligence',
        envVariables: [],
        endpoints: ['/analytics-report', '/admin/landing-analytics', '/system-health'],
        docsUrl: '',
        notes: 'This is app-side cleanup work I can finish without needing new credentials.',
        estimatedHours: 4,
      },
      {
        id: 'growth-google-ads',
        name: 'Google Ads Connection',
        provider: 'Google Ads',
        description: 'Link the app/landing acquisition reporting to your live Google Ads business account and campaign structure.',
        priority: 'high',
        status: 'in_progress',
        owner: 'user',
        category: 'growth-intelligence',
        envVariables: [
          env('EXPO_PUBLIC_GOOGLE_ADS_API_KEY', 'Google Ads API key configured for client usage', 'AIza...'),
        ],
        endpoints: ['/admin/landing-analytics', '/analytics-report', '/app-report'],
        docsUrl: 'https://developers.google.com/google-ads/api/docs/start',
        notes: 'Code-side mapping can continue, but final live connection depends on your Google Ads account access, billing, and campaign ownership.',
        estimatedHours: 3,
      },
    ],
  },
  {
    id: 'launch-module-audit',
    title: 'Launch & Module Audit',
    icon: 'FileCheck',
    color: '#78716C',
    items: [
      {
        id: 'launch-waitlist',
        name: 'Landing + Waitlist Pipeline',
        provider: 'App + Landing Sync',
        description: 'Landing content and waitlist capture flow are aligned to the same public data path used by the app.',
        priority: 'high',
        status: 'ready',
        owner: 'rork',
        category: 'launch-module-audit',
        envVariables: [
          env('EXPO_PUBLIC_SUPABASE_URL', 'Supabase project URL used by the landing and app', 'https://project.supabase.co'),
          env('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'Supabase public anon key used by the landing and app', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'),
        ],
        endpoints: ['/landing', '/waitlist'],
        docsUrl: '',
        notes: 'Landing-side public data path is already wired.',
        estimatedHours: 0,
      },
      {
        id: 'launch-developer-module-refresh',
        name: 'Developer Module Refresh',
        provider: 'Admin Developer Module',
        description: 'Old static developer-module content has been cleared and replaced with a refreshed, project-based execution list.',
        priority: 'medium',
        status: 'ready',
        owner: 'rork',
        category: 'launch-module-audit',
        envVariables: [],
        endpoints: ['/admin/developer-handoff'],
        docsUrl: '',
        notes: 'This module now reports current ownership, time, and environment coverage instead of stale generic items.',
        estimatedHours: 0,
      },
    ],
  },
];

export function getAllIntegrations(): IntegrationItem[] {
  return DEVELOPER_HANDOFF_CATEGORIES.flatMap((category) => category.items);
}

export function getAllEnvVariables(): EnvVariable[] {
  const seen = new Set<string>();
  const variables: EnvVariable[] = [];

  for (const category of DEVELOPER_HANDOFF_CATEGORIES) {
    for (const item of category.items) {
      for (const variable of item.envVariables) {
        if (!seen.has(variable.name)) {
          seen.add(variable.name);
          variables.push(variable);
        }
      }
    }
  }

  return variables;
}

export function getConfiguredEnvCount(): number {
  return getAllEnvVariables().filter((variable) => variable.configured).length;
}

export function getTotalEstimatedHours(): number {
  return getAllIntegrations().reduce((sum, item) => sum + item.estimatedHours, 0);
}

export function getCriticalCount(): number {
  return getAllIntegrations().filter((item) => item.priority === 'critical').length;
}

export function getReadyCount(): number {
  return getAllIntegrations().filter((item) => item.status === 'ready').length;
}

export function getInProgressCount(): number {
  return getAllIntegrations().filter((item) => item.status === 'in_progress').length;
}

export function getMockOnlyCount(): number {
  return getAllIntegrations().filter((item) => item.status === 'mock_only').length;
}

export function getRemainingItems(): IntegrationItem[] {
  return getAllIntegrations().filter((item) => item.status !== 'ready');
}

export function getRemainingItemsByOwner(owner: IntegrationOwner): IntegrationItem[] {
  return getRemainingItems().filter((item) => item.owner === owner);
}

export function getDeliverySummary(): Record<IntegrationOwner, DeliverySummaryBucket> {
  const owners: IntegrationOwner[] = ['rork', 'user', 'shared'];

  return owners.reduce<Record<IntegrationOwner, DeliverySummaryBucket>>((accumulator, owner) => {
    const allItems = getAllIntegrations().filter((item) => item.owner === owner);
    const remainingItems = allItems.filter((item) => item.status !== 'ready');

    accumulator[owner] = {
      owner,
      totalItems: allItems.length,
      remainingItems: remainingItems.length,
      remainingHours: remainingItems.reduce((sum, item) => sum + item.estimatedHours, 0),
    };

    return accumulator;
  }, {
    rork: { owner: 'rork', totalItems: 0, remainingItems: 0, remainingHours: 0 },
    user: { owner: 'user', totalItems: 0, remainingItems: 0, remainingHours: 0 },
    shared: { owner: 'shared', totalItems: 0, remainingItems: 0, remainingHours: 0 },
  });
}

export function generateHandoffTextReport(): string {
  const allItems = getAllIntegrations();
  const allEnvs = getAllEnvVariables();
  const totalHours = getTotalEstimatedHours();
  const configuredEnvCount = getConfiguredEnvCount();
  const deliverySummary = getDeliverySummary();
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let report = '';
  report += `IVXHOLDINGS DEVELOPER MODULE REFRESH\n`;
  report += `Generated: ${now}\n`;
  report += `Total items: ${allItems.length} | Ready: ${getReadyCount()} | In progress: ${getInProgressCount()} | Estimated hours: ${totalHours}h\n`;
  report += `Configured envs: ${configuredEnvCount}/${allEnvs.length}\n`;
  report += `Rork remaining: ${deliverySummary.rork.remainingItems} items / ${deliverySummary.rork.remainingHours}h\n`;
  report += `User remaining: ${deliverySummary.user.remainingItems} items / ${deliverySummary.user.remainingHours}h\n`;
  report += `Shared remaining: ${deliverySummary.shared.remainingItems} items / ${deliverySummary.shared.remainingHours}h\n\n`;

  for (const category of DEVELOPER_HANDOFF_CATEGORIES) {
    report += `━━━ ${category.title.toUpperCase()} ━━━\n`;
    for (const item of category.items) {
      report += `• ${item.name} (${item.provider})\n`;
      report += `  Owner: ${item.owner.toUpperCase()} | Priority: ${item.priority.toUpperCase()} | Status: ${item.status.replace(/_/g, ' ')} | ${item.estimatedHours}h\n`;
      report += `  ${item.description}\n`;
      if (item.envVariables.length > 0) {
        report += `  Envs: ${item.envVariables.map((variable) => `${variable.name}${variable.configured ? '✓' : '✗'}`).join(', ')}\n`;
      }
      if (item.notes) {
        report += `  Notes: ${item.notes}\n`;
      }
      report += '\n';
    }
  }

  return report;
}

export function generateHandoffHtmlReport(): string {
  const allItems = getAllIntegrations();
  const allEnvs = getAllEnvVariables();
  const configuredEnvCount = getConfiguredEnvCount();
  const deliverySummary = getDeliverySummary();
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const priorityColor = (priority: IntegrationPriority): string => {
    switch (priority) {
      case 'critical':
        return '#DC2626';
      case 'high':
        return '#F59E0B';
      case 'medium':
        return '#3B82F6';
      default:
        return '#6B7280';
    }
  };

  const statusColor = (status: IntegrationStatus): string => {
    switch (status) {
      case 'ready':
        return '#22C55E';
      case 'in_progress':
        return '#3B82F6';
      case 'mock_only':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  const ownerColor = (owner: IntegrationOwner): string => {
    switch (owner) {
      case 'rork':
        return '#FFD700';
      case 'user':
        return '#FF6B9D';
      default:
        return '#A78BFA';
    }
  };

  let html = '';
  html += '<!DOCTYPE html><html><head><meta charset="utf-8"><title>IVXHOLDINGS Developer Module Refresh</title>';
  html += '<style>';
  html += 'body{font-family:system-ui;background:#080808;color:#fff;padding:32px}';
  html += '.header{text-align:center;margin-bottom:28px;border-bottom:1px solid #2A2A2A;padding-bottom:20px}';
  html += '.title{font-size:28px;font-weight:800;color:#FFD700;margin:0 0 8px}';
  html += '.subtitle{color:#A1A1AA;margin:0}';
  html += '.stats{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}';
  html += '.stat{flex:1;min-width:150px;background:#141414;border:1px solid #2A2A2A;border-radius:14px;padding:16px}';
  html += '.stat-num{font-size:24px;font-weight:800;margin-bottom:6px}';
  html += '.stat-label{color:#9A9A9A;font-size:12px}';
  html += '.section-title{font-size:18px;font-weight:700;margin:28px 0 12px}';
  html += '.item{background:#141414;border:1px solid #2A2A2A;border-radius:14px;padding:18px;margin-bottom:12px}';
  html += '.item-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}';
  html += '.name{font-size:16px;font-weight:700;margin:0 0 6px}';
  html += '.provider{color:#9A9A9A;font-size:12px;margin:0 0 10px}';
  html += '.desc{color:#D4D4D8;font-size:14px;line-height:1.5;margin:0 0 10px}';
  html += '.badge{display:inline-block;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:700;margin-right:6px;color:#fff}';
  html += '.env{font-family:monospace;font-size:12px;color:#FFD700;margin-top:4px}';
  html += '.note{color:#FBBF24;font-size:12px;margin-top:8px}';
  html += '</style></head><body>';
  html += `<div class="header"><h1 class="title">Developer Module Refresh</h1><p class="subtitle">Updated ${now}</p></div>`;
  html += '<div class="stats">';
  html += `<div class="stat"><div class="stat-num">${allItems.length}</div><div class="stat-label">Items</div></div>`;
  html += `<div class="stat"><div class="stat-num">${getReadyCount()}</div><div class="stat-label">Ready</div></div>`;
  html += `<div class="stat"><div class="stat-num">${configuredEnvCount}/${allEnvs.length}</div><div class="stat-label">Configured Envs</div></div>`;
  html += `<div class="stat"><div class="stat-num">${deliverySummary.rork.remainingItems + deliverySummary.user.remainingItems + deliverySummary.shared.remainingItems}</div><div class="stat-label">Remaining Items</div></div>`;
  html += '</div>';

  for (const category of DEVELOPER_HANDOFF_CATEGORIES) {
    html += `<div class="section-title">${category.title}</div>`;
    for (const item of category.items) {
      html += '<div class="item">';
      html += '<div class="item-top">';
      html += '<div>';
      html += `<p class="name">${item.name}</p>`;
      html += `<p class="provider">${item.provider}</p>`;
      html += `<p class="desc">${item.description}</p>`;
      html += `</div><div>`;
      html += `<span class="badge" style="background:${priorityColor(item.priority)}">${item.priority.toUpperCase()}</span>`;
      html += `<span class="badge" style="background:${statusColor(item.status)}">${item.status.replace(/_/g, ' ').toUpperCase()}</span>`;
      html += `<span class="badge" style="background:${ownerColor(item.owner)};color:#000">${item.owner.toUpperCase()}</span>`;
      html += '</div></div>';
      if (item.envVariables.length > 0) {
        html += item.envVariables.map((variable) => `<div class="env">${variable.name} ${variable.configured ? '✓' : '✗'}</div>`).join('');
      }
      if (item.notes) {
        html += `<div class="note">${item.notes}</div>`;
      }
      html += '</div>';
    }
  }

  html += '</body></html>';
  return html;
}
