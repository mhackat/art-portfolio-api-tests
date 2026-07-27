import { test as setup, expect, request } from "@playwright/test";
import { env } from "../../config/env";
import { saveAuth, saveAdminAuth } from "../../utils/auth-storage";
import { withResponseLogging } from "../../utils/api-logging";

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
  const raw = await request.newContext({ baseURL: env.baseURL });
  const api = withResponseLogging(raw, "setup");

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

  await raw.dispose();
});

/**
 * Captures the admin session the same way and for the same reason. Logins are
 * rate-limited per identifier, so doing this once per run — rather than per
 * worker or per test — is what keeps a local run (where Playwright scales
 * workers to the CPU count) from 429ing on its own admin account.
 *
 * Skips rather than fails when no admin is configured: an environment without
 * one is a valid way to run the suite, it just doesn't cover the admin surface.
 */
setup("authenticate as admin", async () => {
  setup.skip(!env.admin.isConfigured, "ADMIN_EMAIL/ADMIN_PASSWORD not set — admin tests will skip");

  const raw = await request.newContext({ baseURL: env.baseURL });
  const api = withResponseLogging(raw, "setup");

  const loginRes = await api.post("/api/auth/login", {
    data: { identifier: env.admin.email, password: env.admin.password },
  });
  expect(
    loginRes.status(),
    `Admin login failed for ${env.admin.email} on ${env.baseURL} — does this account exist, and is its email listed in the app's ADMIN_EMAILS? ${await loginRes.text()}`
  ).toBe(201);

  const body = await loginRes.json();
  saveAdminAuth({ token: body.token, userId: body.user.id, username: body.user.username });

  await raw.dispose();
});
