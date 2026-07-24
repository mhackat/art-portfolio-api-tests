import { test as setup, expect, request } from "@playwright/test";
import { env } from "../../config/env";
import { saveAuth } from "../../utils/auth-storage";

/**
 * Runs once before the rest of the suite (see the "setup" project in
 * playwright.config.ts). Signs up the dedicated API_AUTOMATION account if it
 * doesn't already exist, logs in, and saves the resulting bearer token to a
 * gitignored file that every other test's fixture reads from — so the whole
 * suite authenticates exactly once instead of once per test file, which both
 * keeps things fast and avoids tripping the login rate limit.
 */
setup("authenticate as API_AUTOMATION", async () => {
  const api = await request.newContext({ baseURL: env.baseURL });

  const signupRes = await api.post("/api/signup", {
    data: {
      username: env.automationUser.username,
      email: env.automationUser.email,
      password: env.automationUser.password,
      displayName: env.automationUser.displayName,
    },
  });
  // 201 = created fresh, 409 = already exists from a previous run — both fine.
  expect(
    [201, 409],
    `Unexpected signup status ${signupRes.status()}: ${await signupRes.text()}`
  ).toContain(signupRes.status());

  const loginRes = await api.post("/api/auth/login", {
    data: {
      identifier: env.automationUser.username,
      password: env.automationUser.password,
    },
  });
  expect(loginRes.status(), await loginRes.text()).toBe(201);

  const body = await loginRes.json();
  saveAuth({ token: body.token, userId: body.user.id, username: body.user.username });

  await api.dispose();
});
