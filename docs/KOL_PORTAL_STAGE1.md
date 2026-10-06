# KOL Portal — Stage 1 Account Foundation

Stage 1 adds the minimum authentication and authorization foundation for a future KOL-facing portal. It is intentionally isolated from the internal operations portal.

## Deployment boundary

- Git branch: `feature/kol-portal`
- API environment: `koldev`
- Worker: `kol-ecosystem-api-kol-dev`
- D1: `kol-ecosystem-kol-dev`
- Pages branch: `feature/kol-portal`
- Production/staging Worker, D1, and the main Pages deployment are not migration or deployment targets for this stage.

## Data model

Migration `0007_kol_accounts.sql` adds:

- `kol_accounts`: one login account linked to exactly one row in `kols`.
- `kol_sessions`: revocable, expiring sessions. Only a SHA-256 hash of the session token is stored.

Passwords are stored with PBKDF2-SHA256, a random salt, and 100,000 iterations (the supported Workers runtime limit in this project).

## Authorization boundary

- `admin` can use admin and operator endpoints.
- `operator` can use operator endpoints.
- `kol` can only use `/api/v1/kol/*` endpoints.
- A KOL session carries and validates both its internal `kol_id` and immutable `upline_id` binding.
- Every KOL request is checked against the session table, active account, active KOL, expiry, and revocation state.
- KOL tokens are explicitly rejected from `/api/v1/admin/*` and `/api/v1/operator/*`.

## Stage 1 endpoint

`GET /api/v1/kol/profile` returns only the logged-in KOL's own identity, tier, and status. Mission, performance, and commission endpoints are deliberately deferred.

## Preview behavior

When the logged-in role is `kol`, the feature Pages build renders a small KOL-only foundation screen. It does not mount the internal operations sidebar or internal pages. Admin and operator behavior remains available in the isolated preview for regression testing.

## Verification checklist

- KOL login succeeds and returns role `kol`.
- KOL can read its own `/kol/profile`.
- KOL receives `401` from operator and admin endpoints.
- Admin receives `401` from the KOL endpoint.
- Admin can still read all internal KOL records in the development copy.
- Logout revokes the KOL session; the same token receives `401` afterward.
- Production Pages bundle points to the staging API only.
- Feature Pages bundle points to the koldev API only.

## Next stage

Build read-only KOL features incrementally: profile, tier-specific mission list, activation commission summary, and date-range filters. Each endpoint must derive `kol_id` from the validated session rather than accepting an arbitrary upline ID from the browser.
