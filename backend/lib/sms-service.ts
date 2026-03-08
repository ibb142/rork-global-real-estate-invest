import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { store } from "../store/index";

const TOOLKIT_URL = process.env.EXPO_PUBLIC_TOOLKIT_URL || "https://toolkit.rork.com";

async function generateTextViaAPI(prompt: string): Promise<string> {
  try {
    const url = new URL("/agent/chat", TOOLKIT_URL).toString();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`[SmartSMS] Toolkit API error: ${response.status}`);
      throw new Error(`Toolkit API returned ${response.status}`);
    }

    const text = await response.text();
    return text.trim();
  } catch (err) {
    console.error("[SmartSMS] generateTextViaAPI failed:", err);
    throw err;
  }
}

const OWNER_PHONE = "+15616443503";

interface TeamRecipient {
  name: string;
  firstName: string;
  phone: string;
  role: string;
  active: boolean;
  alertTypes: ("hourly" | "emergency" | "manual" | "daily_summary" | "smart_update")[];
}

const TEAM_RECIPIENTS: TeamRecipient[] = [
  {
    name: "Ivan Perez",
    firstName: "Ivan",
    phone: OWNER_PHONE,
    role: "owner",
    active: true,
    alertTypes: ["hourly", "emergency", "manual", "daily_summary", "smart_update"],
  },
  {
    name: "Kimberly Perez",
    firstName: "Kimberly",
    phone: "+15615039752",
    role: "advertising_manager",
    active: true,
    alertTypes: ["hourly", "emergency", "daily_summary", "smart_update"],
  },
  {
    name: "Sharon",
    firstName: "Sharon",
    phone: "+17862109240",
    role: "advertising_partner",
    active: true,
    alertTypes: ["hourly", "emergency", "daily_summary", "smart_update"],
  },
];

const snsClient = new SNSClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

interface SMSLogEntry {
  id: string;
  type: "hourly" | "emergency" | "manual" | "daily_summary" | "smart_update";
  message: string;
  sentAt: string;
  status: "sent" | "failed" | "simulated";
  error?: string;
  recipient?: string;
  recipientPhone?: string;
}

type SmartScheduleMode = "testing" | "live_24_7" | "off";

interface SmartScheduleConfig {
  mode: SmartScheduleMode;
  timesPerDay: number;
  scheduledHoursET: number[];
  startDate: string;
  lastSentTimes: Record<string, string>;
  messageHistory: Array<{ recipient: string; message: string; timestamp: string; context: string }>;
}

const smsLog: SMSLogEntry[] = [];
let hourlyIntervalId: ReturnType<typeof setInterval> | null = null;
let smartScheduleIntervalId: ReturnType<typeof setInterval> | null = null;
let reportingEnabled = true;
let lastHourlyReport = "";

let smartSchedule: SmartScheduleConfig = {
  mode: "testing",
  timesPerDay: 3,
  scheduledHoursET: [8, 13, 18],
  startDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
  lastSentTimes: {},
  messageHistory: [],
};

function truncateSMS(msg: string): string {
  if (msg.length <= 1600) return msg;
  return msg.substring(0, 1597) + "...";
}

function getETHour(): number {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false });
  return parseInt(etStr, 10);
}

function getETDateStr(): string {
  return new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
}

