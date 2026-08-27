# GameFinder Master/Worker Automation Control Plane Design

Date: 2026-08-27
Status: Approved by the implementation request
Baseline: `c204d865cf60f07fbb83037985f01e03a2f5e809`
Implementation branch: `infra/master-worker-automation`

## 1. Purpose and authority

This design adds a local, session-continuous control plane for one Codex Master and Workers A-E. It preserves the repository's existing editorial queue, registry, progress, protocol, and validation assets, while replacing the earlier Worker-PR-per-batch workflow.

This document supersedes the branch, Worker PR, orchestration-command, and first-trial portions of `docs/superpowers/specs/2026-08-26-gamefinder-master-worker-github-design.md`. Its safety, content-quality, registry, noindex, and Firebase deploy-root requirements remain in force.

The controlling rules are:

- Workers implement and commit on independent branches and worktrees, then write a structured Result.
- Workers do not create Pull Requests.
- Master accepts only reviewed Worker commits into `integration/batch-XXXX`.
- The only future GitHub PR is one final integration PR. This implementation does not push, create a PR, merge, or deploy.
- One Wave dispatches at most three Workers.
- `a` is session-continuous, not scheduled: it advances selection, allocation, Wave dispatch, tests, review, and subsequent Waves until it needs an external Worker result, a user decision, or reaches `APPROVAL_PENDING`.
- `t` advances one deterministic orchestration round and returns the next required action.

## 2. Compatibility boundary and storage

`editorial/queue/tasks.json` and `editorial/queue/assignments/batch-0001-worker-*.json` remain legacy v1 inputs. Batch 0001 is never mutated, removed, allocated, executed, or used as a synthetic target.

V2 control data is append-oriented:

```text
editorial/control/
  schemas/
  batches/
  locks/
  approvals/
  sessions/
  workers.json
editorial/queue/assignments/v2/
editorial/results/v2/
```

Production state uses `batch-0002` or later. Synthetic runs use a temporary repository and temporary state root outside the real editorial data tree; their only committed artifact is a deterministic fixture.

All persisted JSON uses UTF-8 and LF. `.gitattributes` declares LF for text and explicit binary extensions. Generated-state checks compare logical LF text so an already-created CRLF worktree does not produce false drift.

## 3. Queue and control schemas

The queue reader accepts:

- v1: a top-level task array with the existing snake_case task fields;
- v2: `{ "schema_version": 2, "queue_id": "...", "tasks": [...] }`.

Both normalize to an internal task with `task_id`, `task_type`, `priority`, `status`, `depends_on`, `expected_paths`, and source schema version. For compatible v1 article tasks, `expected_paths` is derived only from the declared `article_slug`. Unsupported or path-ambiguous v1 tasks remain ineligible and are reported, not guessed.

V2 JSON Schemas define queue, batch state, assignment, Worker Result, lock manifest, session state, and approval. Runtime validators enforce the same observable contracts without adding an external package.

## 4. Batch and assignment state machines

Batch states:

```text
DRAFT -> ALLOCATED -> ACTIVE -> REVIEW -> INTEGRATION_PREPARED
      -> APPROVAL_PENDING -> APPROVED -> COMPLETE
```

`ACTIVE`, `REVIEW`, or `INTEGRATION_PREPARED` may become `INTERRUPTED`. Reconciliation moves an interrupted batch to the state proven by persisted assignments, Results, commits, locks, and worktrees. Invalid forward or backward transitions fail without changing disk state.

Assignment states:

```text
ALLOCATED -> DISPATCHED -> RUNNING -> RESULT_READY
RESULT_READY -> REVIEW_PASSED -> INTEGRATED
RESULT_READY -> REVIEW_REJECTED
DISPATCHED or RUNNING -> INTERRUPTED
```

`BLOCKED` and `FAILED` are terminal for automatic allocation. A task ID recorded in assignment history is never assigned again automatically. Reassignment requires an explicit task ID in `allow_reassignment_task_ids` and creates a new assignment with an incremented attempt.

Every transition appends `{from,to,at,reason}` and updates `updated_at`. Time is injected into domain functions so tests remain deterministic.

## 5. Dependencies, ownership, and locks

A task is eligible only when every `depends_on` ID is completed. Missing dependencies and cycles are reported as blocking graph errors. Merely allocated, running, failed, skipped, or rejected dependencies do not satisfy the graph.

Each assignment owns an exact normalized repository-relative file set. Paths must use `/`, must not be absolute, must not contain `..`, and must not name a forbidden target. Forbidden targets are:

- `.github/workflows/**`
- `.firebaserc`
- `firebase.json`
- `public/index.html`
- `public/robots.txt`
- `public/public/**`
- Batch 0001 assignment files

The allocator acquires one exclusive lock per owned path. Conflicting tasks cannot enter the same or later active Wave. A lock contains batch, Wave, assignment, Worker, path, state, and timestamps. Locks release only after reviewed integration or an explicit Master cancellation; interruption does not release them.

Workers may change owned content paths and their own v2 Result file. Central queue, registry, progress, batch, approval, and lock state remain Master-owned.

## 6. Wave allocation and dispatch

