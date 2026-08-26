# GameFinder Master/Worker GitHub Architecture

Date: 2026-08-26
Status: Approved architecture, pending written-spec review
Target repository: `GameFinder` (public)
Current baseline: GameFinder v29

## 1. Purpose

GameFinder will move from ZIP-based, single-chat iteration to a GitHub-centered workflow that supports one Master chat and five Worker chats working in parallel without directly overwriting one another.

The system must make it possible to grow toward:

- 1,000 games with stronger Editorial/Enriched coverage
- 1,000 deep articles as the first article milestone
- multiple deep articles for higher-priority games
- repeatable quality validation before integration
- Master-controlled merges
- automatic Firebase Hosting deployment after approved merges
- public site availability while retaining `noindex` until indexing is intentionally enabled later

The design prioritizes content integrity and recoverability over maximum raw generation speed.

## 2. Current Baseline

The v29 baseline already contains:

- 400 locally enriched editorial game records in `data/games.json`
- 180 deep articles after the v25-v29 batch
- a larger set of legacy/data-guide article pages
- discovery, recommendation, comparison, catalog, metadata, and personal-state UI
- Preview/Production packaging conventions
- `noindex` strategy for automated/unverified article layers
- internal link and article-length validation practices

The current directory is not yet a Git repository. Existing v29 content will become the initial repository baseline during implementation.

## 3. Non-Goals

This migration does not:

- enable public search indexing yet
- invent rich metadata for the external 9,600-game catalog
- automatically classify all content as safe based only on title filtering
- allow Worker branches to push directly to `main`
- auto-merge content without Master review
- rely on a chat Sandbox as the authoritative project state
- guarantee that ChatGPT chats can be invoked directly by GitHub Actions

GitHub is the source of truth for project state; chats are editors/agents operating against that state when a supported connection is available.

## 4. Repository Layout

```text
GameFinder/
├─ public/                         # Firebase Hosting deploy root
│  ├─ index.html
│  ├─ articles/
│  ├─ games/
│  ├─ data/
│  ├─ assets/
│  ├─ js/
│  └─ ...
│
├─ editorial/
│  ├─ registry/
│  │  ├─ games.json
│  │  ├─ articles.json
│  │  └─ sources.json
│  ├─ queue/
│  │  ├─ tasks.json
│  │  └─ assignments/
│  └─ progress.json
│
├─ scripts/
│  ├─ validate-content.mjs
│  ├─ validate-links.mjs
│  ├─ validate-registry.mjs
│  ├─ validate-indexing.mjs
│  ├─ validate-duplicates.mjs
│  ├─ build-progress.mjs
│  └─ prepare-deploy.mjs
│
├─ tests/
│  ├─ fixtures/
│  └─ content/
│
├─ docs/
│  ├─ editorial-policy.md
│  ├─ worker-protocol.md
│  └─ superpowers/specs/
│
├─ .github/
│  ├─ pull_request_template.md
│  └─ workflows/
│     ├─ quality-gate.yml
│     └─ deploy-firebase.yml
│
├─ firebase.json
├─ .firebaserc
├─ package.json
└─ README.md
```

### Why `public/` stays explicit

The current Firebase configuration already uses `public` as Hosting root. Keeping the deploy root explicit prevents repository/editorial tooling from being deployed accidentally and avoids the old `public/public` nesting problem.

## 5. Branch Model

Permanent branches:

```text
main
worker-a
worker-b
worker-c
worker-d
worker-e
```

Rules:

- `main` is the only deployable authoritative branch.
- Workers never push directly to `main`.
- Each Worker works only on its own branch.
- A Worker branch is synchronized from `main` before beginning a new assigned batch.
- Each batch ends in a Pull Request.
- Only the Master approves integration after CI passes.
- After merge, Workers synchronize from the new `main` before taking another batch.

For difficult conflicts, the Worker batch is rebased/recreated from current `main` rather than merging stale generated HTML blindly.

## 6. Central Work Queue

