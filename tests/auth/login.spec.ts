import { test, expect } from "../../fixtures/api-fixtures";
import { env } from "../../config/env";

// Uses the existing API_AUTOMATION account rather than signing up new users
// per test — signup and login are both rate-limited per IP, and the account
// already exists (created once by global setup / tests/auth/signup.spec.ts).
// Each successful login here creates its own revocable session key, cleaned
// up immediately after use so the account doesn't accumulate stray keys.
test.describe("POST /api/auth/login", () => {
  test("logs in with username + password, and the token authenticates a real request", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: env.automationUser.username, password: env.automationUser.password },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.user).toMatchObject({
      username: env.automationUser.username,
      displayName: env.automationUser.displayName,
      email: env.automationUser.email,
    });

    const meRes = await apiRequest.get("/api/api-keys", {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(meRes.status()).toBe(200);

    await apiRequest.post("/api/auth/logout", { headers: { Authorization: `Bearer ${body.token}` } });
  });

  test("logs in with email + password", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: env.automationUser.email, password: env.automationUser.password },
    });
    expect(res.status()).toBe(201);
    const { token } = await res.json();

    await apiRequest.post("/api/auth/logout", { headers: { Authorization: `Bearer ${token}` } });
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
