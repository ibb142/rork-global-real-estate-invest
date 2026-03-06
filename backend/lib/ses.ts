import {
  SESClient,
  SendEmailCommand,
  VerifyDomainIdentityCommand,
  VerifyDomainDkimCommand,
  GetIdentityVerificationAttributesCommand,
  GetSendQuotaCommand,
  GetSendStatisticsCommand,
  ListIdentitiesCommand,
} from "@aws-sdk/client-ses";

const rawRegion = (process.env.AWS_REGION || "").trim();
const SES_REGION = /^[a-z]{2}-[a-z]+-\d$/.test(rawRegion) ? rawRegion : "us-east-1";

function makeSESClient(): SESClient | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    console.warn("[SES] AWS credentials not configured");
    return null;
  }
  return new SESClient({
    region: SES_REGION,
    credentials: { accessKeyId, secretAccessKey },
  });
}

let sesClient: SESClient | null = null;

function getClient(): SESClient | null {
  if (!sesClient) {
    sesClient = makeSESClient();
  }
  return sesClient;
}

export interface SESSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sesSendEmail(params: {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  replyTo?: string[];
}): Promise<SESSendResult> {
  const client = getClient();
  if (!client) {
    console.error("[SES] No SES client available");
    return { success: false, error: "AWS SES not configured" };
  }

  const source = params.fromName
    ? `${params.fromName} <${params.from}>`
    : params.from;

  try {
    console.log(`[SES] Sending email from ${source} to ${params.to.join(", ")}`);

    const command = new SendEmailCommand({
      Source: source,
      Destination: {
        ToAddresses: params.to,
        CcAddresses: params.cc && params.cc.length > 0 ? params.cc : undefined,
        BccAddresses: params.bcc && params.bcc.length > 0 ? params.bcc : undefined,
      },
      Message: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: params.bodyHtml, Charset: "UTF-8" },
          ...(params.bodyText
            ? { Text: { Data: params.bodyText, Charset: "UTF-8" } }
            : {}),
        },
      },
      ReplyToAddresses: params.replyTo && params.replyTo.length > 0 ? params.replyTo : undefined,
    });

    const result = await client.send(command);
    console.log(`[SES] Email sent successfully. MessageId: ${result.MessageId}`);
    return { success: true, messageId: result.MessageId };
  } catch (err: any) {
    console.error("[SES] Send email failed:", err.name, err.message);

    if (err.name === "MessageRejected") {
      return { success: false, error: `Email rejected: ${err.message}` };
    }
    if (err.name === "MailFromDomainNotVerifiedException") {
      return { success: false, error: "Domain not verified in SES. Please verify ivxholding.com first." };
    }
    if (err.name === "AccountSendingPausedException") {
      return { success: false, error: "SES sending is paused. Request production access in AWS console." };
    }

    return { success: false, error: err.message || "Unknown SES error" };
  }
}

export async function sesVerifyDomain(domain: string): Promise<{
  success: boolean;
  verificationToken?: string;
  dkimTokens?: string[];
  error?: string;
}> {
  const client = getClient();
  if (!client) {
    return { success: false, error: "AWS SES not configured" };
  }

  try {
    console.log(`[SES] Verifying domain: ${domain}`);

    const verifyResult = await client.send(
      new VerifyDomainIdentityCommand({ Domain: domain })
    );

    const dkimResult = await client.send(
      new VerifyDomainDkimCommand({ Domain: domain })
    );

    console.log(`[SES] Domain verification initiated for ${domain}`);
    console.log(`[SES] Verification token: ${verifyResult.VerificationToken}`);
    console.log(`[SES] DKIM tokens: ${dkimResult.DkimTokens?.join(", ")}`);

    return {
      success: true,
      verificationToken: verifyResult.VerificationToken,
      dkimTokens: dkimResult.DkimTokens,
    };
  } catch (err: any) {
    console.error("[SES] Domain verification failed:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sesGetDomainStatus(domain: string): Promise<{
  verified: boolean;
  status: string;
  error?: string;
}> {
  const client = getClient();
  if (!client) {
    return { verified: false, status: "not_configured", error: "AWS SES not configured" };
  }

  try {
    const result = await client.send(
      new GetIdentityVerificationAttributesCommand({
        Identities: [domain],
      })
    );

    const attrs = result.VerificationAttributes?.[domain];
    if (!attrs) {
      return { verified: false, status: "not_found" };
    }

    const status = attrs.VerificationStatus || "Unknown";
    console.log(`[SES] Domain ${domain} status: ${status}`);
    return {
      verified: status === "Success",
      status,
    };
  } catch (err: any) {
    console.error("[SES] Get domain status failed:", err.message);
    return { verified: false, status: "error", error: err.message };
  }
}

export async function sesGetSendQuota(): Promise<{
  max24HourSend: number;
  maxSendRate: number;
  sentLast24Hours: number;
  error?: string;
}> {
  const client = getClient();
  if (!client) {
    return { max24HourSend: 0, maxSendRate: 0, sentLast24Hours: 0, error: "AWS SES not configured" };
  }

  try {
    const result = await client.send(new GetSendQuotaCommand({}));
    console.log(`[SES] Quota: ${result.SentLast24Hours}/${result.Max24HourSend}, rate: ${result.MaxSendRate}/sec`);
    return {
      max24HourSend: result.Max24HourSend ?? 0,
      maxSendRate: result.MaxSendRate ?? 0,
      sentLast24Hours: result.SentLast24Hours ?? 0,
    };
  } catch (err: any) {
    console.error("[SES] Get send quota failed:", err.message);
    return { max24HourSend: 0, maxSendRate: 0, sentLast24Hours: 0, error: err.message };
  }
}

export async function sesGetSendStats(): Promise<{
  dataPoints: {
    timestamp: string;
    deliveryAttempts: number;
    bounces: number;
    complaints: number;
    rejects: number;
  }[];
  error?: string;
}> {
  const client = getClient();
  if (!client) {
    return { dataPoints: [], error: "AWS SES not configured" };
  }

  try {
    const result = await client.send(new GetSendStatisticsCommand({}));
    const dataPoints = (result.SendDataPoints || []).map((dp) => ({
      timestamp: dp.Timestamp?.toISOString() ?? "",
      deliveryAttempts: dp.DeliveryAttempts ?? 0,
      bounces: dp.Bounces ?? 0,
      complaints: dp.Complaints ?? 0,
      rejects: dp.Rejects ?? 0,
    }));
    return { dataPoints };
  } catch (err: any) {
    console.error("[SES] Get send stats failed:", err.message);
    return { dataPoints: [], error: err.message };
  }
}

export async function sesListIdentities(): Promise<{
  identities: string[];
  error?: string;
}> {
  const client = getClient();
  if (!client) {
    return { identities: [], error: "AWS SES not configured" };
  }

  try {
    const result = await client.send(new ListIdentitiesCommand({ IdentityType: "Domain" }));
    return { identities: result.Identities ?? [] };
  } catch (err: any) {
    console.error("[SES] List identities failed:", err.message);
    return { identities: [], error: err.message };
  }
}

export function isSESConfigured(): boolean {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}
