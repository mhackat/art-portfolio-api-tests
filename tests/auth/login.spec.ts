import { test, expect } from "../../fixtures/api-fixtures";
import { env } from "../../config/env";

// Uses the existing API_AUTOMATION account rather than signing up new users
// per test — the suite never creates accounts, this one must already exist
// on the target environment (see tests/setup/global.setup.ts). Each
// successful login here creates its own API key; those are left in place
// (not logged out/revoked) so they're visible afterward for inspection.
test.describe("POST /api/auth/login", () => {
  test("logs in with username + password, and the token authenticates a real request", async ({
    apiRequest,
    authedUser,
  }) => {
    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: env.automationUser.username, password: env.automationUser.password },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    // Confirms login resolves to the same account global setup already
    // captured, not just a plausible-looking user object.
    expect(body.user.id).toBe(authedUser.userId);
    expect(body.user).toMatchObject({
      username: env.automationUser.username,
      displayName: env.automationUser.displayName,
      email: env.automationUser.email,
    });

    const meRes = await apiRequest.get("/api/api-keys", {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(meRes.status()).toBe(200);
  });

  test("logs in with email + password", async ({ apiRequest, authedUser }) => {
    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: env.automationUser.email, password: env.automationUser.password },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user.id).toBe(authedUser.userId);
    expect(body.user.username).toBe(env.automationUser.username);
  });

  test("rejects an identifier that doesn't exist", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: "no-such-user-ever", password: "Whatever123!" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects a missing password field", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: env.automationUser.username },
    });
    expect(res.status()).toBe(400);
  });

  test("does not leak whether the identifier or the password was wrong", async ({ apiRequest }) => {
    const wrongPassword = await apiRequest.post("/api/auth/login", {
      data: { identifier: env.automationUser.username, password: "WrongPassword123!" },
    });
    const wrongIdentifier = await apiRequest.post("/api/auth/login", {
      data: { identifier: "no-such-user-ever", password: env.automationUser.password },
    });

    expect(wrongPassword.status()).toBe(401);
    expect(wrongPassword.status()).toBe(wrongIdentifier.status());
    expect(await wrongPassword.json()).toEqual(await wrongIdentifier.json());
  });
});