Allocation reuses the existing task weights and deterministic priority ordering. It filters by dependency readiness, assignment history, forbidden paths, and active locks, then balances workload among available Workers A-E.

A Wave contains no more than three distinct Workers. A Worker with a non-terminal assignment or unsafe worktree is unavailable. The dispatcher writes immutable v2 assignment files and a dispatch manifest naming the custom agent, branch, worktree path, assignment path, and expected Result path.

The Master session uses the dispatch manifest to start the project-scoped custom agents. The control plane never assumes GitHub Actions, scheduled automation, or an ability to invoke an unrelated chat.

## 7. Worker worktree lifecycle

Worker branches use `workers/batch-XXXX/<worker>-wave-NNN`. Integration uses `integration/batch-XXXX`. Git operations call `git` with an argument array and never interpolate shell commands.

Before create, verify, resume, or cleanup, the lifecycle module checks:

- the repository is a Git worktree;
- the requested base commit exists;
- the target path is within the configured worktree root;
- an existing path is registered to the expected branch;
- the Worker base is an ancestor of the Worker commit;
- status and untracked files;
- the expected branch and assignment identity.

Protection outcomes are `READY`, `DIRTY`, `STALE`, and `CORRUPTED`. Automatic reuse and cleanup occur only for `READY`. Dirty worktrees are preserved for manual recovery. Stale or corrupted worktrees are never deleted by the control plane. Cleanup verifies the exact registered path and branch before invoking non-forced `git worktree remove`.

## 8. Worker Result and Master review

A v2 Result identifies schema version, Result ID, batch, Wave, assignment, Worker, base SHA, commit SHA, task outcomes, changed paths, validation commands, exit codes, timestamps, and notes.

Master review independently verifies:

- Result/assignment identity and permitted transition;
- Worker commit exists and descends from the assigned base;
- actual commit diff exactly matches the Result's changed paths;
- every changed path is owned and not forbidden;
- all assigned task IDs have an allowed outcome;
- required tests report exit code 0;
- the assignment Result state is reviewable.

Review writes a structured decision. Only `REVIEW_PASSED` commits are eligible for integration. A rejected Result does not alter integration state or free its task for automatic reassignment.

## 9. Integration and user approval

The integration preparer creates `integration/batch-XXXX` from the batch base in its own worktree and cherry-picks reviewed commits in deterministic Wave/Worker order. Any conflict stops preparation and preserves evidence for Master recovery.

After integration validation passes, the batch stores integration branch/head and creates approval state:

```json
{"schema_version":2,"batch_id":"batch-XXXX","status":"PENDING"}
```

No command implicitly changes `PENDING` to `APPROVED`. Approval requires an explicit user-driven command. Even after approval, this implementation does not push, open a PR, merge to `main`, or deploy.

## 10. Commands and recovery

`npm run t -- [options]` performs one round: load, validate, reconcile, review available Results, prepare integration when ready, or allocate one Wave.

`npm run a -- [options]` repeats deterministic rounds in the same invocation until:

- a Wave requires real Worker execution;
- a dirty, stale, corrupted, failed, rejected, or conflicting state needs attention;
- no dependency-ready work remains;
- approval is `PENDING`.

Every state write is atomic through a sibling temporary file and rename. A session checkpoint records command mode, batch, last completed phase, outstanding assignment IDs, and the next action. `reconcile` is idempotent and reconstructs assignment states from validated Results and Git evidence without inventing completion.

## 11. Codex agent configuration

Project-scoped custom agents live in `.codex/agents/worker-{a-e}.toml`; `.codex/config.toml` caps concurrent spawned threads at three. Each Agent is assignment-driven and must:

- read only the assignment path provided by Master;
- verify identity, base, locks, and worktree before editing;
- use TDD for code behavior;
- touch owned paths only;
- run assignment tests;
- commit locally;
- write its v2 Result;
- never push, create a PR, merge, deploy, or change forbidden files.

`AGENTS.md` defines the Master meanings of `t` and `a` and keeps Batch 0001 read-only.

## 12. Validation and synthetic proof

Control Plane validation checks all schemas and fixtures, v1 Batch 0001 compatibility, v2 transitions, graph evaluation, locks, assignment history, Agent configs, command safety, forbidden targets, and path normalization.

The synthetic end-to-end run creates a temporary Git repository, a no-op v2 queue, a synthetic batch numbered outside production, a Worker worktree, a Worker commit, a Result, a Master review, an integration branch, and a `PENDING` approval. It then removes only verified-clean temporary worktrees and confirms no registered residue remains. It never reads or writes public site content, real editorial tasks, Homepage, Firebase files, GitHub Actions, remote refs, or Batch 0001.

## 13. Completion criteria

- Existing content validation passes without registry/progress churn caused by EOL.
- Batch 0001 hashes remain identical to the baseline.
- All new domain and Git lifecycle behavior has recorded RED then GREEN evidence.
- Full Control Plane validation and tests pass.
- Synthetic flow reaches `APPROVAL_PENDING` with no worktree residue.
- Git diff contains no forbidden or site-content paths and no `public/public`.
- The branch has local commits only; no push, PR, merge, or deploy occurs.
