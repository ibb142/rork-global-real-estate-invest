import * as z from "zod";
import { createTRPCRouter, adminProcedure, publicProcedure } from "../create-context";
import {
  sesSendEmail,
  sesVerifyDomain,
  sesGetDomainStatus,
  sesGetSendQuota,
  sesGetSendStats,
  sesListIdentities,
  isSESConfigured,
} from "../../lib/ses";

const EMAIL_FROM = process.env.EMAIL_FROM_ADDRESS || 'noreply@ivxholding.com';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'IVX HOLDINGS';
const DOMAIN = 'ivxholding.com';

const sendEmailVia = async (
  to: string,
  subject: string,
  htmlBody: string,
  textBody?: string,
  fromEmail?: string,
  fromName?: string,
  cc?: string,
  bcc?: string,
  replyTo?: string,
): Promise<{ success: boolean; messageId?: string; error?: string; provider: string }> => {
  if (isSESConfigured()) {
    const toAddresses = to.split(',').map(e => e.trim()).filter(Boolean);
    const ccAddresses = cc ? cc.split(',').map(e => e.trim()).filter(Boolean) : undefined;
    const bccAddresses = bcc ? bcc.split(',').map(e => e.trim()).filter(Boolean) : undefined;
    const replyToAddresses = replyTo ? [replyTo] : undefined;

    const result = await sesSendEmail({
      from: fromEmail || EMAIL_FROM,
      fromName: fromName || EMAIL_FROM_NAME,
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject,
      bodyHtml: htmlBody,
      bodyText: textBody,
      replyTo: replyToAddresses,
    });

    return { ...result, provider: 'aws-ses' };
  }

  console.log(`[EmailEngine] No email provider configured. Simulating send to ${to}`);
  return { success: true, messageId: `sim_${Date.now()}`, provider: 'simulated' };
};

