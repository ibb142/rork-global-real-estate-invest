/**
 * =============================================================================
 * ALERTS ROUTER - backend/trpc/routes/alerts.ts
 * =============================================================================
 * 
 * Handles SMS/WhatsApp alert delivery via Twilio.
 * Manages alert rules, settings, and delivery.
 * =============================================================================
 */

import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../create-context";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

const sendTwilioSMS = async (to: string, body: string): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.log('[Alerts] Twilio not configured, simulating SMS send');
    return { success: true, messageId: `sim-${Date.now()}` };
  }

  try {
    const formattedPhone = to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`;
    
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: formattedPhone,
          From: TWILIO_PHONE_NUMBER,
          Body: body,
        }),
      }
    );

    const data = await response.json();
    
    if (response.ok) {
      console.log(`[Alerts] SMS sent successfully: ${data.sid}`);
      return { success: true, messageId: data.sid };
    } else {
      console.error('[Alerts] Twilio SMS error:', data);
      return { success: false, error: data.message || 'Failed to send SMS' };
    }
  } catch (error) {
    console.error('[Alerts] SMS send error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

const sendTwilioWhatsApp = async (to: string, body: string): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log('[Alerts] Twilio not configured, simulating WhatsApp send');
    return { success: true, messageId: `sim-wa-${Date.now()}` };
  }

  try {
    const formattedPhone = to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`;
    
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: `whatsapp:${formattedPhone}`,
          From: TWILIO_WHATSAPP_NUMBER,
          Body: body,
        }),
      }
    );

    const data = await response.json();
    
    if (response.ok) {
      console.log(`[Alerts] WhatsApp sent successfully: ${data.sid}`);
      return { success: true, messageId: data.sid };
    } else {
      console.error('[Alerts] Twilio WhatsApp error:', data);
      return { success: false, error: data.message || 'Failed to send WhatsApp' };
    }
  } catch (error) {
    console.error('[Alerts] WhatsApp send error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const alertsRouter = createTRPCRouter({
  sendSMS: protectedProcedure
    .input(z.object({
      phone: z.string(),
      message: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log(`[Alerts] Sending SMS to ${input.phone}`);
      const result = await sendTwilioSMS(input.phone, input.message);
      return result;
    }),

  sendWhatsApp: protectedProcedure
    .input(z.object({
      phone: z.string(),
      message: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log(`[Alerts] Sending WhatsApp to ${input.phone}`);
      const result = await sendTwilioWhatsApp(input.phone, input.message);
      return result;
    }),

  sendAlert: protectedProcedure
    .input(z.object({
      phone: z.string(),
      message: z.string(),
      channels: z.array(z.enum(['sms', 'whatsapp', 'email'])),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
    }))
    .mutation(async ({ input }) => {
      const results: Record<string, { success: boolean; messageId?: string; error?: string }> = {};

      if (input.channels.includes('sms')) {
        results.sms = await sendTwilioSMS(input.phone, input.message);
      }

      if (input.channels.includes('whatsapp')) {
        results.whatsapp = await sendTwilioWhatsApp(input.phone, input.message);
      }

      if (input.channels.includes('email')) {
        results.email = { success: true, messageId: `email-${Date.now()}` };
      }

      return {
        success: Object.values(results).some(r => r.success),
        results,
      };
    }),

  testConnection: protectedProcedure
    .input(z.object({
      phone: z.string(),
      channel: z.enum(['sms', 'whatsapp']),
    }))
    .mutation(async ({ input }) => {
      const testMessage = `🔔 IVX HOLDINGS Alert Test\n\nThis is a test message to verify your ${input.channel.toUpperCase()} alerts are working correctly.\n\nTime: ${new Date().toLocaleString()}`;

      if (input.channel === 'sms') {
        return await sendTwilioSMS(input.phone, testMessage);
      } else {
        return await sendTwilioWhatsApp(input.phone, testMessage);
      }
    }),

  getDeliveryStatus: publicProcedure
    .input(z.object({
      messageId: z.string(),
    }))
    .query(async ({ input }) => {
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        return { status: 'simulated', deliveredAt: new Date().toISOString() };
      }

      try {
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages/${input.messageId}.json`,
          {
            headers: {
              'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
            },
          }
        );

        const data = await response.json();
        return {
          status: data.status,
          deliveredAt: data.date_sent,
          errorCode: data.error_code,
          errorMessage: data.error_message,
        };
      } catch (error) {
        return { status: 'unknown', error: 'Failed to fetch status' };
      }
    }),
});
