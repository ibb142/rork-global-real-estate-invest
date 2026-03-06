import { serve } from "bun";
import app from "./backend/hono";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

console.log(`[Server] Starting IVX Holdings API...`);
console.log(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`[Server] Listening on ${HOST}:${PORT}`);

const server = serve({
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
});

console.log(`[Server] Ready at http://${HOST}:${PORT}`);

let isShuttingDown = false;

const gracefulShutdown = (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Server] ${signal} received — starting graceful shutdown...`);

  const forceTimeout = setTimeout(() => {
    console.error("[Server] Forced shutdown after timeout");
    process.exit(1);
  }, 30000);

  try {
    void server.stop(true);
    console.log("[Server] HTTP server stopped accepting new connections");
    console.log("[Server] Graceful shutdown complete");
    clearTimeout(forceTimeout);
    process.exit(0);
  } catch (err) {
    console.error("[Server] Error during shutdown:", err);
    clearTimeout(forceTimeout);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught exception:", err);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled rejection:", reason);
});
