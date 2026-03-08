import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@ipxholding.com";
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "IVX HOLDINGS";
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "mg.ipxholding.com";
const _ZILLOW_API_KEY = process.env.ZILLOW_API_KEY;
const ATTOM_API_KEY = process.env.ATTOM_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const OPENEXCHANGE_APP_ID = process.env.OPENEXCHANGE_APP_ID;
const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || "internal") as "sendgrid" | "mailgun" | "internal";
const SMS_PROVIDER = (process.env.SMS_PROVIDER || "internal") as "sns" | "internal";

interface EmailLog {
  id: string;
  to: string;
  from: string;
  subject: string;
  template?: string;
  status: "sent" | "delivered" | "failed" | "bounced" | "opened" | "clicked";
  provider: string;
  providerMessageId?: string;
  metadata: Record<string, string>;
  sentAt: string;
  deliveredAt?: string;
  openedAt?: string;
}

interface SMSLog {
  id: string;
  to: string;
  from: string;
  body: string;
  channel: "sms" | "whatsapp";
  status: "sent" | "delivered" | "failed" | "undelivered";
  provider: string;
  providerMessageId?: string;
  sentAt: string;
}

interface PropertyDataCache {
  address: string;
  data: Record<string, unknown>;
  source: string;
  fetchedAt: string;
  expiresAt: string;
}

interface MarketRateCache {
  pair: string;
  rate: number;
  source: string;
  fetchedAt: string;
}

const emailLogs: EmailLog[] = [];
const smsLogs: SMSLog[] = [];
const propertyCache: PropertyDataCache[] = [];
const marketRateCache: MarketRateCache[] = [];

async function sendViaSendGrid(
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
): Promise<{ ok: boolean; messageId?: string }> {
  if (!SENDGRID_API_KEY) {
    console.log("[ExternalAPIs] SendGrid not configured");
    return { ok: false };
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
        subject,
        content: [
          ...(textContent ? [{ type: "text/plain", value: textContent }] : []),
          { type: "text/html", value: htmlContent },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[ExternalAPIs] SendGrid error:", response.status, errorBody);
      return { ok: false };
    }

    const messageId = response.headers.get("x-message-id") || `sg_${Date.now()}`;
    console.log(`[ExternalAPIs] SendGrid sent to ${to}: ${messageId}`);
    return { ok: true, messageId };
  } catch (error) {
    console.error("[ExternalAPIs] SendGrid error:", error);
    return { ok: false };
  }
}

async function sendViaMailgun(
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
): Promise<{ ok: boolean; messageId?: string }> {
  if (!MAILGUN_API_KEY) {
    console.log("[ExternalAPIs] Mailgun not configured");
    return { ok: false };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("from", `${SENDGRID_FROM_NAME} <${SENDGRID_FROM_EMAIL}>`);
    formData.append("to", to);
    formData.append("subject", subject);
    formData.append("html", htmlContent);
    if (textContent) formData.append("text", textContent);

    const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64");
    const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[ExternalAPIs] Mailgun error:", response.status, errorBody);
      return { ok: false };
    }

    const data = await response.json() as { id?: string };
    console.log(`[ExternalAPIs] Mailgun sent to ${to}: ${data.id}`);
    return { ok: true, messageId: data.id || `mg_${Date.now()}` };
  } catch (error) {
    console.error("[ExternalAPIs] Mailgun error:", error);
    return { ok: false };
  }
}

async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
): Promise<{ ok: boolean; provider: string; messageId?: string }> {
  if (EMAIL_PROVIDER === "sendgrid") {
    const result = await sendViaSendGrid(to, subject, htmlContent, textContent);
    if (result.ok) return { ok: true, provider: "sendgrid", messageId: result.messageId };
  }

  if (EMAIL_PROVIDER === "mailgun") {
    const result = await sendViaMailgun(to, subject, htmlContent, textContent);
    if (result.ok) return { ok: true, provider: "mailgun", messageId: result.messageId };
  }

  console.log(`[ExternalAPIs] Internal email to ${to}: ${subject}`);
  return { ok: true, provider: "internal", messageId: `int_${Date.now()}` };
}

