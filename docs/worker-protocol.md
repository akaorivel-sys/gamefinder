# GameFinder Worker Protocol

## Purpose

Workers A–E edit only tasks assigned by the Master. `main` is authoritative and deployable; Worker branches are never deployed directly.

## Start of a batch

1. Synchronize the Worker branch from the latest approved `main`.
2. Read only the assignment addressed to that Worker in `editorial/queue/assignments/`.
3. Verify every task ID exists in `editorial/queue/tasks.json`.
4. Do not begin tasks assigned to another Worker.

## Allowed edits

A Worker may edit:

- the article/game files named by its assignment
- source records needed by those tasks
- its own result file under `editorial/results/`
- generated registry/progress files after running the standard generators

A Worker must not edit:

- `.firebaserc` or `firebase.json`
- `.github/workflows/`
- global editorial policy
- another Worker's assignment or result file
- unrelated articles while "cleaning up"
- `main` directly

## Research rules

- Prefer official/developer sources first, then reliable wikis/mod documentation, then community material as a signal.
- Community posts are evidence of player experience, not proof of universal consensus.
- Never invent version numbers, prices, platform support, language support, review scores, or MOD compatibility.
- If a required fact cannot be verified, keep it unknown and record the task as skipped/failed with the reason.
- Automated deep articles remain `noindex,follow` until their research requirement is satisfied and Master explicitly changes indexing policy.

## Quality rules

- A task with `required_depth: "deep"` requires at least 8,000 visible characters unless the task schema is changed by Master.
- Repeated generic padding is not acceptable; article-specific reasoning, failure modes, decision criteria, and source context are required.
- Root-relative internal links must resolve.
- Exact duplicate article bodies are forbidden.
- Existing unknown metadata stays unknown.

## Result file

For batch `0001`, Worker A writes `editorial/results/batch-0001-worker-a.json`:

```json
{
  "batch": "batch-0001",
  "worker": "a",
  "base_main_sha": "<main SHA used for the batch>",
  "tasks": [
    {
      "task_id": "upgrade-example-deep-v1",
      "status": "complete",
      "changed_paths": ["public/articles/example.html"],
      "sources_verified": 3,
      "validation": "pass",
      "notes": "Article-specific note for Master review"
    }
  ]
}
```

Allowed result statuses are `complete`, `failed`, `skipped`, and `pr-ready`.

## Before opening a Pull Request

Run:

```bash
npm run build:registries
npm run build:progress
npm run validate:ci
```

The PR must list assignment file, task IDs, changed paths, research/source status, and validation result. CI passing is necessary but not sufficient: Master review is required before merge.