const _sendBulkEmails = async (
  recipients: { email: string; name?: string }[],
  subject: string,
  htmlBody: string,
  fromEmail?: string,
  fromName?: string,
  batchSize: number = 40,
  delayMs: number = 6000
): Promise<{ sent: number; failed: number; provider: string }> => {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const promises = batch.map(async (r) => {
      const personalizedHtml = htmlBody
        .replace(/\{\{name\}\}/g, r.name || 'Investor')
        .replace(/\{\{email\}\}/g, r.email);
      const personalizedText = personalizedHtml.replace(/<[^>]*>/g, '');
      const result = await sendEmailVia(r.email, subject, personalizedHtml, personalizedText, fromEmail, fromName);
      if (result.success) sent++;
      else failed++;
    });

    await Promise.all(promises);

    if (i + batchSize < recipients.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log(`[EmailEngine] Bulk send complete: ${sent} sent, ${failed} failed`);
  return { sent, failed, provider: isSESConfigured() ? 'aws-ses' : 'simulated' };
};

export const emailEngineRouter = createTRPCRouter({
  getStatus: publicProcedure.query(async () => {
    const configured = isSESConfigured();
    let domainStatus = { verified: false, status: "unknown" };
    let quota = { max24HourSend: 0, maxSendRate: 0, sentLast24Hours: 0 };

    if (configured) {
      [domainStatus, quota] = await Promise.all([
        sesGetDomainStatus(DOMAIN),
        sesGetSendQuota(),
      ]);
    }

    return {
      provider: configured ? 'aws-ses' : 'none',
      configured,
      domain: DOMAIN,
      domainVerified: domainStatus.verified,
      domainStatus: domainStatus.status,
      quota: {
        max24HourSend: quota.max24HourSend,
        maxSendRate: quota.maxSendRate,
        sentLast24Hours: quota.sentLast24Hours,
      },
    };
  }),

  getStats: adminProcedure.query(async () => {
    console.log("[EmailEngine] Fetching engine stats via SES");
    const configured = isSESConfigured();
    let quota = { max24HourSend: 200, maxSendRate: 1, sentLast24Hours: 0 };
    let stats = { dataPoints: [] as { bounces: number; complaints: number; deliveryAttempts: number; rejects: number }[] };

    if (configured) {
      [quota, stats] = await Promise.all([
        sesGetSendQuota(),
        sesGetSendStats(),
      ]);
    }

    const totalBounces = stats.dataPoints.reduce((sum, dp) => sum + dp.bounces, 0);
    const totalDeliveries = stats.dataPoints.reduce((sum, dp) => sum + dp.deliveryAttempts, 0);
    const totalComplaints = stats.dataPoints.reduce((sum, dp) => sum + dp.complaints, 0);

    return {
      provider: configured ? 'aws-ses' : 'simulated',
      totalSentToday: quota.sentLast24Hours,
      dailyLimit: quota.max24HourSend,
      maxSendRate: quota.maxSendRate,
      deliveryRate: totalDeliveries > 0 ? Math.round(((totalDeliveries - totalBounces) / totalDeliveries) * 1000) / 10 : 100,
      bounceRate: totalDeliveries > 0 ? Math.round((totalBounces / totalDeliveries) * 1000) / 10 : 0,
      spamRate: totalDeliveries > 0 ? Math.round((totalComplaints / totalDeliveries) * 10000) / 100 : 0,
      estimatedCostPerEmail: 0.0001,
      estimatedDailyCost: Math.round(quota.sentLast24Hours * 0.0001 * 100) / 100,
    };
  }),

  verifyDomain: adminProcedure
    .input(z.object({ domain: z.string().default(DOMAIN) }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Verifying domain:", input.domain);
      const result = await sesVerifyDomain(input.domain);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const dnsRecords = [];

      if (result.verificationToken) {
        dnsRecords.push({
          type: 'TXT',
          name: `_amazonses.${input.domain}`,
          value: result.verificationToken,
          purpose: 'Domain verification',
        });
      }

      if (result.dkimTokens) {
        for (const token of result.dkimTokens) {
          dnsRecords.push({
            type: 'CNAME',
            name: `${token}._domainkey.${input.domain}`,
            value: `${token}.dkim.amazonses.com`,
            purpose: 'DKIM signing',
          });
        }
      }

      dnsRecords.push({
        type: 'TXT',
        name: input.domain,
        value: 'v=spf1 include:amazonses.com ~all',
        purpose: 'SPF record',
      });

      dnsRecords.push({
        type: 'TXT',
        name: `_dmarc.${input.domain}`,
        value: 'v=DMARC1; p=quarantine; rua=mailto:admin@ivxholding.com',
        purpose: 'DMARC policy',
      });

      return {
        success: true,
        dnsRecords,
        message: `Add these DNS records to ${input.domain} in Spaceship.com, then wait for verification.`,
      };
    }),

  checkDomainStatus: adminProcedure
    .input(z.object({ domain: z.string().default(DOMAIN) }))
    .query(async ({ input }) => {
      const status = await sesGetDomainStatus(input.domain);
      return {
        domain: input.domain,
        verified: status.verified,
        status: status.status,
      };
    }),

  listVerifiedDomains: adminProcedure.query(async () => {
    const result = await sesListIdentities();
    return { domains: result.identities, error: result.error };
  }),

  sendEmail: adminProcedure
    .input(z.object({
      from: z.string().email(),
      fromName: z.string().optional(),
      to: z.string(),
      cc: z.string().optional(),
      bcc: z.string().optional(),
      subject: z.string(),
      body: z.string(),
      bodyHtml: z.string().optional(),
      replyTo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Sending email from", input.from, "to", input.to);
      const htmlBody = input.bodyHtml || `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #1a1a1a; line-height: 1.6;">${input.body.replace(/\n/g, '<br>')}</div>`;
      const result = await sendEmailVia(
        input.to,
        input.subject,
        htmlBody,
        input.body,
        input.from,
        input.fromName,
        input.cc,
        input.bcc,
        input.replyTo,
      );
      return {
        success: result.success,
        messageId: result.messageId,
        provider: result.provider,
        error: result.error,
      };
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
      const htmlBody = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #1a1a1a; line-height: 1.6;">${input.body.replace(/\n/g, '<br>')}</div>`;
      const result = await sendEmailVia(input.toEmail, input.subject, htmlBody, input.body);
      return { success: result.success, messageId: result.messageId || `msg_${Date.now()}`, provider: result.provider };
    }),

  getSmtpConfigs: adminProcedure.query(async () => {
    console.log("[EmailEngine] Fetching SMTP configs (SES mode)");
    const configured = isSESConfigured();
    if (configured) {
      const quota = await sesGetSendQuota();
      return {
        configs: [{
          id: 'aws-ses',
          name: 'Amazon SES',
          host: `email.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`,
          port: 587,
          fromEmail: EMAIL_FROM,
          fromName: EMAIL_FROM_NAME,
          active: true,
          dailyLimit: quota.max24HourSend,
          sentToday: quota.sentLast24Hours,
          maxSendRate: quota.maxSendRate,
        }],
      };
    }
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
      console.log("[EmailEngine] SES is primary — SMTP config stored for reference:", input.name);
      return { success: true, id: `smtp_${Date.now()}` };
    }),

  toggleSmtp: adminProcedure
    .input(z.object({ smtpId: z.string(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Toggle SMTP:", input.smtpId, input.active);
      return { success: true };
    }),

  getDomainHealth: adminProcedure.query(async () => {
    console.log("[EmailEngine] Fetching domain health via SES");
    const [domainStatus, quota] = await Promise.all([
      sesGetDomainStatus(DOMAIN),
      sesGetSendQuota(),
    ]);

    return {
      domains: [{
        domain: DOMAIN,
        verified: domainStatus.verified,
        status: domainStatus.status,
        provider: 'aws-ses',
        dailyLimit: quota.max24HourSend,
        sentToday: quota.sentLast24Hours,
      }],
    };
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
      return { success: true, campaignId: `camp_${Date.now()}` };
    }),

  startCampaign: adminProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[EmailEngine] Starting campaign:", input.campaignId);
      return { success: true, status: "sending" as const, provider: isSESConfigured() ? 'aws-ses' : 'simulated' };
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
    const quota = await sesGetSendQuota();
    return {
      activeWarmups: quota.max24HourSend < 50000 ? 1 : 0,
      currentLimit: quota.max24HourSend,
      sendRate: quota.maxSendRate,
      warmupSchedule: [
        { day: 1, limit: 200 },
        { day: 7, limit: 1000 },
        { day: 14, limit: 10000 },
        { day: 21, limit: 50000 },
        { day: 30, limit: 100000 },
      ],
    };
  }),
});