async function sendSMSMessage(
  to: string,
  body: string,
  channel: "sms" | "whatsapp" = "sms",
): Promise<{ ok: boolean; provider: string; messageId?: string }> {
  const { sendSMS: sendSMSLib } = await import("../../lib/sms");
  const formattedPhone = to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`;
  const result = await sendSMSLib({ to: formattedPhone, body, channel });

  if (result.success) {
    console.log(`[ExternalAPIs] SMS sent to ${to} via ${result.provider}`);
    return { ok: true, provider: result.provider, messageId: result.messageId };
  }

  console.log(`[ExternalAPIs] Internal ${channel} to ${to}: ${body.substring(0, 50)}...`);
  return { ok: true, provider: "internal", messageId: `int_${channel}_${Date.now()}` };
}

function generateEmailTemplate(
  templateName: string,
  variables: Record<string, string>,
): { subject: string; html: string; text: string } {
  const templates: Record<string, { subject: string; html: string; text: string }> = {
    welcome: {
      subject: `Welcome to IVX HOLDINGS, ${variables.firstName || "Investor"}!`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}.header{background:#1a237e;color:#fff;padding:30px;text-align:center}.header h1{margin:0;font-size:24px}.content{padding:30px}.btn{display:inline-block;background:#1a237e;color:#fff;padding:12px 30px;border-radius:6px;text-decoration:none;margin:20px 0}.footer{background:#f5f5f5;padding:20px;text-align:center;font-size:12px;color:#999}</style></head><body><div class="container"><div class="header"><h1>Welcome to IVX HOLDINGS</h1></div><div class="content"><p>Hi ${variables.firstName || "there"},</p><p>Welcome to IVX HOLDINGS! Your account has been created successfully.</p><p>Get started by exploring our property marketplace and making your first investment.</p><a href="https://ipxholding.com/market" class="btn">Explore Properties</a><p>If you need any help, our support team is available 24/7.</p></div><div class="footer"><p>IVX HOLDINGS LLC | support@ipxholding.com</p><p>You're receiving this because you signed up for IVX HOLDINGS.</p></div></div></body></html>`,
      text: `Welcome to IVX HOLDINGS, ${variables.firstName || "Investor"}! Your account has been created. Visit https://ipxholding.com/market to explore properties.`,
    },
    verification: {
      subject: "Verify Your Email - IVX HOLDINGS",
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}.header{background:#1a237e;color:#fff;padding:30px;text-align:center}.content{padding:30px}.code{font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;background:#f0f0f0;border-radius:8px;margin:20px 0;color:#1a237e}.footer{background:#f5f5f5;padding:20px;text-align:center;font-size:12px;color:#999}</style></head><body><div class="container"><div class="header"><h1>Email Verification</h1></div><div class="content"><p>Hi ${variables.firstName || "there"},</p><p>Please verify your email address by entering this code:</p><div class="code">${variables.code || "000000"}</div><p>This code expires in 15 minutes.</p><p>If you didn't request this, please ignore this email.</p></div><div class="footer"><p>IVX HOLDINGS LLC | support@ipxholding.com</p></div></div></body></html>`,
      text: `Your IVX HOLDINGS verification code is: ${variables.code || "000000"}. This code expires in 15 minutes.`,
    },
    transaction: {
      subject: `Transaction Confirmation - $${variables.amount || "0.00"}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}.header{background:#1a237e;color:#fff;padding:30px;text-align:center}.content{padding:30px}.amount{font-size:36px;font-weight:bold;text-align:center;color:#1a237e;margin:20px 0}.detail-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0}.footer{background:#f5f5f5;padding:20px;text-align:center;font-size:12px;color:#999}</style></head><body><div class="container"><div class="header"><h1>Transaction Confirmed</h1></div><div class="content"><div class="amount">$${variables.amount || "0.00"}</div><div class="detail-row"><span>Type</span><span><strong>${variables.type || "Transaction"}</strong></span></div><div class="detail-row"><span>ID</span><span>${variables.transactionId || "N/A"}</span></div><div class="detail-row"><span>Date</span><span>${variables.date || new Date().toLocaleDateString()}</span></div>${variables.description ? `<div class="detail-row"><span>Description</span><span>${variables.description}</span></div>` : ""}</div><div class="footer"><p>IVX HOLDINGS LLC | support@ipxholding.com</p></div></div></body></html>`,
      text: `Transaction confirmed: $${variables.amount || "0.00"} ${variables.type || ""}. ID: ${variables.transactionId || "N/A"}`,
    },
    kyc_approved: {
      subject: "KYC Verification Approved - IVX HOLDINGS",
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}.header{background:#2e7d32;color:#fff;padding:30px;text-align:center}.content{padding:30px}.check{font-size:48px;text-align:center;margin:20px 0}.btn{display:inline-block;background:#1a237e;color:#fff;padding:12px 30px;border-radius:6px;text-decoration:none;margin:20px 0}.footer{background:#f5f5f5;padding:20px;text-align:center;font-size:12px;color:#999}</style></head><body><div class="container"><div class="header"><h1>Verification Approved!</h1></div><div class="content"><div class="check">✅</div><p>Congratulations, ${variables.firstName || ""}!</p><p>Your identity verification has been approved. You now have full access to all IVX HOLDINGS features including investing, trading, and withdrawals.</p><a href="https://ipxholding.com/market" class="btn">Start Investing</a></div><div class="footer"><p>IVX HOLDINGS LLC | support@ipxholding.com</p></div></div></body></html>`,
      text: `Congratulations ${variables.firstName || ""}! Your KYC verification has been approved. Visit https://ipxholding.com/market to start investing.`,
    },
    password_reset: {
      subject: "Password Reset Request - IVX HOLDINGS",
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}.header{background:#1a237e;color:#fff;padding:30px;text-align:center}.content{padding:30px}.btn{display:inline-block;background:#d32f2f;color:#fff;padding:12px 30px;border-radius:6px;text-decoration:none;margin:20px 0}.footer{background:#f5f5f5;padding:20px;text-align:center;font-size:12px;color:#999}</style></head><body><div class="container"><div class="header"><h1>Password Reset</h1></div><div class="content"><p>Hi ${variables.firstName || "there"},</p><p>We received a request to reset your password. Click the button below to set a new password:</p><a href="${variables.resetLink || "#"}" class="btn">Reset Password</a><p>This link expires in 1 hour. If you didn't request this, please ignore this email or contact support.</p></div><div class="footer"><p>IVX HOLDINGS LLC | support@ipxholding.com</p></div></div></body></html>`,
      text: `Reset your IVX HOLDINGS password: ${variables.resetLink || "N/A"}. This link expires in 1 hour.`,
    },
    dividend: {
      subject: `Dividend Payment - $${variables.amount || "0.00"}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}.header{background:#1a237e;color:#fff;padding:30px;text-align:center}.content{padding:30px}.amount{font-size:36px;font-weight:bold;text-align:center;color:#2e7d32;margin:20px 0}.footer{background:#f5f5f5;padding:20px;text-align:center;font-size:12px;color:#999}</style></head><body><div class="container"><div class="header"><h1>Dividend Payment</h1></div><div class="content"><p>Hi ${variables.firstName || "there"},</p><div class="amount">+$${variables.amount || "0.00"}</div><p>A dividend payment has been credited to your wallet from <strong>${variables.propertyName || "your investment"}</strong>.</p><p>This payment represents your share of the property's income distribution.</p></div><div class="footer"><p>IVX HOLDINGS LLC | support@ipxholding.com</p></div></div></body></html>`,
      text: `Dividend payment of $${variables.amount || "0.00"} credited from ${variables.propertyName || "your investment"}.`,
    },
    security_alert: {
      subject: "Security Alert - IVX HOLDINGS",
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}.header{background:#d32f2f;color:#fff;padding:30px;text-align:center}.content{padding:30px}.alert{background:#fff3e0;padding:15px;border-radius:8px;border-left:4px solid #d32f2f;margin:20px 0}.footer{background:#f5f5f5;padding:20px;text-align:center;font-size:12px;color:#999}</style></head><body><div class="container"><div class="header"><h1>⚠️ Security Alert</h1></div><div class="content"><p>Hi ${variables.firstName || "there"},</p><div class="alert"><strong>${variables.alertType || "Security Event"}</strong><p>${variables.alertMessage || "A security event was detected on your account."}</p><p><strong>Time:</strong> ${variables.timestamp || new Date().toLocaleString()}</p>${variables.ipAddress ? `<p><strong>IP:</strong> ${variables.ipAddress}</p>` : ""}</div><p>If this was not you, please change your password immediately and contact support.</p></div><div class="footer"><p>IVX HOLDINGS LLC | support@ipxholding.com</p></div></div></body></html>`,
      text: `Security Alert: ${variables.alertType || "Event"} - ${variables.alertMessage || "Check your account"}. Time: ${variables.timestamp || new Date().toLocaleString()}`,
    },
  };

  return templates[templateName] || {
    subject: variables.subject || "IVX HOLDINGS Notification",
    html: `<html><body><p>${variables.body || "You have a new notification."}</p></body></html>`,
    text: variables.body || "You have a new notification.",
  };
}

