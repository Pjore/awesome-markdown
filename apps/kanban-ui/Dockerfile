# ── Stage 1: Build ────────────────────────────────────────────────────────────
# Build the Vite/React SPA using the full monorepo context so workspace
# packages (@awesome-markdown/contracts, filter-engine, etc.) resolve correctly.
FROM node:22-alpine AS builder

RUN npm install -g pnpm@10

WORKDIR /build

# Copy workspace definition files first to leverage Docker layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/kanban-ui/ apps/kanban-ui/

# Install all workspace dependencies (including dev deps for the build).
RUN pnpm install --frozen-lockfile

# Build shared workspace packages in dependency order.
RUN pnpm --filter @awesome-markdown/contracts build
RUN pnpm --filter @awesome-markdown/filter-engine build
RUN pnpm --filter @awesome-markdown/provider-localstorage build
RUN pnpm --filter @awesome-markdown/provider-http build

# Ensure an .env file exists for VITE_* variable baking at build time.
# If the user has not created apps/kanban-ui/.env before building, fall back to
# .env.example (all VITE_* vars commented out → app uses compiled-in defaults
# of http://localhost:7701 and http://localhost:7402, which work for single-
# machine Docker Compose deployments).
RUN test -f apps/kanban-ui/.env || cp apps/kanban-ui/.env.example apps/kanban-ui/.env

# Build the SPA — VITE_* env vars are baked into the bundle here.
RUN pnpm --filter kanban-ui build

# ── Stage 2: Serve with nginx ──────────────────────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=builder /build/apps/kanban-ui/dist /usr/share/nginx/html
COPY apps/kanban-ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
