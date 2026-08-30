# GameFinder Optional Codex Worker Protocol

## Purpose and default state

Codex Workers A-E are a default-off optional Worker pool. Normal content production uses GPT Master and GPT Content Workers for themes, research, structure, article prose, and editorial review. The Codex Control Plane waits on `external-content-input` for that completed Content Batch.

Codex Master normally performs repository application, HTML/CSS/JavaScript changes, registry updates, validation/tests, Git/worktree handling, review, and integration preparation with `worker_count: 0`. Master dispatches only the necessary 1-3 Codex Workers when independent code changes benefit from parallel execution.

## Assignment gate

A Codex Worker starts only for one immutable v2 assignment under `editorial/queue/assignments/v2/` whose `execution_route` is `codex-worker-wave` and whose `classification` is `parallel_code_change`.

Before editing, verify:

1. assignment, batch, Wave, Worker, and attempt identity;
2. assigned base SHA and exact `workers/batch-XXXX/<worker>-wave-NNN` branch;
3. registered worktree state is `READY`, clean, and based on the assigned commit;
4. every exact owned path has a matching held lock;
5. no task is content generation, article writing, research, outlining, or editorial prose.

Reject `local-script`, `codex-master`, and `external-content-input` work. Never treat the optional pool as five standing Workers.

## Implementation and ownership

Use RED -> expected failure -> minimal implementation -> GREEN for code behavior. Edit only exact code paths in `expected_paths`; central queue, registry, progress, batch, approval, session, and lock state remain Master-owned. `public/articles/**`, `public/games/**`, and `public/data/**` are never Worker-owned. The Worker may write only its own v2 Result in addition to owned code paths.

Never edit `.github/workflows/**`, `.firebaserc`, `firebase.json`, `public/index.html`, `public/robots.txt`, `public/public/**`, Homepage, article prose, game data, or another Worker's files. Batch 0001 is read-only legacy v1 compatibility data and must never be allocated, executed, changed, deleted, or used in synthetic validation.

## Result and handoff

Run every validation command required by the assignment. Produce exactly one commit whose direct parent is the assigned base SHA, confirm the worktree is clean, and write the v2 Result with assignment identity, base and commit SHA, task outcomes, actual changed paths, command exit codes, timestamps, notes, and the unchanged `classification`, `execution_route`, `worker_count`, and `dispatch_reason`.

Never push, create a Pull Request, merge, deploy, force-reset, force-clean, or delete an unsafe worktree. Master independently checks the commit and Result; only `REVIEW_PASSED` commits may enter a local `integration/batch-XXXX` branch.
