# GameFinder Codex Master Protocol

## Role boundary

GPT Master and GPT Content Workers select themes, research facts, design structure, generate article prose, and perform editorial review. Codex Master receives a completed Content Batch through the `external-content-input` boundary. Codex Workers never generate or rewrite article prose.

Codex Master owns repository application, HTML/CSS/JavaScript work, registry and progress generation, validation/tests, Git branches/worktrees, Result review, integration preparation, and difficult code fixes.

## Resource-aware round

Every `t` or `a` round performs these decisions in order:

1. classify the selected task;
2. choose `local-script` when deterministic repository scripts can finish it;
3. otherwise choose `codex-master` when Master can safely complete it alone;
4. choose `codex-worker-wave` only when independent code tasks have a useful parallelization benefit;
5. choose `external-content-input` for content generation or article writing.

Persist `classification`, `execution_route`, `worker_count`, and `dispatch_reason` in batch, assignment, Result, and session state. The default Worker count is 0. A Worker Wave uses only the necessary 1-3 Workers and never starts all five automatically.

`t` advances exactly one deterministic round. `a` is session-continuous and reclassifies each round; it continues through zero-Worker local/Master work and later Waves until it needs GPT content, Worker execution, Master attention, a user decision, or reaches `APPROVAL_PENDING`. It is not scheduled automation.

## Optional Worker gate

Workers A-E are a default-off optional Worker pool. Dispatch only an immutable assignment with `classification: parallel_code_change` and `execution_route: codex-worker-wave`. Before dispatch, acquire exact path locks and verify the assigned base, branch, and worktree. Each Worker is assignment-driven, uses TDD, commits locally, and writes one v2 Result.

Master independently verifies Result identity, a single commit directly based on the assigned SHA, the cumulative base-to-Result diff, exact code ownership, all-completed task outcomes, and successful validation commands. Integration recomputes each decision from the exact Assignment and Result; only matching `REVIEW_PASSED` commits enter `integration/batch-XXXX` in deterministic Wave/Worker order.

## Recovery and approval

Reconciliation trusts persisted Result and Git/worktree evidence only. Missing Result evidence never implies completion. `DIRTY`, `STALE`, and `CORRUPTED` worktrees remain preserved, retain their locks, and require Master attention.

After clean integration validation, create explicit approval status `PENDING` and move the batch to `APPROVAL_PENDING`. Approval never advances automatically; an explicit user actor, reason, decision, and timestamp are required.

## Safety

Batch 0001 is read-only legacy v1 compatibility data. Never allocate, execute, modify, remove, or use it for synthetic runs. Never modify Homepage, article prose, game data, `.github/workflows/**`, `.firebaserc`, `firebase.json`, `public/index.html`, `public/robots.txt`, or `public/public/**`. Preserve `noindex,follow` and `Disallow: /`.

Never push, create a Pull Request, merge, deploy, force-reset, force-clean, or delete an unsafe worktree.
