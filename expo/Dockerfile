FROM oven/bun:1.2-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 honojs

COPY --from=deps --chown=honojs:nodejs /app/node_modules ./node_modules
COPY --chown=honojs:nodejs package.json ./package.json
COPY --chown=honojs:nodejs tsconfig.json ./tsconfig.json
COPY --chown=honojs:nodejs backend ./backend
COPY --chown=honojs:nodejs server.ts ./server.ts

USER honojs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "run", "server.ts"]
