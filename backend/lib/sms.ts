import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
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
  console.log("[SMS] AWS SNS not configured — SMS will be logged to console");
}

interface SMSOptions {
  to: string;
  body: string;
  channel?: "sms" | "whatsapp";
}

interface SMSResult {
  success: boolean;
  provider: "sns" | "console";
  messageId?: string;
  error?: string;
}

async function sendViaSNS(options: SMSOptions): Promise<SMSResult> {
  if (!snsClient) return { success: false, provider: "sns", error: "AWS SNS not configured" };

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

export async function sendSMS(options: SMSOptions): Promise<SMSResult> {
  if (isSNSConfigured) {
    const result = await sendViaSNS(options);
    if (result.success) return result;
    console.warn("[SMS] AWS SNS failed, falling back to console log");
  }

  console.log(`[SMS] [CONSOLE-LOG] To: ${options.to} | Channel: ${options.channel || "sms"} | Body: ${options.body}`);
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
