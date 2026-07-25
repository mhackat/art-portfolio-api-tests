import { test as setup, expect, request } from "@playwright/test";
import { env } from "../../config/env";
import { saveAuth } from "../../utils/auth-storage";

/**
 * Runs once before the rest of the suite (see the "setup" project in
 * playwright.config.ts). Logs in as the dedicated API_AUTOMATION account and
 * saves the resulting bearer token to a gitignored file that every other
 * test's fixture reads from — so the whole suite authenticates exactly once
 * instead of once per test file, which both keeps things fast and avoids
 * tripping the login rate limit.
 *
 * The suite never signs this account up itself — it must already exist as a
 * real, pre-provisioned user on the target environment. If login fails here,
 * that's the fix: create API_AUTOMATION_USERNAME/EMAIL/PASSWORD manually
 * first, the suite won't do it for you.
 */
setup("authenticate as API_AUTOMATION", async () => {
  const api = await request.newContext({ baseURL: env.baseURL });

  const loginRes = await api.post("/api/auth/login", {
    data: {
      identifier: env.automationUser.username,
      password: env.automationUser.password,
    },
  });
  expect(
    loginRes.status(),
    `Login failed for ${env.automationUser.username} — does this account already exist on ${env.baseURL}? ${await loginRes.text()}`
  ).toBe(201);

  const body = await loginRes.json();
  saveAuth({ token: body.token, userId: body.user.id, username: body.user.username });

  await api.dispose();
});
