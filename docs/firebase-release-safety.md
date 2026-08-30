# Firebase Release Safety

## Release paths

Production has one path:

`main` push → `Firebase Production Release` → Control Plane validation → CI and Release Safety validation → remote-main freshness check → Firebase `live` deployment → live health-marker verification.

Pull requests have a separate path:

PR to `main` → `quality-gate` job → same-repository Firebase Preview deployment.

The Preview job depends on `quality-gate`, never declares `channelId: live`, and cannot run for forked pull requests that do not have access to repository secrets.

## Enforced release policy

- `.github/workflows/deploy-firebase.yml` is the only `main`-push Workflow allowed to declare the Firebase `live` channel.
- Production concurrency uses the fixed `firebase-production` group with `cancel-in-progress: false`; deployments cannot overlap.
- Immediately before live deployment, the Workflow compares `GITHUB_SHA` with `refs/heads/main` from `origin`. An obsolete queued run fails before deployment.
- `npm run validate:control-plane` and `npm run validate:ci` must precede live deployment. `validate:ci` includes `npm run validate:release-safety`.
- `.firebaserc` is read as UTF-8 text and parsed with `JSON.parse`. Malformed JSON or any default project other than `gamefinder-b6a00` fails the Gate.
- `firebase.json` must keep the Hosting public root at `public`, and `public/public` must not exist.
- `public/index.html` must retain `noindex,follow`; `public/robots.txt` must retain `Disallow: /`; and `public/health.txt` must contain a valid GameFinder version marker.
- Live health verification must follow deployment and match the marker in the merged commit.

## Failure behavior

Configuration, policy, content, link, indexing, registry, duplicate, Control Plane, or existing content-test failures stop the Workflow before Firebase deployment. A stale remote-main check also stops deployment. A failed live verification marks the production run failed after deployment and requires operator investigation; it does not start another deployment automatically.

## GitHub repository policy audit

Audited on 2026-08-30:

- Repository rulesets: none.
- `main` branch protection: not enabled.
- Repository settings were not changed by this batch.

Recommended follow-up settings:

1. Require a pull request before merging into `main`.
2. Require the `quality-gate` status check and require the branch to be up to date.
3. Block direct pushes, force pushes, and branch deletion.
4. Apply the rules to administrators as well as regular collaborators.
5. Keep Production deployment exclusively in `.github/workflows/deploy-firebase.yml`.

## Resource routing

This batch used Codex Master and local scripts only. Optional Codex Worker usage was zero because the Workflow and validator edits shared the same policy surface and would have created avoidable merge conflicts.
