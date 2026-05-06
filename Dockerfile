FROM oven/bun:1.2-alpine AS server-deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=server-deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY server.ts ./server.ts
COPY tsconfig.json ./tsconfig.json
COPY backend ./backend
COPY expo/constants ./expo/constants
COPY expo/shared ./expo/shared
COPY expo/deploy/scripts ./expo/deploy/scripts

RUN ln -s /app/node_modules /node_modules \
  && ln -s /app/server.ts /server.ts \
  && ln -s /app/backend /backend \
  && ln -s /app/expo /expo \
  && ln -s /app/tsconfig.json /tsconfig.json \
  && ln -s /app/package.json /package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3000/health" || exit 1

CMD ["node", "./node_modules/tsx/dist/cli.mjs", "server.ts"]
