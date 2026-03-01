import { serve } from "bun";
import app from "./backend/hono";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

console.log(`[Server] Starting IVX Holdings API...`);
console.log(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`[Server] Listening on ${HOST}:${PORT}`);

serve({
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
});

console.log(`[Server] Ready at http://${HOST}:${PORT}`);
