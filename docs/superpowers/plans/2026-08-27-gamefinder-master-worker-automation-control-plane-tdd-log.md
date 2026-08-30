# GameFinder Control Plane TDD Evidence

Date: 2026-08-28
Branch: `infra/master-worker-automation`
Baseline: `c204d865cf60f07fbb83037985f01e03a2f5e809`

## Recorded RED -> GREEN cycles

| Scope | RED evidence | GREEN evidence |
| --- | --- | --- |
| EOL/atomic IO | missing LF/atomic interfaces failed registered tests | focused IO tests and `validate:ci` passed; registry/progress stayed unchanged |
| v1/v2 schemas and states | missing validators/transitions and later parity regressions failed | schema/state tests passed after runtime/JSON parity fixes |
| dependencies | missing dependency evaluator failed ready/missing/cycle cases | focused graph suite passed |
| ownership/locks | missing exact-path/forbidden/lock behavior failed | ownership and immutable lock suite passed |
| Wave allocation | missing safe v2 Wave behavior failed max/dedup/reassignment cases | Wave suite passed with maximum three distinct Workers |
| worktree lifecycle | 18 tests registered; 8 failed for missing DIRTY evidence, resume, and cleanup | 18/18 passed; READY-only non-forced cleanup and DIRTY/STALE/CORRUPTED preservation verified |
| resource routing | 9/9 failed with missing routing module | 9/9 passed for local=0, Master=0, useful parallel 1-3, content=0, and completed Content Batch application |
| dispatch schema persistence | 17/19 passed; two new tests failed because metadata was optional and unsafe combinations were accepted | routing/schema/state suites passed after required metadata, zero default, and route/count correlations |
| shared optional pool | round-plan test failed because per-task counts summed to 4 | plan now allocates at most three total and defers overflow |
| Worker execution/Result | 6/6 initially failed with missing Worker module; the project Agent test then remained RED while `.codex/**` was unavailable | identity/base/branch/lock/worktree/ownership/Result tests pass, and the five default-off optional Agent definitions plus three-thread cap now load from project `.codex/**` |
| Master review | 3/3 failed with missing review module | 3/3 passed for real diff, identity, ancestry, outcomes, and validation evidence |
| integration | 3/3 failed with missing integration module | 3/3 passed for deterministic order, reviewed-only commits, and conflict preservation |
| approval | 4/4 failed with missing approval gate and incomplete schema | approval suite passed with explicit PENDING/APPROVED/REJECTED evidence |
| reconcile/store | 5/5 failed with missing modules | 5/5 passed for atomic checkpoint, evidence-only recovery, idempotence, and unsafe-state lock preservation |
| `t`/`a` | 6/6 failed with missing orchestrator; CLI alias test later failed | orchestrator/CLI suite passed for per-round reclassification, zero-Worker routes, optional Wave, preview/apply, and Batch 0001 refusal |
| executor evidence | new review test showed CLI could mark local/Master work complete without an executor | local/Master routes now stop at `*_REQUIRED` unless an injected executor returns explicit completion evidence |
| attempt-group worktree safety | an initial distinct-count test exposed that one Worker could receive separate fresh/retry attempt groups on the same branch; the final one-Worker RED case produced two incompatible Assignments | `createWorkerWave` is exported and allocation now keeps different attempts on distinct Workers, deferring the extra group when only one Worker is available |
| dependency-safe orchestration | six new cases exposed dependency bypass, single-task Waves, blocked reassignment, historical Worker overcount, and unchanged batch state | orchestrator suite passed 15/15 with graph-safe selection, real three-Worker allocation, explicit reassignment, active-only counts, and `DRAFT -> ALLOCATED` |
| connected Control Plane phases | four controller tests failed because no controller module connected reconcile, review, integration, and approval; a fifth exposed missing worktree preparation | controller suite passed 5/5 and CLI now advances deterministic review/integration/approval phases, with apply-only Worker worktree and integration mutations |
| cumulative Master review | BLOCKED/FAILED outcomes and a two-commit Result incorrectly passed review | review suite passed 6/6 after requiring completed outcomes, cumulative diff verification, and one direct child commit |
| non-empty Worker evidence | a direct-base allow-empty commit with no changed paths incorrectly passed review | Master review now rejects it with `NO_CHANGED_PATHS`; Review/Integration focused suite passed 12/12 |
| integration evidence binding | forged decisions and mismatched Batch bases were accepted | integration suite passed 5/5 after one-to-one Assignment/Result/Decision binding and review recomputation |
| protected Worker ownership | article/game pages and data could enter Worker ownership | ownership and Wave suites passed after forbidding `public/articles/**`, `public/games/**`, and `public/data/**` and moving fixtures to synthetic code paths |
| reconcile ambiguity | duplicate Results, rejected assignments, and unsafe `RESULT_READY` evidence remained automatable | reconcile suite now requires Master attention and removes unsafe/rejected evidence from review eligibility |
| bounded Git processes | Git subprocesses had no timeout | Git helper suite passed with a 30-second default, override support, and explicit timeout evidence/errors |
| validator protected scope | Batch 0001 `tasks.json`, untracked forbidden files, and article/game data changes were outside the final gate | validation mutation tests now compare the complete legacy fixture and scan tracked plus untracked protected paths |
| malformed review input | null assignment crashed during ancestry lookup | Master review now records `SCHEMA_INVALID`/rejection evidence without crashing |
| synthetic | initial runner hard-coded Assignments, manually reported batch state, and force-removed failure evidence | isolated flow now uses real planning/allocation and legal transitions through Result, reconcile, review, integration, PENDING approval; success leaves zero residue while failures preserve the diagnostic root |
| validation | missing validator failed; mutation fixtures failed expected contracts; repository validation remained RED until the project Agent files existed | contract fixtures, full repository safety checks, five Agent definitions, and the resource-aware pool contract all pass |

