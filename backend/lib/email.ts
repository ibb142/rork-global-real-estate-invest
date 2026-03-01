import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_SES_FROM_EMAIL = process.env.AWS_SES_FROM_EMAIL || "noreply@ivxholding.com";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@ivxholding.com";
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "mail.ivxholding.com";
const APP_NAME = "IVX HOLDINGS";

const isSESConfigured = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);

let sesClient: SESClient | null = null;
if (isSESConfigured) {
  sesClient = new SESClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    },
  });
  console.log(`[Email] AWS SES configured: region=${AWS_REGION}, from=${AWS_SES_FROM_EMAIL}`);
} else {
  console.log("[Email] AWS SES not configured — will use fallback providers");
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

interface EmailResult {
  success: boolean;
  provider: "ses" | "sendgrid" | "mailgun" | "console";
  messageId?: string;
  error?: string;
}

async function sendViaSES(options: EmailOptions): Promise<EmailResult> {
  if (!sesClient) return { success: false, provider: "ses", error: "Not configured" };

  try {
    const command = new SendEmailCommand({
      Source: options.from || AWS_SES_FROM_EMAIL,
      Destination: { ToAddresses: [options.to] },
      Message: {
        Subject: { Data: options.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: options.html, Charset: "UTF-8" },
          ...(options.text ? { Text: { Data: options.text, Charset: "UTF-8" } } : {}),
        },
      },
    });

    const result = await sesClient.send(command);
    const messageId = result.MessageId || `ses_${Date.now()}`;
    console.log(`[Email] AWS SES sent to ${options.to}: ${options.subject} (${messageId})`);
    return { success: true, provider: "ses", messageId };
  } catch (error: any) {
    console.error("[Email] AWS SES error:", error.message || error);
    return { success: false, provider: "ses", error: String(error.message || error) };
  }
}

async function sendViaSendGrid(options: EmailOptions): Promise<EmailResult> {
  if (!SENDGRID_API_KEY) return { success: false, provider: "sendgrid", error: "Not configured" };

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: options.to }] }],
        from: { email: options.from || SENDGRID_FROM_EMAIL, name: APP_NAME },
        subject: options.subject,
        content: [
          ...(options.text ? [{ type: "text/plain", value: options.text }] : []),
          { type: "text/html", value: options.html },
        ],
      }),
    });

    if (response.ok || response.status === 202) {
      const messageId = response.headers.get("x-message-id") || `sg_${Date.now()}`;
      console.log(`[Email] SendGrid sent to ${options.to}: ${options.subject} (${messageId})`);
      return { success: true, provider: "sendgrid", messageId };
    }

    const errorBody = await response.text();
    console.error(`[Email] SendGrid error (${response.status}):`, errorBody);
    return { success: false, provider: "sendgrid", error: `Status ${response.status}` };
  } catch (error) {
    console.error("[Email] SendGrid request failed:", error);
    return { success: false, provider: "sendgrid", error: String(error) };
  }
}

