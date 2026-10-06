# KOL Portal — Stage 2 Profile and Tier Missions

Stage 2 adds the first read-only KOL experience on top of the isolated Stage 1 account foundation.

## Deployment boundary

- Git branch: `feature/kol-portal`
- Worker environment: `koldev`
- D1 database: `kol-ecosystem-kol-dev`
- Dedicated Pages project: `kol-ecosystem-kol-portal-dev`
- The main Pages deployment, staging Worker, and staging D1 are not deployment targets.

## Features

- Personal profile showing the authenticated KOL's upline ID, current tier, cooperation status, and PIC.
- Read-only mission list for the KOL's current tier.
- Only missions with `status = 'active'` are visible to a KOL. Draft, completed, and cancelled missions remain hidden.
- Mission cards expose the period, description, targets, and optional reward description.
- Internal program budget and other KOL participant data are not exposed through the KOL API.
- A refresh action reloads the current profile and mission assignment.

## Dynamic tier rule

Tier is never accepted from a browser query, request body, or stale session claim. Every request to `GET /api/v1/kol/missions`:

1. validates the revocable KOL session;
2. derives `kol_id` and `upline_id` from that session;
3. reads the latest `kols.tier_code` from D1;
4. returns active missions whose `missions.tier_code` matches that current tier.

Changing a KOL's tier in Master KOL therefore changes the visible mission on the next API request. No account migration, logout, or new token is required.

## Endpoints

- `GET /api/v1/kol/profile`
- `GET /api/v1/kol/missions`

Neither endpoint accepts an arbitrary KOL ID or tier.

## Verification performed

- Pilot profile resolves to `FA582386`, tier `KUAT`.
- A temporary active KUAT mission was visible while the pilot tier was KUAT.
- A forged `?tierCode=BIASA` query did not affect the response.
- After moving the pilot to `BARU`, the same session immediately received the BARU mission.
- Restoring the pilot to `KUAT` immediately restored the KUAT mission response.
- Temporary tier and mission status changes were restored after testing.
- KOL tokens remain rejected by operator and admin endpoints.
- Admin tokens remain rejected by KOL endpoints.
- Production Pages still contains only the staging API URL; the dedicated KOL Pages project contains only the koldev API URL.

## Current development data note

The existing three mission records are currently `draft`, so the KOL preview correctly shows “Belum ada mission aktif.” An administrator must change a mission to `active` before it becomes visible to the matching tier.