A single self-mutating `work-queue.json` edited independently by five branches would create avoidable merge conflicts. Therefore the queue is central, but assignment is controlled by the Master.

`editorial/queue/tasks.json` is the authoritative backlog. The Master allocates work into immutable assignment files:

```text
editorial/queue/assignments/
  batch-0001-worker-a.json
  batch-0001-worker-b.json
  batch-0001-worker-c.json
  batch-0001-worker-d.json
  batch-0001-worker-e.json
```

Workers do not claim arbitrary tasks by editing the same queue file. They execute the assignment addressed to their worker ID. This preserves the efficiency of a central queue without creating five-way JSON conflicts.

### Task schema

```json
{
  "task_id": "game-440-beginner-deep-v1",
  "game_id": 440,
  "appid": 123456,
  "slug": "example-game",
  "task_type": "article_upgrade",
  "article_type": "beginner",
  "priority": 80,
  "required_depth": "deep",
  "min_visible_chars": 8000,
  "research_required": true,
  "status": "queued",
  "depends_on": [],
  "assigned_worker": null
}
```

Allowed initial task types:

- `game_enrichment`
- `dossier_upgrade`
- `article_create`
- `article_upgrade`
- `source_refresh`
- `internal_link_pass`
- `editorial_rewrite`

New task types require Master approval so queue semantics remain stable.

## 7. Allocation Strategy

The Master allocates tasks by priority, dependency, and Worker load.

Preferred batch size is not fixed by game count. Each assignment has a workload budget so expensive research tasks are not treated as equivalent to simple rewrites.

Example weighting:

- source refresh: 1 unit
- article rewrite: 2 units
- deep article creation: 3 units
- dossier upgrade: 3 units
- verified game enrichment: 4 units

Each Worker receives approximately equal total units rather than equal task counts.

The allocator also avoids assigning two Workers to the same game in one round unless their outputs are guaranteed to touch disjoint files.

## 8. Worker Protocol

Each Worker performs the following sequence:

1. synchronize its branch from latest approved `main`
2. read its assignment file
3. verify task preconditions
4. research only where required
5. edit only assigned game/article/source/registry records
6. run local validation
7. update Worker result metadata
8. commit changes to the Worker branch
9. open a Pull Request targeting `main`
10. wait for CI and Master review

Workers must not:

- change Firebase project configuration unless explicitly assigned
- change global editorial policy
- rewrite another Worker's assignment
- mark unknown metadata as known
- fabricate version-sensitive details
- turn `noindex` content indexable
- add monetization/indexing behavior unless separately approved

## 9. Article Registry

`editorial/registry/articles.json` is the machine-readable content index.

Each record stores at minimum:

```json
{
  "slug": "frostpunk-first-20-days",
  "game_slug": "frostpunk",
  "appid": 323190,
  "type": "beginner",
  "depth": "flagship",
  "visible_chars": 9450,
  "source_count": 5,
  "research_date": "2026-08-26",
  "version_sensitive": true,
  "indexing": "noindex",
  "status": "verified",
  "path": "/articles/frostpunk-first-20-days.html"
}
```

The registry is generated/validated against actual HTML. A Worker cannot pass CI by changing registry numbers without matching content.

## 10. Game Registry

`editorial/registry/games.json` tracks editorial depth separately from catalog identity.

Levels:

- `core`: identity/store-level record only
- `enriched`: verified structured metadata beyond identity
- `editorial_plus`: human/editorial summary and meaningful local guidance
- `deep`: at least the configured minimum number of verified deep articles
- `flagship`: manually prioritized multi-article coverage

A level upgrade must satisfy explicit field requirements. Unknown values remain `null`/unknown and never count positively toward completion.

## 11. Source Registry

`editorial/registry/sources.json` separates evidence from prose.

Source record fields include:

- source ID
- canonical URL
- source class (`official`, `developer`, `official_wiki`, `community_wiki`, `community`, `video`, `guide`)
- game/appid
- observed date
- version/date scope
- articles using the source