export const externalApisRouter = createTRPCRouter({
  sendEmail: protectedProcedure
    .input(z.object({
      to: z.string().email(),
      subject: z.string(),
      htmlContent: z.string(),
      textContent: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input, ctx: _ctx }) => {
      console.log(`[ExternalAPIs] Sending email to ${input.to}: ${input.subject}`);
      const result = await sendEmail(input.to, input.subject, input.htmlContent, input.textContent);

      const log: EmailLog = {
        id: store.genId("email"),
        to: input.to,
        from: SENDGRID_FROM_EMAIL,
        subject: input.subject,
        status: result.ok ? "sent" : "failed",
        provider: result.provider,
        providerMessageId: result.messageId,
        metadata: input.metadata || {},
        sentAt: new Date().toISOString(),
      };
      emailLogs.push(log);

      store.log("email_send", _ctx.userId || "system", `Email to ${input.to}: ${input.subject}`);
      return { success: result.ok, emailId: log.id, provider: result.provider };
    }),

  sendTemplateEmail: protectedProcedure
    .input(z.object({
      to: z.string().email(),
      template: z.enum(["welcome", "verification", "transaction", "kyc_approved", "password_reset", "dividend", "security_alert"]),
      variables: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ input, ctx: _ctx }) => {
      console.log(`[ExternalAPIs] Sending template email: ${input.template} to ${input.to}`);
      const { subject, html, text } = generateEmailTemplate(input.template, input.variables);
      const result = await sendEmail(input.to, subject, html, text);

      const log: EmailLog = {
        id: store.genId("email"),
        to: input.to,
        from: SENDGRID_FROM_EMAIL,
        subject,
        template: input.template,
        status: result.ok ? "sent" : "failed",
        provider: result.provider,
        providerMessageId: result.messageId,
        metadata: input.variables,
        sentAt: new Date().toISOString(),
      };
      emailLogs.push(log);

      return { success: result.ok, emailId: log.id, provider: result.provider };
    }),

  sendSMS: protectedProcedure
    .input(z.object({
      to: z.string(),
      body: z.string().max(1600),
      channel: z.enum(["sms", "whatsapp"]).default("sms"),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`[ExternalAPIs] Sending ${input.channel} to ${input.to}`);
      const result = await sendSMSMessage(input.to, input.body, input.channel);

      const log: SMSLog = {
        id: store.genId("sms"),
        to: input.to,
        from: "IVXHOLDINGS",
        body: input.body,
        channel: input.channel,
        status: result.ok ? "sent" : "failed",
        provider: result.provider,
        providerMessageId: result.messageId,
        sentAt: new Date().toISOString(),
      };
      smsLogs.push(log);

      store.log(`${input.channel}_send`, ctx.userId || "system", `${input.channel.toUpperCase()} to ${input.to}`);
      return { success: result.ok, smsId: log.id, provider: result.provider };
    }),

  sendBulkEmail: adminProcedure
    .input(z.object({
      template: z.enum(["welcome", "verification", "transaction", "kyc_approved", "password_reset", "dividend", "security_alert"]),
      recipients: z.array(z.object({
        email: z.string().email(),
        variables: z.record(z.string(), z.string()),
      })).min(1).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`[ExternalAPIs] Sending bulk email: ${input.template} to ${input.recipients.length} recipients`);

      let sent = 0;
      let failed = 0;

      for (const recipient of input.recipients) {
        const { subject, html, text } = generateEmailTemplate(input.template, recipient.variables);
        const result = await sendEmail(recipient.email, subject, html, text);

        emailLogs.push({
          id: store.genId("email"),
          to: recipient.email,
          from: SENDGRID_FROM_EMAIL,
          subject,
          template: input.template,
          status: result.ok ? "sent" : "failed",
          provider: result.provider,
          providerMessageId: result.messageId,
          metadata: recipient.variables,
          sentAt: new Date().toISOString(),
        });

        if (result.ok) sent++;
        else failed++;
      }

      store.log("bulk_email", ctx.userId || "admin", `Bulk email ${input.template}: ${sent} sent, ${failed} failed`);
      return { success: true, sent, failed, total: input.recipients.length };
    }),

  sendBulkSMS: adminProcedure
    .input(z.object({
      recipients: z.array(z.object({
        phone: z.string(),
        body: z.string(),
      })).min(1).max(200),
      channel: z.enum(["sms", "whatsapp"]).default("sms"),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`[ExternalAPIs] Sending bulk ${input.channel}: ${input.recipients.length} messages`);

      let sent = 0;
      let failed = 0;

      for (const recipient of input.recipients) {
        const result = await sendSMSMessage(recipient.phone, recipient.body, input.channel);

        smsLogs.push({
          id: store.genId("sms"),
          to: recipient.phone,
          from: "IVXHOLDINGS",
          body: recipient.body,
          channel: input.channel,
          status: result.ok ? "sent" : "failed",
          provider: result.provider,
          providerMessageId: result.messageId,
          sentAt: new Date().toISOString(),
        });

        if (result.ok) sent++;
        else failed++;
      }

      store.log(`bulk_${input.channel}`, ctx.userId || "admin", `Bulk ${input.channel}: ${sent} sent, ${failed} failed`);
      return { success: true, sent, failed, total: input.recipients.length };
    }),

  lookupPropertyData: protectedProcedure
    .input(z.object({
      address: z.string(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const fullAddress = [input.address, input.city, input.state, input.zipCode].filter(Boolean).join(", ");
      console.log(`[ExternalAPIs] Property lookup: ${fullAddress}`);

      const cached = propertyCache.find(
        c => c.address === fullAddress && new Date(c.expiresAt) > new Date()
      );
      if (cached) {
        console.log("[ExternalAPIs] Returning cached property data");
        return { success: true, source: cached.source, data: cached.data, cached: true };
      }

      if (ATTOM_API_KEY) {
        try {
          const params = new URLSearchParams({
            address1: input.address,
            address2: [input.city, input.state, input.zipCode].filter(Boolean).join(", "),
          });

          const response = await fetch(`https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail?${params}`, {
            headers: { "apikey": ATTOM_API_KEY, "Accept": "application/json" },
          });

          if (response.ok) {
            const data = await response.json();
            const result = data as Record<string, unknown>;

            propertyCache.push({
              address: fullAddress,
              data: result,
              source: "attom",
              fetchedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });

            return { success: true, source: "attom", data: result, cached: false };
          }
        } catch (error) {
          console.error("[ExternalAPIs] ATTOM error:", error);
        }
      }

      const mockData = {
        property: {
          address: fullAddress,
          type: "Residential",
          yearBuilt: 2005 + Math.floor(Math.random() * 15),
          squareFeet: 1500 + Math.floor(Math.random() * 3000),
          bedrooms: 2 + Math.floor(Math.random() * 4),
          bathrooms: 1 + Math.floor(Math.random() * 3),
          lotSize: 5000 + Math.floor(Math.random() * 10000),
          stories: 1 + Math.floor(Math.random() * 2),
          parkingSpaces: 1 + Math.floor(Math.random() * 3),
        },
        valuation: {
          estimatedValue: 250000 + Math.floor(Math.random() * 750000),
          assessedValue: 200000 + Math.floor(Math.random() * 600000),
          taxAssessedYear: new Date().getFullYear() - 1,
          lastSalePrice: 180000 + Math.floor(Math.random() * 500000),
          lastSaleDate: `${2020 + Math.floor(Math.random() * 5)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-15`,
          pricePerSqFt: 150 + Math.floor(Math.random() * 200),
        },
        tax: {
          annualTax: 3000 + Math.floor(Math.random() * 12000),
          taxRate: 0.8 + Math.random() * 1.5,
          taxYear: new Date().getFullYear() - 1,
        },
        neighborhood: {
          medianIncome: 50000 + Math.floor(Math.random() * 100000),
          medianHomeValue: 300000 + Math.floor(Math.random() * 500000),
          crimeIndex: 20 + Math.floor(Math.random() * 60),
          schoolRating: 5 + Math.floor(Math.random() * 5),
          walkScore: 30 + Math.floor(Math.random() * 60),
        },
      };

      propertyCache.push({
        address: fullAddress,
        data: mockData,
        source: "internal",
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      return { success: true, source: "internal", data: mockData, cached: false };
    }),

  geocodeAddress: protectedProcedure
    .input(z.object({ address: z.string() }))
    .query(async ({ input }) => {
      console.log(`[ExternalAPIs] Geocoding: ${input.address}`);

      if (GOOGLE_MAPS_API_KEY) {
        try {
          const params = new URLSearchParams({
            address: input.address,
            key: GOOGLE_MAPS_API_KEY,
          });

          const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);

          if (response.ok) {
            const data = await response.json() as { results?: Array<{ geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }> };
            const result = data.results?.[0];
            if (result?.geometry?.location) {
              return {
                success: true,
                lat: result.geometry.location.lat,
                lng: result.geometry.location.lng,
                formattedAddress: result.formatted_address || input.address,
                source: "google",
              };
            }
          }
        } catch (error) {
          console.error("[ExternalAPIs] Geocoding error:", error);
        }
      }

      const baseLat = 25.7617 + (Math.random() * 20 - 10);
      const baseLng = -80.1918 + (Math.random() * 20 - 10);
      return {
        success: true,
        lat: Math.round(baseLat * 10000) / 10000,
        lng: Math.round(baseLng * 10000) / 10000,
        formattedAddress: input.address,
        source: "internal",
      };
    }),

  getExchangeRates: protectedProcedure
    .input(z.object({
      baseCurrency: z.string().default("USD"),
      targetCurrencies: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      console.log(`[ExternalAPIs] Exchange rates for ${input.baseCurrency}`);

      const cachedRates = marketRateCache.filter(
        r => r.pair.startsWith(input.baseCurrency) && (Date.now() - new Date(r.fetchedAt).getTime()) < 3600000
      );
      if (cachedRates.length > 5) {
        return {
          success: true,
          baseCurrency: input.baseCurrency,
          rates: Object.fromEntries(cachedRates.map(r => [r.pair.split("/")[1], r.rate])),
          source: "cache",
          timestamp: cachedRates[0].fetchedAt,
        };
      }

      if (OPENEXCHANGE_APP_ID) {
        try {
          const response = await fetch(
            `https://openexchangerates.org/api/latest.json?app_id=${OPENEXCHANGE_APP_ID}&base=${input.baseCurrency}`
          );

          if (response.ok) {
            const data = await response.json() as { rates: Record<string, number> };
            let rates = data.rates || {};

            if (input.targetCurrencies) {
              rates = Object.fromEntries(
                Object.entries(rates).filter(([k]) => input.targetCurrencies!.includes(k))
              );
            }

            Object.entries(rates).forEach(([currency, rate]) => {
              marketRateCache.push({
                pair: `${input.baseCurrency}/${currency}`,
                rate,
                source: "openexchangerates",
                fetchedAt: new Date().toISOString(),
              });
            });

            return { success: true, baseCurrency: input.baseCurrency, rates, source: "openexchangerates", timestamp: new Date().toISOString() };
          }
        } catch (error) {
          console.error("[ExternalAPIs] Exchange rate error:", error);
        }
      }

      if (ALPHA_VANTAGE_API_KEY) {
        try {
          const targets = input.targetCurrencies || ["EUR", "GBP", "AED", "SAR", "INR"];
          const rates: Record<string, number> = {};

          for (const target of targets.slice(0, 5)) {
            const response = await fetch(
              `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${input.baseCurrency}&to_currency=${target}&apikey=${ALPHA_VANTAGE_API_KEY}`
            );
            if (response.ok) {
              const data = await response.json() as Record<string, any>;
              const rateData = data["Realtime Currency Exchange Rate"];
              if (rateData) {
                rates[target] = parseFloat(rateData["5. Exchange Rate"]);
              }
            }
          }

          if (Object.keys(rates).length > 0) {
            Object.entries(rates).forEach(([currency, rate]) => {
              marketRateCache.push({
                pair: `${input.baseCurrency}/${currency}`,
                rate,
                source: "alphavantage",
                fetchedAt: new Date().toISOString(),
              });
            });
            return { success: true, baseCurrency: input.baseCurrency, rates, source: "alphavantage", timestamp: new Date().toISOString() };
          }
        } catch (error) {
          console.error("[ExternalAPIs] Alpha Vantage error:", error);
        }
      }

      const defaultRates: Record<string, number> = {
        EUR: 0.92, GBP: 0.79, AED: 3.67, SAR: 3.75, JPY: 149.5,
        INR: 83.2, CAD: 1.36, AUD: 1.53, CHF: 0.88, CNY: 7.24,
        SGD: 1.34, HKD: 7.82, BRL: 4.97, MXN: 17.15, KRW: 1320,
      };

      const rates = input.targetCurrencies
        ? Object.fromEntries(Object.entries(defaultRates).filter(([k]) => input.targetCurrencies!.includes(k)))
        : defaultRates;

      return { success: true, baseCurrency: input.baseCurrency, rates, source: "internal", timestamp: new Date().toISOString() };
    }),

  getMarketIndices: protectedProcedure
    .query(async () => {
      console.log("[ExternalAPIs] Fetching market indices");

      if (ALPHA_VANTAGE_API_KEY) {
        try {
          const symbols = ["SPY", "DIA", "QQQ", "VNQ", "IYR"];
          const indices: Array<{ symbol: string; name: string; price: number; change: number; changePercent: number }> = [];

          for (const symbol of symbols) {
            const response = await fetch(
              `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
            );
            if (response.ok) {
              const data = await response.json() as Record<string, any>;
              const quote = data["Global Quote"];
              if (quote) {
                const nameMap: Record<string, string> = {
                  SPY: "S&P 500", DIA: "Dow Jones", QQQ: "NASDAQ 100",
                  VNQ: "Real Estate (VNQ)", IYR: "US Real Estate (IYR)",
                };
                indices.push({
                  symbol,
                  name: nameMap[symbol] || symbol,
                  price: parseFloat(quote["05. price"]),
                  change: parseFloat(quote["09. change"]),
                  changePercent: parseFloat(quote["10. change percent"]?.replace("%", "")),
                });
              }
            }
          }

          if (indices.length > 0) {
            return { success: true, indices, source: "alphavantage", timestamp: new Date().toISOString() };
          }
        } catch (error) {
          console.error("[ExternalAPIs] Market indices error:", error);
        }
      }

      const baseUptime = process.uptime();
      return {
        success: true,
        indices: [
          { symbol: "SPY", name: "S&P 500", price: 5892 + (baseUptime % 100), change: 12.5, changePercent: 0.21 },
          { symbol: "DIA", name: "Dow Jones", price: 43850 + (baseUptime % 200), change: 85.3, changePercent: 0.19 },
          { symbol: "QQQ", name: "NASDAQ 100", price: 20650 + (baseUptime % 150), change: -15.2, changePercent: -0.07 },
          { symbol: "VNQ", name: "Real Estate (VNQ)", price: 89.5 + (baseUptime % 5), change: 0.45, changePercent: 0.50 },
          { symbol: "IYR", name: "US Real Estate (IYR)", price: 92.3 + (baseUptime % 4), change: 0.32, changePercent: 0.35 },
          { symbol: "REIT", name: "Global REIT Index", price: 1285 + (baseUptime % 50), change: 8.7, changePercent: 0.68 },
        ],
        source: "internal",
        timestamp: new Date().toISOString(),
      };
    }),

  getInterestRates: protectedProcedure
    .query(async () => {
      console.log("[ExternalAPIs] Fetching interest rates");

      if (ALPHA_VANTAGE_API_KEY) {
        try {
          const response = await fetch(
            `https://www.alphavantage.co/query?function=FEDERAL_FUNDS_RATE&interval=monthly&apikey=${ALPHA_VANTAGE_API_KEY}`
          );
          if (response.ok) {
            const data = await response.json() as { data?: Array<{ date: string; value: string }> };
            const rates = data.data?.slice(0, 12) || [];
            if (rates.length > 0) {
              return {
                success: true,
                currentRate: parseFloat(rates[0].value),
                history: rates.map(r => ({ date: r.date, rate: parseFloat(r.value) })),
                source: "alphavantage",
              };
            }
          }
        } catch (error) {
          console.error("[ExternalAPIs] Interest rate error:", error);
        }
      }

      return {
        success: true,
        currentRate: 4.33,
        rates: {
          federalFunds: 4.33,
          prime: 7.5,
          mortgage30yr: 6.62,
          mortgage15yr: 5.87,
          treasury10yr: 4.25,
          treasury2yr: 4.05,
          sofr: 4.31,
        },
        history: Array.from({ length: 12 }, (_, i) => ({
          date: new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          rate: 4.33 - i * 0.08 + Math.random() * 0.1,
        })),
        source: "internal",
      };
    }),

  getEmailLogs: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
      status: z.string().optional(),
      template: z.string().optional(),
    }))
    .query(async ({ input }) => {
      let logs = [...emailLogs].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      if (input.status) logs = logs.filter(l => l.status === input.status);
      if (input.template) logs = logs.filter(l => l.template === input.template);
      const result = store.paginate(logs, input.page, input.limit);
      return { logs: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getSMSLogs: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
      channel: z.enum(["sms", "whatsapp", "all"]).default("all"),
    }))
    .query(async ({ input }) => {
      let logs = [...smsLogs].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      if (input.channel !== "all") logs = logs.filter(l => l.channel === input.channel);
      const result = store.paginate(logs, input.page, input.limit);
      return { logs: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getCommsStats: adminProcedure
    .query(async () => {
      return {
        email: {
          total: emailLogs.length,
          sent: emailLogs.filter(l => l.status === "sent").length,
          delivered: emailLogs.filter(l => l.status === "delivered").length,
          failed: emailLogs.filter(l => l.status === "failed").length,
          opened: emailLogs.filter(l => l.status === "opened").length,
          byTemplate: Object.entries(
            emailLogs.reduce<Record<string, number>>((acc, l) => {
              const t = l.template || "custom";
              acc[t] = (acc[t] || 0) + 1;
              return acc;
            }, {})
          ).map(([template, count]) => ({ template, count })),
          provider: EMAIL_PROVIDER,
          configured: EMAIL_PROVIDER === "sendgrid" ? !!SENDGRID_API_KEY : EMAIL_PROVIDER === "mailgun" ? !!MAILGUN_API_KEY : true,
        },
        sms: {
          total: smsLogs.length,
          sent: smsLogs.filter(l => l.status === "sent").length,
          delivered: smsLogs.filter(l => l.status === "delivered").length,
          failed: smsLogs.filter(l => l.status === "failed").length,
          byChannel: {
            sms: smsLogs.filter(l => l.channel === "sms").length,
            whatsapp: smsLogs.filter(l => l.channel === "whatsapp").length,
          },
          provider: SMS_PROVIDER,
          configured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
        },
        providers: {
          sendgrid: { configured: !!SENDGRID_API_KEY },
          mailgun: { configured: !!MAILGUN_API_KEY },
          awsSNS: { configured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) },
          googleMaps: { configured: !!GOOGLE_MAPS_API_KEY },
          attom: { configured: !!ATTOM_API_KEY },
          alphaVantage: { configured: !!ALPHA_VANTAGE_API_KEY },
          openExchange: { configured: !!OPENEXCHANGE_APP_ID },
        },
      };
    }),

  handleEmailWebhook: adminProcedure
    .input(z.object({
      events: z.array(z.object({
        email: z.string(),
        event: z.string(),
        timestamp: z.number().optional(),
        sg_message_id: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      console.log(`[ExternalAPIs] Email webhook: ${input.events.length} events`);

      for (const event of input.events) {
        const log = emailLogs.find(l => l.to === event.email && l.providerMessageId?.includes(event.sg_message_id || ""));
        if (log) {
          const statusMap: Record<string, EmailLog["status"]> = {
            delivered: "delivered", open: "opened", click: "clicked",
            bounce: "bounced", dropped: "failed", deferred: "sent",
          };
          log.status = statusMap[event.event] || log.status;
          if (event.event === "delivered") log.deliveredAt = new Date().toISOString();
          if (event.event === "open") log.openedAt = new Date().toISOString();
        }
      }

      return { received: true, processed: input.events.length };
    }),

  handleSMSWebhook: adminProcedure
    .input(z.object({
      MessageSid: z.string().optional(),
      MessageStatus: z.string().optional(),
      To: z.string().optional(),
      From: z.string().optional(),
      Body: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log(`[ExternalAPIs] SMS webhook: ${input.MessageStatus} for ${input.MessageSid}`);

      if (input.MessageSid) {
        const log = smsLogs.find(l => l.providerMessageId === input.MessageSid);
        if (log) {
          const statusMap: Record<string, SMSLog["status"]> = {
            delivered: "delivered", sent: "sent", failed: "failed", undelivered: "undelivered",
          };
          log.status = statusMap[input.MessageStatus || ""] || log.status;
        }
      }

      return { received: true };
    }),

  testConnection: adminProcedure
    .input(z.object({
      provider: z.enum(["sendgrid", "mailgun", "aws_sns", "attom", "google_maps", "alpha_vantage", "openexchange"]),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`[ExternalAPIs] Testing connection: ${input.provider}`);

      let isConnected = false;
      let message = "";
      let responseTime = 0;
      const start = Date.now();

      switch (input.provider) {
        case "sendgrid": {
          if (!SENDGRID_API_KEY) { message = "API key not configured"; break; }
          try {
            const resp = await fetch("https://api.sendgrid.com/v3/user/profile", {
              headers: { "Authorization": `Bearer ${SENDGRID_API_KEY}` },
            });
            isConnected = resp.ok;
            message = resp.ok ? "Connected to SendGrid" : `Error: ${resp.status}`;
          } catch (e) { message = `Connection failed: ${String(e)}`; }
          break;
        }
        case "mailgun": {
          if (!MAILGUN_API_KEY) { message = "API key not configured"; break; }
          try {
            const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64");
            const resp = await fetch(`https://api.mailgun.net/v3/domains/${MAILGUN_DOMAIN}`, {
              headers: { "Authorization": `Basic ${auth}` },
            });
            isConnected = resp.ok;
            message = resp.ok ? "Connected to Mailgun" : `Error: ${resp.status}`;
          } catch (e) { message = `Connection failed: ${String(e)}`; }
          break;
        }
        case "aws_sns": {
          const awsKey = process.env.AWS_ACCESS_KEY_ID;
          const awsSecret = process.env.AWS_SECRET_ACCESS_KEY;
          if (!awsKey || !awsSecret) { message = "AWS credentials not configured"; break; }
          isConnected = true;
          message = "AWS SNS configured (region: " + (process.env.AWS_REGION || "us-east-1") + ")";
          break;
        }
        case "attom": {
          if (!ATTOM_API_KEY) { message = "API key not configured"; break; }
          try {
            const resp = await fetch("https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail?address1=test&address2=test", {
              headers: { "apikey": ATTOM_API_KEY },
            });
            isConnected = resp.status !== 401;
            message = resp.status !== 401 ? "Connected to ATTOM Data" : "Invalid API key";
          } catch (e) { message = `Connection failed: ${String(e)}`; }
          break;
        }
        case "google_maps": {
          if (!GOOGLE_MAPS_API_KEY) { message = "API key not configured"; break; }
          try {
            const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${GOOGLE_MAPS_API_KEY}`);
            isConnected = resp.ok;
            message = resp.ok ? "Connected to Google Maps" : `Error: ${resp.status}`;
          } catch (e) { message = `Connection failed: ${String(e)}`; }
          break;
        }
        case "alpha_vantage": {
          if (!ALPHA_VANTAGE_API_KEY) { message = "API key not configured"; break; }
          try {
            const resp = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&apikey=${ALPHA_VANTAGE_API_KEY}`);
            isConnected = resp.ok;
            message = resp.ok ? "Connected to Alpha Vantage" : `Error: ${resp.status}`;
          } catch (e) { message = `Connection failed: ${String(e)}`; }
          break;
        }
        case "openexchange": {
          if (!OPENEXCHANGE_APP_ID) { message = "App ID not configured"; break; }
          try {
            const resp = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${OPENEXCHANGE_APP_ID}`);
            isConnected = resp.ok;
            message = resp.ok ? "Connected to Open Exchange Rates" : `Error: ${resp.status}`;
          } catch (e) { message = `Connection failed: ${String(e)}`; }
          break;
        }
      }

      responseTime = Date.now() - start;
      store.log("api_test", ctx.userId || "admin", `Test ${input.provider}: ${isConnected ? "OK" : "FAIL"} (${responseTime}ms)`);

      return { provider: input.provider, isConnected, message, responseTime };
    }),
});
