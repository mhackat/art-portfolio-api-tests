import { test, expect } from "../../fixtures/api-fixtures";
import { pngFilePart, oversizedPngFilePart, disallowedFilePart } from "../../utils/test-image";
import { buildMultipartFields } from "../../utils/multipart";

// Uses the existing API_AUTOMATION account throughout. Each test that
// creates an artwork deletes it again afterward so repeated local runs
// don't accumulate gallery items on the shared account.

test.describe("POST /api/users/by-username/{username}/artworks", () => {
  test("the owner can add an artwork with an uploaded image", async ({ authedRequest, authedUser }) => {
    const res = await authedRequest.post(`/api/users/by-username/${authedUser.username}/artworks`, {
      multipart: { title: "Untitled No. 1", description: "Oil on canvas.", file: pngFilePart() },
    });

    expect(res.status()).toBe(201);
    const artwork = await res.json();
    expect(artwork).toMatchObject({ title: "Untitled No. 1", description: "Oil on canvas.", userId: authedUser.userId });
    expect(typeof artwork.imageUrl).toBe("string");
    expect(artwork.imageUrl.length).toBeGreaterThan(0);

    await authedRequest.delete(`/api/artworks/${artwork.id}`);
  });

  test("description defaults to an empty string when omitted", async ({ authedRequest, authedUser }) => {
    const res = await authedRequest.post(`/api/users/by-username/${authedUser.username}/artworks`, {
      multipart: { title: "No description", file: pngFilePart() },
    });
    expect(res.status()).toBe(201);
    const artwork = await res.json();
    expect(artwork.description).toBe("");

    await authedRequest.delete(`/api/artworks/${artwork.id}`);
  });

  test("requires a title", async ({ authedRequest, authedUser }) => {
    const res = await authedRequest.post(`/api/users/by-username/${authedUser.username}/artworks`, {
      multipart: { file: pngFilePart() },
    });
    expect(res.status()).toBe(400);
  });

  test("requires a file", async ({ authedRequest, authedUser }) => {
    const res = await authedRequest.post(`/api/users/by-username/${authedUser.username}/artworks`, {
      multipart: { title: "No file here" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a disallowed file type", async ({ authedRequest, authedUser }) => {
    const res = await authedRequest.post(`/api/users/by-username/${authedUser.username}/artworks`, {
      multipart: { title: "Wrong type", file: disallowedFilePart() },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a file over the size limit", async ({ authedRequest, authedUser }) => {
    const res = await authedRequest.post(`/api/users/by-username/${authedUser.username}/artworks`, {
      multipart: { title: "Too big", file: oversizedPngFilePart() },
    });
    expect(res.status()).toBe(400);
  });

  test("requires authentication", async ({ apiRequest, authedUser }) => {
    const res = await apiRequest.post(`/api/users/by-username/${authedUser.username}/artworks`, {
      multipart: { title: "Anonymous upload", file: pngFilePart() },
    });
    expect(res.status()).toBe(401);
  });

  test("404s for a username that doesn't exist", async ({ authedRequest }) => {
    const res = await authedRequest.post("/api/users/by-username/does-not-exist-xyz/artworks", {
      multipart: { title: "Ghost gallery", file: pngFilePart() },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("PATCH and DELETE /api/artworks/{artworkId}", () => {
  async function createArtwork(authedRequest: import("@playwright/test").APIRequestContext, username: string) {
    const res = await authedRequest.post(`/api/users/by-username/${username}/artworks`, {
      multipart: { title: "Original title", description: "Original description.", file: pngFilePart() },
    });
    return res.json();
  }

  test("the owner can update the title and description without touching the image", async ({
    authedRequest,
    authedUser,
  }) => {
    const artwork = await createArtwork(authedRequest, authedUser.username);

    const res = await authedRequest.patch(`/api/artworks/${artwork.id}`, {
      multipart: { title: "Updated title", description: "Updated description." },
    });

    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.title).toBe("Updated title");
    expect(updated.description).toBe("Updated description.");
    expect(updated.imageUrl).toBe(artwork.imageUrl);

    await authedRequest.delete(`/api/artworks/${artwork.id}`);
  });

  test("a blank title is treated as 'leave unchanged', not rejected", async ({ authedRequest, authedUser }) => {
    const artwork = await createArtwork(authedRequest, authedUser.username);

    const res = await authedRequest.patch(`/api/artworks/${artwork.id}`, {
      multipart: { title: "   ", description: "only description changed" },
    });

    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.title).toBe("Original title");
    expect(updated.description).toBe("only description changed");

    await authedRequest.delete(`/api/artworks/${artwork.id}`);
  });

  test("a blank description intentionally clears it", async ({ authedRequest, authedUser }) => {
    const artwork = await createArtwork(authedRequest, authedUser.username);

    // Built by hand rather than passed via Playwright's `multipart` option —
    // see utils/multipart.ts for why an empty-string value needs this.
    const { body, contentType } = buildMultipartFields([{ name: "description", value: "" }]);
    const res = await authedRequest.patch(`/api/artworks/${artwork.id}`, {
      headers: { "Content-Type": contentType },
      data: body,
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).description).toBe("");

    await authedRequest.delete(`/api/artworks/${artwork.id}`);
  });

  test("uploading a new file replaces the image", async ({ authedRequest, authedUser }) => {
    const artwork = await createArtwork(authedRequest, authedUser.username);

    const res = await authedRequest.patch(`/api/artworks/${artwork.id}`, {
      multipart: { file: pngFilePart("replacement.png") },
    });

    expect(res.status()).toBe(200);
    expect(typeof (await res.json()).imageUrl).toBe("string");

    await authedRequest.delete(`/api/artworks/${artwork.id}`);
  });

  test("requires authentication", async ({ apiRequest, authedRequest, authedUser }) => {
    const artwork = await createArtwork(authedRequest, authedUser.username);

    const res = await apiRequest.patch(`/api/artworks/${artwork.id}`, {
      multipart: { title: "Anonymous edit" },
    });
    expect(res.status()).toBe(401);

    await authedRequest.delete(`/api/artworks/${artwork.id}`);
  });

  test("404s for an artwork that doesn't exist", async ({ authedRequest }) => {
    const res = await authedRequest.patch("/api/artworks/does-not-exist-xyz", {
      multipart: { title: "Ghost" },
    });
    expect(res.status()).toBe(404);
  });

  test("the owner can delete their own artwork", async ({ authedRequest, authedUser }) => {
    const artwork = await createArtwork(authedRequest, authedUser.username);

    const res = await authedRequest.delete(`/api/artworks/${artwork.id}`);
    expect(res.status()).toBe(204);

    const profile = await authedRequest.get(`/api/users/by-username/${authedUser.username}`);
    const body = await profile.json();
    expect(body.artworks.find((a: { id: string }) => a.id === artwork.id)).toBeUndefined();
  });

  test("DELETE requires authentication", async ({ apiRequest, authedRequest, authedUser }) => {
    const artwork = await createArtwork(authedRequest, authedUser.username);

    const res = await apiRequest.delete(`/api/artworks/${artwork.id}`);
    expect(res.status()).toBe(401);

    await authedRequest.delete(`/api/artworks/${artwork.id}`);
  });

  test("404s deleting an artwork that doesn't exist", async ({ authedRequest }) => {
    const res = await authedRequest.delete("/api/artworks/does-not-exist-xyz");
    expect(res.status()).toBe(404);
  });
});
