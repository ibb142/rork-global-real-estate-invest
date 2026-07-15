const MOCK_IMPORTS_REGISTRY: string[] = [];
let _warned = false;

const KNOWN_MOCK_SCREENS: Array<{ screen: string; mock: string }> = [
  { screen: 'admin/supabase-scripts', mock: 'mocks/supabase-scripts' },
  { screen: 'email-compose', mock: 'mocks/email-templates' },
  { screen: 'vip-tiers', mock: 'mocks/vip-tiers' },
  { screen: 'admin/ai-outreach', mock: 'mocks/lenders + mocks/lender-discovery + mocks/properties' },
  { screen: 'admin/app-docs', mock: 'mocks/functionality-registry' },
  { screen: 'admin/developer-handoff', mock: 'mocks/developer-handoff' },
  { screen: 'admin/email-accounts', mock: 'mocks/emails + mocks/admin' },
  { screen: 'admin/email-engine', mock: 'mocks/email-engine + mocks/email-logs' },
  { screen: 'admin/email-management', mock: 'mocks/emails + mocks/admin' },
  { screen: 'admin/growth', mock: 'mocks/marketing' },
  { screen: 'admin/influencers', mock: 'mocks/marketing' },
  { screen: 'admin/land-partners', mock: 'mocks/ipx-invest' },
  { screen: 'admin/lender-search', mock: 'mocks/lender-discovery' },
  { screen: 'admin/marketing', mock: 'mocks/admin + mocks/marketing' },
  { screen: 'admin/outreach-analytics', mock: 'mocks/outreach-analytics' },
  { screen: 'admin/social-command', mock: 'mocks/social-media' },
  { screen: 'admin/system-monitor', mock: 'mocks/system-monitor' },
  { screen: 'admin/title-companies', mock: 'mocks/title-company + mocks/properties' },
  { screen: 'app-report', mock: 'mocks/functionality-registry' },
  { screen: 'compare-investments', mock: 'mocks/competitive-stats' },
  { screen: 'copy-investing', mock: 'mocks/social-portfolios' },
  { screen: 'property-documents', mock: 'mocks/title-company' },
  { screen: 'smart-investing', mock: 'mocks/competitive-stats' },
  { screen: 'title-review', mock: 'mocks/title-company' },
  { screen: 'trust-center', mock: 'mocks/competitive-stats' },
  { screen: 'viral-growth', mock: 'mocks/viral-growth' },
  { screen: 'lib/email-context', mock: 'mocks/emails' },
  { screen: 'lib/lender-context', mock: 'mocks/lenders + mocks/lender-discovery' },
  { screen: 'lib/ipx-context', mock: 'mocks/ipx-invest' },
];

export function registerMockUsage(screenName: string, mockModule: string): void {
  const entry = `${screenName} → ${mockModule}`;
  if (!MOCK_IMPORTS_REGISTRY.includes(entry)) {
    MOCK_IMPORTS_REGISTRY.push(entry);
  }
}

function autoRegisterKnownMocks(): void {
  for (const { screen, mock } of KNOWN_MOCK_SCREENS) {
    registerMockUsage(screen, mock);
  }
}

export function logMockDataWarning(): void {
  if (_warned) return;
  _warned = true;

  autoRegisterKnownMocks();

  if (MOCK_IMPORTS_REGISTRY.length === 0) return;

  const productionScreens = MOCK_IMPORTS_REGISTRY.filter(
    entry => !entry.startsWith('admin/') && !entry.startsWith('lib/')
  );
  const adminScreens = MOCK_IMPORTS_REGISTRY.filter(entry => entry.startsWith('admin/'));
  const libScreens = MOCK_IMPORTS_REGISTRY.filter(entry => entry.startsWith('lib/'));

  console.warn(
    `[MockData] ⚠️ ${MOCK_IMPORTS_REGISTRY.length} modules using mock data instead of real Supabase data.\n` +
    `  Production screens: ${productionScreens.length} (MUST replace before launch)\n` +
    `  Admin screens: ${adminScreens.length} (should replace for real admin ops)\n` +
    `  Lib contexts: ${libScreens.length} (should migrate to Supabase queries)\n` +
    (!__DEV__ ? '  ❌ WARNING: Mock data detected in non-dev build!\n' : '') +
    `  Top screens: ${MOCK_IMPORTS_REGISTRY.slice(0, 8).map(e => e.split(' → ')[0]).join(', ')}` +
    (MOCK_IMPORTS_REGISTRY.length > 8 ? ` (+${MOCK_IMPORTS_REGISTRY.length - 8} more)` : '')
  );
}

export function getMockDataReport(): { total: number; screens: string[]; productionCount: number; adminCount: number } {
  autoRegisterKnownMocks();
  const productionCount = MOCK_IMPORTS_REGISTRY.filter(
    entry => !entry.startsWith('admin/') && !entry.startsWith('lib/')
  ).length;
  const adminCount = MOCK_IMPORTS_REGISTRY.filter(entry => entry.startsWith('admin/')).length;
  return {
    total: MOCK_IMPORTS_REGISTRY.length,
    screens: [...MOCK_IMPORTS_REGISTRY],
    productionCount,
    adminCount,
  };
}

export function isMockDataInUse(): boolean {
  autoRegisterKnownMocks();
  return MOCK_IMPORTS_REGISTRY.length > 0;
}
