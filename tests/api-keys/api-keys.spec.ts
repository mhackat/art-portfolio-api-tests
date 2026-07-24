import { test, expect } from "../../fixtures/api-fixtures";

test.describe("API key management", () => {
  test("GET /api/api-keys requires authentication", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/api-keys");
    expect(res.status()).toBe(401);
  });

  test("the authenticated user can list their own keys, prefix only — never the raw key", async ({
    authedRequest,
  }) => {
    const res = await authedRequest.get("/api/api-keys");
    expect(res.status()).toBe(200);

    const keys = await res.json();
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toHaveProperty("keyPrefix");
      expect(key).not.toHaveProperty("key");
      expect(key).not.toHaveProperty("keyHash");
    }
  });

  test("POST /api/api-keys creates a key and returns the raw value once", async ({ authedRequest }) => {
    const res = await authedRequest.post("/api/api-keys", { data: { name: "CI test key" } });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.name).toBe("CI test key");
    expect(typeof body.key).toBe("string");
    expect(body.key.length).toBeGreaterThan(0);

    // Clean up so we don't accumulate keys across repeated local runs.
    await authedRequest.delete(`/api/api-keys/${body.id}`);
  });

  test("a newly created key authenticates a real request", async ({ authedRequest }) => {
    const createRes = await authedRequest.post("/api/api-keys", { data: { name: "usable key" } });
    const { id, key } = await createRes.json();

    const res = await authedRequest.get("/api/api-keys", {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(res.status()).toBe(200);

    await authedRequest.delete(`/api/api-keys/${id}`);
  });

  test("defaults the key name to 'Default' when none is given", async ({ authedRequest }) => {
    const res = await authedRequest.post("/api/api-keys", { data: {} });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Default");

    await authedRequest.delete(`/api/api-keys/${body.id}`);
  });

  test("DELETE revokes a key so it can no longer authenticate", async ({ authedRequest }) => {
    const createRes = await authedRequest.post("/api/api-keys", { data: { name: "to be revoked" } });
    const { id, key } = await createRes.json();

    const deleteRes = await authedRequest.delete(`/api/api-keys/${id}`);
    expect(deleteRes.status()).toBe(204);

    const reuseRes = await authedRequest.get("/api/api-keys", {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(reuseRes.status()).toBe(401);
  });

  test("DELETE on a nonexistent key returns 404", async ({ authedRequest }) => {
    const res = await authedRequest.delete("/api/api-keys/does-not-exist");
    expect(res.status()).toBe(404);
  });
});
