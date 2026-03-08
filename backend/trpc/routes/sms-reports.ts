import * as z from "zod";
import { createTRPCRouter, ceoProcedure, adminProcedure } from "../create-context";
import {
  sendSMS,
  sendHourlyReport,
  sendDailySummary,
  sendEmergencyAlert,
  startHourlyReporting,
  stopHourlyReporting,
  setReportingEnabled,
  getSMSLog,
  getReportingStatus,
  startSmartSchedule,
  stopSmartSchedule,
  getSmartScheduleStatus,
  sendSmartUpdateNow,
} from "../../lib/sms-service";

export const smsReportsRouter = createTRPCRouter({
  getStatus: adminProcedure
    .query(async () => {
      console.log("[SMSReports] Fetching status");
      return getReportingStatus();
    }),

  getLog: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(25),
      type: z.enum(["all", "hourly", "emergency", "manual", "daily_summary", "smart_update"]).default("all"),
    }))
    .query(async ({ input }) => {
      console.log("[SMSReports] Fetching log:", input.type, "page:", input.page);
      let logs = getSMSLog();
      if (input.type !== "all") {
        logs = logs.filter(l => l.type === input.type);
      }
      const total = logs.length;
      const start = (input.page - 1) * input.limit;
      const items = logs.slice(start, start + input.limit);
      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
      };
    }),

  startReporting: ceoProcedure
    .mutation(async () => {
      console.log("[SMSReports] Starting hourly reporting");
      startHourlyReporting();
      return { success: true, message: "Hourly SMS reporting started" };
    }),

  stopReporting: ceoProcedure
    .mutation(async () => {
      console.log("[SMSReports] Stopping hourly reporting");
      stopHourlyReporting();
      return { success: true, message: "Hourly SMS reporting stopped" };
    }),

  toggleEnabled: ceoProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      console.log("[SMSReports] Toggle reporting:", input.enabled);
      setReportingEnabled(input.enabled);
      return { success: true, enabled: input.enabled };
    }),

  sendNow: ceoProcedure
    .mutation(async () => {
      console.log("[SMSReports] Sending immediate hourly report");
      await sendHourlyReport();
      return { success: true, message: "Hourly report sent" };
    }),

  sendDailySummary: ceoProcedure
    .mutation(async () => {
      console.log("[SMSReports] Sending daily summary");
      await sendDailySummary();
      return { success: true, message: "Daily summary sent" };
    }),

  sendEmergency: ceoProcedure
    .input(z.object({
      subject: z.string().min(1).max(100),
      details: z.string().min(1).max(500),
    }))
    .mutation(async ({ input }) => {
      console.log("[SMSReports] Sending emergency alert:", input.subject);
      await sendEmergencyAlert(input.subject, input.details);
      return { success: true, message: "Emergency alert sent" };
    }),

  sendCustom: ceoProcedure
    .input(z.object({
      message: z.string().min(1).max(1600),
    }))
    .mutation(async ({ input }) => {
      console.log("[SMSReports] Sending custom SMS");
      const result = await sendSMS(input.message, "manual");
      return result;
    }),

  getSmartSchedule: adminProcedure
    .query(async () => {
      console.log("[SMSReports] Fetching smart schedule status");
      return getSmartScheduleStatus();
    }),

  startSmartSchedule: ceoProcedure
    .input(z.object({
      mode: z.enum(["testing", "live_24_7"]).default("testing"),
      timesPerDay: z.number().min(1).max(24).default(3),
      scheduledHoursET: z.array(z.number().min(0).max(23)).optional(),
      startDate: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      console.log("[SMSReports] Starting smart AI schedule:", input);
      startSmartSchedule(input ? {
        mode: input.mode,
        timesPerDay: input.timesPerDay,
        scheduledHoursET: input.scheduledHoursET,
        startDate: input.startDate,
      } : undefined);
      return { success: true, status: getSmartScheduleStatus() };
    }),

  stopSmartSchedule: ceoProcedure
    .mutation(async () => {
      console.log("[SMSReports] Stopping smart schedule");
      stopSmartSchedule();
      return { success: true };
    }),

  sendSmartNow: ceoProcedure
    .input(z.object({
      recipientName: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      console.log("[SMSReports] Sending smart update now to:", input?.recipientName || "all");
      const result = await sendSmartUpdateNow(input?.recipientName);
      return result;
    }),
});
