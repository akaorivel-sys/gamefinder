# GameFinder Firebase Release Safety Design

## Scope

This batch changes only GitHub Actions, release-safety validation code/tests, package scripts, and release-safety documentation. Homepage, articles, games, game data, Batch 0001, Firebase project identity, and indexing policy remain unchanged.

## Resource-aware execution

Codex Master executes the batch alone. The Workflow files, validation contracts, and tests overlap, so parallel Worker work would add merge risk without useful concurrency. Optional Codex Worker count is zero.

## Production architecture

`deploy-firebase.yml` is the only workflow allowed to deploy a `main` push to the Firebase `live` channel. Its single job runs, in order:

1. checkout and Node.js 22 setup;
2. `npm run validate:control-plane`;
3. `npm run validate:ci`, including release-safety policy tests;
4. Firebase configuration, project, public-root, health marker, `noindex,follow`, and `robots.txt` preflight validation as part of `validate:ci`;
5. verification that the run commit is still the current remote `main`;
6. Firebase Hosting deployment with `channelId: live`;
7. verification that the live health marker matches the merged commit.

The workflow uses `concurrency.group: firebase-production` and `cancel-in-progress: false`, so live deployments never overlap. A remote-main freshness guard immediately before deployment rejects an obsolete queued run. Together, these controls prevent an older pending run from overwriting a newer release.

`firebase-hosting-merge.yml` is removed, eliminating the quality-gate-free production path.

## Pull request architecture

`firebase-hosting-pull-request.yml` owns both PR validation and Preview deployment. A `quality-gate` job runs the Control Plane and CI validation. The Preview job declares `needs: quality-gate`, is limited to same-repository PRs, and never specifies the `live` channel. `quality-gate.yml` is removed to avoid duplicate validation and to keep the required check name inside the sequential PR workflow.

## Validation boundaries

`scripts/lib/release-safety/firebase-config.mjs` parses `.firebaserc` using `fs.readFileSync` plus `JSON.parse`; extensionless `require()` is not used. It validates the exact project ID, Firebase public root, missing `public/public`, health marker, `noindex,follow`, and `Disallow: /`.

`scripts/lib/release-safety/workflow-policy.mjs` validates observable workflow policy: exactly one live production workflow, required validation-before-deploy ordering, production concurrency, PR Preview dependency on `quality-gate`, and absence of a PR live-channel path. `scripts/validate-release-safety.mjs` exposes both validators through `npm run validate:release-safety`, and `validate:ci` invokes that command.

## GitHub repository policy

The audit found no repository rulesets and no branch protection on `main`. This batch does not mutate repository settings. The recommended follow-up is a ruleset that blocks direct pushes, requires pull requests, requires the `quality-gate` check, blocks force pushes/deletion, and includes administrators.