function gatherAppContext(): string {
  const users = store.getAllUsers();
  const allTx = store.getAllTransactions();
  const now = Date.now();
  const hourAgo = now - 3600000;
  const dayAgo = now - 86400000;

  const _recentEvents = store.analyticsEvents.filter(e => new Date(e.timestamp).getTime() >= hourAgo);
  const dayEvents = store.analyticsEvents.filter(e => new Date(e.timestamp).getTime() >= dayAgo);
  const liveSessions = store.getLiveSessions();
  const activeNow = liveSessions.filter(s => now - new Date(s.lastSeen).getTime() < 120000).length;
  const uniqueVisitorsDay = new Set(dayEvents.map(e => e.sessionId)).size;
  const landingViews = dayEvents.filter(e => e.event === "landing_page_view").length;
  const formSubmits = dayEvents.filter(e => e.event === "form_submit").length;
  const ctaClicks = dayEvents.filter(e => e.event.startsWith("cta_")).length;
  const dayTx = allTx.filter(t => new Date(t.createdAt).getTime() >= dayAgo);
  const dayVolume = dayTx.reduce((s, t) => s + Math.abs(t.amount), 0);
  const waitlistCount = store.waitlistEntries.length;
  const openTickets = store.supportTickets.filter(t => t.status === "open").length;

  const topCountries = dayEvents
    .filter(e => e.geo?.country)
    .reduce<Record<string, number>>((acc, e) => {
      const c = e.geo!.country!;
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});
  const topGeo = Object.entries(topCountries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, n]) => `${c}: ${n}`)
    .join(", ");

  return [
    `Active now: ${activeNow}`,
    `Visitors today: ${uniqueVisitorsDay}`,
    `Landing views: ${landingViews}`,
    `Form submissions: ${formSubmits}`,
    `CTA clicks: ${ctaClicks}`,
    `Transactions today: ${dayTx.length} (${dayVolume.toLocaleString()})`,
    `Total users: ${users.length}`,
    `Waitlist: ${waitlistCount}`,
    `Open tickets: ${openTickets}`,
    `Properties: ${store.properties.length}`,
    topGeo ? `Top countries: ${topGeo}` : "",
  ].filter(Boolean).join("\n");
}

async function generateSmartMessage(recipientFirstName: string, role: string, context: string, recentHistory: string[]): Promise<string> {
  const timeET = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

  const prompt = `You are the intelligent AI assistant for IVX Holdings, a global real estate investment platform. Generate a SHORT, professional SMS update for a team member.

Recipient: ${recipientFirstName} (${role})
Current time: ${timeET} ET

App data right now:
${context}

${recentHistory.length > 0 ? `Previous messages sent to ${recipientFirstName} (avoid repeating):\n${recentHistory.slice(0, 5).join("\n")}` : ""}

Rules:
- Address ${recipientFirstName} by first name
- Keep it under 160 characters max
- Be professional, concise, no fluff
- Include 1-2 key metrics that matter for their role
- ${role === "advertising_manager" || role === "advertising_partner" ? "Focus on traffic, leads, engagement, and potential investors" : "Focus on overall performance and key KPIs"}
- Sound human, not robotic
- No emojis except one if appropriate
- Sign off with "— IVX AI"
- If there are real visitors or leads, highlight that
- If nothing notable, give a brief status check

Generate ONLY the SMS text, nothing else.`;

  try {
    const text = await generateTextViaAPI(prompt);
    console.log(`[SmartSMS] AI generated for ${recipientFirstName}: ${text.substring(0, 80)}...`);
    return text.trim();
  } catch (err) {
    console.error(`[SmartSMS] AI generation failed for ${recipientFirstName}:`, err);
    const fallback = `Hi ${recipientFirstName}, IVX status at ${timeET} ET: ${store.getAllUsers().length} users, ${store.analyticsEvents.length > 0 ? "activity detected" : "monitoring active"}. — IVX AI`;
    return fallback;
  }
}

async function sendSmartUpdateToRecipient(recipient: TeamRecipient): Promise<void> {
  const context = gatherAppContext();
  const recentForRecipient = smartSchedule.messageHistory
    .filter(h => h.recipient === recipient.firstName)
    .map(h => h.message);

  const message = await generateSmartMessage(recipient.firstName, recipient.role, context, recentForRecipient);

  const result = await sendToPhone(recipient.phone, message, "smart_update", recipient.name);

  smartSchedule.lastSentTimes[recipient.firstName] = new Date().toISOString();
  smartSchedule.messageHistory.push({
    recipient: recipient.firstName,
    message,
    timestamp: new Date().toISOString(),
    context: context.substring(0, 200),
  });

  if (smartSchedule.messageHistory.length > 100) {
    smartSchedule.messageHistory = smartSchedule.messageHistory.slice(-60);
  }

  console.log(`[SmartSMS] Update sent to ${recipient.name}: success=${result.success}`);
}

