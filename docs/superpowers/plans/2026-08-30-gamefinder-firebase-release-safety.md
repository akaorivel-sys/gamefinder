# GameFinder Firebase Release Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Firebase Production deployment to one quality-gated, serialized, verified workflow while preserving a separate validation-gated PR Preview path.

**Architecture:** Node.js validators enforce Firebase configuration and GitHub Workflow policy with fixture-driven tests. GitHub Actions then call those validators before Preview or live deployment, and only `deploy-firebase.yml` may target the live channel.

**Tech Stack:** Node.js 22 ESM, `node:test`, GitHub Actions YAML, Firebase Hosting GitHub Action.

**Spec:** `docs/superpowers/specs/2026-08-30-gamefinder-firebase-release-safety-design.md`

## Global Constraints

- Base every change on remote main `99479cdd760864240abebcef073b83e3841e9515`.
- Do not modify Homepage, articles, games, game data, Batch 0001, `.firebaserc`, `firebase.json`, or indexing policy.
- Do not push, open a PR, merge, or deploy in this batch.
- Use Codex Master only; optional Worker count remains zero.

---

### Task 1: Firebase release preflight

**Files:**
- Create: `scripts/lib/release-safety/firebase-config.mjs`
- Create: `tests/release-safety/firebase-config.test.mjs`

**Interfaces:**
- Produces: `validateFirebaseRelease(root, { expectedProjectId }) -> { ok, errors, checks }`.

- [x] Write fixtures for a valid release root, malformed `.firebaserc`, project mismatch, missing noindex, missing robots disallow, invalid public root, and `public/public`.
- [x] Run `node --test tests/release-safety/firebase-config.test.mjs` and verify RED because the validator module is missing.
- [x] Implement JSON parsing and filesystem/content checks without extensionless `require()`.
- [x] Run the focused test and verify all cases PASS.
- [x] Commit the validator and tests.

### Task 2: Workflow policy validator

**Files:**
- Create: `scripts/lib/release-safety/workflow-policy.mjs`
- Create: `scripts/validate-release-safety.mjs`
- Create: `tests/release-safety/workflow-policy.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `validateWorkflowPolicy(root) -> { ok, errors, checks }`.
- Consumes: `validateFirebaseRelease` from Task 1.

- [x] Write fixtures that fail for two production workflows, missing quality gates, deploy-before-validation, missing concurrency, stale-main exposure, malformed Firebase JSON, project mismatch, missing noindex, and PR live-channel deployment.
- [x] Run the focused test and verify expected RED failures.
- [x] Implement the workflow/config validation CLI and add `validate:release-safety` to `package.json` and `validate:ci`.
- [x] Run both focused release-safety test files and verify PASS.
- [x] Commit the policy validator, CLI, package scripts, and tests with the Workflow consolidation.

### Task 3: Consolidate GitHub Actions

**Files:**
- Delete: `.github/workflows/firebase-hosting-merge.yml`
- Delete: `.github/workflows/quality-gate.yml`
- Modify: `.github/workflows/deploy-firebase.yml`
- Modify: `.github/workflows/firebase-hosting-pull-request.yml`
- Modify: `scripts/validate-control-plane.mjs`
- Modify: `tests/control-plane/validation.test.mjs`

**Interfaces:**
- Production: one `main` push Workflow, serialized by `firebase-production`.
- PR: `quality-gate` job followed by Preview via `needs: quality-gate`.

- [x] Run `npm run validate:release-safety` against the current two-production-workflow state and verify RED.
- [x] Remove the duplicate production workflow and make validation precede the remaining live deploy.
- [x] Move the required `quality-gate` check into the PR Preview workflow and make Preview depend on it.
- [x] Transfer Workflow safety ownership from the completed Control Plane implementation gate to the release-safety validator while keeping content and Firebase config protected.
- [x] Run `npm run validate:release-safety`, Control Plane tests, and content validation; verify PASS.
- [x] Commit the Workflow consolidation.

### Task 4: Documentation and final verification

**Files:**
- Create: `docs/firebase-release-safety.md`
- Modify: `docs/superpowers/plans/2026-08-30-gamefinder-firebase-release-safety.md`

**Interfaces:**
- Records production/preview responsibilities, current unprotected main state, and recommended ruleset.

- [x] Document the final pipeline, failure behavior, and audited GitHub settings without changing repository settings.
- [x] Mark completed plan steps and record RED/GREEN evidence.
- [x] Run all release-safety tests, Control Plane validation tests, `npm run validate:control-plane`, `npm run validate:ci`, and `git diff --check` before the documentation commit.
- [ ] Verify forbidden target changes are zero, the worktree is clean after commit, and Push/PR/Merge/Deploy counts are zero.
- [ ] Commit the documentation and perform final verification on the clean branch.

## TDD and validation evidence

- Firebase configuration RED: 7/7 fixtures failed while the module was absent; GREEN: 7/7 passed after JSON and indexing-policy validation was implemented.
- Workflow policy RED: 8/8 fixtures initially failed while the module/package command was absent. The stale-main test then failed independently until the freshness guard became mandatory.
- Repository-state RED: two production Workflows, two `live` declarations, and no gated PR Preview were detected before Workflow consolidation.
- Release Safety GREEN: 16/16 tests passed and the repository report showed one production Workflow, one PR Preview Workflow, and one `live` declaration.
- Control Plane integration: 7/7 validation tests passed after Workflow ownership moved to Release Safety.
- Pre-documentation verification: `validate:control-plane`, `validate:ci` (including existing content tests 7/7), and `git diff --check` passed.
