import { test, expect } from "../../fixtures/api-fixtures";
import { createTestUser } from "../../utils/create-user";
import { pngFilePart, oversizedPngFilePart, disallowedFilePart } from "../../utils/test-image";
import { buildMultipartFields } from "../../utils/multipart";

// Each test creates its own throwaway user (see createTestUser) so uploaded
// artworks/images don't pile up on the shared API_AUTOMATION account across
// repeated local runs.

test.describe("POST /api/users/by-username/{username}/artworks", () => {
  test("the owner can add an artwork with an uploaded image", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);

    const res = await apiRequest.post(`/api/users/by-username/${user.username}/artworks`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: { title: "Untitled No. 1", description: "Oil on canvas.", file: pngFilePart() },
    });

    expect(res.status()).toBe(201);
    const artwork = await res.json();
    expect(artwork).toMatchObject({ title: "Untitled No. 1", description: "Oil on canvas.", userId: user.userId });
    expect(typeof artwork.imageUrl).toBe("string");
    expect(artwork.imageUrl.length).toBeGreaterThan(0);
  });

  test("description defaults to an empty string when omitted", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const res = await apiRequest.post(`/api/users/by-username/${user.username}/artworks`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: { title: "No description", file: pngFilePart() },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).description).toBe("");
  });

  test("requires a title", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const res = await apiRequest.post(`/api/users/by-username/${user.username}/artworks`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: { file: pngFilePart() },
    });
    expect(res.status()).toBe(400);
  });

  test("requires a file", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const res = await apiRequest.post(`/api/users/by-username/${user.username}/artworks`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: { title: "No file here" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a disallowed file type", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const res = await apiRequest.post(`/api/users/by-username/${user.username}/artworks`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: { title: "Wrong type", file: disallowedFilePart() },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a file over the size limit", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const res = await apiRequest.post(`/api/users/by-username/${user.username}/artworks`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: { title: "Too big", file: oversizedPngFilePart() },
    });
    expect(res.status()).toBe(400);
  });

  test("requires authentication", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const res = await apiRequest.post(`/api/users/by-username/${user.username}/artworks`, {
      multipart: { title: "Anonymous upload", file: pngFilePart() },
    });
    expect(res.status()).toBe(401);
  });

  test("a different authenticated user cannot post to someone else's gallery", async ({ apiRequest }) => {
    const owner = await createTestUser(apiRequest);
    const attacker = await createTestUser(apiRequest);

    const res = await apiRequest.post(`/api/users/by-username/${owner.username}/artworks`, {
      headers: { Authorization: `Bearer ${attacker.token}` },
      multipart: { title: "Squatting", file: pngFilePart() },
    });
    expect(res.status()).toBe(403);
  });

  test("404s for a username that doesn't exist", async ({ apiRequest, authedUser }) => {
    const res = await apiRequest.post("/api/users/by-username/does-not-exist-xyz/artworks", {
      headers: { Authorization: `Bearer ${authedUser.token}` },
      multipart: { title: "Ghost gallery", file: pngFilePart() },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("PATCH and DELETE /api/artworks/{artworkId}", () => {
  async function createArtwork(apiRequest: import("@playwright/test").APIRequestContext, token: string, username: string) {
    const res = await apiRequest.post(`/api/users/by-username/${username}/artworks`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { title: "Original title", description: "Original description.", file: pngFilePart() },
    });
    return res.json();
  }

  test("the owner can update the title and description without touching the image", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const artwork = await createArtwork(apiRequest, user.token, user.username);

    const res = await apiRequest.patch(`/api/artworks/${artwork.id}`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: { title: "Updated title", description: "Updated description." },
    });

    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.title).toBe("Updated title");
    expect(updated.description).toBe("Updated description.");
    expect(updated.imageUrl).toBe(artwork.imageUrl);
  });

  test("a blank title is treated as 'leave unchanged', not rejected", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const artwork = await createArtwork(apiRequest, user.token, user.username);

    const res = await apiRequest.patch(`/api/artworks/${artwork.id}`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: { title: "   ", description: "only description changed" },
    });

    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.title).toBe("Original title");
    expect(updated.description).toBe("only description changed");
  });

  test("a blank description intentionally clears it", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const artwork = await createArtwork(apiRequest, user.token, user.username);

    // Built by hand rather than passed via Playwright's `multipart` option —
    // see utils/multipart.ts for why an empty-string value needs this.
    const { body, contentType } = buildMultipartFields([{ name: "description", value: "" }]);
    const res = await apiRequest.patch(`/api/artworks/${artwork.id}`, {
      headers: { Authorization: `Bearer ${user.token}`, "Content-Type": contentType },
      data: body,
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).description).toBe("");
  });

  test("uploading a new file replaces the image", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const artwork = await createArtwork(apiRequest, user.token, user.username);

    const res = await apiRequest.patch(`/api/artworks/${artwork.id}`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: { file: pngFilePart("replacement.png") },
    });

    expect(res.status()).toBe(200);
    expect(typeof (await res.json()).imageUrl).toBe("string");
  });

  test("requires authentication", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const artwork = await createArtwork(apiRequest, user.token, user.username);

    const res = await apiRequest.patch(`/api/artworks/${artwork.id}`, {
      multipart: { title: "Anonymous edit" },
    });
    expect(res.status()).toBe(401);
  });

  test("a different authenticated user cannot update someone else's artwork", async ({ apiRequest }) => {
    const owner = await createTestUser(apiRequest);
    const attacker = await createTestUser(apiRequest);
    const artwork = await createArtwork(apiRequest, owner.token, owner.username);

    const res = await apiRequest.patch(`/api/artworks/${artwork.id}`, {
      headers: { Authorization: `Bearer ${attacker.token}` },
      multipart: { title: "Vandalized" },
    });
    expect(res.status()).toBe(403);
  });

  test("404s for an artwork that doesn't exist", async ({ apiRequest, authedUser }) => {
    const res = await apiRequest.patch("/api/artworks/does-not-exist-xyz", {
      headers: { Authorization: `Bearer ${authedUser.token}` },
      multipart: { title: "Ghost" },
    });
    expect(res.status()).toBe(404);
  });

  test("the owner can delete their own artwork", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const artwork = await createArtwork(apiRequest, user.token, user.username);

    const res = await apiRequest.delete(`/api/artworks/${artwork.id}`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(res.status()).toBe(204);

    const profile = await apiRequest.get(`/api/users/by-username/${user.username}`);
    const body = await profile.json();
    expect(body.artworks.find((a: { id: string }) => a.id === artwork.id)).toBeUndefined();
  });

  test("a different authenticated user cannot delete someone else's artwork", async ({ apiRequest }) => {
    const owner = await createTestUser(apiRequest);
    const attacker = await createTestUser(apiRequest);
    const artwork = await createArtwork(apiRequest, owner.token, owner.username);

    const res = await apiRequest.delete(`/api/artworks/${artwork.id}`, {
      headers: { Authorization: `Bearer ${attacker.token}` },
    });
    expect(res.status()).toBe(403);
  });

  test("DELETE requires authentication", async ({ apiRequest }) => {
    const user = await createTestUser(apiRequest);
    const artwork = await createArtwork(apiRequest, user.token, user.username);

    const res = await apiRequest.delete(`/api/artworks/${artwork.id}`);
    expect(res.status()).toBe(401);
  });

  test("404s deleting an artwork that doesn't exist", async ({ apiRequest, authedUser }) => {
    const res = await apiRequest.delete("/api/artworks/does-not-exist-xyz", {
      headers: { Authorization: `Bearer ${authedUser.token}` },
    });
    expect(res.status()).toBe(404);
  });
});
