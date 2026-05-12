# Implementation Plan: awesome-markdown-scaling

## 0. Metadata
- **Complexity:** 3
- **Uncertainty:** 1
- **Work:** 3
- **Scope:** npm package publishing readiness, `provider-http` auth hook, Docker Compose deployment option
- **Non-goals:** Cloud backend implementation, multi-tenant auth, Zitadel integration, Caddy HTTPS setup, conflict resolution UI, billing

---

## 1. Problem Statement

The monorepo packages are not publishable to npm (`private: true` on `provider-http`, no `publishConfig`, no `license`, no CI publish workflow). The `provider-http` package cannot attach auth tokens when pointed at a remote endpoint. Non-developer self-hosters have no Node-free deployment path.

---

## 2. Constraints & Assumptions

- Existing local-first stack (`provider-fs` + `sync-engine` + `provider-localstorage`) must remain entirely unchanged in behaviour.
- All changes are additive — no breaking changes to `PersistenceProvider` contract.
- `provider-http` auth hook is auth-system-agnostic; token refresh is caller responsibility.
- Docker Compose coexists with PM2; neither replaces the other.
- `packages/contracts` version is the compatibility anchor for semver.

---

## 3. Target State (Definition of Done)

**Functional:**
- Running `pnpm publish --filter @awesome-markdown/contracts --access public` (and the three other packages) succeeds from a clean checkout with no workspace symlinks in the artifact.
- `createHttpProvider({ baseUrl, getToken })` attaches `Authorization: Bearer <token>` to every request when `getToken` is provided; omitting `getToken` preserves today's behaviour exactly.
- `docker compose up` starts all three services (kanban-ui, provider-fs, sync-engine) with shared `content/` volume and correct env.
- `./scripts/compose start|stop|status|logs <service>` works as a UX mirror of `./scripts/services`.

**Non-functional:**
- Published packages include only `dist/` — no `src/`, no workspace references.
- GitHub Actions publish workflow gates on `pnpm typecheck && pnpm lint && pnpm test` before publishing.

**Success Criteria:**
- [ ] `packages/provider-http/package.json` has `publishConfig: { access: "public" }` and no `"private": true`
- [ ] All four publishable packages have `"license": "MIT"` and `"version": "1.0.0"`
- [ ] GitHub Actions workflow file exists at `.github/workflows/publish.yml`, triggers on `v*.*.*` tags
- [ ] `HttpProviderConfig` has `getToken?: () => Promise<string>` field; `SidecarHttpClient` calls it before each request
- [ ] Existing `provider-http` tests pass with no modifications
- [ ] `docker-compose.yml` exists at repo root with `kanban-ui`, `provider-fs`, `sync-engine` services sharing a `content/` volume
- [ ] `scripts/compose` exists and supports `start`, `stop`, `status`, `logs <service>` subcommands

---

## 4. Change Overview

| Area | Type | Description |
|------|------|-------------|
| `packages/contracts/package.json` | Modify | Add `license`, bump version to `1.0.0`, add `publishConfig` |
| `packages/filter-engine/package.json` | Modify | Add `license`, bump version to `1.0.0`, add `publishConfig` |
| `packages/provider-http/package.json` | Modify | Remove `"private": true`, add `license`, bump version to `1.0.0`, add `publishConfig` |
| `packages/provider-localstorage/package.json` | Modify | Add `license`, bump version to `1.0.0`, add `publishConfig` |
| `.github/workflows/publish.yml` | New | CI workflow: on `v*.*.*` tag → quality gate → publish four packages |
| `packages/provider-http/src/http-client.ts` | Modify | Add optional `getToken` to `HttpClientConfig`; call it before each fetch request to attach `Authorization` header |
| `packages/provider-http/src/sse-client.ts` | Modify | Add optional `getToken` to `SseClientConfig`; append `?token=` to SSE URL when factory is present |
| `packages/provider-http/src/provider.ts` | Modify | Thread `getToken` from `HttpProviderConfig` through to `SidecarHttpClient` and `SseClient` |
| `docker-compose.yml` | New | Three-service Compose file with shared `content/` bind mount and `env_file` per service |
| `scripts/compose` | New | Shell wrapper mirroring `scripts/services` UX (`start`, `stop`, `status`, `logs <service>`) |
| `README.md` | Modify | Rewrite for external audience; remove internal-only sections |
| `CONTRIBUTING.md` | New | Dev setup, conventions, test requirements, issue reporting |
| `CODE_OF_CONDUCT.md` | New | Contributor Covenant v2.1 |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | New | Structured bug report template |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | New | Structured feature request template |
| `.github/pull_request_template.md` | New | PR checklist |
| `SECURITY.md` | New | Responsible disclosure policy |
| `docs/ARCHITECTURE.md` | Modify | Remove internal assumptions; ensure readable for first-time external contributors |
| GitHub repository visibility | Modify | Set to public (manual step after Milestone 4 merge) |

