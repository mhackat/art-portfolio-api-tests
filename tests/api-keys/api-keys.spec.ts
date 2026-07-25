import { test, expect } from "../../fixtures/api-fixtures";

test.describe("API key management", () => {
  test("GET /api/api-keys requires authentication", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/api-keys");
    expect(res.status()).toBe(401);
  });

  test("newly created keys appear in the list with the name that was passed in", async ({ authedRequest }) => {
    const created = await authedRequest.post("/api/api-keys", { data: { name: "list-visibility test key" } });
    const { id, key, keyPrefix } = await created.json();
    expect(keyPrefix).toBe(key.slice(0, 10));

    const res = await authedRequest.get("/api/api-keys");
    expect(res.status()).toBe(200);

    const keys = await res.json();
    expect(Array.isArray(keys)).toBe(true);

    const match = keys.find((k: { id: string }) => k.id === id);
    expect(match).toBeDefined();
    expect(match.name).toBe("list-visibility test key");
    expect(match.keyPrefix).toBe(keyPrefix);

    for (const k of keys) {
      expect(k).toHaveProperty("keyPrefix");
      expect(k).not.toHaveProperty("key");
      expect(k).not.toHaveProperty("keyHash");
    }
  });

  test("POST /api/api-keys creates a key and returns the raw value once", async ({ authedRequest }) => {
    const res = await authedRequest.post("/api/api-keys", { data: { name: "CI test key" } });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
    expect(body.name).toBe("CI test key");
    expect(typeof body.key).toBe("string");
    expect(body.key.length).toBeGreaterThan(0);
    // keyPrefix is derived from the raw key (see src/lib/api-keys.ts) — confirm
    // the response's two fields actually agree with each other.
    expect(body.keyPrefix).toBe(body.key.slice(0, 10));
    expect(typeof body.createdAt).toBe("string");
  });

  test("a newly created key authenticates as the same account that created it", async ({ authedRequest }) => {
    const createRes = await authedRequest.post("/api/api-keys", { data: { name: "usable key" } });
    const { id, key } = await createRes.json();

    const res = await authedRequest.get("/api/api-keys", {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(res.status()).toBe(200);
    const keys = await res.json();
    // Proves the new key authenticates as the account that created it, not
    // some other identity — the key should see itself in its own key list.
    expect(keys.some((k: { id: string }) => k.id === id)).toBe(true);
  });

  test("defaults the key name to 'Default' when none is given", async ({ authedRequest }) => {
    const res = await authedRequest.post("/api/api-keys", { data: {} });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Default");
    expect(body.keyPrefix).toBe(body.key.slice(0, 10));
  });

  test("DELETE revokes a key so it can no longer authenticate", async ({ authedRequest }) => {
    const createRes = await authedRequest.post("/api/api-keys", { data: { name: "to be revoked" } });
    const created = await createRes.json();
    expect(created.name).toBe("to be revoked");
    const { id, key } = created;

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
