# GameFinder Master/Worker Automation Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, resumable, resource-aware Control Plane that defaults to zero Codex Workers, dispatches at most three assignment-driven optional Workers only for beneficial parallel code work, integrates only Master-approved commits, and stops at user approval without touching GitHub or Firebase.

**Architecture:** GPT Master and GPT Content Workers produce completed Content Batches; Codex Master accepts that boundary and owns repository application, code, registry, validation, Git, review, and integration preparation. Preserve the legacy queue and Batch 0001 as read-only v1 inputs, and layer v2 batch, assignment, Result, lock, session, and approval records under append-oriented control directories. Put pure task classification and resource routing before the existing optional Wave primitive, keep schema/state/allocation logic separate from guarded Git worktree operations, then compose them through deterministic `t`, session-continuous `a`, reconciliation, validation, and a temporary synthetic repository.

**Tech Stack:** Node.js 22+ ESM, built-in `node:test`, JSON/JSON Schema, Git worktrees, project-scoped Codex Agent TOML.

**Spec:** `docs/superpowers/specs/2026-08-27-gamefinder-master-worker-automation-control-plane-design.md`

## Global Constraints

- Work only in the native worktree on `infra/master-worker-automation` from baseline `c204d865cf60f07fbb83037985f01e03a2f5e809`.
- Do not modify `main`, push, create a Pull Request, merge, deploy, or schedule automation.
- Do not modify `.github/workflows/**`, `.firebaserc`, `firebase.json`, Homepage, article bodies, or game data.
- Do not change, delete, allocate, or execute Batch 0001; use it only as a v1 compatibility fixture.
- Do not create `public/public`.
- Preserve `noindex,follow` and `robots.txt` `Disallow: /`.
- Dispatch at most three Workers in one Wave.
- Codex Workers A-E are a default-off optional code pool. Do not assign content generation, article writing, research, or editorial prose to them.
- Every `t`/`a` round selects `local-script`, `codex-master`, `codex-worker-wave`, or `external-content-input`; `worker_count` defaults to zero.
- All production code follows a recorded RED -> expected failure -> minimal GREEN -> PASS cycle.
- Synthetic verification uses a temporary repository and no-op files only.

---

### Task 1: Normalize EOL and establish a clean baseline

**Files:**
- Create: `.gitattributes`
- Create: `scripts/lib/control-plane/io.mjs`
- Create: `tests/control-plane/io.test.mjs`
- Modify: `scripts/build-registries.mjs`
- Modify: `scripts/build-progress.mjs`

**Interfaces:**
- Produces: `normalizeLf(text: string): string`, `generatedTextMatches(previous: string|null, next: string): boolean`, and atomic JSON writes used by all later state.
- Consumes: existing registry/progress generators without changing generated data semantics.

- [ ] **Step 1: Write the RED tests.** Assert CRLF and LF generated JSON compare equal, unequal JSON remains unequal, an atomic write leaves only the target, and `git check-attr eol -- package.json` reports `lf`.
- [ ] **Step 2: Run `node --test tests/control-plane/io.test.mjs`.** Record the expected missing-module/attribute failure in the TDD evidence log.
- [ ] **Step 3: Implement minimal EOL/atomic IO and `.gitattributes`.** Use `text=auto eol=lf`, explicit binary extensions, `fs.writeFileSync(temp)` followed by `fs.renameSync`, and normalized comparisons in both generators.
- [ ] **Step 4: Run the focused test and `npm run validate:ci`.** Require the EOL tests and the pre-existing validation suite to pass without rewriting registry, progress, public, or Batch 0001 files.
- [ ] **Step 5: Verify diff scope and commit.** Commit as `chore: normalize control plane text files`.

### Task 2: Define v1/v2 schemas and state machines

**Files:**
- Create: `editorial/control/schemas/queue-v2.schema.json`
- Create: `editorial/control/schemas/batch-state-v2.schema.json`
- Create: `editorial/control/schemas/assignment-v2.schema.json`
- Create: `editorial/control/schemas/worker-result-v2.schema.json`
- Create: `editorial/control/schemas/lock-manifest-v2.schema.json`
- Create: `editorial/control/schemas/session-state-v2.schema.json`
- Create: `editorial/control/schemas/approval-v2.schema.json`
- Create: `scripts/lib/control-plane/schema.mjs`
- Create: `scripts/lib/control-plane/state-machine.mjs`
- Create: `tests/control-plane/schema.test.mjs`
- Create: `tests/control-plane/state-machine.test.mjs`

**Interfaces:**
- Produces: `normalizeQueue(input)`, `validateBatchState(value)`, `validateAssignment(value)`, `validateWorkerResult(value)`, `validateLockManifest(value)`, `validateSessionState(value)`, `validateApproval(value)`, `transitionBatch(batch,to,context)`, and `transitionAssignment(assignment,to,context)`.
- Consumes: the existing v1 task array and Batch 0001 assignment shape without mutation.

