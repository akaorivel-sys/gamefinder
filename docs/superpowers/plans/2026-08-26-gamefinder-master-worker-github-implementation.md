# GameFinder Master/Worker GitHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move GameFinder v29 from ZIP-based iteration to a GitHub-centered Master + 5 Worker workflow with central assignments, automated quality gates, Master-controlled merges, and Firebase Hosting deployment from `main`.

**Architecture:** `main` is the authoritative deployable branch. Master owns the backlog and immutable Worker assignment files; Workers edit only assigned content on dedicated branches and submit PRs. CI validates content/registry/indexing/link rules; only Master-approved merges to `main` trigger Firebase Hosting deployment.

**Tech Stack:** Static HTML/CSS/JS, Node.js 22, JSON registries, Git/GitHub Actions, Firebase Hosting.

**Spec:** `docs/superpowers/specs/2026-08-26-gamefinder-master-worker-github-design.md`

## Global Constraints

- Repository name: `GameFinder`, public.
- Worker count: 5 (`worker-a` ... `worker-e`) plus one Master workflow.
- `main` is the only deployable authoritative branch.
- Workers never write directly to `main`.
- Master review is required after CI passes.
- Firebase Hosting project: `gamefinder-b6a00`.
- Firebase Hosting deploy root remains `public/`; never create `public/public`.
- Public site remains `noindex` until indexing is explicitly enabled later.
- Unknown metadata remains unknown; no fabricated enrichment.
- External 9,600-game catalog is not promoted to Editorial/Enriched Plus without verified metadata.

---

### Task 1: Establish Git Repository Baseline

**Files:**
- Create repository root `GameFinder/`
- Create `public/` from v29 Preview/noindex build
- Create `firebase.json`
- Create `.firebaserc`
- Create `.gitignore`
- Create `package.json`

**Interfaces:**
- Consumes: v29 Preview/noindex artifact.
- Produces: clean `main` baseline where `public/index.html` is the Hosting root and Firebase targets `gamefinder-b6a00`.

- [ ] Verify v29 package contains `index.html` at ZIP root and no nested `public/`.
- [ ] Copy v29 site files into repository `public/`.
- [ ] Add Firebase config with `hosting.public = "public"` and project `gamefinder-b6a00`.
- [ ] Add `package.json` scripts: `validate`, `validate:links`, `validate:indexing`, `validate:registry`, `build:progress`.
- [ ] Run structural test: `test -f public/index.html && test ! -d public/public`.
- [ ] Commit baseline as `chore: import GameFinder v29 baseline`.

### Task 2: Build Machine-Readable Editorial Registries

**Files:**
- Create `editorial/registry/games.json`
- Create `editorial/registry/articles.json`
- Create `editorial/registry/sources.json`
- Create `scripts/build-registries.mjs`
- Create `tests/content/registries.test.mjs`

**Interfaces:**
- Consumes: `public/data/games.json`, `public/articles/*.html`, existing source sections.
- Produces: normalized registries keyed by game slug/article slug.

- [ ] Write tests that fail when an article path/slug is duplicated or references a missing game.
- [ ] Implement registry builder using actual HTML visible-text count rather than stored claims.
- [ ] Extract article `indexing`, visible characters, game slug, source count and path.
- [ ] Preserve unknown values as `null`.
- [ ] Run `node --test tests/content/registries.test.mjs` and require zero failures.
- [ ] Commit as `feat: add editorial registries`.

### Task 3: Add Central Backlog and Immutable Assignments

**Files:**
- Create `editorial/queue/tasks.json`
- Create `editorial/queue/assignments/.gitkeep`
- Create `scripts/allocate-work.mjs`
- Create `tests/content/allocation.test.mjs`

**Interfaces:**
- Consumes: registries plus task priority/weight.
- Produces: `batch-XXXX-worker-[a-e].json` assignment files without multiple Workers editing the central queue.

- [ ] Define allowed task types from the approved spec.
- [ ] Write test proving one task cannot be assigned to two Workers in the same batch.
- [ ] Write test proving allocation balances workload units, not just task count.
- [ ] Implement deterministic allocator with worker IDs `a`–`e`.
- [ ] Run allocation tests.
- [ ] Commit as `feat: add master work allocator`.

### Task 4: Implement Content Quality Gates

**Files:**
- Create `scripts/validate-content.mjs`
- Create `scripts/validate-links.mjs`
- Create `scripts/validate-registry.mjs`
- Create `scripts/validate-indexing.mjs`
- Create `scripts/validate-duplicates.mjs`
- Create `tests/content/quality.test.mjs`

**Interfaces:**
- Consumes: `public/`, registries, assignment metadata.
- Produces: non-zero exit code on any blocking quality violation.

- [ ] Test deep article visible-text minimum of 8,000 chars for tasks that require deep depth.
- [ ] Test duplicate slug/AppID/article path detection.
- [ ] Test root-relative internal links resolve to a real file or directory index.
- [ ] Test automated/unverified article layers remain `noindex,follow`.
- [ ] Test Preview/live-noindex build keeps `robots.txt` disallowing crawling until indexing policy changes.
- [ ] Test version-sensitive researched tasks include configured source metadata.
- [ ] Test exact duplicate article bodies are rejected.
- [ ] Run the full validator against v29 and require zero blocking failures before moving on.
- [ ] Commit as `feat: add content quality gates`.

