# Milestone 4: OSS Documentation and Repo Visibility

## Metadata
- Parent plan: `awesome-markdown-scaling-main.md`
- Complexity / Work: 3 / 3
- Depends on: Milestones 1–3 (can be executed in parallel; no code dependency)
- Use cases: UC-6, UC-7

## Objective

All community health files are created, public-facing docs are rewritten for an external audience, internal-only artefacts are reviewed and sanitised, and the maintainer has a documented manual step to flip repository visibility to public.

## Scope

**In:**
- `README.md` rewritten: external pitch, quickstart, provider choice guide, links to architecture and contributing docs; `File Constraints` and `Planning` sections removed
- Six new community files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`
- `docs/ARCHITECTURE.md` reviewed and updated: remove any internal-agent references, add "Getting Started" pointer to README/CONTRIBUTING
- `docs/VERIFICATION.md` reviewed: redact owner-identifying details (Coder subdomain example exposes username + domain); `agent-browser` framing may need neutral language since it appears in public docs
- `.github/copilot-instructions.md` reviewed: flag and remove internal skill-name references (`branch-and-pr`, `commit-work`, `agent-browser`, `dev-environment-coder`) or replace with generic guidance; keep the file — it is used by AI contributing agents
- Manual-step note documented (in `CONTRIBUTING.md` or a maintainer section) that repo visibility must be set to public via GitHub Settings after merge

**Out:**
- `ai-docs/` — not linked from any public-facing doc; no changes needed
- `.github/agents/` and `.github/skills/` — do not remove, do not reference from public docs
- `LICENSE` — already exists; do not recreate or modify
- Any source code changes
- Milestone-tracking or status files in `ai-docs/`

## Constraints

- `ai-docs/` must not be linked from README or any other public-facing file.
- The `Planning` section in `README.md` links to `ai-docs/awesome-markdown-main.md` — remove the entire section, not just the link.
- `FILE Constraints` section in README is an internal AI-agent rule; remove it entirely from the public README. It can remain in `.github/copilot-instructions.md`.
- Contributor Covenant version must be **v2.1** exactly. Use the canonical text; the enforcement contact email placeholder is `conduct@awesome-markdown.dev`.
- `SECURITY.md` contact email placeholder is `security@awesome-markdown.dev`; expected response time is 72 hours; scope covers all packages and apps in this repo.
- `docs/VERIFICATION.md` contains a Coder workspace subdomain example (`7402--main--awesome-markdown--pjore.coder.pjore.com`) that exposes the owner's username and hosting domain — replace with a generic placeholder pattern.
- `.github/copilot-instructions.md` must survive the milestone (AI agents depend on it); only remove or generalise content that would be misleading or identifying to a public reader.
- The `SSE ?token= query string` exposure note from the main plan's open questions should appear as a brief warning in `CONTRIBUTING.md` (or `docs/ARCHITECTURE.md`) for developers pointing `provider-http` at a remote endpoint.

## Contracts

- None. This milestone produces only documentation and template files.

## Definition of Done

- [ ] `README.md` contains no `File Constraints` section, no `Planning` section, and no links into `ai-docs/`
- [ ] `README.md` opens with a clear one-paragraph project pitch and includes a provider choice guide (when to use `provider-localstorage` vs `provider-fs` + `sync-engine`)
- [ ] `CONTRIBUTING.md` exists and covers: prerequisites (Node 22+, pnpm 9+, Docker optional), fork/clone/install, branch naming convention, Conventional Commits format with AI co-author trailer, PR lifecycle, `pnpm typecheck && pnpm lint && pnpm test` gate, full-stack local run, and where to file issues vs discussions
- [ ] `CODE_OF_CONDUCT.md` exists with Contributor Covenant v2.1 text and `conduct@awesome-markdown.dev` placeholder
- [ ] `SECURITY.md` exists with responsible disclosure policy, `security@awesome-markdown.dev` contact, 72 h response commitment, and scope statement
- [ ] `.github/pull_request_template.md` exists with checklist: linked issue, tests added/updated, quality gate passes, docs updated if needed, breaking change noted
- [ ] `.github/ISSUE_TEMPLATE/bug_report.yml` exists as a GitHub issue form with fields: description, steps to reproduce, expected vs actual behaviour, environment (OS, Node version, provider type), relevant logs
- [ ] `.github/ISSUE_TEMPLATE/feature_request.yml` exists as a GitHub issue form with fields: problem statement, proposed solution, alternatives considered, provider/package affected
- [ ] `docs/ARCHITECTURE.md` contains a "Getting Started" pointer to README and CONTRIBUTING; contains no references to internal agent tooling
- [ ] `docs/VERIFICATION.md` contains no owner-identifying Coder subdomain; `agent-browser` description is neutral enough for a public audience (or scoped to a maintainer/contributor section)
- [ ] `.github/copilot-instructions.md` contains no internal skill names that would mislead public readers; skill-loading instructions generalised or removed
- [ ] `pnpm typecheck && pnpm lint` pass; no existing test suites broken
- [ ] A maintainer note (in CONTRIBUTING.md or a separate `docs/RELEASING.md`) states: "After Milestone 4 is merged, set GitHub repository visibility to **Public** via Settings → General → Danger Zone"

## Risks & Decisions To Get Right

- **`docs/VERIFICATION.md` is public once the repo goes public** — the Coder URL example is the clearest PII risk; replace before anything else is merged. The `agent-browser` "LLM-driven" framing is unusual in public OSS docs — reframe it as a browser automation test runner or move the agent-specific detail to a maintainer/contributor-tools section.
- **`.github/copilot-instructions.md` skill names are internal workflow labels** — a public reader seeing `load the branch-and-pr skill` will be confused and may find dangling references. Replace with the equivalent plain-language instruction (e.g., "create a feature branch and open a draft PR") rather than deleting the guidance.
- **README quickstart must work for the zero-server path** — lead with `provider-localstorage` (no sidecar needed) as the fastest first-run option; the `provider-fs` + `sync-engine` path is the second option. Getting this order wrong creates unnecessary friction for first-time contributors.
- **Issue template format** — use GitHub's `.yml` form format (not legacy `.md`) for both templates so GitHub renders them as structured forms; a plain `.md` template will silently fall back to a text box.
