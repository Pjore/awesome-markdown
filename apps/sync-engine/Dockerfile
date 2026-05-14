# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm install -g pnpm@10

WORKDIR /build

# Copy workspace definition files first to leverage Docker layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
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
# inject-workspace-packages=true (in .npmrc) makes pnpm deploy work correctly
# in pnpm v10 and ensures built dist/ files are included.
RUN pnpm --filter sync-engine deploy --prod /deploy

# pnpm deploy copies source files and node_modules but not the compiled dist/.
# Copy it explicitly from the build stage.
RUN cp -r apps/sync-engine/dist /deploy/dist

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# simple-git shells out to the git binary — install it in the runtime image.
RUN apk add --no-cache git

WORKDIR /app
COPY --from=builder /deploy ./

# Run as the built-in non-root user so bind-mounted directories owned by
# uid=1000 (the common default on Linux hosts) are accepted by git.
USER node

EXPOSE 7402

CMD ["node", "dist/index.js"]