async function sendViaMailgun(options: EmailOptions): Promise<EmailResult> {
  if (!MAILGUN_API_KEY) return { success: false, provider: "mailgun", error: "Not configured" };

  try {
    const formData = new URLSearchParams();
    formData.append("from", `${APP_NAME} <${options.from || `noreply@${MAILGUN_DOMAIN}`}>`);
    formData.append("to", options.to);
    formData.append("subject", options.subject);
    formData.append("html", options.html);
    if (options.text) formData.append("text", options.text);

    const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}`,
      },
      body: formData,
    });

    if (response.ok) {
      const data = (await response.json()) as { id?: string };
      console.log(`[Email] Mailgun sent to ${options.to}: ${options.subject}`);
      return { success: true, provider: "mailgun", messageId: data.id };
    }

    const errorBody = await response.text();
    console.error(`[Email] Mailgun error (${response.status}):`, errorBody);
    return { success: false, provider: "mailgun", error: `Status ${response.status}` };
  } catch (error) {
    console.error("[Email] Mailgun request failed:", error);
    return { success: false, provider: "mailgun", error: String(error) };
  }
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (isSESConfigured) {
    const result = await sendViaSES(options);
    if (result.success) return result;
    console.warn("[Email] AWS SES failed, trying SendGrid fallback");
  }

  if (SENDGRID_API_KEY) {
    const result = await sendViaSendGrid(options);
    if (result.success) return result;
    console.warn("[Email] SendGrid failed, trying Mailgun fallback");
  }

  if (MAILGUN_API_KEY) {
    const result = await sendViaMailgun(options);
    if (result.success) return result;
  }

  console.log(`[Email] [CONSOLE-ONLY] To: ${options.to} | Subject: ${options.subject}`);
  return { success: true, provider: "console", messageId: `console_${Date.now()}` };
}

export async function sendVerificationEmail(to: string, token: string, firstName: string): Promise<EmailResult> {
  const verifyUrl = `${process.env.APP_URL || "https://ivxholding.com"}/verify-email?token=${token}`;
  return sendEmail({
    to,
    subject: `${APP_NAME} - Verify Your Email`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#1a237e">Welcome to ${APP_NAME}, ${firstName}!</h2>
        <p>Please verify your email address to complete your registration.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#1a237e;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:20px 0">Verify Email</a>
        <p style="color:#666;font-size:12px">This link expires in 60 minutes. If you didn't create an account, ignore this email.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
        <p style="color:#999;font-size:11px">${APP_NAME} | support@ivxholding.com</p>
      </div>
    `,
    text: `Welcome to ${APP_NAME}, ${firstName}! Verify your email: ${verifyUrl}`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string, firstName: string): Promise<EmailResult> {
  const resetUrl = `${process.env.APP_URL || "https://ivxholding.com"}/reset-password?token=${token}`;
  return sendEmail({
    to,
    subject: `${APP_NAME} - Reset Your Password`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#1a237e">Password Reset Request</h2>
        <p>Hi ${firstName}, we received a request to reset your password.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#1a237e;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:20px 0">Reset Password</a>
        <p style="color:#666;font-size:12px">This link expires in 60 minutes. If you didn't request this, please secure your account.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
        <p style="color:#999;font-size:11px">${APP_NAME} | support@ivxholding.com</p>
      </div>
    `,
    text: `Hi ${firstName}, reset your password: ${resetUrl}`,
  });
}

export async function sendTransactionEmail(to: string, firstName: string, type: string, amount: number, status: string): Promise<EmailResult> {
  const color = status === "completed" ? "#4caf50" : status === "failed" ? "#f44336" : "#ff9800";
  return sendEmail({
    to,
    subject: `${APP_NAME} - ${type.charAt(0).toUpperCase() + type.slice(1)} ${status === "completed" ? "Confirmed" : "Update"}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#1a237e">Transaction ${status === "completed" ? "Confirmed" : "Update"}</h2>
        <p>Hi ${firstName},</p>
        <div style="background:#f5f5f5;padding:20px;border-radius:8px;margin:20px 0">
          <p style="margin:0"><strong>Type:</strong> ${type.charAt(0).toUpperCase() + type.slice(1)}</p>
          <p style="margin:8px 0 0"><strong>Amount:</strong> $${amount.toFixed(2)}</p>
          <p style="margin:8px 0 0"><strong>Status:</strong> <span style="color:${color}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></p>
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
        <p style="color:#999;font-size:11px">${APP_NAME} | support@ivxholding.com</p>
      </div>
    `,
  });
}

export async function sendKYCStatusEmail(to: string, firstName: string, status: string, reason?: string): Promise<EmailResult> {
  const statusText = status === "approved" ? "Approved" : status === "rejected" ? "Requires Attention" : "Under Review";
  return sendEmail({
    to,
    subject: `${APP_NAME} - KYC Verification ${statusText}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#1a237e">KYC Verification ${statusText}</h2>
        <p>Hi ${firstName},</p>
        <p>${
          status === "approved"
            ? "Your identity verification has been approved. You now have full access to all investment features."
            : status === "rejected"
            ? `Your verification requires attention. ${reason || "Please review and resubmit your documents."}`
            : "Your verification is currently under manual review. This typically takes 1-3 business days."
        }</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
        <p style="color:#999;font-size:11px">${APP_NAME} | support@ivxholding.com</p>
      </div>
    `,
  });
}
