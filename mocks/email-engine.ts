import {
  SMTPConfig,
  EmailRecipient,
  EmailCampaign,
  DomainHealth,
  EngineStats,
} from '@/lib/email-engine';
import { discoveredLenders } from '@/mocks/lender-discovery';
import { lenderToRecipient } from '@/lib/email-engine';

export const smtpConfigs: SMTPConfig[] = [
  {
    id: 'smtp-1',
    name: 'Primary - mail.ipxholding.com',
    host: 'mail.ipxholding.com',
    port: 587,
    username: 'outreach@ipxholding.com',
    fromEmail: 'outreach@ipxholding.com',
    fromName: 'IVX HOLDINGS Investments',
    dailyLimit: 5000,
    sentToday: 1247,
    isActive: true,
    warmupPhase: 'ready',
    warmupDay: 30,
    reputationScore: 94,
    lastUsed: '2026-02-17T14:30:00Z',
    domain: 'ipxholding.com',
  },
  {
    id: 'smtp-2',
    name: 'Secondary - send.ipxinvest.com',
    host: 'send.ipxinvest.com',
    port: 587,
    username: 'invest@ipxinvest.com',
    fromEmail: 'invest@ipxinvest.com',
    fromName: 'IVXHOLDINGS Investment Team',
    dailyLimit: 5000,
    sentToday: 983,
    isActive: true,
    warmupPhase: 'ready',
    warmupDay: 28,
    reputationScore: 91,
    lastUsed: '2026-02-17T14:25:00Z',
    domain: 'ipxinvest.com',
  },
  {
    id: 'smtp-3',
    name: 'Rotation C - mail.ipxcapital.com',
    host: 'mail.ipxcapital.com',
    port: 587,
    username: 'capital@ipxcapital.com',
    fromEmail: 'capital@ipxcapital.com',
    fromName: 'IVXHOLDINGS Capital Relations',
    dailyLimit: 5000,
    sentToday: 1102,
    isActive: true,
    warmupPhase: 'ready',
    warmupDay: 25,
    reputationScore: 89,
    lastUsed: '2026-02-17T14:20:00Z',
    domain: 'ipxcapital.com',
  },
  {
    id: 'smtp-4',
    name: 'Warming - new.ipxpartners.com',
    host: 'mail.ipxpartners.com',
    port: 587,
    username: 'partners@ipxpartners.com',
    fromEmail: 'partners@ipxpartners.com',
    fromName: 'IVXHOLDINGS Partners',
    dailyLimit: 600,
    sentToday: 412,
    isActive: true,
    warmupPhase: 'warming',
    warmupDay: 8,
    reputationScore: 78,
    lastUsed: '2026-02-17T13:45:00Z',
    domain: 'ipxpartners.com',
  },
  {
    id: 'smtp-5',
    name: 'Backup - alt.ipxgroup.com',
    host: 'mail.ipxgroup.com',
    port: 587,
    username: 'group@ipxgroup.com',
    fromEmail: 'group@ipxgroup.com',
    fromName: 'IVXHOLDINGS Group',
    dailyLimit: 5000,
    sentToday: 0,
    isActive: false,
    warmupPhase: 'ready',
    warmupDay: 35,
    reputationScore: 92,
    lastUsed: '2026-02-16T18:00:00Z',
    domain: 'ipxgroup.com',
  },
];

export const domainHealth: DomainHealth[] = [
  {
    domain: 'ipxholding.com',
    spfConfigured: true,
    dkimConfigured: true,
    dmarcConfigured: true,
    reputationScore: 94,
    blacklisted: false,
    lastChecked: '2026-02-17T12:00:00Z',
  },
  {
    domain: 'ipxinvest.com',
    spfConfigured: true,
    dkimConfigured: true,
    dmarcConfigured: true,
    reputationScore: 91,
    blacklisted: false,
    lastChecked: '2026-02-17T12:00:00Z',
  },
  {
    domain: 'ipxcapital.com',
    spfConfigured: true,
    dkimConfigured: true,
    dmarcConfigured: false,
    reputationScore: 89,
    blacklisted: false,
    lastChecked: '2026-02-17T12:00:00Z',
  },
  {
    domain: 'ipxpartners.com',
    spfConfigured: true,
    dkimConfigured: false,
    dmarcConfigured: false,
    reputationScore: 78,
    blacklisted: false,
    lastChecked: '2026-02-17T12:00:00Z',
  },
  {
    domain: 'ipxgroup.com',
    spfConfigured: true,
    dkimConfigured: true,
    dmarcConfigured: true,
    reputationScore: 92,
    blacklisted: false,
    lastChecked: '2026-02-17T12:00:00Z',
  },
];

export const emailRecipients: EmailRecipient[] = discoveredLenders.map(lenderToRecipient);

