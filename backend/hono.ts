import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { compress } from "hono/compress";
import { requestId } from "hono/request-id";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { validateEnv, logEnvStatus } from "./lib/env";
import { verifyToken } from "./lib/jwt";
import { store } from "./store/index";
import { captureError, logSentryStatus } from "./lib/sentry";
import { runStagingChecklist } from "./lib/staging-checklist";
import { runAWSProductionSetup, getAWSSetupStatus, getIAMPolicyDocument, PROD_BUCKET_NAME, PROD_REGION } from "./lib/aws-setup";
import { parseUserAgent, getClientIP } from "./lib/ua-parser";
import { startHourlyReporting } from "./lib/sms-service";

logEnvStatus();
logSentryStatus();

store.init().then(() => {
  console.log('[App] Store initialized — ready to serve requests');
  startHourlyReporting();
}).catch((err) => {
  console.error('[App] Store initialization failed:', err.message);
});

runAWSProductionSetup().then((result) => {
  if (result.success) {
    console.log(`[AWS] Production S3 ready: bucket=${result.bucket} region=${result.region}`);
  } else if (result.steps[0]?.status === "skip") {
    console.log("[AWS] Running in local storage mode (no AWS credentials)");
  } else {
    console.warn("[AWS] Production setup completed with issues — check /aws-status");
  }
}).catch((err) => {
  console.error("[AWS] Production setup error:", err.message);
});

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60000;
const MAX_STORE_SIZE = 50000;

const rateLimit = (limit: number, windowMs: number) => {
  return async (c: any, next: any) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
               c.req.header("x-real-ip") ||
               c.req.header("cf-connecting-ip") ||
               "unknown";
    const now = Date.now();
    const record = rateLimitStore.get(ip);

    if (record && now < record.resetTime) {
      if (record.count >= limit) {
        c.header("Retry-After", String(Math.ceil((record.resetTime - now) / 1000)));
        c.header("X-RateLimit-Limit", String(limit));
        c.header("X-RateLimit-Remaining", "0");
        return c.json({ error: "Too many requests", retryAfter: Math.ceil((record.resetTime - now) / 1000) }, 429);
      }
      record.count++;
      c.header("X-RateLimit-Remaining", String(limit - record.count));
    } else {
      rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
      c.header("X-RateLimit-Remaining", String(limit - 1));
    }

    c.header("X-RateLimit-Limit", String(limit));

    if (now - lastCleanup > CLEANUP_INTERVAL && rateLimitStore.size > MAX_STORE_SIZE / 2) {
      lastCleanup = now;
      const keysToDelete: string[] = [];
      for (const [key, value] of rateLimitStore.entries()) {
        if (value.resetTime < now) keysToDelete.push(key);
      }
      keysToDelete.forEach(key => rateLimitStore.delete(key));
      console.log(`[RateLimit] Cleaned ${keysToDelete.length} expired entries`);
    }

    await next();
  };
};

const app = new Hono();

app.use("*", requestId());
app.use("*", logger());
app.use("*", timing());
app.use("*", secureHeaders());
app.use("*", compress());
const _IS_PRODUCTION = process.env.NODE_ENV === 'production';
const APP_VERSION = "1.0.1";
const START_TIME = Date.now();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [];

app.use("*", cors({
  origin: (origin) => {
    if (!origin) return '*';
    if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return origin;
    if (ALLOWED_ORIGINS.length > 0) {
      console.warn(`[CORS] Origin not in allowlist: ${origin}`);
    }
    return origin;
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["X-Request-Id", "X-Response-Time", "X-RateLimit-Remaining"],
  maxAge: 86400,
  credentials: true,
}));

app.use("/trpc/*", rateLimit(100, 60000));

app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  }),
);

app.post("/track/heartbeat", async (c) => {
  try {
    const body = await c.req.json();
    const headers = c.req.raw.headers;
    const ip = getClientIP(headers);
    const rawUA = headers.get('user-agent') || body.userAgent || '';
    const parsed = parseUserAgent(rawUA);

    const sessionId = body.sessionId || `s_${Date.now()}`;
    const now = new Date().toISOString();

    store.updateLiveSession({
      sessionId,
      ip,
      device: parsed.device,
      os: parsed.os,
      browser: parsed.browser,
      geo: body.geo,
      currentStep: body.properties?.currentStep ?? 0,
      sessionDuration: body.properties?.sessionDuration ?? 0,
      activeTime: body.properties?.activeTime ?? 0,
      lastSeen: now,
      startedAt: undefined,
    });

    return c.json({ success: true });
  } catch {
    return c.json({ success: false }, 500);
  }
});

