import { test, expect } from "../../fixtures/api-fixtures";
import { createTestUser } from "../../utils/create-user";

// These use a freshly-created user per test (via createTestUser) rather than
// the shared API_AUTOMATION account, so read-after-write assertions on the
// bio value can't race with other tests mutating the same account in
// parallel.

test.describe("PATCH /api/users/by-username/{username}/bio", () => {
  test("the owner can update their own bio", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);

    const res = await apiRequest.patch(`/api/users/by-username/${user.username}/bio`, {
      data: { bio: "Painter of small, strange things." },
      headers: { Authorization: `Bearer ${user.token}` },
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).bio).toBe("Painter of small, strange things.");

    const profile = await apiRequest.get(`/api/users/by-username/${user.username}`);
    expect((await profile.json()).bio).toBe("Painter of small, strange things.");
  });

  test("an empty string is a valid bio (clears it)", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    await apiRequest.patch(`/api/users/by-username/${user.username}/bio`, {
      data: { bio: "temporary" },
      headers: { Authorization: `Bearer ${user.token}` },
    });

    const res = await apiRequest.patch(`/api/users/by-username/${user.username}/bio`, {
      data: { bio: "" },
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).bio).toBe("");
  });

  test("rejects a bio over 2000 characters", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const res = await apiRequest.patch(`/api/users/by-username/${user.username}/bio`, {
      data: { bio: "a".repeat(2001) },
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a missing bio field", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const res = await apiRequest.patch(`/api/users/by-username/${user.username}/bio`, {
      data: {},
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(res.status()).toBe(400);
  });

  test("requires authentication", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const res = await apiRequest.patch(`/api/users/by-username/${user.username}/bio`, {
      data: { bio: "should not work" },
    });
    expect(res.status()).toBe(401);
  });

  test("a different authenticated user cannot update someone else's bio", async ({ apiRequest }) => {
    const owner = await createTestUser(apiRequest);
    const attacker = await createTestUser(apiRequest);

    const res = await apiRequest.patch(`/api/users/by-username/${owner.username}/bio`, {
      data: { bio: "hijacked" },
      headers: { Authorization: `Bearer ${attacker.token}` },
    });
    expect(res.status()).toBe(403);
  });

  test("404s for a username that doesn't exist", async ({ apiRequest, authedUser }) => {
    const res = await apiRequest.patch("/api/users/by-username/does-not-exist-xyz/bio", {
      data: { bio: "irrelevant" },
      headers: { Authorization: `Bearer ${authedUser.token}` },
    });
    expect(res.status()).toBe(404);
  });
});
