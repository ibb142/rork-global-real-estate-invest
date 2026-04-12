FROM oven/bun:1.2-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package.json ./package.json
RUN bun install --production

COPY server.ts ./server.ts
COPY tsconfig.json ./tsconfig.json
COPY backend ./backend
COPY expo/constants ./expo/constants
COPY expo/shared ./expo/shared

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3000/health" || exit 1

CMD ["bun", "run", "server.ts"]