Official/developer sources are preferred for version-sensitive claims. Community material is a signal, not a substitute for official facts.

No source text is copied wholesale into the repository.

## 12. Progress Model

`editorial/progress.json` is generated from the registries and filesystem; Workers do not manually inflate it.

Example:

```json
{
  "target_games": 1000,
  "target_deep_articles": 1000,
  "editorial_plus_games": 400,
  "deep_games": 84,
  "deep_articles": 180,
  "queued_tasks": 420,
  "assigned_tasks": 25,
  "open_prs": 5,
  "failed_quality_gates": 0,
  "updated_at": "2026-08-26T00:00:00Z"
}
```

The Master uses this file as the fast status view, but CI recomputes it before merge to prevent drift.

## 13. Quality Gate

Every Pull Request runs deterministic checks before Master review.

Required checks:

1. HTML/build validation
2. root-relative internal links resolve
3. slug uniqueness
4. AppID identity consistency
5. article registry ↔ filesystem consistency
6. game registry ↔ `data/games.json` consistency
7. assigned files only, unless PR explains an allowed shared-file update
8. deep article visible-character threshold
9. required source coverage for version-sensitive content
10. no exact duplicate article body
11. duplicate-title detection
12. repeated-template/fingerprint warning
13. unknown metadata is not converted to positive values without evidence
14. `noindex` policy remains intact
15. Preview `robots.txt` remains disallow-all when Preview is built
16. Firebase deploy root contains no nested `public/public`

### Hard failures vs warnings

Hard failure blocks Master merge:

- broken links
- registry mismatch
- duplicate slug/AppID conflict
- missing required official evidence on version-sensitive claims
- article below assigned minimum
- indexing rule violation
- build failure

Warnings require Master judgment but do not automatically block:

- unusually high phrase repetition
- article near minimum depth
- source concentration on one domain
- content structure similarity

## 14. Master Review

CI passing does not merge automatically.

The Master reviews:

- assignment completion
- source quality
- article differentiation
- natural Japanese
- whether the article provides game-specific expertise rather than generic filler
- whether titles/openings are memorable and not template-like
- whether the Worker changed out-of-scope files
- quality-gate warnings

Only after Master approval is the PR merged to `main`.

## 15. Deployment

A merge to `main` triggers Firebase Hosting deployment through GitHub Actions.

Target Firebase project:

`gamefinder-b6a00`

Deployment rules:

- only `main` deploys production
- Worker branches never deploy production
- Firebase credentials/tokens/service-account material live only in GitHub Secrets or an approved identity mechanism
- secrets are never committed to the public repository
- deploy action validates project ID and deploy root before upload

The existing public site remains usable, but `noindex` continues until a later explicit indexing decision.

## 16. Indexing Policy

Public availability and search indexing are separate.

Current policy:

- site may be publicly reachable
- automated/new content remains `noindex,follow`
- Preview remains globally `noindex` plus robots disallow
- no Search Console/indexing push is part of this migration
- changing indexing policy requires a separate Master-approved task

## 17. GitHub Actions

### `quality-gate.yml`

Triggers on Pull Requests to `main`.

Sequence:

1. checkout
2. install locked dependencies
3. run registry validation
4. run article/content validation
5. run link validation
6. run indexing validation
7. run duplicate/fingerprint validation
8. generate progress preview
9. publish concise CI summary

### `deploy-firebase.yml`

Triggers only after push/merge to `main`.

Sequence:

1. checkout exact merged commit
2. install locked dependencies
3. rerun hard quality gate
4. build/prepare `public/`
5. verify Firebase project ID
6. deploy Hosting
7. record deployed commit SHA in workflow output

A failed deployment does not roll back content automatically; the previous Firebase version remains available and Master receives a failure state for remediation.

## 18. Concurrency and Conflict Handling

Parallelism is safe only when file ownership is explicit.

Rules:

