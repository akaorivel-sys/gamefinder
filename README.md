# GameFinder

Game discovery and editorial guide site. Firebase Hosting project: `gamefinder-b6a00`.

## Local validation

```bash
npm run build:registries
npm run build:progress
npm run validate:ci
```

## Branch model

- `main`: Master-approved, deployable source of truth
- `worker-a` ... `worker-e`: parallel editorial workers

Workers follow `docs/worker-protocol.md`. Only approved merges to `main` deploy to Firebase.

## Current indexing policy

The public site intentionally remains `noindex`. Do not change `public/robots.txt` or HTML robots metadata until the Master explicitly enables indexing.
