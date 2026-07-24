import { test, expect } from "../../fixtures/api-fixtures";
import { generateUniqueUser } from "../../utils/test-data";

test.describe("POST /api/auth/logout", () => {
  test("revokes the token used to call it, so it can't be reused", async ({ apiRequest }) => {
    const user = generateUniqueUser();
    await apiRequest.post("/api/signup", { data: user });
    const loginRes = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: user.password },
    });
    const { token } = await loginRes.json();

    const logoutRes = await apiRequest.post("/api/auth/logout", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status()).toBe(204);

    const reuseRes = await apiRequest.get("/api/api-keys", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reuseRes.status()).toBe(401);
  });

  test("only revokes the token presented, leaving the account's other keys intact", async ({ apiRequest }) => {
    const user = generateUniqueUser();
    await apiRequest.post("/api/signup", { data: user });
    const firstLogin = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: user.password },
    });
    const { token: firstToken } = await firstLogin.json();
    const secondLogin = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: user.password },
    });
    const { token: secondToken } = await secondLogin.json();

    const logoutRes = await apiRequest.post("/api/auth/logout", {
      headers: { Authorization: `Bearer ${firstToken}` },
    });
    expect(logoutRes.status()).toBe(204);

    const secondStillWorks = await apiRequest.get("/api/api-keys", {
      headers: { Authorization: `Bearer ${secondToken}` },
    });
    expect(secondStillWorks.status()).toBe(200);
  });

  test("rejects a request with no Authorization header", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/auth/logout");
    expect(res.status()).toBe(401);
  });

  test("rejects an already-revoked / garbage token", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/auth/logout", {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    expect(res.status()).toBe(401);
  });
});
