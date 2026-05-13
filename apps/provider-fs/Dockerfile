# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@10

WORKDIR /build

# Copy workspace definition files first to leverage Docker layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
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
# inject-workspace-packages=true (in .npmrc) makes pnpm deploy work correctly
# in pnpm v10 and ensures built dist/ files are included.
RUN pnpm --filter provider-fs deploy --prod /deploy

# pnpm deploy copies source files and node_modules but not the compiled dist/.
# Copy it explicitly from the build stage.
RUN cp -r apps/provider-fs/dist /deploy/dist

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app
COPY --from=builder /deploy ./

EXPOSE 7701

CMD ["node", "dist/index.js"]
