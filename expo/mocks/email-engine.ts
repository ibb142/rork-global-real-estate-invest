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
    sentToday: 0,
    isActive: true,
    warmupPhase: 'ready',
    warmupDay: 30,
    reputationScore: 94,
    lastUsed: '',
    domain: 'ipxholding.com',
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
    lastChecked: new Date().toISOString(),
  },
];

export const emailRecipients: EmailRecipient[] = discoveredLenders.map(lenderToRecipient);

export const emailCampaigns: EmailCampaign[] = [];

export function getEngineStats(): EngineStats {
  const activeSmtp = smtpConfigs.filter(s => s.isActive);
  const cleanRecipients = emailRecipients.filter(r => !r.unsubscribed && !r.bounced);

  return {
    totalSentToday: 0,
    dailyLimit: activeSmtp.reduce((sum, s) => sum + s.dailyLimit, 0),
    deliveryRate: 0,
    openRate: 0,
    bounceRate: 0,
    spamRate: 0,
    activeSmtpServers: activeSmtp.length,
    warmingSmtpServers: 0,
    recipientListSize: emailRecipients.length,
    cleanRecipients: cleanRecipients.length,
    avgSendSpeed: 0,
    estimatedCostPerEmail: 0.0001,
    estimatedDailyCost: 0,
    monthlyProjection: 0,
  };
}