app.get("/track/live-sessions", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const payload = verifyToken(authHeader.slice(7));
  if (!payload || (payload.role !== "owner" && payload.role !== "ceo" && payload.role !== "staff" && payload.role !== "manager" && payload.role !== "analyst")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sessions = store.getLiveSessions();
  const now = Date.now();
  const activeSessions = sessions.filter(s => now - new Date(s.lastSeen).getTime() < 60000);
  const recentSessions = sessions.filter(s => now - new Date(s.lastSeen).getTime() < 300000);

  const byCountry: Record<string, number> = {};
  const byDevice: Record<string, number> = {};
  const byStep: Record<string, number> = {};

  activeSessions.forEach(s => {
    const country = s.geo?.country || 'Unknown';
    byCountry[country] = (byCountry[country] || 0) + 1;
    byDevice[s.device] = (byDevice[s.device] || 0) + 1;
    const stepKey = `Step ${s.currentStep}`;
    byStep[stepKey] = (byStep[stepKey] || 0) + 1;
  });

  return c.json({
    active: activeSessions.length,
    recent: recentSessions.length,
    sessions: recentSessions.map(s => ({
      sessionId: s.sessionId,
      ip: s.ip,
      device: s.device,
      os: s.os,
      browser: s.browser,
      geo: s.geo,
      currentStep: s.currentStep,
      sessionDuration: s.sessionDuration,
      activeTime: s.activeTime,
      lastSeen: s.lastSeen,
      startedAt: s.startedAt,
      isActive: now - new Date(s.lastSeen).getTime() < 60000,
    })),
    breakdown: {
      byCountry: Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([country, count]) => ({ country, count })),
      byDevice: Object.entries(byDevice).sort((a, b) => b[1] - a[1]).map(([device, count]) => ({ device, count })),
      byStep: Object.entries(byStep).sort((a, b) => b[1] - a[1]).map(([step, count]) => ({ step, count })),
    },
    timestamp: new Date().toISOString(),
  });
});