### Task 5: Generate Progress State Automatically

**Files:**
- Create `editorial/progress.json`
- Create `scripts/build-progress.mjs`
- Create `tests/content/progress.test.mjs`

**Interfaces:**
- Consumes: registries, queue, assignments.
- Produces: derived counts for Master reporting; Workers cannot manually inflate totals.

- [ ] Test totals are calculated from actual registry records.
- [ ] Include target/current counts for games, deep articles, queued, assigned, PR-ready and failed-gate tasks.
- [ ] Include per-worker workload/result counts.
- [ ] Run progress tests.
- [ ] Commit as `feat: add derived progress manifest`.

### Task 6: Define Worker Protocol and PR Contract

**Files:**
- Create `docs/worker-protocol.md`
- Create `.github/pull_request_template.md`
- Create `editorial/results/.gitkeep`

**Interfaces:**
- Consumes: assignment JSON.
- Produces: predictable Worker result records and PR descriptions Master can review quickly.

- [ ] Document branch sync, assignment boundaries, research rules and forbidden edits.
- [ ] Require PR to list task IDs, changed paths, source status and local validation output.
- [ ] Require Worker result JSON to identify completed/failed/skipped tasks.
- [ ] Commit as `docs: define worker protocol`.

### Task 7: Add GitHub Actions Quality Gate

**Files:**
- Create `.github/workflows/quality-gate.yml`

**Interfaces:**
- Consumes: Pull Requests targeting `main`.
- Produces: required CI status named `quality-gate`.

- [ ] Configure Node.js 22 checkout/install.
- [ ] Run registry build in check mode.
- [ ] Run content/link/indexing/duplicate validators.
- [ ] Fail if generated registry/progress differs from committed state.
- [ ] Upload validation report artifact on failure.
- [ ] Verify a deliberately broken internal link causes CI failure, then restore it and verify pass.
- [ ] Commit as `ci: add GameFinder quality gate`.

### Task 8: Configure Master-Controlled Branch Protection

**Files:**
- No site-content file changes; GitHub repository settings.

**Interfaces:**
- Consumes: `quality-gate` CI status.
- Produces: protected `main` that cannot be bypassed by Worker branches.

- [ ] Require PR before merge to `main`.
- [ ] Require `quality-gate` status.
- [ ] Disable Worker direct pushes to `main`.
- [ ] Keep Master as final reviewer/merge authority.
- [ ] Verify a Worker branch cannot bypass PR requirements.

### Task 9: Add Firebase Deployment Workflow

**Files:**
- Create `.github/workflows/deploy-firebase.yml`
- Confirm `firebase.json`
- Confirm `.firebaserc`

**Interfaces:**
- Consumes: approved merge/push to `main` plus Firebase deployment credential stored as a GitHub secret/identity integration.
- Produces: deployment to `https://gamefinder-b6a00.web.app/`.

- [ ] Configure workflow to run only after changes land on `main`.
- [ ] Run the same validation command before deployment.
- [ ] Deploy only `public/` to Firebase Hosting project `gamefinder-b6a00`.
- [ ] Keep live `robots.txt` and HTML robots metadata in noindex mode for the current phase.
- [ ] Add deployment verification that fetches `/health.txt` and checks a v29-or-later build marker.
- [ ] Verify a successful approved merge triggers Hosting deployment.
- [ ] Commit as `ci: deploy approved main to Firebase`.

### Task 10: Create and Verify Five Worker Branches

**Files:**
- Git branches: `worker-a`, `worker-b`, `worker-c`, `worker-d`, `worker-e`.

**Interfaces:**
- Consumes: protected `main` baseline.
- Produces: five independent Worker branches ready to process assignment files.

- [ ] Create all five Worker branches from the same approved `main` SHA.
- [ ] Generate batch 0001 assignments for all Workers.
- [ ] Run a dry-run Worker change on one harmless editorial task.
- [ ] Open PR, pass CI, review in Master, merge, and verify Firebase deployment.
- [ ] Synchronize all Worker branches from the new `main`.

### Task 11: End-to-End Automation Trial

**Files:**
- Modify only files assigned by the trial batch plus generated registry/progress state.

**Interfaces:**
- Consumes: one real queued editorial task.
- Produces: proof that the complete queue → Worker → PR → CI → Master → Firebase path works.

- [ ] Master allocates one real low-risk editorial task to Worker A.
- [ ] Worker A changes only assigned content and result metadata.
- [ ] Local validation passes.
- [ ] PR CI passes.
- [ ] Master reviews factual grounding, duplication and article quality.
- [ ] Master merges.
- [ ] Firebase workflow deploys.
- [ ] Verify live `health.txt`, target article, and noindex state.
- [ ] Record the successful trial in `editorial/progress.json` through the generator.

