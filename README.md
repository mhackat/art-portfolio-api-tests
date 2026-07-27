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
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no, but recommended | Runs `tests/admin/*` and `tests/auth/signup.spec.ts`. The account must exist **and** its email must be in the app's own `ADMIN_EMAILS` for that environment. Unset, those tests skip rather than fail |

The target app must have a Postgres database and (for artwork upload tests) image storage configured — same requirements as running it locally.

## Running

```bash
npm test        # everything
npm run test:ci # everything, list + HTML reporters — used by CI, see below
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

## Reading a run: every response is captured

Each API response is printed to the console and attached to the HTML report, grouped under the test that produced it and numbered in call order. `npm run report` is the readable view — you can see exactly what the server said for every request without opening the code.

This works by wrapping the request contexts in `utils/api-logging.ts` rather than logging at call sites, so existing specs are untouched and no future test can forget to do it. JSON bodies are pretty-printed; binary responses are reported as a type and byte count instead of dumping an image into the report. Console output is truncated at 1500 characters, the report always has the full body.

## Design: one existing user, one login, shared everywhere, nothing cleaned up

The suite runs almost entirely as a single pre-existing account (`API_AUTOMATION`). That account must already exist on whatever environment `API_BASE_URL` points at; the suite will not create it for you. The one exception is the signup spec — see below.

- **`tests/setup/global.setup.ts`** runs once before everything else (wired via Playwright's `projects` in `playwright.config.ts`, using `dependencies`). It logs in as `API_AUTOMATION` and writes the bearer token to a gitignored file (`.auth/api-automation.json`). If login fails here, that's the fix: go create the account first — the failure message says as much.
- Every other test reads that token through the `authedRequest` / `authedUser` fixtures (`fixtures/api-fixtures.ts`) — one login for the whole run, not one per test.
- **`tests/setup/global.teardown.ts`** runs once after everything else (`teardown: 'teardown'` in the project config) and logs out with that same token via `POST /api/auth/logout`, ending the captured authorization. This only revokes that one session token — it doesn't touch the account, its bio, or anything it created.

**`tests/auth/signup.spec.ts` is the one test that creates an account**, because signup is the thing it covers. It asks an admin to mint a single-use code, signs up with a per-run random email, proves the code is then spent, and has the admin delete the account — asserting the profile really 404s afterwards. An `afterEach` repeats the delete if the test failed before reaching it, so a broken run can't strand a user on a shared environment. It's deliberately one test rather than several: every signup burns a code, and a used code can't be revoked (the app refuses, since it is the record of which account the code created), so splitting it would leave more residue behind each run for no extra coverage.

**Otherwise no test creates an account, and nothing the suite creates (artworks, API keys, bio edits) is deleted or reset afterward.** Everything a test writes is left in place on `API_AUTOMATION` so you can go look at it once the run finishes — the dashboard, `/api/api-keys`, the account's public profile, etc. Deletion is only ever exercised where deleting is literally what's being tested (e.g. "the owner can delete their own artwork", "DELETE revokes a key so it can no longer authenticate") — those still delete, because that's the assertion, not incidental tidying.

**Trade-off:** tests that would normally prove "user A can't touch user B's resources" (editing someone else's bio, deleting someone else's artwork or API key) aren't covered, since that needs a second long-lived account. `tests/admin/admin.spec.ts` exercises deletion negatively only (self-delete blocked, nonexistent-user 404, non-admin forbidden); the successful-delete path is covered by the signup spec, against the throwaway account it just created.

**Logins are shared for a reason.** The app rate-limits logins per identifier, and Playwright scales workers to the CPU on a local run. Both the automation and admin sessions are therefore captured once, in the setup project, and read from gitignored files (`.auth/`) — a run performs exactly one login per account. An earlier worker-scoped version of this 429'd against its own admin account within a few runs.

## CI: gating art-portfolio-app's deploys to prod

[art-portfolio-app](https://github.com/mhackat/art-portfolio-app)'s
`.github/workflows/prod-deploy-gate.yml` checks out this repo and runs `npm run test:ci`
against its `test` environment (`https://art-portfolio-app-plumtest.vercel.app`) on every
PR targeting `main`. It's a required status check — the PR can't be merged, and therefore
nothing reaches Production, until this suite passes.

Admin tests run there too, provided the `ADMIN_EMAIL` and `ADMIN_PASSWORD` repository
secrets are set to an account that is in the **test** environment's own `ADMIN_EMAILS`.
Without them those specs skip, so a missing secret narrows coverage rather than breaking
the gate.

The `test` branch must be kept up to date with `main`. It deploys the test environment,
so if it lags, the suite is gating a PR against older code than the PR contains — a test
covering a new endpoint will 404 for reasons that have nothing to do with the change.

Since that repo is private, the workflow needs a token to check this one out — see its
README for the exact secrets required.

## Notes

- `utils/multipart.ts` exists because Playwright's `multipart` request option silently drops empty-string field values — confirmed against the app with a raw `curl -F "field="`, which the app handles correctly. Used only where a test needs to send a genuinely empty field (e.g. "blank description clears it").
- `tests/users/bio.spec.ts` runs its tests serially (`test.describe.configure({ mode: "serial" })`) since they all mutate the same shared account's bio field — parallel runs would race a write in one test against a read-after-write assertion in another.
- Artwork and API-key tests do **not** clean up what they create — repeated runs accumulate artworks/keys on the shared `API_AUTOMATION` account by design, so you can inspect what a run actually did afterward. Expect the account's gallery and key list to grow over time; prune it manually if that becomes a problem.
