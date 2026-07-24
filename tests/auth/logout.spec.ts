import { test, expect } from "../../fixtures/api-fixtures";

// Uses POST /api/api-keys (via the shared authedRequest) to mint disposable
// bearer tokens instead of logging in — logout revokes "whichever key
// authenticated the request" regardless of how it was issued, and this
// keeps these tests off the login endpoint's rate limit entirely.
test.describe("POST /api/auth/logout", () => {
  test("revokes the token used to call it, so it can't be reused", async ({ apiRequest, authedRequest }) => {
    const created = await authedRequest.post("/api/api-keys", { data: { name: "logout test key" } });
    const { key } = await created.json();

    const logoutRes = await apiRequest.post("/api/auth/logout", { headers: { Authorization: `Bearer ${key}` } });
    expect(logoutRes.status()).toBe(204);

    const reuseRes = await apiRequest.get("/api/api-keys", { headers: { Authorization: `Bearer ${key}` } });
    expect(reuseRes.status()).toBe(401);
  });

  test("only revokes the token presented, leaving the account's other keys intact", async ({
    apiRequest,
    authedRequest,
  }) => {
    const first = await authedRequest.post("/api/api-keys", { data: { name: "logout test key A" } });
    const { key: firstKey } = await first.json();
    const second = await authedRequest.post("/api/api-keys", { data: { name: "logout test key B" } });
    const { id: secondId, key: secondKey } = await second.json();

    const logoutRes = await apiRequest.post("/api/auth/logout", {
      headers: { Authorization: `Bearer ${firstKey}` },
    });
    expect(logoutRes.status()).toBe(204);

    const secondStillWorks = await apiRequest.get("/api/api-keys", {
      headers: { Authorization: `Bearer ${secondKey}` },
    });
    expect(secondStillWorks.status()).toBe(200);

    await authedRequest.delete(`/api/api-keys/${secondId}`);
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