async function runSmartScheduleCheck(): Promise<void> {
  if (smartSchedule.mode === "off") return;

  const today = getETDateStr();
  const startDate = new Date(smartSchedule.startDate).toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

  if (new Date(today) < new Date(startDate)) {
    return;
  }

  const currentHourET = getETHour();
  const recipients = TEAM_RECIPIENTS.filter(r => r.active && r.alertTypes.includes("smart_update") && r.role !== "owner");

  for (const scheduledHour of smartSchedule.scheduledHoursET) {
    if (currentHourET !== scheduledHour) continue;

    for (const recipient of recipients) {
      const lastSent = smartSchedule.lastSentTimes[recipient.firstName];
      if (lastSent) {
        const lastSentTime = new Date(lastSent).getTime();
        if (Date.now() - lastSentTime < 3500000) {
          continue;
        }
      }

      console.log(`[SmartSMS] Scheduled send to ${recipient.name} at hour ${scheduledHour} ET`);
      await sendSmartUpdateToRecipient(recipient);
    }
  }
}

export function startSmartSchedule(config?: Partial<SmartScheduleConfig>): void {
  if (config) {
    if (config.mode) smartSchedule.mode = config.mode;
    if (config.timesPerDay) smartSchedule.timesPerDay = config.timesPerDay;
    if (config.scheduledHoursET) smartSchedule.scheduledHoursET = config.scheduledHoursET;
    if (config.startDate) smartSchedule.startDate = config.startDate;
  }

  if (smartScheduleIntervalId) {
    clearInterval(smartScheduleIntervalId);
  }

  smartScheduleIntervalId = setInterval(() => {
    void runSmartScheduleCheck();
  }, 60000);

  console.log(`[SmartSMS] Schedule started: mode=${smartSchedule.mode}, ${smartSchedule.timesPerDay}x/day at hours [${smartSchedule.scheduledHoursET.join(", ")}] ET, start=${smartSchedule.startDate}`);

  const teamNames = TEAM_RECIPIENTS.filter(r => r.active && r.alertTypes.includes("smart_update") && r.role !== "owner").map(r => r.name);
  void sendToPhone(OWNER_PHONE, `IVX Smart AI Messaging ACTIVE\n\nRecipients: ${teamNames.join(", ")}\nSchedule: ${smartSchedule.timesPerDay}x/day at ${smartSchedule.scheduledHoursET.map(h => `${h}:00`).join(", ")} ET\nMode: ${smartSchedule.mode}\nStart: ${smartSchedule.startDate}\n\nAI will send personalized, professional updates.`, "smart_update", "Ivan Perez");
}

export function stopSmartSchedule(): void {
  if (smartScheduleIntervalId) {
    clearInterval(smartScheduleIntervalId);
    smartScheduleIntervalId = null;
  }
  smartSchedule.mode = "off";
  console.log("[SmartSMS] Schedule stopped");
}

export function getSmartScheduleStatus(): {
  mode: SmartScheduleMode;
  timesPerDay: number;
  scheduledHoursET: number[];
  startDate: string;
  running: boolean;
  lastSentTimes: Record<string, string>;
  recentMessages: Array<{ recipient: string; message: string; timestamp: string }>;
  recipients: string[];
} {
  const recipients = TEAM_RECIPIENTS
    .filter(r => r.active && r.alertTypes.includes("smart_update") && r.role !== "owner")
    .map(r => r.name);

  return {
    mode: smartSchedule.mode,
    timesPerDay: smartSchedule.timesPerDay,
    scheduledHoursET: smartSchedule.scheduledHoursET,
    startDate: smartSchedule.startDate,
    running: !!smartScheduleIntervalId,
    lastSentTimes: { ...smartSchedule.lastSentTimes },
    recentMessages: smartSchedule.messageHistory.slice(-10).map(h => ({
      recipient: h.recipient,
      message: h.message,
      timestamp: h.timestamp,
    })),
    recipients,
  };
}

