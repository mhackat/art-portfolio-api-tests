import { test, expect } from "../../fixtures/api-fixtures";
import { env } from "../../config/env";
import { createTestUser } from "../../utils/create-user";

// Admin access is gated by the ADMIN_EMAILS env var on the app, not a DB
// role — there's no way to grant it via the API itself. These tests only
// run when ADMIN_EMAIL/ADMIN_PASSWORD are supplied for an account that's
// already an admin on the target environment; otherwise they're skipped
// rather than failing, since "no admin configured" isn't a bug.
//
// createTestUser is used exactly once below ("an admin can delete another
// user's account") because that test needs a real, disposable account to
// delete — it can't reuse the shared API_AUTOMATION user without breaking
// every other test that depends on it existing. This whole describe block
// only runs when explicitly configured, so it doesn't affect the signup
// rate limit in normal local/CI runs.
test.describe("Admin endpoints", () => {
  test.skip(!env.admin.isConfigured, "ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin tests");

  async function loginAsAdmin(apiRequest: import("@playwright/test").APIRequestContext) {
    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: env.admin.email, password: env.admin.password },
    });
    expect(res.status(), await res.text()).toBe(201);
    return res.json();
  }

  test("a non-admin cannot list users", async ({ authedRequest }) => {
    const res = await authedRequest.get("/api/admin/users");
    expect(res.status()).toBe(403);
  });

  test("a non-admin cannot delete a user", async ({ authedRequest, authedUser }) => {
    // Targets the caller's own id — the request is rejected on the
    // authorization check before any deletion would happen, so this is
    // safe to run against the shared account.
    const res = await authedRequest.delete(`/api/admin/users/${authedUser.userId}`);
    expect(res.status()).toBe(403);
  });

  test("admin endpoints require authentication", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/admin/users");
    expect(res.status()).toBe(401);
  });

  test("an admin can list users, paginated", async ({ apiRequest }) => {
    const { token } = await loginAsAdmin(apiRequest);

    const res = await apiRequest.get("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users ?? body)).toBe(true);
  });

  test("an admin can delete another user's account", async ({ apiRequest }) => {
    const { token } = await loginAsAdmin(apiRequest);
    const victim = await createTestUser(apiRequest);

    const res = await apiRequest.delete(`/api/admin/users/${victim.userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(204);

    const profile = await apiRequest.get(`/api/users/${victim.userId}`);
    expect(profile.status()).toBe(404);
  });

  test("an admin cannot delete their own account through this endpoint", async ({ apiRequest }) => {
    const { token, user } = await loginAsAdmin(apiRequest);

    const res = await apiRequest.delete(`/api/admin/users/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(400);
  });

  test("404s deleting a user that doesn't exist", async ({ apiRequest }) => {
    const { token } = await loginAsAdmin(apiRequest);
    const res = await apiRequest.delete("/api/admin/users/does-not-exist-xyz", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(404);
  });
});