- assignment generator avoids overlapping article paths
- each task declares expected output paths
- shared registries are updated through generated deltas or deterministic regeneration, not ad hoc manual edits from all Workers
- if two PRs both change a generated registry, the later PR refreshes from `main` and regenerates before merge
- Master merges PRs one at a time when they touch shared generated files

This means five Workers can write articles simultaneously without five-way conflicts in central JSON files.

## 19. Registry Delta Design

Workers write small result files instead of directly editing every central registry entry:

```text
editorial/results/
  <task-id>.json
```

CI/Master tooling derives canonical registries from current content plus accepted result records.

This makes Worker branches append-oriented and reduces conflicts.

A result file contains:

- task ID
- worker ID
- changed paths
- resulting article metrics
- source IDs
- validation timestamp
- status

After merge, registry generation incorporates the result automatically.

## 20. Recovery

Failure scenarios:

### Worker generates poor content

PR remains unmerged. The assignment is revised/requeued.

### Worker branch becomes stale

Sync from `main`, regenerate shared derived files, rerun CI.

### CI passes but Master rejects editorial quality

PR receives revision instructions; no production effect occurs.

### Deploy fails

The merged repository remains source of truth. The deployment workflow is repaired/re-run; no Worker repeats editorial generation.

### Queue/progress mismatch

Regenerate from accepted task results, registries, and filesystem rather than trusting manually edited counts.

## 21. Public Repository Safety

Because the repository is public:

- no Firebase secret, API token, cookie, account credential, or private identifier may appear in tracked files
- `.env*` secrets are gitignored
- GitHub Actions use repository secrets/approved identity
- source URLs may be public, but copyrighted article/community text is not reproduced
- generated artifacts should not contain private chat data
- Worker prompts/instructions committed to the repo must contain only project rules, not account-specific information

## 22. ChatGPT Connection Boundary

The architecture does not assume that a normal ChatGPT chat can automatically invoke another chat or that GitHub Actions can start ChatGPT workers.

The repository defines the shared state and protocol. A Worker chat can operate directly only when the product/session has a GitHub-capable write connection or another authorized repository-writing environment.

Until such a connection exists, the same protocol can still be implemented locally and published through a user-authorized GitHub workflow later. The repository structure intentionally keeps the agent/editor interface replaceable.

## 23. Master and Worker Commands

Project convention after migration:

- `t` in the Master chat: run one manual orchestration round against currently available Worker results; review/merge/reallocate as supported by the active GitHub connection.
- `t` in a Worker chat: execute the Worker's current assignment batch.
- `a`: request automation mode where supported; automation must respect the same queue, branch, PR, and Master-review gates.

`t` never means bypassing CI or Master review.

## 24. First Implementation Milestone

Milestone 1 establishes the control plane before generating another large content batch.

Deliverables:

1. initialize `GameFinder` repository structure from v29
2. normalize Firebase deploy root as `public/`
3. add registry schemas
4. add queue/assignment/result schemas
5. import current v29 article/game state into registries
6. add validation scripts
7. add GitHub Actions quality gate
8. add Firebase deployment workflow template
9. add Master/Worker operating documents
10. create Worker A-E branch/bootstrap instructions
11. run validation locally
12. only then begin the next parallel editorial batch

## 25. Success Criteria

The migration is successful when:

- v29 renders from the repository without functional regressions
- `main` is the single production source of truth
- five Workers can work on disjoint assignments without overwriting one another
- every Worker contribution arrives through PR
- CI catches structural/content-policy violations before Master review
- Master approval is required before merge
- merge to `main` automatically deploys to Firebase
- progress counts are derived rather than manually trusted
- public site remains `noindex` until intentionally changed
- no fabricated external Enriched Plus metadata is introduced
- secrets are absent from the public repository

## 26. Recommended Next Step

After this specification is reviewed and approved, create an implementation plan that starts with repository/control-plane migration. Do not resume mass article generation until the new registry, queue, CI, and deployment structure can validate the existing v29 baseline.
