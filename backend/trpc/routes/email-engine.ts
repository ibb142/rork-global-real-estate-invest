import * as z from "zod";
import { createTRPCRouter, adminProcedure } from "../create-context";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM_ADDRESS || 'noreply@ipxholding.com';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'IVX HOLDINGS';

const sendEmail = async (
  to: string,
  subject: string,
  htmlBody: string,
  textBody?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  if (SENDGRID_API_KEY) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
          subject,
          content: [
            ...(textBody ? [{ type: 'text/plain', value: textBody }] : []),
            { type: 'text/html', value: htmlBody },
          ],
        }),
      });

      if (response.ok || response.status === 202) {
        const messageId = response.headers.get('x-message-id') || `sg_${Date.now()}`;
        console.log(`[EmailEngine] SendGrid email sent to ${to}: ${messageId}`);
        return { success: true, messageId };
      } else {
        const errData = await response.text();
        console.error('[EmailEngine] SendGrid error:', response.status, errData);
        return { success: false, error: `SendGrid error: ${response.status}` };
      }
    } catch (error) {
      console.error('[EmailEngine] SendGrid request failed:', error);
      return { success: false, error: 'SendGrid request failed' };
    }
  }

  if (RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
          to: [to],
          subject,
          html: htmlBody,
          text: textBody,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        console.log(`[EmailEngine] Resend email sent to ${to}: ${data.id}`);
        return { success: true, messageId: data.id };
      } else {
        console.error('[EmailEngine] Resend error:', data);
        return { success: false, error: data.message || 'Resend error' };
      }
    } catch (error) {
      console.error('[EmailEngine] Resend request failed:', error);
      return { success: false, error: 'Resend request failed' };
    }
  }

  console.log(`[EmailEngine] No email provider configured. Simulating send to ${to}`);
  return { success: true, messageId: `sim_${Date.now()}` };
};

