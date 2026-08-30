# GameFinder Master/Worker Control Plane

## Operating model

This is a local, resumable Control Plane. GPT Master/GPT Content Workers create and approve article prose outside the Codex Worker pool. Completed Content Batches enter as `external-content-input`; Codex Master applies them to the repository.

Codex Workers A-E are a default-off optional Worker pool for parallel code only. Normal rounds use `worker_count: 0`. A `codex-worker-wave` starts only the necessary 1-3 assignment-driven Workers.

## Routes

| Route | Owner | Worker count |
| --- | --- | --- |
| `local-script` | deterministic local script | 0 |
| `codex-master` | Codex Master | 0 |
| `codex-worker-wave` | optional Codex Workers | 1-3 |
| `external-content-input` | GPT Master/GPT Content Workers | 0 |

Content generation, research, outlining, article writing, and editorial article prose always use `external-content-input`. Applying an already completed Content Batch is a `codex-master` repository task.

## Commands

Prepare a validated state JSON for Batch 0002 or later. Preview one round without writing:

```text
npm run t -- --state <state.json>
```

Preview session-continuous rounds:

```text
npm run a -- --state <state.json>
```

Add `--apply` only after inspecting the preview. Apply writes the updated state and session checkpoint atomically. An allocated Wave is prepared in verified worktrees on the next applied round; supplied Result/worktree evidence is reconciled before review, integration, and approval phases. Batch 0001 is read-only and is always refused.

Run repository content gates, Control Plane tests, validation, and the isolated synthetic proof:

```text
npm run validate:ci
node --test --test-timeout=60000 tests/control-plane/*.test.mjs
npm run validate:control-plane
npm run control:synthetic
```

The synthetic proof uses a temporary Git repository and covers `local-script` with 0 Workers, `codex-master` with 0 Workers, a two-Worker `codex-worker-wave`, and a negative article-writing case that creates no dispatch. It reaches Master review, integration preparation, `APPROVAL_PENDING`, and zero leftover worktrees.

## Attention and recovery

On interruption, rerun reconciliation with current assignment, Result, and worktree evidence. A clean matching Result commit may recover to `RESULT_READY`; missing evidence does nothing. `DIRTY`, `STALE`, and `CORRUPTED` evidence stops automation and keeps locks/worktrees intact.

Only a single-commit Worker Result whose Assignment, Result, actual diff, and recomputed Master decision all match may be cherry-picked to `integration/batch-XXXX`. Conflicts preserve the integration worktree for diagnosis. User approval remains explicitly `PENDING` until a named user supplies a decision and reason.

## Non-negotiable safety

Never push, create a Pull Request, merge, deploy, or change `main`. Never change Homepage, article prose, game data, Batch 0001, `.github/workflows/**`, `.firebaserc`, `firebase.json`, `public/index.html`, `public/robots.txt`, or create `public/public`. Preserve `noindex,follow` and `robots.txt` `Disallow: /`.
