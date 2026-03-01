import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
const APP_NAME = "IVX HOLDINGS";

const isSNSConfigured = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);

let snsClient: SNSClient | null = null;
if (isSNSConfigured) {
  snsClient = new SNSClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    },
  });
  console.log(`[SMS] AWS SNS configured: region=${AWS_REGION}`);
} else {
  console.log("[SMS] AWS SNS not configured — will use fallback providers");
}

interface SMSOptions {
  to: string;
  body: string;
  channel?: "sms" | "whatsapp";
}

interface SMSResult {
  success: boolean;
  provider: "sns" | "twilio" | "console";
  messageId?: string;
  error?: string;
}

async function sendViaSNS(options: SMSOptions): Promise<SMSResult> {
  if (!snsClient) return { success: false, provider: "sns", error: "Not configured" };
  if (options.channel === "whatsapp") {
    return { success: false, provider: "sns", error: "WhatsApp not supported by SNS" };
  }

  try {
    const command = new PublishCommand({
      PhoneNumber: options.to,
      Message: options.body,
      MessageAttributes: {
        "AWS.SNS.SMS.SenderID": {
          DataType: "String",
          StringValue: "IVXHOLD",
        },
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional",
        },
      },
    });

    const result = await snsClient.send(command);
    const messageId = result.MessageId || `sns_${Date.now()}`;
    console.log(`[SMS] AWS SNS sent to ${options.to} (${messageId})`);
    return { success: true, provider: "sns", messageId };
  } catch (error: any) {
    console.error("[SMS] AWS SNS error:", error.message || error);
    return { success: false, provider: "sns", error: String(error.message || error) };
  }
}

async function sendViaTwilio(options: SMSOptions): Promise<SMSResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    return { success: false, provider: "twilio", error: "Not configured" };
  }

  const from =
    options.channel === "whatsapp"
      ? `whatsapp:${TWILIO_WHATSAPP_NUMBER || TWILIO_PHONE_NUMBER}`
      : TWILIO_PHONE_NUMBER;

  const to = options.channel === "whatsapp" ? `whatsapp:${options.to}` : options.to;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: options.body }),
      }
    );

    if (response.ok) {
      const data = (await response.json()) as { sid?: string };
      console.log(`[SMS] Twilio sent to ${options.to} via ${options.channel || "sms"} (${data.sid})`);
      return { success: true, provider: "twilio", messageId: data.sid };
    }

    const errorBody = await response.text();
    console.error(`[SMS] Twilio error (${response.status}):`, errorBody);
    return { success: false, provider: "twilio", error: `Status ${response.status}` };
  } catch (error) {
    console.error("[SMS] Twilio request failed:", error);
    return { success: false, provider: "twilio", error: String(error) };
  }
}

export async function sendSMS(options: SMSOptions): Promise<SMSResult> {
  if (isSNSConfigured && options.channel !== "whatsapp") {
    const result = await sendViaSNS(options);
    if (result.success) return result;
    console.warn("[SMS] AWS SNS failed, trying Twilio fallback");
  }

  if (TWILIO_ACCOUNT_SID) {
    const result = await sendViaTwilio(options);
    if (result.success) return result;
  }

  console.log(`[SMS] [CONSOLE-ONLY] To: ${options.to} | Channel: ${options.channel || "sms"} | Body: ${options.body}`);
  return { success: true, provider: "console", messageId: `console_${Date.now()}` };
}

export async function sendOTP(to: string, code: string): Promise<SMSResult> {
  return sendSMS({
    to,
    body: `${APP_NAME}: Your verification code is ${code}. It expires in 5 minutes. Do not share this code.`,
  });
}

export async function sendLoginAlert(to: string, deviceInfo: string): Promise<SMSResult> {
  return sendSMS({
    to,
    body: `${APP_NAME}: New login detected from ${deviceInfo}. If this wasn't you, secure your account immediately.`,
  });
}

export async function sendTransactionAlert(to: string, type: string, amount: number): Promise<SMSResult> {
  return sendSMS({
    to,
    body: `${APP_NAME}: ${type.charAt(0).toUpperCase() + type.slice(1)} of $${amount.toFixed(2)} has been processed. Log in to view details.`,
  });
}
