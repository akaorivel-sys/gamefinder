# GameFinder Control Plane Instructions

## Authority boundary

GPT Master and GPT Content Workers own article theme selection, research, structure, article prose, and editorial review. The Codex Control Plane accepts a completed Content Batch through `external-content-input`; it does not use Codex Workers to create or rewrite prose.

Codex Master owns repository application, HTML/CSS/JavaScript changes, registry generation, validation/tests, Git branches and worktrees, Master review, integration preparation, and difficult code fixes.

## Commands

- `t` advances exactly one deterministic Control Plane round. It classifies the selected task, tries a `local-script` route first, then `codex-master`, and creates a `codex-worker-wave` only when independent code changes benefit from parallel work.
- `a` is session-continuous. It repeats newly classified rounds in the current Codex session, including zero-Worker local and Master rounds, until external input, Worker completion, attention, user approval, or `APPROVAL_PENDING` is required. It is not a scheduled automation.

## Optional Codex Worker pool

Codex Workers A-E are a default-off optional Worker pool. The default `worker_count` is 0. Start only the necessary 1-3 Workers for an assignment whose route is `codex-worker-wave`; never start all five automatically.

Workers are assignment-driven. They must verify the exact v2 assignment, Worker ID, base SHA, branch/worktree identity, READY status, and held locks before editing. They use TDD, touch only owned code paths, produce exactly one commit directly based on the assigned SHA, and write a structured v2 Result. They must reject content generation, article writing, research, outlining, editorial prose, `local-script`, `codex-master`, and `external-content-input` assignments. `public/articles/**`, `public/games/**`, and `public/data/**` are never Worker-owned.

## Safety

Batch 0001 is a read-only legacy v1 compatibility fixture. Never allocate, execute, rewrite, remove, or use it as a synthetic target.

Never modify `.github/workflows/**`, `.firebaserc`, `firebase.json`, `public/index.html`, `public/robots.txt`, `public/public/**`, Homepage, article prose, or game data during Control Plane implementation. Preserve `noindex,follow` and `robots.txt` `Disallow: /`.

Never push, create a Pull Request, merge, deploy, force-reset, force-clean, or remove a dirty, stale, or corrupted worktree. Only Master-reviewed Worker commits may be prepared on `integration/batch-XXXX`; final approval remains explicitly user-driven and local.