## Hang investigation

Two Node processes created at 15:03 and 15:07 remained visible but their command lines and termination were access-denied in this task. A fresh `node --test --test-timeout=60000 tests/control-plane/worktree.test.mjs` run completed 18/18 in 30.2 seconds, created no new lingering Node process, left no `gamefinder-worktree-*` temporary directory, and added no registered worktree. The 30-second command yield occurred just before buffered test output, not at the Node 60-second timeout.

On 2026-08-30, two accidentally overlapping Review/Integration invocations delayed buffered output; the observed invocation completed 12/12 in 64.8 seconds. The final single full-suite invocation completed in 153.3 seconds with no per-test timeout, no temporary directory, and no registered worktree residue. Two low-CPU Codex CUA Node parent processes from 12:36 remained visible with stable 191-handle counts; they were not force-terminated because their command lines were unavailable and the test/worktree evidence was already clean.

## Environment limitations

The project `.codex/**`, infra branch refs, and object store became writable after a scoped permission grant, so `.codex/config.toml` plus `.codex/agents/worker-{a-e}.toml` were created and validated. The linked worktree index directory remains read-only: a safe `index.lock` creation probe is denied even after file-specific permission requests. Therefore Task 4 and later changes still cannot be staged/committed. The implementation and tests remain preserved in the native worktree; no push, PR, merge, or deploy was attempted.

## Fresh completion audit

- Control Plane: 134 tests registered, 134 passed, 0 failed.
- Existing repository validation: `npm run validate:ci` passed, including 7/7 content tests and unchanged registry/progress checks.
- Synthetic: local-script 0 Workers, Codex Master 0 Workers, real Master allocation to optional Workers A/B, legal `DRAFT -> ALLOCATED -> ACTIVE -> REVIEW -> INTEGRATION_PREPARED -> APPROVAL_PENDING`, two `REVIEW_PASSED` decisions, external content 0 Workers/no dispatch, approval PENDING, zero leftover worktrees.
- Full Control Plane validation: PASS with seven schemas, five optional Workers, default Worker count 0, maximum Wave size 3, Batch 0001 compatibility, forbidden diff count 0, no `public/public`, and preserved noindex/robots disallow.
- Git/worktree safety: branch remains `infra/master-worker-automation`; main and the native worktree are the only registered worktrees; forbidden changed-path scan is empty; `git diff --check` has no whitespace error.
