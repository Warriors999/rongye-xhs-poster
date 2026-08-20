FROM node:22.14.0-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV COREPACK_HOME="/corepack"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

RUN mkdir -p "$PNPM_HOME" "$COREPACK_HOME" \
  && corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm typecheck
RUN pnpm build

FROM base AS production-deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS runner

ENV NODE_ENV="production"

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && chown -R nextjs:nodejs "$COREPACK_HOME"

COPY --from=production-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
# Worker 通过 tsx 直接启动 TypeScript 入口；保留源代码和路径别名配置，确保独立 Worker 镜像可启动。
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
