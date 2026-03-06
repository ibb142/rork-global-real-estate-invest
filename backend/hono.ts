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

logEnvStatus();
logSentryStatus();

store.init().then(() => {
  console.log('[App] Store initialized — ready to serve requests');
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
