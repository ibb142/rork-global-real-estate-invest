import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { getSupabaseAdmin, isServiceRoleConfigured } from "../../../lib/supabase-admin";

const geoSchema = z.object({
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  timezone: z.string().optional(),
  ip: z.string().optional(),
  org: z.string().optional(),
}).optional();

const propertiesSchema = z.record(z.string(), z.unknown()).optional();

async function insertLandingEvent(params: {
  event: string;
  session_id: string;
  properties?: Record<string, unknown>;
  geo?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  if (!isServiceRoleConfigured()) {
    console.log("[Analytics] Service role not configured — cannot write to landing_analytics");
    return { success: false, error: "service_role not configured" };
  }

  try {
    const admin = getSupabaseAdmin();

    const row: Record<string, unknown> = {
      event: params.event,
      session_id: params.session_id,
      properties: params.properties ? JSON.stringify(params.properties) : null,
      geo: params.geo ? JSON.stringify(params.geo) : null,
      created_at: new Date().toISOString(),
    };

    const { error } = await admin.from("landing_analytics").insert(row);

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        console.log("[Analytics] landing_analytics table does not exist — creating it now");
        await ensureLandingAnalyticsTable(admin);
        const retry = await admin.from("landing_analytics").insert(row);
        if (retry.error) {
          console.error("[Analytics] Insert failed after table creation:", retry.error.message);
          return { success: false, error: retry.error.message };
        }
        console.log("[Analytics] Event inserted after table creation:", params.event);
        return { success: true };
      }

      if (error.code === "42703" || error.message?.includes("column")) {
        console.log("[Analytics] Schema mismatch, trying minimal insert:", error.message);
        const minimalRow = {
          event: params.event,
          session_id: params.session_id,
          properties: params.properties ? JSON.stringify(params.properties) : null,
          created_at: new Date().toISOString(),
        };
        const retry = await admin.from("landing_analytics").insert(minimalRow);
        if (retry.error) {
          console.error("[Analytics] Minimal insert also failed:", retry.error.message);
          return { success: false, error: retry.error.message };
        }
        return { success: true };
      }

      console.error("[Analytics] Insert error:", error.code, error.message);
      return { success: false, error: error.message };
    }

    console.log("[Analytics] Event stored:", params.event, "session:", params.session_id.substring(0, 12));
    return { success: true };
  } catch (err) {
    console.error("[Analytics] insertLandingEvent exception:", (err as Error)?.message);
    return { success: false, error: (err as Error)?.message };
  }
}

async function ensureLandingAnalyticsTable(admin: ReturnType<typeof getSupabaseAdmin>): Promise<void> {
  try {
    const createSQL = `
      CREATE TABLE IF NOT EXISTS landing_analytics (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        event text NOT NULL DEFAULT 'unknown',
        session_id text NOT NULL DEFAULT 'unknown',
        properties jsonb,
        geo jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_landing_analytics_event ON landing_analytics(event);
      CREATE INDEX IF NOT EXISTS idx_landing_analytics_session ON landing_analytics(session_id);
      CREATE INDEX IF NOT EXISTS idx_landing_analytics_created ON landing_analytics(created_at DESC);
      ALTER TABLE landing_analytics ENABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'landing_analytics' AND policyname = 'landing_analytics_select_authenticated') THEN
          CREATE POLICY landing_analytics_select_authenticated ON landing_analytics FOR SELECT TO authenticated USING (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'landing_analytics' AND policyname = 'landing_analytics_insert_service') THEN
          CREATE POLICY landing_analytics_insert_service ON landing_analytics FOR INSERT TO service_role WITH CHECK (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'landing_analytics' AND policyname = 'landing_analytics_insert_anon') THEN
          CREATE POLICY landing_analytics_insert_anon ON landing_analytics FOR INSERT TO anon WITH CHECK (true);
        END IF;
      END $$;
    `;
    try {
      await admin.rpc("exec_sql", { sql: createSQL });
    } catch {
      console.log("[Analytics] exec_sql RPC not available — table must be created via SQL editor");
    }
  } catch (err) {
    console.log("[Analytics] Table creation attempt:", (err as Error)?.message);
  }
}

const _heartbeatSessions = new Map<string, { lastSeen: number; data: Record<string, unknown> }>();
const HEARTBEAT_STALE_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  const keys = Array.from(_heartbeatSessions.keys());
  for (const key of keys) {
    const entry = _heartbeatSessions.get(key);
    if (entry && now - entry.lastSeen > HEARTBEAT_STALE_MS) {
      _heartbeatSessions.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`[Analytics] Cleaned ${cleaned} stale heartbeat sessions`);
}, 60_000);

