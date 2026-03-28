/* eslint-disable no-var */
declare var process: { env: Record<string, string | undefined> };
declare var Bun: { serve: (options: { fetch: (req: Request) => Response | Promise<Response>; port: number; hostname: string }) => void };
/* eslint-enable no-var */

import app from "./backend/hono";

const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "0.0.0.0";

console.log(`[SERVER] Starting IVX Holdings API on ${host}:${port}`);
console.log(`[SERVER] Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`[SERVER] Supabase URL: ${(process.env.EXPO_PUBLIC_SUPABASE_URL || "").substring(0, 40)}...`);
console.log(`[SERVER] AWS Region: ${process.env.AWS_REGION || "us-east-1"}`);

Bun.serve({
  fetch: app.fetch as (req: Request) => Response | Promise<Response>,
  port,
  hostname: host,
});

console.log(`[SERVER] IVX Holdings API running at http://${host}:${port}`);
console.log(`[SERVER] Health check: http://${host}:${port}/health`);
