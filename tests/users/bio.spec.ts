import { test, expect } from "../../fixtures/api-fixtures";

// Serial because these tests mutate the same existing account's bio field —
// running them in parallel would let one test's write race another's
// read-after-write assertion.
test.describe.configure({ mode: "serial" });

test.describe("PATCH /api/users/by-username/{username}/bio", () => {
  test("the owner can update their own bio", async ({ authedRequest, authedUser }) => {
    const res = await authedRequest.patch(`/api/users/by-username/${authedUser.username}/bio`, {
      data: { bio: "Painter of small, strange things." },
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).bio).toBe("Painter of small, strange things.");

    const profile = await authedRequest.get(`/api/users/by-username/${authedUser.username}`);
    expect((await profile.json()).bio).toBe("Painter of small, strange things.");
  });

  test("an empty string is a valid bio (clears it)", async ({ authedRequest, authedUser }) => {
    const res = await authedRequest.patch(`/api/users/by-username/${authedUser.username}/bio`, {
      data: { bio: "" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).bio).toBe("");
  });

  test("rejects a bio over 2000 characters", async ({ authedRequest, authedUser }) => {
    const res = await authedRequest.patch(`/api/users/by-username/${authedUser.username}/bio`, {
      data: { bio: "a".repeat(2001) },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a missing bio field", async ({ authedRequest, authedUser }) => {
    const res = await authedRequest.patch(`/api/users/by-username/${authedUser.username}/bio`, { data: {} });
    expect(res.status()).toBe(400);
  });

  test("requires authentication", async ({ apiRequest, authedUser }) => {
    const res = await apiRequest.patch(`/api/users/by-username/${authedUser.username}/bio`, {
      data: { bio: "should not work" },
    });
    expect(res.status()).toBe(401);
  });

  test("404s for a username that doesn't exist", async ({ authedRequest }) => {
    const res = await authedRequest.patch("/api/users/by-username/does-not-exist-xyz/bio", {
      data: { bio: "irrelevant" },
    });
    expect(res.status()).toBe(404);
  });
});
