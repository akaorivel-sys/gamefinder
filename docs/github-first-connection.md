# GitHub / Firebase First Connection

This document is the one-time bridge between the prepared GameFinder repository and the user's GitHub/Firebase accounts.

## 1. Create the GitHub repository

Create a **public** GitHub repository named `GameFinder`. Do not add a README, license, or `.gitignore` in the GitHub UI because this repository already contains them.

## 2. Push the prepared repository

After cloning the provided Git bundle (or using the prepared local repository), add the GitHub repository as `origin` and push:

```bash
git remote add origin https://github.com/<YOUR_GITHUB_NAME>/GameFinder.git
git push -u origin main
git push origin worker-a worker-b worker-c worker-d worker-e
```

Use GitHub's normal browser/device authentication. Do not paste a personal access token into ChatGPT.

## 3. Create the Firebase Hosting GitHub credential

The repository already contains `firebase.json` and `.firebaserc`, so from the repository root run:

```bash
firebase init hosting:github
```

Choose the existing Firebase project `gamefinder-b6a00` and the new GitHub `GameFinder` repository. The Firebase CLI creates a deployment service account and stores its JSON key as an encrypted GitHub Actions secret.

The custom GameFinder workflow expects this secret name:

```text
FIREBASE_SERVICE_ACCOUNT_GAMEFINDER_B6A00
```

If the CLI created a differently named secret, either rename/recreate the GitHub secret with the expected name or update only the secret reference in `.github/workflows/deploy-firebase.yml`.

The Firebase CLI may also create its own `firebase-hosting-*.yml` workflows. GameFinder already has a controlled deployment workflow, so do **not** merge duplicate auto-deploy workflows. Keep:

- `.github/workflows/quality-gate.yml`
- `.github/workflows/deploy-firebase.yml`

## 4. Protect `main`

In GitHub repository settings, add a branch protection/ruleset for `main`:

- require a Pull Request before merge
- require the `quality-gate` status check
- do not allow Worker branches to push directly to `main`
- keep Master as the final merge/review authority

## 5. First automation test

1. Push all branches.
2. Confirm GitHub Actions can run `quality-gate`.
3. Make one low-risk assigned Worker change.
4. Open a PR to `main`.
5. Confirm `quality-gate` passes.
6. Master reviews and merges.
7. `deploy-firebase` runs on the resulting push to `main`.
8. The workflow checks `https://gamefinder-b6a00.web.app/health.txt` against the repository's `public/health.txt` marker.
9. Confirm live pages remain `noindex`.

## Security note

Never commit Firebase service-account JSON or other credentials to this repository. Store deployment credentials only in GitHub Actions Secrets / the Firebase GitHub integration.