---

## 5. Use Cases

### UC-1: Publish packages to npm on release tag

**Actor:** Maintainer  
**Trigger:** Push a `v*.*.*` git tag to `main`  
**Flow:**
1. Maintainer pushes tag `v1.0.0`
2. GitHub Actions workflow triggers
3. Workflow runs full quality gate (`typecheck`, `lint`, `test`)
4. Workflow publishes `contracts`, `filter-engine`, `provider-http`, `provider-localstorage` in dependency order
5. Packages appear on npm under `@awesome-markdown` scope

**Input:** Git tag matching `v*.*.*`  
**Output:** Four packages published to npm  
**Errors:** Quality gate failure aborts publish; partial publish (one package fails) leaves earlier packages published — acceptable since semver guarantees compatibility within a tag

---

### UC-2: External consumer depends on published packages

**Actor:** Cloud backend (private repo) or third-party integration  
**Trigger:** Developer adds `@awesome-markdown/contracts` to their `package.json`  
**Flow:**
1. Consumer runs `npm install @awesome-markdown/contracts`
2. npm resolves published `dist/` artifact (no workspace references)
3. Consumer imports types and Zod schemas

**Input:** Package name + semver range  
**Output:** Working TypeScript types and runtime validators  
**Errors:** Stale `dist/` in published artifact — prevented by build step in publish workflow

---

### UC-3: `provider-http` attaches auth token to remote endpoint

**Actor:** Application developer  
**Trigger:** `createHttpProvider` called with `getToken` option  
**Flow:**
1. Developer calls `createHttpProvider({ baseUrl: 'https://api.example.com/...', getToken: () => auth.getToken() })`
2. Application makes a provider call (e.g., `listBoards()`)
3. `provider-http` calls `getToken()` to obtain current token
4. Fetch request is sent with `Authorization: Bearer <token>` header
5. SSE connection is opened with `?token=<value>` appended to the URL
6. Remote endpoint validates token and returns data

**Input:** `getToken?: () => Promise<string>` factory  
**Output:** All HTTP fetch requests include `Authorization` header; SSE URL includes `?token=` when factory is present  
**Errors:** `getToken()` rejection propagates as a rejected provider call; no retry logic in `provider-http`; token exposed in SSE URL query string (caller must be aware)

---

### UC-4: Self-hoster deploys stack with Docker Compose

**Actor:** Non-developer self-hoster (no Node/pnpm installed)  
**Trigger:** `docker compose up` in repo root  
**Flow:**
1. Self-hoster clones repo and copies `.env.example` to `.env` for each app
2. Runs `docker compose up -d`
3. Compose builds images for `kanban-ui`, `provider-fs`, `sync-engine`
4. All three containers start, sharing `content/` bind mount
5. UI is accessible at `http://localhost:5173`

**Input:** `.env` files per service, `content/` directory  
**Output:** Running three-service stack  
**Errors:** Missing `.env` → container fails to start with clear env-var error; missing `content/` → bind mount created empty (acceptable)

---

### UC-5: Developer uses `scripts/compose` wrapper

**Actor:** Developer who prefers the `scripts/services` UX  
**Trigger:** `./scripts/compose start` (or `stop`, `status`, `logs ui`)  
**Flow:**
1. Developer runs `./scripts/compose start`
2. Wrapper delegates to `docker compose up -d`
3. Developer runs `./scripts/compose logs fs` → streams provider-fs logs
4. Developer runs `./scripts/compose stop` → `docker compose down`

**Input:** Subcommand + optional service name  
**Output:** Delegated docker compose output  
**Errors:** Docker not installed → clear error message

---

### UC-6: External contributor onboards to the project

**Actor:** External developer (no prior context)  
**Trigger:** Lands on the GitHub repository page  
**Flow:**
1. Contributor reads README — understands what the project does, how to run it, and which provider to choose
2. Contributor reads `CONTRIBUTING.md` — understands branch conventions, commit format, test requirements
3. Contributor opens an issue or PR using the provided template
4. Maintainer reviews using a consistent checklist

**Input:** Repository README, CONTRIBUTING.md, issue/PR templates  
**Output:** Contributor can set up, run, and submit a change without asking questions  
**Errors:** Missing setup step → CONTRIBUTING.md covers prerequisites explicitly

---

### UC-7: Maintainer makes repository public

**Actor:** Repository maintainer  
**Trigger:** All OSS-readiness deliverables from Milestone 4 are merged  
**Flow:**
1. Maintainer reviews that no sensitive internal data is exposed in any committed file
2. Maintainer sets GitHub repository visibility to **public**
3. Repository appears in GitHub search; npm packages become publishable with `--access public`