app.post("/track/visit", async (c) => {
  try {
    const body = await c.req.json();
    const headers = c.req.raw.headers;
    const ip = getClientIP(headers);
    const rawUA = headers.get('user-agent') || body.userAgent || '';
    const parsed = parseUserAgent(rawUA);
    const refHeader = headers.get('referer') || headers.get('referrer') || '';

    const entry = {
      id: `vis_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      sessionId: body.sessionId || `s_${Date.now()}`,
      ip,
      userAgent: rawUA,
      browser: parsed.browser,
      browserVersion: parsed.browserVersion,
      os: parsed.os,
      osVersion: parsed.osVersion,
      device: parsed.device,
      deviceModel: parsed.deviceModel,
      isBot: parsed.isBot,
      referrer: body.referrer || refHeader || 'direct',
      page: body.page || '/landing',
      event: body.event || 'page_view',
      geo: body.geo || undefined,
      timestamp: new Date().toISOString(),
    };

    store.addVisitorLog(entry);

    const evt = {
      id: store.genId('evt'),
      userId: 'landing_visitor',
      event: body.event || 'landing_page_view',
      category: 'page_view' as const,
      properties: {
        platform: parsed.device === 'Desktop' ? 'web' : parsed.os === 'iOS' || parsed.os === 'iPadOS' ? 'ios' : parsed.os === 'Android' ? 'android' : 'web',
        referrer: entry.referrer,
        userAgent: rawUA,
        ip,
        browser: parsed.browser,
        os: parsed.os,
        device: parsed.device,
        section: body.section || 'hero',
        ...body.properties,
      },
      sessionId: entry.sessionId,
      timestamp: entry.timestamp,
      geo: body.geo,
    };
    store.addAnalyticsEvent(evt);

    console.log(`[Track] ${ip} | ${parsed.device} ${parsed.os} ${parsed.browser} | ${entry.event} | ${body.geo?.city || 'unknown'}, ${body.geo?.country || 'unknown'}`);

    return c.json({
      success: true,
      visitor: {
        ip,
        device: parsed.device,
        os: parsed.os,
        browser: parsed.browser,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Track] Error:', message);
    return c.json({ success: false, error: message }, 500);
  }
});

app.get("/track/pixel", async (c) => {
  const headers = c.req.raw.headers;
  const ip = getClientIP(headers);
  const rawUA = headers.get('user-agent') || '';
  const parsed = parseUserAgent(rawUA);
  const refHeader = headers.get('referer') || headers.get('referrer') || '';

  const entry = {
    id: `vis_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
    sessionId: `pixel_${Date.now()}`,
    ip,
    userAgent: rawUA,
    browser: parsed.browser,
    browserVersion: parsed.browserVersion,
    os: parsed.os,
    osVersion: parsed.osVersion,
    device: parsed.device,
    deviceModel: parsed.deviceModel,
    isBot: parsed.isBot,
    referrer: refHeader || 'direct',
    page: '/landing',
    event: 'pixel_load',
    timestamp: new Date().toISOString(),
  };

  store.addVisitorLog(entry);
  console.log(`[Pixel] ${ip} | ${parsed.device} ${parsed.os} ${parsed.browser}`);

  c.header('Content-Type', 'image/gif');
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  return c.body(pixel);
});

app.post("/webhooks/stripe", async (c) => {
  const signature = c.req.header("stripe-signature") || "";
  const payload = await c.req.text();

  if (!signature) {
    console.warn("[Webhook] Stripe webhook missing signature header");
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  console.log("[Webhook] Received Stripe webhook");

  try {
    const mockReq = new Request("http://localhost/webhooks/stripe", { method: "POST" });
    const ctx = await createContext({ req: mockReq, resHeaders: new Headers(), info: {} as any });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.payments.handleStripeWebhook({ payload, signature });
    return c.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Webhook] Stripe webhook processing error:", message);
    return c.json({ received: false, error: message }, 500);
  }
});

app.post("/webhooks/plaid", async (c) => {
  const body = await c.req.json();
  console.log("[Webhook] Received Plaid webhook:", body.webhook_type, body.webhook_code);

  try {
    const mockReq = new Request("http://localhost/webhooks/plaid", { method: "POST" });
    const ctx = await createContext({ req: mockReq, resHeaders: new Headers(), info: {} as any });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.payments.handlePlaidWebhook({
      webhookType: body.webhook_type || "",
      webhookCode: body.webhook_code || "",
      itemId: body.item_id,
      error: body.error,
    });
    return c.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Webhook] Plaid webhook processing error:", message);
    return c.json({ received: false, error: message }, 500);
  }
});

app.get("/", (c) => {
  return c.json({
    status: "ok",
    message: "IVX HOLDINGS API is running",
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
});

app.get("/robots.txt", (c) => {
  c.header('Content-Type', 'text/plain');
  return c.body(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /trpc/
Disallow: /admin/
Disallow: /track/

Sitemap: https://ivxholding.com/sitemap.xml

User-agent: Googlebot
Allow: /
Crawl-delay: 1

User-agent: Bingbot
Allow: /
Crawl-delay: 2
`);
});

app.get("/sitemap.xml", (c) => {
  const now = new Date().toISOString().split('T')[0];
  const properties = store.properties || [];
  
  let urls = `
  <url><loc>https://ivxholding.com</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://ivxholding.com/#properties</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>https://ivxholding.com/#how-it-works</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://ivxholding.com/#trust</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://ivxholding.com/#reviews</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>https://ivxholding.com/#partners</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;

  for (const prop of properties) {
    urls += `\n  <url><loc>https://ivxholding.com/property/${prop.id}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`;
  }

  c.header('Content-Type', 'application/xml');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`);
});

app.get("/structured-data", (c) => {
  const properties = store.properties || [];
  const listings = properties.filter(p => p.status === 'live').map(p => ({
    '@type': 'Product',
    name: p.name,
    description: `Fractional ownership in ${p.name}, ${p.city}, ${p.country}. ${p.yield}% annual yield.`,
    url: `https://ivxholding.com/property/${p.id}`,
    image: p.images?.[0] || 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=80',
    offers: {
      '@type': 'Offer',
      price: p.pricePerShare,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  }));

  return c.json({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: listings.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item,
    })),
  });
});

