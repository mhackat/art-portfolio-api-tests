# art-portfolio-api-tests

Playwright API test suite for the [art-portfolio-app](../art-portfolio-app) backend. Pure HTTP — no browser — organized by feature, with a one-time login shared across the whole run.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Var | Required | Purpose |
| --- | --- | --- |
| `API_BASE_URL` | no (defaults to `http://localhost:3000`) | Which deployment to run against |
| `API_AUTOMATION_USERNAME` / `_EMAIL` / `_PASSWORD` / `_DISPLAY_NAME` | yes | Dedicated existing test account used by nearly every test |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | Only needed to exercise `tests/admin/*`; those tests skip (not fail) if unset |

The target app must have a Postgres database and (for artwork upload tests) image storage configured — same requirements as running it locally.

## Running

```bash
npm test        # everything
npm run test:ci # everything except @admin-tagged tests — used by CI, see below
npm run test:ui # everything, with Playwright's UI mode
npm run report   # open the last HTML report
```

## Structure

```
config/env.ts              typed env var access
fixtures/api-fixtures.ts   apiRequest / authedRequest / authedUser fixtures
utils/                     test image fixture, multipart helpers, auth file I/O
tests/setup/                global setup (login) and teardown (logout), run once per suite
tests/auth/                 login, logout
tests/api-keys/             API key create/list/revoke
tests/users/                bio, public discovery (search/list/get)
tests/artworks/             artwork upload/update/delete
tests/admin/                admin-only endpoints, tagged @admin (skipped unless ADMIN_EMAIL/PASSWORD set)
```

## Design: one existing user, one login, shared everywhere, nothing cleaned up

The suite runs entirely as a single pre-existing account (`API_AUTOMATION`) — it never signs anyone up. That account must already exist on whatever environment `API_BASE_URL` points at; the suite will not create it for you.

- **`tests/setup/global.setup.ts`** runs once before everything else (wired via Playwright's `projects` in `playwright.config.ts`, using `dependencies`). It logs in as `API_AUTOMATION` and writes the bearer token to a gitignored file (`.auth/api-automation.json`). If login fails here, that's the fix: go create the account first — the failure message says as much.
- Every other test reads that token through the `authedRequest` / `authedUser` fixtures (`fixtures/api-fixtures.ts`) — one login for the whole run, not one per test.
- **`tests/setup/global.teardown.ts`** runs once after everything else (`teardown: 'teardown'` in the project config) and logs out with that same token via `POST /api/auth/logout`, ending the captured authorization. This only revokes that one session token — it doesn't touch the account, its bio, or anything it created.

**No test creates a new account, and nothing the suite creates (artworks, API keys, bio edits) is deleted or reset afterward.** Everything a test writes is left in place on `API_AUTOMATION` so you can go look at it once the run finishes — the dashboard, `/api/api-keys`, the account's public profile, etc. Deletion is only ever exercised where deleting is literally what's being tested (e.g. "the owner can delete their own artwork", "DELETE revokes a key so it can no longer authenticate") — those still delete, because that's the assertion, not incidental tidying.

**Trade-off:** tests that would normally prove "user A can't touch user B's resources" (editing someone else's bio, deleting someone else's artwork or API key) aren't covered, since that needs a second real account and the suite never creates one. The same applies to `tests/admin/admin.spec.ts`, which has no "an admin can successfully delete another user" test for the same reason — deletion there is only exercised negatively (self-delete blocked, nonexistent-user 404, non-admin forbidden).

## CI: gating art-portfolio-app's deploys to prod

[art-portfolio-app](https://github.com/mhackat/art-portfolio-app)'s
`.github/workflows/prod-deploy-gate.yml` checks out this repo and runs `npm run test:ci`
against its `test` environment (`https://art-portfolio-app-plumtest.vercel.app`) on every
PR targeting `main`. It's a required status check — the PR can't be merged, and therefore
nothing reaches Production, until this suite passes. Admin tests are excluded via the
`@admin` tag (`--grep-invert @admin`) rather than by simply leaving `ADMIN_EMAIL`/
`ADMIN_PASSWORD` unset, so they can never accidentally run in CI even if those secrets
are added later.

Since that repo is private, the workflow needs a token to check this one out — see its
README for the exact secrets required.

## Notes

- `utils/multipart.ts` exists because Playwright's `multipart` request option silently drops empty-string field values — confirmed against the app with a raw `curl -F "field="`, which the app handles correctly. Used only where a test needs to send a genuinely empty field (e.g. "blank description clears it").
- `tests/users/bio.spec.ts` runs its tests serially (`test.describe.configure({ mode: "serial" })`) since they all mutate the same shared account's bio field — parallel runs would race a write in one test against a read-after-write assertion in another.
- Artwork and API-key tests do **not** clean up what they create — repeated runs accumulate artworks/keys on the shared `API_AUTOMATION` account by design, so you can inspect what a run actually did afterward. Expect the account's gallery and key list to grow over time; prune it manually if that becomes a problem.
