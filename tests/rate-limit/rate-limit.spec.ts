// Deliberately using Playwright's own `test`/`expect` (not our custom
// fixtures) so this traffic never carries the X-RateLimit-Bypass header —
// these tests exist specifically to prove the real rate limiting works.
import { test, expect } from "@playwright/test";
import { generateUniqueUser } from "../../utils/test-data";

// Tagged @rate-limit and excluded from the default `npm test` run (see
// playwright.config.ts / package.json) because tripping these limits means
// the signup/login endpoints stay 429-ing from this machine's IP for the
// full 15-minute window afterward — that would break every other auth test
// if it ran in the same session. Run explicitly with `npm run test:rate-limit`
// when you actually want to exercise this, ideally on its own.
//
// Serial within the file so two rate-limit tests can't race each other and
// undercount requests against the same window.
test.describe.configure({ mode: "serial" });

test.describe("Rate limiting @rate-limit", () => {
  test("signup is rate-limited per IP after 5 attempts in the window", async ({ request }) => {
    const SIGNUP_LIMIT = 5;
    let lastStatus = 0;
    let lastRes;

    for (let i = 0; i < SIGNUP_LIMIT + 1; i++) {
      lastRes = await request.post("/api/signup", { data: generateUniqueUser("apiauto_ratelimit") });
      lastStatus = lastRes.status();
      if (lastStatus === 429) break;
    }

    expect(lastStatus).toBe(429);
    expect(lastRes!.headers()["retry-after"]).toBeTruthy();
  });

  test("login is rate-limited per identifier after 10 attempts in the window", async ({ request }) => {
    const LOGIN_LIMIT = 10;
    const identifier = `apiauto_ratelimit_login_${Date.now().toString(36)}`;
    let lastStatus = 0;
    let lastRes;

    for (let i = 0; i < LOGIN_LIMIT + 1; i++) {
      lastRes = await request.post("/api/auth/login", {
        data: { identifier, password: "WrongPassword123!" },
      });
      lastStatus = lastRes.status();
      if (lastStatus === 429) break;
    }

    expect(lastStatus).toBe(429);
    expect(lastRes!.headers()["retry-after"]).toBeTruthy();
  });
});
