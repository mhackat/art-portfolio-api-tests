import { test as teardown, expect, request } from "@playwright/test";
import { env } from "../../config/env";
import { authFileExists, loadAuth, adminAuthFileExists, loadAdminAuth } from "../../utils/auth-storage";
import { withResponseLogging } from "../../utils/api-logging";

/**
 * Runs once after the rest of the suite finishes (see the "teardown" project
 * in playwright.config.ts, wired to the "setup" project). Revokes the
 * captured session so it doesn't linger as a valid credential once the run
 * is done — mirrors the app's own "log out when finished" API contract.
 */
teardown("revoke API_AUTOMATION session", async () => {
  if (!authFileExists()) {
    // Setup never ran or already failed before saving a token — nothing to revoke.
    return;
  }

  const { token } = loadAuth();
  const raw = await request.newContext({ baseURL: env.baseURL });
  const api = withResponseLogging(raw, "teardown");

  const res = await api.post("/api/auth/logout", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect([204, 401], `Unexpected logout status ${res.status()}: ${await res.text()}`).toContain(
    res.status()
  );

  await raw.dispose();
});

/** Same for the admin session — a run shouldn't leave a live admin credential
 * lying around once it's finished with it. */
teardown("revoke admin session", async () => {
  if (!adminAuthFileExists()) {
    return;
  }

  const { token } = loadAdminAuth();
  const raw = await request.newContext({ baseURL: env.baseURL });
  const api = withResponseLogging(raw, "teardown");

  const res = await api.post("/api/auth/logout", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect([204, 401], `Unexpected admin logout status ${res.status()}: ${await res.text()}`).toContain(
    res.status()
  );

  await raw.dispose();
});