- [ ] **Step 1: RED queue/schema behavior.** Test v1 arrays normalize, v2 queues validate, v1 article paths derive safely, ambiguous tasks stay ineligible, and malformed identity/SHA/path/status fields fail with field-specific errors.
- [ ] **Step 2: Run the schema test and record expected failures.** Each new validator must be exercised by an observable accepted or rejected document.
- [ ] **Step 3: Implement minimal validators and JSON Schemas.** Keep allowed values and required fields identical between runtime code and schema documents.
- [ ] **Step 4: RED state behavior.** Test legal transition history, invalid transition immutability, terminal failure/rejection, interruption, and explicit-only approval.
- [ ] **Step 5: Implement state transitions and run both focused suites.** Inject timestamps; never call the clock inside pure transition logic.
- [ ] **Step 6: Commit as `feat: add control plane schemas and state machines`.**

### Task 3: Evaluate dependencies, ownership, locks, and reassignment

**Files:**
- Modify: `scripts/lib/allocation.mjs`
- Create: `scripts/lib/control-plane/dependencies.mjs`
- Create: `scripts/lib/control-plane/ownership.mjs`
- Create: `scripts/lib/control-plane/wave.mjs`
- Create: `tests/control-plane/dependencies.test.mjs`
- Create: `tests/control-plane/ownership.test.mjs`
- Create: `tests/control-plane/wave.test.mjs`

**Interfaces:**
- Produces: `evaluateDependencies(tasks, completedIds)`, `normalizeOwnedPath(path)`, `acquireLocks(manifest,assignment,at)`, `releaseLocks(manifest,assignmentId,at)`, `assertOwnedChanges(assignment,paths)`, and `allocateWave({tasks,batch,workers,locks,maxWorkers})`.
- Consumes: existing `TASK_WEIGHTS` and deterministic priority ordering.

- [ ] **Step 1: RED dependency tests.** Cover ready tasks, incomplete dependencies, missing IDs, and cycles with literal expected task/error lists.
- [ ] **Step 2: Implement dependency evaluation and confirm GREEN.** Only completed IDs satisfy dependencies.
- [ ] **Step 3: RED ownership/lock tests.** Reject absolute, traversal, backslash, forbidden, Batch 0001, and `public/public` paths; reject overlapping locks and out-of-scope diffs; preserve locks on interruption.
- [ ] **Step 4: Implement ownership and exclusive locks, then confirm GREEN.** Use exact repository-relative POSIX paths and immutable return values.
- [ ] **Step 5: RED Wave tests.** Prove at most three Workers, balanced load, no active-Worker reuse, no assigned-task reuse, explicit attempt increment for approved reassignment, dependency filtering, and conflict-free ownership.
- [ ] **Step 6: Implement minimal Wave selection, run old and new allocation tests, and commit.** Commit as `feat: allocate safe worker waves`.

### Task 4: Guard Worker worktree create, verify, resume, and cleanup

**Files:**
- Create: `scripts/lib/control-plane/git.mjs`
- Create: `scripts/lib/control-plane/worktree.mjs`
- Create: `tests/control-plane/worktree.test.mjs`
- Create: `tests/fixtures/control-plane/.gitkeep`

**Interfaces:**
- Produces: `runGit(repo,args,options)`, `createWorkerWorktree(options)`, `verifyWorkerWorktree(options)`, `resumeWorkerWorktree(options)`, and `cleanupWorkerWorktree(options)`.
- Consumes: an injected repository path, worktree root, base SHA, exact branch, and expected result commit.

- [ ] **Step 1: RED create/verify tests in a temporary Git repository.** Prove a clean expected branch is `READY`, the base is an ancestor, and the path is registered.
- [ ] **Step 2: Implement argument-array Git execution and minimal create/verify.** Do not enable shell execution or forced worktree operations.
- [ ] **Step 3: RED protection tests.** Independently produce and detect dirty, stale, corrupted, wrong-branch, outside-root, and unregistered-path states.
- [ ] **Step 4: Implement resume/cleanup guards.** Resume reports protected state without overwriting; cleanup removes only an exact verified-clean registered worktree.
- [ ] **Step 5: Run focused tests, `git worktree list --porcelain`, and commit.** Commit as `feat: guard worker worktree lifecycle`.

### Task 5: Add resource-aware routing and persist dispatch decisions

**Files:**
- Create: `scripts/lib/control-plane/resource-routing.mjs`
- Create: `tests/control-plane/resource-routing.test.mjs`
- Modify: `scripts/lib/control-plane/schema.mjs`
- Modify: `editorial/control/schemas/batch-state-v2.schema.json`
- Modify: `editorial/control/schemas/assignment-v2.schema.json`
- Modify: `editorial/control/schemas/worker-result-v2.schema.json`
- Modify: `editorial/control/schemas/session-state-v2.schema.json`
- Modify: `tests/control-plane/schema.test.mjs`
- Modify: `tests/control-plane/state-machine.test.mjs`