app.post("/track/conversion", async (c) => {
  try {
    const body = await c.req.json();
    const headers = c.req.raw.headers;
    const ip = getClientIP(headers);
    const rawUA = headers.get('user-agent') || body.userAgent || '';
    const parsed = parseUserAgent(rawUA);

    const evt = {
      id: store.genId('evt'),
      userId: 'landing_visitor',
      event: `conversion_${body.event || 'generic'}`,
      category: 'conversion' as const,
      properties: {
        ...body.properties,
        value: body.value,
        currency: body.currency || 'USD',
        utmSource: body.utmSource,
        utmMedium: body.utmMedium,
        utmCampaign: body.utmCampaign,
        fbclid: body.fbclid,
        gclid: body.gclid,
        ttclid: body.ttclid,
        ip,
        browser: parsed.browser,
        os: parsed.os,
        device: parsed.device,
      },
      sessionId: body.sessionId || `conv_${Date.now()}`,
      timestamp: new Date().toISOString(),
      geo: body.geo,
    };
    store.addAnalyticsEvent(evt);

    console.log(`[Conversion] ${ip} | ${body.event} | value: ${body.value || 0} | utm: ${body.utmSource || 'direct'}`);

    return c.json({ success: true, eventId: evt.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Conversion] Error:', message);
    return c.json({ success: false, error: message }, 500);
  }
});

app.get("/health", (c) => {
  const mem = process.memoryUsage();
  return c.json({
    status: "healthy",
    version: APP_VERSION,
    uptime: process.uptime(),
    startedAt: new Date(START_TIME).toISOString(),
    memory: {
      rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    },
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

app.get("/readiness", (c) => {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    return c.json({
      ready: true,
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    });
  }

  const envResult = validateEnv();
  return c.json({
    ready: true,
    environment: {
      readinessScore: envResult.readinessScore,
      configured: envResult.configured.length,
      total: envResult.configured.length + envResult.missing.length,
    },
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
});

app.get("/aws-status", (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = verifyToken(authHeader.slice(7));
  if (!payload || (payload.role !== "owner" && payload.role !== "ceo")) {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }

  const status = getAWSSetupStatus();
  return c.json({
    configured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
    bucket: PROD_BUCKET_NAME,
    region: PROD_REGION,
    storageProvider: process.env.STORAGE_PROVIDER || (process.env.AWS_ACCESS_KEY_ID ? "s3" : "local"),
    setupComplete: !!status,
    setup: status,
    iamPolicy: getIAMPolicyDocument(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/staging-check", (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = verifyToken(authHeader.slice(7));
  if (!payload || (payload.role !== "owner" && payload.role !== "ceo")) {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }

  const result = runStagingChecklist();
  return c.json({
    ready: result.ready,
    checks: result.checks,
    timestamp: new Date().toISOString(),
  });
});

app.get("/env-check", (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = verifyToken(authHeader.slice(7));
  if (!payload || (payload.role !== "owner" && payload.role !== "ceo")) {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }

  const envResult = validateEnv();
  return c.json({
    readinessScore: envResult.readinessScore,
    isValid: envResult.isValid,
    configured: envResult.configured,
    missing: envResult.missing,
    warnings: envResult.warnings,
    byCategory: envResult.byCategory,
  });
});

app.onError(async (err, c) => {
  console.error(`[ERROR] ${c.req.method} ${c.req.url}:`, err.message);

  captureError(err instanceof Error ? err : new Error(String(err)), {
    tags: { method: c.req.method, path: c.req.url },
    extra: { url: c.req.url, method: c.req.method },
  }).catch(() => {});

  const isProduction = process.env.NODE_ENV === 'production';
  return c.json(
    {
      error: "Internal Server Error",
      message: isProduction ? "Something went wrong" : err.message,
      ...(isProduction ? {} : { stack: err instanceof Error ? err.stack : undefined }),
    },
    500
  );
});

app.notFound((c) => {
  return c.json({ error: "Not Found", path: c.req.url }, 404);
});

export default app;
