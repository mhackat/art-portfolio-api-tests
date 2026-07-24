import { test, expect } from "../../fixtures/api-fixtures";

test.describe("GET /api/users", () => {
  test("lists users without requiring authentication", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/users");
    expect(res.status()).toBe(200);
    const users = await res.json();
    expect(Array.isArray(users)).toBe(true);
  });

  test("only exposes public fields, never id/email/passwordHash", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/users");
    const users = await res.json();
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) {
      expect(user).toHaveProperty("username");
      expect(user).toHaveProperty("displayName");
      expect(user).not.toHaveProperty("id");
      expect(user).not.toHaveProperty("email");
      expect(user).not.toHaveProperty("passwordHash");
    }
  });

  test("finds the API_AUTOMATION user via a q= substring match on display name", async ({
    apiRequest,
    authedUser,
  }) => {
    const res = await apiRequest.get("/api/users", { params: { q: "API Automation" } });
    expect(res.status()).toBe(200);
    const users = await res.json();
    expect(users.some((u: { username: string }) => u.username === authedUser.username)).toBe(true);
  });

  test("returns an empty list for a query that matches nobody", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/users", { params: { q: "definitely-not-a-real-artist-xyz" } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("caps results at the requested limit", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/users", { params: { limit: "1" } });
    expect(res.status()).toBe(200);
    const users = await res.json();
    expect(users.length).toBeLessThanOrEqual(1);
  });
});

test.describe("GET /api/users/{id} and /api/users/by-username/{username}", () => {
  test("fetches a public profile by id", async ({ apiRequest, authedUser }) => {
    const res = await apiRequest.get(`/api/users/${authedUser.userId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.username).toBe(authedUser.username);
    expect(Array.isArray(body.artworks)).toBe(true);
    expect(body).not.toHaveProperty("passwordHash");
  });

  test("fetches the same profile by username", async ({ apiRequest, authedUser }) => {
    const res = await apiRequest.get(`/api/users/by-username/${authedUser.username}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(authedUser.userId);
  });

  test("404s for an id that doesn't exist", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/users/does-not-exist-xyz");
    expect(res.status()).toBe(404);
  });

  test("404s for a username that doesn't exist", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/users/by-username/does-not-exist-xyz");
    expect(res.status()).toBe(404);
  });
});