export const emailCampaigns: EmailCampaign[] = [
  {
    id: 'camp-1',
    name: 'Q1 2026 Investment Opportunities',
    subject: 'Exclusive: {{company}} — New Tokenized RE Opportunity ({{yield}}% Yield)',
    body: `Dear {{name}},

I hope this message finds you well. Given {{company}}'s track record in real estate investment, I wanted to personally share an exclusive opportunity from IVX HOLDINGS LLC.

We have a newly listed tokenized property offering a projected {{yield}}% annual yield with strong fundamentals:

• First-lien secured tokenized mortgage
• Institutional-grade due diligence completed
• 24/7 secondary market liquidity
• Regulatory compliant structure

Would you have 15 minutes this week for a brief overview call?

Best regards,
IVX HOLDINGS LLC
Investment Relations`,
    status: 'completed',
    totalRecipients: 18400,
    sentCount: 18400,
    deliveredCount: 17848,
    openedCount: 6992,
    clickedCount: 1288,
    repliedCount: 347,
    bouncedCount: 552,
    unsubscribedCount: 23,
    spamReportCount: 2,
    batchSize: 50,
    delayBetweenBatches: 5000,
    dailyLimit: 20000,
    smtpRotation: ['smtp-1', 'smtp-2', 'smtp-3'],
    currentSmtpIndex: 0,
    scheduledAt: '2026-02-10T08:00:00Z',
    startedAt: '2026-02-10T08:01:00Z',
    completedAt: '2026-02-10T19:45:00Z',
    createdAt: '2026-02-09T15:00:00Z',
    personalizeFields: ['name', 'company', 'yield'],
    trackOpens: true,
    trackClicks: true,
    includeUnsubscribe: true,
    sendTimeOptimization: true,
    warmupEnabled: false,
  },
  {
    id: 'camp-2',
    name: 'Follow-Up — Warm Leads Feb 2026',
    subject: 'Following Up: {{name}}, quick question about your RE strategy',
    body: `Hi {{name}},

I reached out last week about an investment opportunity that I believe aligns well with {{company}}'s portfolio strategy.

I understand you're busy — so I'll keep this brief. We have 3 properties currently yielding 6-9% with full transparency and blockchain-verified ownership.

Would a 10-minute call work for you this week?

Best,
IVX HOLDINGS Investment Team`,
    status: 'sending',
    totalRecipients: 6992,
    sentCount: 4218,
    deliveredCount: 4092,
    openedCount: 1847,
    clickedCount: 412,
    repliedCount: 189,
    bouncedCount: 126,
    unsubscribedCount: 8,
    spamReportCount: 0,
    batchSize: 30,
    delayBetweenBatches: 8000,
    dailyLimit: 20000,
    smtpRotation: ['smtp-1', 'smtp-2', 'smtp-3', 'smtp-4'],
    currentSmtpIndex: 2,
    scheduledAt: '2026-02-17T08:00:00Z',
    startedAt: '2026-02-17T08:02:00Z',
    completedAt: null,
    createdAt: '2026-02-16T20:00:00Z',
    personalizeFields: ['name', 'company'],
    trackOpens: true,
    trackClicks: true,
    includeUnsubscribe: true,
    sendTimeOptimization: true,
    warmupEnabled: false,
  },
  {
    id: 'camp-3',
    name: 'New Property Alert — Miami Luxury Tower',
    subject: '🏗️ New Listing: Miami Luxury Tower — 8.2% Projected Yield',
    body: `Dear {{name}},

A premium new property has just been listed on IVX HOLDINGS that matches {{company}}'s investment criteria.

MIAMI LUXURY TOWER
📍 Brickell, Miami, FL
💰 Target: $15M
📊 Yield: 8.2% | IRR: 14.5%
🏢 Type: Mixed-Use (Residential + Commercial)

Early access closes in 72 hours.

Best regards,
IVX HOLDINGS LLC`,
    status: 'draft',
    totalRecipients: 0,
    sentCount: 0,
    deliveredCount: 0,
    openedCount: 0,
    clickedCount: 0,
    repliedCount: 0,
    bouncedCount: 0,
    unsubscribedCount: 0,
    spamReportCount: 0,
    batchSize: 40,
    delayBetweenBatches: 6000,
    dailyLimit: 20000,
    smtpRotation: ['smtp-1', 'smtp-2', 'smtp-3'],
    currentSmtpIndex: 0,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-02-17T10:00:00Z',
    personalizeFields: ['name', 'company'],
    trackOpens: true,
    trackClicks: true,
    includeUnsubscribe: true,
    sendTimeOptimization: true,
    warmupEnabled: false,
  },
];

export function getEngineStats(): EngineStats {
  const activeSmtp = smtpConfigs.filter(s => s.isActive);
  const warmingSmtp = smtpConfigs.filter(s => s.warmupPhase === 'warming');
  const totalSentToday = smtpConfigs.reduce((sum, s) => sum + s.sentToday, 0);
  const totalDailyLimit = activeSmtp.reduce((sum, s) => sum + s.dailyLimit, 0);
  const cleanRecipients = emailRecipients.filter(r => !r.unsubscribed && !r.bounced);

  const lastCampaign = emailCampaigns.find(c => c.status === 'completed');
  const deliveryRate = lastCampaign
    ? Math.round((lastCampaign.deliveredCount / lastCampaign.sentCount) * 100 * 10) / 10
    : 97;
  const openRate = lastCampaign
    ? Math.round((lastCampaign.openedCount / lastCampaign.deliveredCount) * 100 * 10) / 10
    : 38;
  const bounceRate = lastCampaign
    ? Math.round((lastCampaign.bouncedCount / lastCampaign.sentCount) * 100 * 10) / 10
    : 3;
  const spamRate = lastCampaign
    ? Math.round((lastCampaign.spamReportCount / lastCampaign.sentCount) * 1000 * 10) / 10
    : 0.1;

  return {
    totalSentToday,
    dailyLimit: totalDailyLimit,
    deliveryRate,
    openRate,
    bounceRate,
    spamRate,
    activeSmtpServers: activeSmtp.length,
    warmingSmtpServers: warmingSmtp.length,
    recipientListSize: emailRecipients.length,
    cleanRecipients: cleanRecipients.length,
    avgSendSpeed: 720,
    estimatedCostPerEmail: 0.0001,
    estimatedDailyCost: totalSentToday * 0.0001,
    monthlyProjection: 20000 * 0.0001 * 30,
  };
}
