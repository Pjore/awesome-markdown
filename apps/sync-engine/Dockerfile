# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@10

WORKDIR /build

# Copy workspace definition files first to leverage Docker layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
COPY apps/sync-engine/ apps/sync-engine/

# Install all workspace dependencies.
RUN pnpm install --frozen-lockfile

# Build shared workspace packages (sync-engine only depends on contracts).
RUN pnpm --filter @awesome-markdown/contracts build

# Build sync-engine.
RUN pnpm --filter sync-engine build

# Create a standalone production deployment directory.
RUN pnpm --filter sync-engine deploy --prod /deploy

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# simple-git shells out to the git binary — install it in the runtime image.
RUN apk add --no-cache git

WORKDIR /app
COPY --from=builder /deploy ./

EXPOSE 7402

CMD ["node", "dist/index.js"]