**Input:** Completed Milestone 4 deliverables  
**Output:** Repository publicly visible; all community health files surfaced by GitHub  
**Errors:** Sensitive data in `ai-docs/` or `.github/` — addressed in Milestone 4 review step

---

## 6. Milestones

### Milestone 1: Package publishing readiness
**Objective:** All four packages are publishable to npm with correct metadata and a CI workflow that gates on quality checks.

**Deliverables:**
- `publishConfig`, `license: "MIT"`, `version: "1.0.0"` on all four packages
- `"private": true` removed from `packages/provider-http/package.json`
- `.github/workflows/publish.yml` — triggers on `v*.*.*`, quality gate, publishes in dependency order

**Use Cases:** UC-1, UC-2

**Complexity:** 2 | **Work:** 2

---

### Milestone 2: `provider-http` auth token hook
**Objective:** `createHttpProvider` accepts an optional `getToken` factory; every HTTP request and the SSE connection conditionally attaches auth credentials.

**Deliverables:**
- `getToken?: () => Promise<string>` added to `HttpClientConfig` and `HttpProviderConfig`
- `SidecarHttpClient.req()` calls `getToken()` before each fetch request and merges `Authorization: Bearer` header
- `SseClient` appends token as a `?token=` query parameter on the SSE URL when `getToken` is provided
- `SseClientConfig` accepts the same `getToken` factory, threaded through from `HttpProviderConfig`
- Existing tests continue to pass; new tests cover authenticated and unauthenticated paths for both fetch and SSE

**Use Cases:** UC-3

**Complexity:** 2 | **Work:** 2

---

### Milestone 3: Docker Compose deployment
**Objective:** Non-developers can run the full stack with `docker compose up`; developers get a `scripts/compose` UX wrapper.

**Deliverables:**
- `docker-compose.yml` at repo root with `kanban-ui`, `provider-fs`, `sync-engine` services
- Shared `content/` bind mount; each service uses `env_file`
- `scripts/compose` shell script: `start`, `stop`, `status`, `logs <service>`
- README section documenting Docker Compose path vs PM2 path

**Use Cases:** UC-4, UC-5

**Complexity:** 3 | **Work:** 3

---

### Milestone 4: OSS documentation and repo visibility
**Objective:** The repository is ready for public external contributors — clear onboarding, contribution guidelines, and no internal-only artefacts exposed to outsiders.

**Deliverables:**
- `README.md` rewritten for external audience: project pitch, quickstart, provider choice guide, link to docs; internal AI-agent sections (`File Constraints`, `Planning`) removed or moved
- `CONTRIBUTING.md` created: dev setup, branch/PR conventions, commit message format, code style, test requirements, issue reporting
- `CODE_OF_CONDUCT.md` created (Contributor Covenant v2.1)
- `.github/ISSUE_TEMPLATE/` — two templates: `bug_report.yml`, `feature_request.yml`
- `.github/pull_request_template.md` — checklist covering tests, docs, changelog
- `SECURITY.md` — responsible disclosure policy and contact
- `docs/ARCHITECTURE.md` reviewed and updated to remove internal-only assumptions; ensure it reads well for first-time external contributors
- `ai-docs/` excluded from public-facing docs (no link from README); `.github/copilot-instructions.md` and `.github/agents/` reviewed — ensure no sensitive internal details leak
- GitHub repository visibility set to **public**

**Use Cases:** UC-6, UC-7

**Complexity:** 3 | **Work:** 3

---

**Review Checkpoint:** After creating this main plan, pause for user review before generating detailed milestone files.

---

## 7. Validation & Verification

- `pnpm typecheck` — no errors after provider-http changes
- `pnpm test --filter provider-http` — all existing tests pass; new auth tests added
- Manual: `docker compose up` starts all services and UI loads at `http://localhost:5173`
- Manual: `./scripts/compose logs ui` streams kanban-ui output
- CI: dry-run publish with `--dry-run` flag to verify artifact contents before first real tag

---

## 8. Rollback Strategy

- Package metadata changes: revert `package.json` files; no published packages to un-publish until tag is pushed
- Auth hook: purely additive — removing `getToken` field restores original behaviour
- Docker Compose: file can be deleted; PM2 stack is unaffected

---

## 9. Open Questions

- Should the publish workflow use a single `NPM_TOKEN` secret or per-package granular tokens?
- SSE `?token=` query param exposes the token in server access logs and browser history — callers pointed at a remote endpoint should be made aware of this in documentation. Deferred to Milestone 4 (CONTRIBUTING / docs).

---

## 10. References

- [pnpm publish filtering](https://pnpm.io/filtering)
- [GitHub Actions: publishing Node packages](https://docs.github.com/en/actions/publishing-packages/publishing-nodejs-packages)
- [Docker Compose bind mounts](https://docs.docker.com/compose/compose-file/compose-file-v3/#volumes)
- [npm publishConfig](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#publishconfig)