**Interfaces:**
- Produces: `classifyTask(task)`, `selectExecutionRoute(task)`, and `planResources(tasks)` with persisted `classification`, `execution_route`, `worker_count`, and `dispatch_reason`.
- Consumes: normalized queue tasks before any call to the existing `allocateWave`/`createWorkerWave` primitive.

- [ ] **Step 1: RED route-selection tests.** Prove local scripts and Master work select zero Workers, independent parallel code selects only the useful 1-3 Workers, and the default route uses zero Workers.
- [ ] **Step 2: RED content boundary tests.** Prove `content_generation` and `article_writing` can never select `codex-worker-wave`, even when parallel flags or a requested Worker count are present; completed Content Batch application selects Codex Master.
- [ ] **Step 3: Implement pure classification and resource planning, then confirm GREEN.** Route priority is content boundary, local script, Codex Master, then beneficial parallel code; only the Worker route may return a non-zero count.
- [ ] **Step 4: RED persistence tests.** Require dispatch metadata in batch, assignment, Result, and session state, constrain route/count combinations, and prove the JSON Schema and runtime validators agree.
- [ ] **Step 5: Update runtime/JSON schemas and state fixtures, then confirm GREEN.** Set the JSON Schema default for `worker_count` to zero while requiring persisted state to include the actual decision.
- [ ] **Step 6: Run focused suites and review that existing Wave limit, deduplication, locks, and worktree work remain intact.** Commit as `feat: route control plane resources` when Git metadata is writable.

### Task 6: Add optional assignment-driven Worker Agents and Result writer

**Files:**
- Create: `.codex/config.toml`
- Create: `.codex/agents/worker-a.toml`
- Create: `.codex/agents/worker-b.toml`
- Create: `.codex/agents/worker-c.toml`
- Create: `.codex/agents/worker-d.toml`
- Create: `.codex/agents/worker-e.toml`
- Create: `AGENTS.md`
- Create: `editorial/control/workers.json`
- Create: `scripts/worker-control.mjs`
- Create: `scripts/lib/control-plane/worker.mjs`
- Create: `tests/control-plane/worker.test.mjs`

**Interfaces:**
- Produces: `loadWorkerDefinition(root,workerId)`, `verifyWorkerStart(context)`, and `buildWorkerResult(context)` plus `node scripts/worker-control.mjs verify|result`.
- Consumes: one immutable v2 assignment and its verified worktree/lock state.

- [ ] **Step 1: RED Agent/definition tests.** Parse all five project-scoped TOML files through the production loader, assert unique IDs A-E, default-off optional-pool wording, assignment-driven instructions, explicit content-prose prohibition, three-thread cap, and the same forbidden targets as runtime ownership.
- [ ] **Step 2: RED Worker start/Result tests.** Reject identity, base, branch, lock, dirty-state, uncommitted-change, changed-path, and failed-test mismatches; accept a literal valid Result.
- [ ] **Step 3: Implement Worker definitions, Agent TOML, start checks, and Result builder.** Omit fixed model settings so each Agent inherits the approved parent model/effort. Reject any assignment whose execution route is not `codex-worker-wave` or whose classification is content generation/article writing.
- [ ] **Step 4: Run focused tests and a no-write Worker verify fixture.** Confirm no Git remote operation is present or invoked.
- [ ] **Step 5: Commit as `feat: add assignment driven worker agents`.**

### Task 7: Implement Master review, integration preparation, and approval

**Files:**
- Create: `scripts/lib/control-plane/review.mjs`
- Create: `scripts/lib/control-plane/integration.mjs`
- Create: `scripts/lib/control-plane/approval.mjs`
- Create: `tests/control-plane/review.test.mjs`
- Create: `tests/control-plane/integration.test.mjs`
- Create: `tests/control-plane/approval.test.mjs`

**Interfaces:**
- Produces: `reviewWorkerResult(context)`, `prepareIntegration(context)`, `buildPendingApproval(context)`, and `applyUserApproval(approval,decision,context)`.
- Consumes: actual Git commit/diff evidence, reviewed assignments, and deterministic Wave/Worker order.

