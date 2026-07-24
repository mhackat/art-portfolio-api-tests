# art-portfolio-api-tests

Playwright API test suite for the [art-portfolio-app](../art-portfolio-app) backend. Pure HTTP — no browser — organized by feature, with a one-time auth setup/teardown shared across the whole run.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Var | Required | Purpose |
| --- | --- | --- |
| `API_BASE_URL` | no (defaults to `http://localhost:3000`) | Which deployment to run against |
| `API_AUTOMATION_USERNAME` / `_EMAIL` / `_PASSWORD` / `_DISPLAY_NAME` | yes | Dedicated test account, created automatically on first run if it doesn't exist |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | Only needed to exercise `tests/admin/*`; those tests skip (not fail) if unset |
| `RATE_LIMIT_BYPASS_TOKEN` | no | See "Rate limiting" below |

The target app must have a Postgres database and (for artwork upload tests) image storage configured — same requirements as running it locally.

## Running

```bash
npm test              # everything except rate-limit tests (the default — see below)
npm run test:ui       # same, with Playwright's UI mode
npm run test:rate-limit
npm run test:all      # everything, including rate-limit
npm run report         # open the last HTML report
```

## Structure

```
config/env.ts              typed env var access
fixtures/api-fixtures.ts   apiRequest / authedRequest / authedUser fixtures
utils/                     unique test data, throwaway test users, multipart helpers, auth file I/O
tests/setup/                global setup (auth) and teardown (revoke), run once per suite
tests/auth/                 signup, login, logout
tests/api-keys/             API key create/list/revoke, ownership
tests/users/                bio, public discovery (search/list/get)
tests/artworks/             artwork upload/update/delete
tests/admin/                admin-only endpoints (skipped unless ADMIN_EMAIL/PASSWORD set)
tests/rate-limit/           deliberately trips the real signup/login rate limits
```

## How authorization is captured and shared

`tests/setup/global.setup.ts` runs once before everything else (wired via Playwright's `projects` in `playwright.config.ts`, using `dependencies`). It signs up the `API_AUTOMATION` account if it doesn't already exist, logs in, and writes the bearer token to a gitignored file (`.auth/api-automation.json`). Every test that needs to be authenticated pulls that token through the `authedRequest` / `authedUser` fixtures (`fixtures/api-fixtures.ts`) instead of logging in itself — one login for the whole run, not one per test.

`tests/setup/global.teardown.ts` runs once after everything else (`teardown: 'teardown'` in the project config) and revokes that token via `POST /api/auth/logout`, so no valid credential is left behind once the suite finishes.

Tests that need a *second*, distinct identity (to prove user A can't touch user B's resources) create one on the spot with `utils/create-user.ts`, which signs up a uniquely-named throwaway account via `utils/test-data.ts#generateUniqueUser`.

## Rate limiting

The app rate-limits signup and login per IP (and per-identifier for login) to stop real-world abuse — a handful of attempts per 15 minutes. That's far too strict for an automated suite that legitimately creates many accounts in one run: every test file in `tests/` needs at least one real signup or login.

If `RATE_LIMIT_BYPASS_TOKEN` is set (and matches `RATE_LIMIT_BYPASS_TOKEN` in the target app's environment), most test traffic sends an `X-RateLimit-Bypass` header and skips the check entirely. **This must never be set on a Production or Preview deployment** — it only exists for local/test use. If it's unset, tests just run unbypassed and may hit real limits on a fresh environment.

`tests/rate-limit/rate-limit.spec.ts` deliberately does *not* use the bypass (it imports Playwright's own `test`/`expect` rather than the shared fixtures) — its whole job is to prove the real limiting behavior works, so it sends genuine unbypassed traffic until it gets a 429. That's also why it's excluded from the default `npm test` run: tripping these limits leaves the endpoint 429-ing for the rest of the 15-minute window, which would break every other auth test sharing that IP if run in the same session. Run it on its own with `npm run test:rate-limit`.

## Notes

- Tests are independent and safe to run in parallel (Playwright's default) — most create their own throwaway user rather than sharing mutable state on `API_AUTOMATION`.
- Artwork/API-key tests clean up what they create (delete the key/artwork at the end) so repeated local runs don't accumulate data on the shared automation account.
- `utils/multipart.ts` exists because Playwright's `multipart` request option silently drops empty-string field values — confirmed against the app with a raw `curl -F "field="`, which the app handles correctly. Used only where a test needs to send a genuinely empty field (e.g. "blank description clears it").
