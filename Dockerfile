FROM oven/bun:1.2-alpine AS server-deps
WORKDIR /app

# NOTE: bun.lock is intentionally NOT required here. The GitHub sync pipeline
# (expo/sync-github.mjs) ignores bun.lock, so the lockfile in this repo can lag
# package.json (e.g. when a new dep like `unpdf` is added). `--frozen-lockfile`
# would then abort the build (the exact cause of prod being stuck on an old
# commit). Resolve fresh from package.json instead so new deps always install.
COPY package.json ./
RUN bun install --production

# Node 22 ships a native global WebSocket (Node 20 does not). @supabase/supabase-js
# initializes a Realtime WebSocket client in its constructor, so on Node 20 every
# createClient() call threw "Node.js 20 detected without native WebSocket support"
# before any owner-gated request could run. Node 22 (LTS) provides WebSocket natively.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# NOTE: we deliberately do NOT copy the `bun` binary into this Node runner.
# A hard `COPY --from=server-deps /usr/local/bin/bun ...` is FATAL if the source
# path differs between bun image versions, which froze production on the last-good
# image (the landing-SEO auto-deployer never ran). The autonomous lifecycle's
# step 6 already degrades gracefully to the in-process tsx import-smoke check when
# bun is absent (ivx-runtime-resolver), so the Node-only runner is fully
# self-sufficient and the build can never fail on bun setup.
COPY --from=server-deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY server.ts ./server.ts
COPY tsconfig.json ./tsconfig.json
COPY backend ./backend
COPY expo/constants ./expo/constants
COPY expo/shared ./expo/shared
COPY expo/deploy/scripts ./expo/deploy/scripts
# Ship the GitHub-sync scripts so the owner-only sync route
# (POST /api/ivx/autonomy/github/sync, backend/api/ivx-autonomy.ts) can spawn
# `node expo/sync-github.mjs` at runtime. Without these two files the server
# threw MODULE_NOT_FOUND ('/app/expo/sync-github.mjs') and every sync 502'd.
COPY expo/sync-github.mjs ./expo/sync-github.mjs
COPY expo/sync-paths.mjs ./expo/sync-paths.mjs
# Ship the static landing/SEO files so the startup landing-SEO auto-deployer
# (backend/services/ivx-landing-seo-autodeploy.ts) can push robots.txt /
# sitemap.xml / capture.html to S3 with the correct content-types on boot,
# using the AWS credentials that exist on the Render service.
COPY expo/ivxholding-landing ./expo/ivxholding-landing
# Ship the durable IVX task-orchestrator ledger so the canonical task store
# (GET /api/ivx/senior-developer/tasks) serves every real task with its
# production-verification evidence. Without this the live dashboard shows 0.
COPY logs ./logs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3000/health" || exit 1

CMD ["node", "/app/node_modules/tsx/dist/cli.mjs", "/app/server.ts"]