export async function sendSmartUpdateNow(recipientName?: string): Promise<{ success: boolean; sentTo: string[] }> {
  const recipients = TEAM_RECIPIENTS.filter(r =>
    r.active && r.alertTypes.includes("smart_update") && r.role !== "owner" &&
    (!recipientName || r.firstName === recipientName || r.name === recipientName)
  );

  const sentTo: string[] = [];
  for (const r of recipients) {
    await sendSmartUpdateToRecipient(r);
    sentTo.push(r.name);
  }

  return { success: sentTo.length > 0, sentTo };
}

async function sendToPhone(phone: string, message: string, type: SMSLogEntry["type"], recipientName: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const logEntry: SMSLogEntry = {
    id: `sms_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type,
    message: truncateSMS(message),
    sentAt: new Date().toISOString(),
    status: "sent",
    recipient: recipientName,
    recipientPhone: phone,
  };

  try {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.log(`[SMS-SIM] Would send to ${recipientName} (${phone}): ${message.substring(0, 100)}...`);
      logEntry.status = "simulated";
      smsLog.unshift(logEntry);
      if (smsLog.length > 500) smsLog.splice(500);
      return { success: true, messageId: logEntry.id };
    }

    const command = new PublishCommand({
      PhoneNumber: phone,
      Message: truncateSMS(message),
      MessageAttributes: {
        "AWS.SNS.SMS.SenderID": {
          DataType: "String",
          StringValue: "IVX",
        },
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: type === "emergency" ? "Transactional" : "Promotional",
        },
      },
    });

    const result = await snsClient.send(command);
    console.log(`[SMS] Sent ${type} to ${recipientName} (${phone}): msgId=${result.MessageId}`);
    logEntry.status = "sent";
    smsLog.unshift(logEntry);
    if (smsLog.length > 500) smsLog.splice(500);
    return { success: true, messageId: result.MessageId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[SMS] Failed to send ${type} to ${recipientName}:`, errorMsg);
    logEntry.status = "failed";
    logEntry.error = errorMsg;
    smsLog.unshift(logEntry);
    if (smsLog.length > 500) smsLog.splice(500);
    return { success: false, error: errorMsg };
  }
}

export async function sendSMS(message: string, type: SMSLogEntry["type"] = "manual"): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const recipients = TEAM_RECIPIENTS.filter(r => r.active && (r.alertTypes as string[]).includes(type));
  console.log(`[SMS] Broadcasting ${type} to ${recipients.length} recipients: ${recipients.map(r => r.name).join(", ")}`);

  const results = await Promise.allSettled(
    recipients.map(r => sendToPhone(r.phone, message, type, r.name))
  );

  const anySuccess = results.some(r => r.status === "fulfilled" && r.value.success);
  const firstSuccess = results.find(r => r.status === "fulfilled" && r.value.success);
  const firstId = firstSuccess?.status === "fulfilled" ? firstSuccess.value.messageId : undefined;

  return { success: anySuccess, messageId: firstId };
}

