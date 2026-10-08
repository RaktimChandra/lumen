# syntax=docker/dockerfile:1.7
# Build from the repository root:  docker build -f apps/api/Dockerfile -t lumen-api .

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @lumen/shared --workspace @lumen/api --include-workspace-root --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @lumen/shared && npm run build -w @lumen/api \
 && npm prune --omit=dev --workspace @lumen/shared --workspace @lumen/api --include-workspace-root

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/drizzle ./apps/api/drizzle
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/server.js"]
