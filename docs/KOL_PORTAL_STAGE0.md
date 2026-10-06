# KOL Portal — Stage 0 Isolation Baseline

Date: 2026-10-06

## Stable production-testing baseline

- Git branch: `main`
- Git tag: `internal-dashboard-v1`
- Stable commit: `7f52dc3`
- Pages production URL: `https://kol-ecosystem-dashboard-staging.pages.dev/`
- API staging URL: `https://kol-ecosystem-api-staging.inovalentino99tele.workers.dev`
- D1 staging database: `kol-ecosystem-staging`
- D1 staging ID: `0006b07e-33a6-44e0-b31b-8d4c32319eff`

The staging database was exported read-only before the KOL portal environment was created. The local SQL backup is stored in `.backups/`, which is ignored by Git.

## Isolated KOL development environment

- Git branch: `feature/kol-portal`
- Pages preview URL: `https://feature-kol-portal.kol-ecosystem-dashboard-staging.pages.dev/`
- API environment: `koldev`
- API Worker: `kol-ecosystem-api-kol-dev`
- API URL: `https://kol-ecosystem-api-kol-dev.inovalentino99tele.workers.dev`
- D1 database: `kol-ecosystem-kol-dev`
- D1 database ID: `143db6d7-0c3d-4754-9d94-9b1362e1c761`

The development D1 database was populated from the read-only staging export. It is a separate database; writes in the preview environment do not affect staging.

## Isolation rules

1. Never run KOL portal migrations with `--env staging`.
2. All KOL portal Worker commands must use `--env koldev` until an explicit production rollout is approved.
3. All KOL portal Pages deployments must use `--branch feature/kol-portal`.
4. The preview frontend must be built with:

   ```text
   VITE_API_URL=https://kol-ecosystem-api-kol-dev.inovalentino99tele.workers.dev
   ```

5. Never commit `.backups/`, `.dev.vars`, secrets, or exported D1 data.
6. Schema changes should be additive during development; do not rename or remove staging columns.

## Verification completed

- Staging API health: HTTP 200, environment `staging`.
- Development API health: HTTP 200, environment `development`.
- Staging Master KOL count: 533.
- Development Master KOL count after copy: 533.
- Production Pages bundle points only to the staging API.
- Preview Pages bundle points only to the development API.

## Rollback

The live dashboard was not changed during Stage 0. If the feature branch must be abandoned:

1. Stop using the preview URL.
2. Switch the local repository back to `main`.
3. Leave the live Pages project and staging Worker unchanged.
4. The stable source can be restored from Git tag `internal-dashboard-v1`.

Deleting the development Worker or D1 database is not required for rollback and should only be done after explicit approval.
