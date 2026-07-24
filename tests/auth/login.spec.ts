import { test, expect } from "../../fixtures/api-fixtures";
import { generateUniqueUser } from "../../utils/test-data";

async function signUp(apiRequest: import("@playwright/test").APIRequestContext, user: ReturnType<typeof generateUniqueUser>) {
  const res = await apiRequest.post("/api/signup", { data: user });
  expect(res.status()).toBe(201);
}

test.describe("POST /api/auth/login", () => {
  test("logs in with username + password and returns a bearer token", async ({ apiRequest }) => {
    const user = generateUniqueUser();
    await signUp(apiRequest, user);

    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: user.password },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.user).toMatchObject({ username: user.username, displayName: user.displayName, email: user.email });
  });

  test("logs in with email + password", async ({ apiRequest }) => {
    const user = generateUniqueUser();
    await signUp(apiRequest, user);

    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.email, password: user.password },
    });

    expect(res.status()).toBe(201);
  });

  test("a freshly issued token authenticates a real request", async ({ apiRequest }) => {
    const user = generateUniqueUser();
    await signUp(apiRequest, user);
    const loginRes = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: user.password },
    });
    const { token } = await loginRes.json();

    const meRes = await apiRequest.get("/api/api-keys", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status()).toBe(200);
  });

  test("rejects the wrong password", async ({ apiRequest }) => {
    const user = generateUniqueUser();
    await signUp(apiRequest, user);

    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: "WrongPassword123!" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects an identifier that doesn't exist", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: "no-such-user-ever", password: "Whatever123!" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects a missing password field", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/auth/login", {
      data: { identifier: "someone" },
    });
    expect(res.status()).toBe(400);
  });

  test("does not leak whether the identifier or the password was wrong", async ({ apiRequest }) => {
    const user = generateUniqueUser();
    await signUp(apiRequest, user);

    const wrongPassword = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: "WrongPassword123!" },
    });
    const wrongIdentifier = await apiRequest.post("/api/auth/login", {
      data: { identifier: "no-such-user-ever", password: user.password },
    });

    expect(wrongPassword.status()).toBe(wrongIdentifier.status());
    expect(await wrongPassword.json()).toEqual(await wrongIdentifier.json());
  });
});