function generateHourlyReport(): string {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 3600000);
  const hourStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });

  const users = store.getAllUsers();
  const allTx = store.getAllTransactions();
  const recentTx = allTx.filter(t => new Date(t.createdAt) >= hourAgo);
  const recentVolume = recentTx.reduce((s, t) => s + Math.abs(t.amount), 0);

  const recentEvents = store.analyticsEvents.filter(e => new Date(e.timestamp).getTime() >= hourAgo.getTime());
  const uniqueVisitors = new Set(recentEvents.map(e => e.sessionId)).size;
  const landingViews = recentEvents.filter(e => e.event === "landing_page_view").length;
  const formSubmits = recentEvents.filter(e => e.event === "form_submit").length;
  const ctaClicks = recentEvents.filter(e => e.event.startsWith("cta_")).length;

  const liveSessions = store.getLiveSessions();
  const activeNow = liveSessions.filter(s => Date.now() - new Date(s.lastSeen).getTime() < 60000).length;

  const openTickets = store.supportTickets.filter(t => t.status === "open").length;
  const pendingKyc = users.filter(u => u.kycStatus === "pending").length;
  const waitlistCount = store.waitlistEntries.length;

  const newSignups = recentEvents.filter(e => e.event === "form_submit").length;

  const topCountries = recentEvents
    .filter(e => e.geo?.country)
    .reduce<Record<string, number>>((acc, e) => {
      const c = e.geo!.country!;
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});
  const topCountryList = Object.entries(topCountries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c, n]) => `${c}:${n}`)
    .join(", ");

  const lines = [
    `IVX ${hourStr} ET`,
    ``,
    `LIVE: ${activeNow} active`,
    `TRAFFIC: ${uniqueVisitors} visitors | ${landingViews} views`,
    `ENGAGE: ${ctaClicks} CTAs | ${formSubmits} forms`,
    `TX: ${recentTx.length} trades | $${recentVolume.toLocaleString()}`,
    ``,
    `TOTALS: ${users.length} users | ${store.properties.length} props`,
    `QUEUE: ${openTickets} tickets | ${pendingKyc} KYC | ${waitlistCount} waitlist`,
  ];

  if (topCountryList) {
    lines.push(`GEO: ${topCountryList}`);
  }
  if (newSignups > 0) {
    lines.push(`NEW: ${newSignups} signups this hour`);
  }

  return lines.join("\n");
}

function generateDailySummary(): string {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400000);
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

  const users = store.getAllUsers();
  const allTx = store.getAllTransactions();
  const dayTx = allTx.filter(t => new Date(t.createdAt) >= dayAgo);
  const dayVolume = dayTx.reduce((s, t) => s + Math.abs(t.amount), 0);

  const dayEvents = store.analyticsEvents.filter(e => new Date(e.timestamp).getTime() >= dayAgo.getTime());
  const uniqueVisitors = new Set(dayEvents.map(e => e.sessionId)).size;
  const formSubmits = dayEvents.filter(e => e.event === "form_submit").length;
  const ctaClicks = dayEvents.filter(e => e.event.startsWith("cta_")).length;

  const totalInvested = users.reduce((s, u) => s + u.totalInvested, 0);

  return [
    `IVX DAILY ${dateStr}`,
    ``,
    `VISITORS: ${uniqueVisitors}`,
    `FORMS: ${formSubmits} | CTAs: ${ctaClicks}`,
    `TX: ${dayTx.length} | VOL: $${dayVolume.toLocaleString()}`,
    `USERS: ${users.length} | AUM: $${totalInvested.toLocaleString()}`,
    `TICKETS: ${store.supportTickets.filter(t => t.status === "open").length} open`,
    `WAITLIST: ${store.waitlistEntries.length}`,
  ].join("\n");
}

export async function sendHourlyReport(): Promise<void> {
  if (!reportingEnabled) {
    console.log("[SMS] Hourly reporting disabled, skipping");
    return;
  }

  const report = generateHourlyReport();
  lastHourlyReport = report;
  console.log("[SMS] Sending hourly report");
  await sendSMS(report, "hourly");
}

export async function sendDailySummary(): Promise<void> {
  const summary = generateDailySummary();
  console.log("[SMS] Sending daily summary");
  await sendSMS(summary, "daily_summary");
}

