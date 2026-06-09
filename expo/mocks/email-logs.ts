export type EmailLogType = 'automatic' | 'manual';
export type EmailLogStatus = 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed' | 'pending' | 'sending';

export interface EmailLog {
  id: string;
  recipientName: string;
  recipientEmail: string;
  recipientCompany: string;
  subject: string;
  type: EmailLogType;
  status: EmailLogStatus;
  campaignName: string | null;
  smtpServer: string;
  sentAt: string;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
}

export const emailLogs: EmailLog[] = [];

export function getEmailLogStats() {
  return { total: 0, automatic: 0, manual: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 };
}