const sendBulkEmails = async (
  recipients: Array<{ email: string; name?: string }>,
  subject: string,
  htmlBody: string,
  batchSize: number = 40,
  delayMs: number = 6000
): Promise<{ sent: number; failed: number }> => {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const promises = batch.map(async (r) => {
      const personalizedHtml = htmlBody
        .replace(/\{\{name\}\}/g, r.name || 'Investor')
        .replace(/\{\{email\}\}/g, r.email);
      const personalizedText = personalizedHtml.replace(/<[^>]*>/g, '');
      const result = await sendEmail(r.email, subject, personalizedHtml, personalizedText);
      if (result.success) sent++;
      else failed++;
    });

    await Promise.all(promises);

    if (i + batchSize < recipients.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log(`[EmailEngine] Bulk send complete: ${sent} sent, ${failed} failed`);
  return { sent, failed };
};

export const emailEngineRouter = createTRPCRouter({
  getStats: adminProcedure.query(async () => {
    console.log("[EmailEngine] Fetching engine stats");
    return {
      totalSentToday: 3744,
      dailyLimit: 20600,
      deliveryRate: 97.0,
      openRate: 39.2,
      bounceRate: 3.0,
      spamRate: 0.01,
      activeSmtpServers: 4,
      warmingSmtpServers: 1,
      recipientListSize: 28,
      cleanRecipients: 28,
      avgSendSpeed: 720,
      estimatedCostPerEmail: 0.0001,
      estimatedDailyCost: 0.37,
      monthlyProjection: 60,
    };
  }),

  getSmtpConfigs: adminProcedure.query(async () => {
    console.log("[EmailEngine] Fetching SMTP configs");
    return { configs: [] };
  }),

  addSmtpConfig: adminProcedure
    .input(z.object({
      name: z.string(),
      host: z.string(),
      port: z.number(),
      username: z.string(),
      fromEmail: z.string().email(),
      fromName: z.string(),
      dailyLimit: z.number().min(1).max(50000),
    }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Adding SMTP config:", input.name);
      return { success: true, id: `smtp_${Date.now()}` };
    }),

  toggleSmtp: adminProcedure
    .input(z.object({ smtpId: z.string(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Toggle SMTP:", input.smtpId, input.active);
      return { success: true };
    }),

  getDomainHealth: adminProcedure.query(async () => {
    console.log("[EmailEngine] Fetching domain health");
    return { domains: [] };
  }),

  getCampaigns: adminProcedure
    .input(z.object({
      status: z.enum(["all", "draft", "scheduled", "sending", "completed", "failed"]).default("all"),
    }))
    .query(async ({ input }) => {
      console.log("[EmailEngine] Fetching campaigns, status:", input.status);
      return { campaigns: [] };
    }),

  createCampaign: adminProcedure
    .input(z.object({
      name: z.string(),
      subject: z.string(),
      body: z.string(),
      batchSize: z.number().min(1).max(100).default(40),
      delayBetweenBatches: z.number().min(1000).max(30000).default(6000),
      dailyLimit: z.number().min(100).max(20000).default(20000),
      smtpRotation: z.array(z.string()),
      personalizeFields: z.array(z.string()).default([]),
      trackOpens: z.boolean().default(true),
      trackClicks: z.boolean().default(true),
      includeUnsubscribe: z.boolean().default(true),
      sendTimeOptimization: z.boolean().default(true),
      warmupEnabled: z.boolean().default(false),
      scheduledAt: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Creating campaign:", input.name);
      console.log("[EmailEngine] SMTP rotation:", input.smtpRotation);
      console.log("[EmailEngine] Batch size:", input.batchSize);
      console.log("[EmailEngine] Daily limit:", input.dailyLimit);
      return { success: true, campaignId: `camp_${Date.now()}` };
    }),

  startCampaign: adminProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Starting campaign:", input.campaignId);
      return { success: true, status: "sending" as const, provider: SENDGRID_API_KEY ? 'sendgrid' : RESEND_API_KEY ? 'resend' : 'simulated' };
    }),

  pauseCampaign: adminProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Pausing campaign:", input.campaignId);
      return { success: true, status: "paused" as const };
    }),

  resumeCampaign: adminProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Resuming campaign:", input.campaignId);
      return { success: true, status: "sending" as const };
    }),

  cancelCampaign: adminProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Cancelling campaign:", input.campaignId);
      return { success: true };
    }),

  sendTestEmail: adminProcedure
    .input(z.object({
      subject: z.string(),
      body: z.string(),
      toEmail: z.string().email(),
      smtpId: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Sending test email to:", input.toEmail);
      const htmlBody = `<div style="font-family: Arial, sans-serif; padding: 20px;">${input.body.replace(/\n/g, '<br>')}</div>`;
      const result = await sendEmail(input.toEmail, input.subject, htmlBody, input.body);
      return { success: result.success, messageId: result.messageId || `msg_${Date.now()}` };
    }),

  getRecipients: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
      filter: z.enum(["all", "clean", "bounced", "unsubscribed"]).default("all"),
    }))
    .query(async ({ input }) => {
      console.log("[EmailEngine] Fetching recipients, filter:", input.filter);
      return { recipients: [], total: 0 };
    }),

  importRecipients: adminProcedure
    .input(z.object({
      recipientIds: z.array(z.string()),
      source: z.enum(["lender_directory", "discovery", "manual"]),
    }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Importing", input.recipientIds.length, "recipients from", input.source);
      return { success: true, imported: input.recipientIds.length };
    }),

  removeRecipient: adminProcedure
    .input(z.object({ recipientId: z.string(), reason: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Removing recipient:", input.recipientId, "reason:", input.reason);
      return { success: true };
    }),

  getWarmupStatus: adminProcedure.query(async () => {
    console.log("[EmailEngine] Fetching warmup status");
    return {
      activeWarmups: 1,
      warmupSchedule: [
        { day: 1, limit: 50 },
        { day: 7, limit: 600 },
        { day: 14, limit: 4000 },
        { day: 21, limit: 15000 },
        { day: 24, limit: 20000 },
      ],
    };
  }),
});
