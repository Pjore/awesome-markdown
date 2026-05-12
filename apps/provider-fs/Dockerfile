# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@10

WORKDIR /build

# Copy workspace definition files first to leverage Docker layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
COPY apps/provider-fs/ apps/provider-fs/

# Install all workspace dependencies.
RUN pnpm install --frozen-lockfile

# Build shared workspace packages (TypeScript project references require this
# order: contracts → filter-engine → provider-fs).
RUN pnpm --filter @awesome-markdown/contracts build
RUN pnpm --filter @awesome-markdown/filter-engine build

# Build provider-fs.
RUN pnpm --filter provider-fs build

# Create a standalone production deployment directory.
# pnpm deploy copies workspace dependencies (resolved from their dist/) into
# the deployed package's node_modules so the runtime image needs no pnpm.
RUN pnpm --filter provider-fs deploy --prod /deploy

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app
COPY --from=builder /deploy ./

EXPOSE 7701

CMD ["node", "dist/index.js"]
