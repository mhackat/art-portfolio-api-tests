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
utils/                     unique test data, multipart helpers, auth file I/O
tests/setup/                global setup (login) and teardown (logout), run once per suite
tests/auth/                 signup (one test only — see below), login, logout
tests/api-keys/             API key create/list/revoke
tests/users/                bio, public discovery (search/list/get)
tests/artworks/             artwork upload/update/delete
tests/admin/                admin-only endpoints, tagged @admin (skipped unless ADMIN_EMAIL/PASSWORD set)
```

## Design: one existing user, one login, shared everywhere

The suite is built around a single existing account (`API_AUTOMATION`), not a fresh account per test. Almost every test authenticates as that one account rather than signing up or logging in itself:

- **`tests/setup/global.setup.ts`** runs once before everything else (wired via Playwright's `projects` in `playwright.config.ts`, using `dependencies`). It logs in as `API_AUTOMATION` (creating the account first if this is the very first run ever — see `tests/auth/signup.spec.ts`) and writes the bearer token to a gitignored file (`.auth/api-automation.json`).
- Every other test reads that token through the `authedRequest` / `authedUser` fixtures (`fixtures/api-fixtures.ts`) — one login for the whole run, not one per test.
- **`tests/setup/global.teardown.ts`** runs once after everything else (`teardown: 'teardown'` in the project config) and logs out with that same token via `POST /api/auth/logout`, ending the captured authorization.

**`tests/auth/signup.spec.ts` is the only test that exercises the signup flow.** It creates one throwaway account (via `utils/test-data.ts#generateUniqueUser`) to prove the endpoint works and rejects a duplicate, then never touches signup again. No other test creates a new account — the app's signup/login endpoints are rate-limited per IP for real-world abuse prevention, and a suite that spun up a fresh account per test would trip that immediately. `tests/auth/logout.spec.ts` mints its disposable tokens via `POST /api/api-keys` instead of logging in again, for the same reason.

**Trade-off:** tests that would normally prove "user A can't touch user B's resources" (editing someone else's bio, deleting someone else's artwork, revoking someone else's API key) aren't covered, since that needs a second real account and the suite deliberately avoids creating extra ones. The one unavoidable exception is `tests/admin/admin.spec.ts`'s "an admin can delete another user's account" test, which needs a disposable victim account to delete — that describe block only runs at all when `ADMIN_EMAIL`/`ADMIN_PASSWORD` are explicitly configured, so it doesn't affect normal runs.

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
- Artwork and API-key tests clean up what they create (delete the artwork/key at the end) so repeated local runs don't accumulate data on the shared account.