- [ ] **Step 1: RED review tests.** Reject forged Result paths, mismatched actual diff, non-descendant commit, failed command, missing task outcome, forbidden file, and wrong identity; accept a complete owned commit.
- [ ] **Step 2: Implement independent Master review and confirm GREEN.** Never trust Result-declared paths without comparing the actual commit.
- [ ] **Step 3: RED integration tests.** Prove only passed commits are cherry-picked, order is stable, conflicts stop without approval, and branch is exactly `integration/batch-XXXX` from the batch base.
- [ ] **Step 4: Implement integration in a dedicated worktree and confirm GREEN.** Do not merge to `main`, push, or create a PR.
- [ ] **Step 5: RED then GREEN approval tests.** Default to `PENDING`; accept only explicit `APPROVED`/`REJECTED` with actor, reason, and timestamp.
- [ ] **Step 6: Commit as `feat: add master review and integration gate`.**

### Task 8: Compose resource-aware `t`, session-continuous `a`, and interrupted-session reconciliation

**Files:**
- Create: `scripts/control-plane.mjs`
- Create: `scripts/lib/control-plane/store.mjs`
- Create: `scripts/lib/control-plane/reconcile.mjs`
- Create: `scripts/lib/control-plane/orchestrator.mjs`
- Create: `tests/control-plane/reconcile.test.mjs`
- Create: `tests/control-plane/orchestrator.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `createControlStore(root)`, `reconcileBatch(context)`, `runRound(context)`, `runContinuous(context)`, `npm run t`, and `npm run a`.
- Consumes: validated queue/control state, worktree evidence, Results, review decisions, and integration/approval services injected for tests.

- [ ] **Step 1: RED store/reconcile tests.** Prove atomic checkpoint writes, idempotence, Result recovery, dirty worktree preservation, missing Result non-completion, stale/corrupted attention states, and no lock release on interruption.
- [ ] **Step 2: Implement store/reconcile and confirm GREEN.** Reconstruction uses evidence; it never assumes Worker success.
- [ ] **Step 3: RED `t` tests.** One call performs exactly one next action, classifies it before allocation, advances zero-Worker local/Master routes, and refuses Batch 0001, an unsafe repository, and an invalid state.
- [ ] **Step 4: RED `a` tests.** It reclassifies every round, loops through zero-Worker internal phases without a Wave, dispatches only the needed optional Workers with a maximum of three, continues to later rounds when Results are supplied, and stops on external content/Worker work, attention, no-ready-work, or `APPROVAL_PENDING`.
- [ ] **Step 5: Implement orchestrator/CLI and package aliases.** Default real commands preview; state-changing execution requires explicit `--apply` and a batch ID of 0002 or later.
- [ ] **Step 6: Run focused and full Control Plane tests, then commit.** Commit as `feat: add resumable master commands`.

### Task 9: Validate the Control Plane and run complete synthetic routes

**Files:**
- Create: `scripts/validate-control-plane.mjs`
- Create: `scripts/run-synthetic-control-plane.mjs`
- Create: `tests/control-plane/validation.test.mjs`
- Create: `tests/control-plane/synthetic.test.mjs`
- Create: `tests/fixtures/control-plane/queue-v2.json`
- Create: `docs/master-worker-control-plane.md`
- Create during execution: `docs/superpowers/plans/2026-08-27-gamefinder-master-worker-automation-control-plane-tdd-log.md`
- Modify: `docs/worker-protocol.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run validate:control-plane`, `npm run control:synthetic`, and operator documentation for `t`, `a`, reconcile, approval, and cleanup.
- Consumes: every prior module and a temporary synthetic Git repository.

- [ ] **Step 1: RED validation tests.** Mutate each schema/config/forbidden-path fixture and prove the validator exits non-zero with a specific diagnostic; prove Batch 0001 is read-only compatible.
- [ ] **Step 2: Implement the validator and confirm GREEN.** Include hashes/scope checks for Batch 0001 and protected paths.
- [ ] **Step 3: RED synthetic tests.** Expect separate summaries for `local-script` with zero Workers, `codex-master` with zero Workers, and parallel code with only the needed Workers (maximum three). The parallel summary reaches Allocation, Worker worktree/commit/Result, `REVIEW_PASSED`, integration head, `APPROVAL_PENDING`, and zero leftover worktrees.
- [ ] **Step 4: RED content negative test.** Prove content generation/article writing stops at `external-content-input` with zero Codex Workers and no dispatch manifest.
- [ ] **Step 5: Implement the temporary no-op synthetic flows and confirm GREEN.** Delete only the verified temporary root; never name the real repository as a cleanup target.
- [ ] **Step 6: Record every RED/GREEN command and observed outcome in the TDD log.** The log identifies the behavior protected by each test group.
- [ ] **Step 7: Run fresh completion verification.** Execute `npm run validate:ci`, `npm run validate:control-plane`, all `tests/control-plane/*.test.mjs`, `npm run control:synthetic`, forbidden-diff scans, Batch 0001 hash comparison, noindex/robots checks, `public/public` absence, `git diff --check`, `git status`, and `git worktree list --porcelain`.
- [ ] **Step 8: Review the complete branch diff and commit.** Commit as `test: validate master worker control plane` when Git metadata is writable.