export const analyticsRouter = createTRPCRouter({
  trackVisit: publicProcedure
    .input(z.object({
      event: z.string().max(200),
      sessionId: z.string().max(200),
      page: z.string().max(500).optional(),
      section: z.string().max(200).optional(),
      referrer: z.string().max(2000).optional(),
      userAgent: z.string().max(1000).optional(),
      properties: propertiesSchema,
      geo: geoSchema,
    }))
    .mutation(async ({ input }) => {
      console.log("[Analytics.trackVisit]", input.event, "session:", input.sessionId.substring(0, 12));

      const properties: Record<string, unknown> = {
        ...(input.properties || {}),
        page: input.page || "/landing",
        section: input.section || "general",
        referrer: input.referrer || "direct",
        userAgent: input.userAgent?.substring(0, 500),
        platform: "web",
        source: "landing",
      };

      const result = await insertLandingEvent({
        event: input.event,
        session_id: input.sessionId,
        properties,
        geo: input.geo as Record<string, unknown> | undefined,
      });

      _heartbeatSessions.set(input.sessionId, {
        lastSeen: Date.now(),
        data: {
          sessionId: input.sessionId,
          device: detectDeviceFromUA(input.userAgent),
          os: detectOSFromUA(input.userAgent),
          browser: detectBrowserFromUA(input.userAgent),
          geo: input.geo,
          currentStep: 0,
          startedAt: new Date().toISOString(),
        },
      });

      return {
        success: result.success,
        tracked: result.success,
        visitor: {
          sessionId: input.sessionId,
          isNew: true,
        },
      };
    }),

  trackLanding: publicProcedure
    .input(z.object({
      event: z.string().max(200),
      sessionId: z.string().max(200),
      properties: propertiesSchema,
      geo: geoSchema,
    }))
    .mutation(async ({ input }) => {
      console.log("[Analytics.trackLanding]", input.event, "session:", input.sessionId.substring(0, 12));

      const properties: Record<string, unknown> = {
        ...(input.properties || {}),
        platform: "web",
        source: "landing",
      };

      const result = await insertLandingEvent({
        event: input.event,
        session_id: input.sessionId,
        properties,
        geo: input.geo as Record<string, unknown> | undefined,
      });

      return { success: result.success, tracked: result.success };
    }),

  trackHeartbeat: publicProcedure
    .input(z.object({
      sessionId: z.string().max(200),
      userAgent: z.string().max(1000).optional(),
      properties: propertiesSchema,
      geo: geoSchema,
    }))
    .mutation(async ({ input }) => {
      const existing = _heartbeatSessions.get(input.sessionId);
      const now = Date.now();

      _heartbeatSessions.set(input.sessionId, {
        lastSeen: now,
        data: {
          ...(existing?.data || {}),
          sessionId: input.sessionId,
          device: detectDeviceFromUA(input.userAgent),
          os: detectOSFromUA(input.userAgent),
          browser: detectBrowserFromUA(input.userAgent),
          geo: input.geo,
          currentStep: (input.properties as Record<string, unknown>)?.currentStep ?? 0,
          sessionDuration: (input.properties as Record<string, unknown>)?.sessionDuration ?? 0,
          activeTime: (input.properties as Record<string, unknown>)?.activeTime ?? 0,
          engagementScore: (input.properties as Record<string, unknown>)?.engagementScore ?? 0,
          lastSeen: new Date().toISOString(),
        },
      });

      const shouldStore = !existing || (now - existing.lastSeen > 30_000);
      if (shouldStore) {
        await insertLandingEvent({
          event: "heartbeat",
          session_id: input.sessionId,
          properties: {
            ...(input.properties || {}),
            platform: "web",
            source: "landing",
            type: "heartbeat",
          },
          geo: input.geo as Record<string, unknown> | undefined,
        });
      }

      return {
        success: true,
        activeSessions: _heartbeatSessions.size,
      };
    }),

  getLiveSessions: publicProcedure.query(() => {
    const now = Date.now();
    const activeSessions: Record<string, unknown>[] = [];

    const entries = Array.from(_heartbeatSessions.values());
    for (const entry of entries) {
      if (now - entry.lastSeen < HEARTBEAT_STALE_MS) {
        activeSessions.push({
          ...entry.data,
          isActive: now - entry.lastSeen < 60_000,
          lastSeenAgo: Math.round((now - entry.lastSeen) / 1000),
        });
      }
    }

    return {
      active: activeSessions.filter((s) => (s as { isActive: boolean }).isActive).length,
      recent: activeSessions.length,
      sessions: activeSessions,
      timestamp: new Date().toISOString(),
    };
  }),
});

function detectDeviceFromUA(ua?: string): string {
  if (!ua) return "Unknown";
  const lower = ua.toLowerCase();
  if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android")) return "Mobile";
  if (lower.includes("tablet") || lower.includes("ipad")) return "Tablet";
  return "Desktop";
}

function detectOSFromUA(ua?: string): string {
  if (!ua) return "Unknown";
  const lower = ua.toLowerCase();
  if (lower.includes("windows")) return "Windows";
  if (lower.includes("mac os") || lower.includes("macintosh")) return "macOS";
  if (lower.includes("linux")) return "Linux";
  if (lower.includes("iphone") || lower.includes("ipad")) return "iOS";
  if (lower.includes("android")) return "Android";
  return "Unknown";
}

function detectBrowserFromUA(ua?: string): string {
  if (!ua) return "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  return "Unknown";
}
