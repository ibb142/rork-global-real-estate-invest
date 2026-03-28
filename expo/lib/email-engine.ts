import { DiscoveredLender } from '@/types/jv';

export interface SMTPConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  fromEmail: string;
  fromName: string;
  dailyLimit: number;
  sentToday: number;
  isActive: boolean;
  warmupPhase: 'new' | 'warming' | 'ready';
  warmupDay: number;
  reputationScore: number;
  lastUsed: string | null;
  domain: string;
}

export interface EmailRecipient {
  id: string;
  email: string;
  name: string;
  company: string;
  contactTitle: string;
  category: string;
  tags: string[];
  unsubscribed: boolean;
  bounced: boolean;
  lastEmailed: string | null;
  emailCount: number;
  openCount: number;
  clickCount: number;
  replyCount: number;
}

export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: 'draft' | 'scheduled' | 'warming' | 'sending' | 'paused' | 'completed' | 'failed';
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  spamReportCount: number;
  batchSize: number;
  delayBetweenBatches: number;
  dailyLimit: number;
  smtpRotation: string[];
  currentSmtpIndex: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  personalizeFields: string[];
  trackOpens: boolean;
  trackClicks: boolean;
  includeUnsubscribe: boolean;
  sendTimeOptimization: boolean;
  warmupEnabled: boolean;
}

export interface SendingSchedule {
  hour: number;
  maxEmails: number;
  priority: 'low' | 'medium' | 'high';
}

export interface DomainHealth {
  domain: string;
  spfConfigured: boolean;
  dkimConfigured: boolean;
  dmarcConfigured: boolean;
  reputationScore: number;
  blacklisted: boolean;
  lastChecked: string;
}

export interface EngineStats {
  totalSentToday: number;
  dailyLimit: number;
  deliveryRate: number;
  openRate: number;
  bounceRate: number;
  spamRate: number;
  activeSmtpServers: number;
  warmingSmtpServers: number;
  recipientListSize: number;
  cleanRecipients: number;
  avgSendSpeed: number;
  estimatedCostPerEmail: number;
  estimatedDailyCost: number;
  monthlyProjection: number;
}

const WARMUP_SCHEDULE: Record<number, number> = {
  1: 50,
  2: 75,
  3: 100,
  4: 150,
  5: 250,
  6: 400,
  7: 600,
  8: 900,
  9: 1200,
  10: 1600,
  11: 2000,
  12: 2500,
  13: 3000,
  14: 4000,
  15: 5000,
  16: 6000,
  17: 7500,
  18: 9000,
  19: 11000,
  20: 13000,
  21: 15000,
  22: 17000,
  23: 19000,
  24: 20000,
};

export function getWarmupLimit(day: number): number {
  if (day <= 0) return 50;
  if (day > 24) return 20000;
  return WARMUP_SCHEDULE[day] || 20000;
}

export function getOptimalSendingHours(): SendingSchedule[] {
  return [
    { hour: 6, maxEmails: 500, priority: 'low' },
    { hour: 7, maxEmails: 800, priority: 'medium' },
    { hour: 8, maxEmails: 1200, priority: 'high' },
    { hour: 9, maxEmails: 1500, priority: 'high' },
    { hour: 10, maxEmails: 1800, priority: 'high' },
    { hour: 11, maxEmails: 1500, priority: 'high' },
    { hour: 12, maxEmails: 800, priority: 'medium' },
    { hour: 13, maxEmails: 1000, priority: 'medium' },
    { hour: 14, maxEmails: 1500, priority: 'high' },
    { hour: 15, maxEmails: 1200, priority: 'high' },
    { hour: 16, maxEmails: 1000, priority: 'medium' },
    { hour: 17, maxEmails: 800, priority: 'medium' },
    { hour: 18, maxEmails: 500, priority: 'low' },
    { hour: 19, maxEmails: 400, priority: 'low' },
    { hour: 20, maxEmails: 300, priority: 'low' },
  ];
}