export async function sendEmergencyAlert(subject: string, details: string): Promise<void> {
  const msg = `🚨 IVX ALERT\n\n${subject}\n\n${details}\n\nTime: ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET`;
  console.log(`[SMS] EMERGENCY: ${subject}`);
  await sendSMS(msg, "emergency");
}

function checkForEmergencies(): void {
  const mem = process.memoryUsage();
  const heapUsedMB = mem.heapUsed / 1024 / 1024;
  if (heapUsedMB > 450) {
    void sendEmergencyAlert("HIGH MEMORY", `Heap: ${Math.round(heapUsedMB)}MB — server may restart soon`);
  }

  const recentErrors = store.analyticsEvents
    .filter(e => e.category === "error" && Date.now() - new Date(e.timestamp).getTime() < 300000);
  if (recentErrors.length > 10) {
    void sendEmergencyAlert("ERROR SPIKE", `${recentErrors.length} errors in last 5 min`);
  }
}

export function startHourlyReporting(): void {
  if (hourlyIntervalId) {
    console.log("[SMS] Hourly reporting already running");
    return;
  }

  console.log(`[SMS] Starting hourly reports to ${OWNER_PHONE}`);

  hourlyIntervalId = setInterval(() => {
    void sendHourlyReport();
    checkForEmergencies();
  }, 3600000);

  setInterval(() => {
    checkForEmergencies();
  }, 300000);

  const now = new Date();
  const hour = now.getUTCHours();
  if (hour === 4) {
    void sendDailySummary();
  }

  setInterval(() => {
    const h = new Date().getUTCHours();
    const m = new Date().getUTCMinutes();
    if (h === 4 && m < 2) {
      void sendDailySummary();
    }
  }, 60000);

  void sendSMS(
    `IVX SMS Reports ACTIVE\n\nTeam Recipients:\n${TEAM_RECIPIENTS.filter(r => r.active).map(r => `• ${r.name} (${r.role})`).join("\n")}\n\nYou'll receive:\n• Hourly app reports\n• Emergency alerts 24/7\n• Daily summaries at midnight ET\n\nStarted: ${now.toLocaleString("en-US", { timeZone: "America/New_York" })} ET`,
    "manual"
  );
}

export function stopHourlyReporting(): void {
  if (hourlyIntervalId) {
    clearInterval(hourlyIntervalId);
    hourlyIntervalId = null;
    console.log("[SMS] Hourly reporting stopped");
  }
}

export function setReportingEnabled(enabled: boolean): void {
  reportingEnabled = enabled;
  console.log(`[SMS] Reporting ${enabled ? "enabled" : "disabled"}`);
}

export function getSMSLog(): SMSLogEntry[] {
  return smsLog;
}

export function getReportingStatus(): {
  enabled: boolean;
  running: boolean;
  phone: string;
  totalSent: number;
  totalFailed: number;
  lastReport: string;
  lastReportTime: string | null;
  recipients: { name: string; phone: string; role: string; active: boolean; alertTypes: string[] }[];
  smartSchedule: ReturnType<typeof getSmartScheduleStatus>;
} {
  const lastSent = smsLog.find(e => e.status === "sent" || e.status === "simulated");
  return {
    enabled: reportingEnabled,
    running: !!hourlyIntervalId,
    phone: OWNER_PHONE,
    totalSent: smsLog.filter(e => e.status === "sent" || e.status === "simulated").length,
    totalFailed: smsLog.filter(e => e.status === "failed").length,
    lastReport: lastHourlyReport,
    lastReportTime: lastSent?.sentAt || null,
    recipients: TEAM_RECIPIENTS.map(r => ({
      name: r.name,
      phone: r.phone,
      role: r.role,
      active: r.active,
      alertTypes: r.alertTypes as string[],
    })),
    smartSchedule: getSmartScheduleStatus(),
  };
}

export type { SMSLogEntry, SmartScheduleMode, SmartScheduleConfig };
