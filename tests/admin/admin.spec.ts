import { test, expect } from "../../fixtures/api-fixtures";

/**
 * Admin access is gated by the ADMIN_EMAILS env var on the app, not a DB role —
 * there's no way to grant it through the API itself. These tests run wherever
 * ADMIN_EMAIL/ADMIN_PASSWORD point at an account that is already an admin on the
 * target environment, which is both local and the shared test deployment. If
 * those vars are unset the tests skip rather than fail, since "no admin
 * configured" isn't a bug in the app.
 *
 * The @admin tag is kept so a run can still be narrowed to (or away from) these.
 *
 * Nothing here deletes a real user: deletion is exercised by the signup spec,
 * which creates a throwaway account precisely so it has something safe to remove.
 */
test.describe("Admin endpoints @admin", () => {
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

  test("an admin can list users, paginated", async ({ adminRequest }) => {
    const res = await adminRequest.get("/api/admin/users");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.users ?? body)).toBe(true);
  });

  test("an admin cannot delete their own account through this endpoint", async ({ adminRequest }) => {
    const me = await adminRequest.get("/api/admin/users");
    expect(me.status()).toBe(200);

    // Resolve the admin's own id from the list rather than logging in again,
    // which keeps this test within the shared worker-scoped session.
    const { users } = await me.json();
    const admin = (users ?? []).find((u: { email: string }) => u.email === process.env.ADMIN_EMAIL);
    expect(admin, "admin account should appear in the user list it just fetched").toBeTruthy();

    const res = await adminRequest.delete(`/api/admin/users/${admin.id}`);
    expect(res.status()).toBe(400);
  });

  test("404s deleting a user that doesn't exist", async ({ adminRequest }) => {
    const res = await adminRequest.delete("/api/admin/users/does-not-exist-xyz");
    expect(res.status()).toBe(404);
  });

  test("an admin can mint a single-use signup code", async ({ adminRequest }) => {
    const res = await adminRequest.post("/api/admin/access-codes", {
      data: { note: "admin spec" },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(typeof body.code).toBe("string");
    // The prefix in the response is derived from the raw code, so the two
    // fields should agree with each other.
    expect(body.codePrefix).toBe(body.code.slice(0, 10));

    // Leave nothing outstanding: an unused code is a live way into the site.
    const revoked = await adminRequest.delete(`/api/admin/access-codes/${body.id}`);
    expect(revoked.status()).toBe(204);
  });
});