export function personalizeEmail(
  template: string,
  recipient: EmailRecipient,
  extraVars?: Record<string, string>
): string {
  let result = template;
  result = result.replace(/\{\{name\}\}/g, recipient.name);
  result = result.replace(/\{\{company\}\}/g, recipient.company);
  result = result.replace(/\{\{email\}\}/g, recipient.email);
  result = result.replace(/\{\{title\}\}/g, recipient.contactTitle);
  result = result.replace(/\{\{category\}\}/g, recipient.category.replace('_', ' '));

  if (extraVars) {
    for (const [key, value] of Object.entries(extraVars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
  }

  return result;
}

export function selectNextSmtp(
  configs: SMTPConfig[],
  currentIndex: number
): { smtp: SMTPConfig; index: number } | null {
  const active = configs.filter(c => c.isActive && c.sentToday < c.dailyLimit);
  if (active.length === 0) return null;

  let nextIndex = (currentIndex + 1) % configs.length;
  let attempts = 0;

  while (attempts < configs.length) {
    const smtp = configs[nextIndex];
    if (smtp && smtp.isActive && smtp.sentToday < smtp.dailyLimit) {
      return { smtp, index: nextIndex };
    }
    nextIndex = (nextIndex + 1) % configs.length;
    attempts++;
  }

  return null;
}

export function calculateBatchDelay(
  sentThisHour: number,
  hourlyLimit: number
): number {
  const ratio = sentThisHour / hourlyLimit;
  if (ratio < 0.3) return 2000;
  if (ratio < 0.5) return 4000;
  if (ratio < 0.7) return 6000;
  if (ratio < 0.9) return 10000;
  return 15000;
}

export function shouldSkipRecipient(recipient: EmailRecipient): {
  skip: boolean;
  reason: string;
} {
  if (recipient.unsubscribed) return { skip: true, reason: 'Unsubscribed' };
  if (recipient.bounced) return { skip: true, reason: 'Bounced email' };

  if (recipient.lastEmailed) {
    const hoursSince = (Date.now() - new Date(recipient.lastEmailed).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 48) return { skip: true, reason: 'Emailed within 48hrs' };
  }

  if (recipient.emailCount > 0 && recipient.openCount === 0 && recipient.emailCount >= 5) {
    return { skip: true, reason: 'Never opened (5+ emails)' };
  }

  return { skip: false, reason: '' };
}

export function generateUnsubscribeHeader(recipientId: string, campaignId: string): string {
  return `List-Unsubscribe: <mailto:unsubscribe@ivxholding.com?subject=unsubscribe-${recipientId}-${campaignId}>`;
}

export function estimateDailyCost(emailCount: number, provider: string): number {
  switch (provider) {
    case 'ses':
      return emailCount * 0.0001;
    case 'smtp_own':
      return 0;
    case 'multi_rotation':
      return emailCount * 0.00005;
    default:
      return emailCount * 0.0001;
  }
}

export function lenderToRecipient(lender: DiscoveredLender): EmailRecipient {
  return {
    id: lender.id,
    email: lender.email,
    name: lender.contactName,
    company: lender.name,
    contactTitle: lender.contactTitle,
    category: lender.category,
    tags: lender.tags,
    unsubscribed: false,
    bounced: false,
    lastEmailed: null,
    emailCount: 0,
    openCount: 0,
    clickCount: 0,
    replyCount: 0,
  };
}

export const ANTI_BLACKLIST_RULES = [
  {
    id: 'warmup',
    name: 'IP/Domain Warm-up',
    description: 'Gradually increase volume over 24 days from 50 to 20K/day',
    critical: true,
  },
  {
    id: 'rotation',
    name: 'SMTP Rotation',
    description: 'Rotate between multiple SMTP servers to distribute load',
    critical: true,
  },
  {
    id: 'throttle',
    name: 'Smart Throttling',
    description: 'Spread emails across business hours with adaptive delays',
    critical: true,
  },
  {
    id: 'personalize',
    name: 'Content Personalization',
    description: 'Each email is unique — avoids bulk spam signatures',
    critical: true,
  },
  {
    id: 'spf_dkim',
    name: 'SPF + DKIM + DMARC',
    description: 'Authentication records on your sending domains',
    critical: true,
  },
  {
    id: 'unsubscribe',
    name: 'One-Click Unsubscribe',
    description: 'CAN-SPAM compliant unsubscribe in every email',
    critical: true,
  },
  {
    id: 'bounce_mgmt',
    name: 'Bounce Management',
    description: 'Auto-remove hard bounces, pause on soft bounces',
    critical: true,
  },
  {
    id: 'engagement_filter',
    name: 'Engagement Filtering',
    description: 'Skip recipients who never open after 5 emails',
    critical: false,
  },
  {
    id: 'cooldown',
    name: '48hr Cooldown',
    description: 'Minimum 48 hours between emails to same recipient',
    critical: false,
  },
  {
    id: 'time_zone',
    name: 'Send Time Optimization',
    description: 'Deliver during business hours in recipient time zone',
    critical: false,
  },
  {
    id: 'text_ratio',
    name: 'Text-to-HTML Ratio',
    description: 'Keep text > 60% of email content — avoid image-heavy emails',
    critical: false,
  },
  {
    id: 'domain_age',
    name: 'Domain Age',
    description: 'Use domains at least 30 days old for sending',
    critical: false,
  },
];
