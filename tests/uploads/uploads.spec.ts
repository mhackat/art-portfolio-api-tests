import { test, expect } from "../../fixtures/api-fixtures";
import { pngFilePart, oversizedPngFilePart, disallowedFilePart } from "../../utils/test-image";

/**
 * POST /api/uploads — takes an image and hands back a public URL, without
 * creating an artwork.
 *
 * Nothing in the app calls it; the artwork routes do their own upload. But it's
 * documented and reachable with an API key, so it's part of the published
 * contract whether or not the UI uses it — and an unused, untested upload
 * endpoint is exactly where a validation gap goes unnoticed.
 *
 * Each successful upload leaves an object in storage that no artwork row points
 * at. That's what the orphaned-image sweeper in the admin tools exists to find,
 * so the residue is expected rather than a leak.
 */
test.describe("POST /api/uploads", () => {
  test("requires authentication", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/uploads", {
      multipart: { file: pngFilePart() },
    });
    expect(res.status()).toBe(401);
  });

  test("returns a public URL for an uploaded image", async ({ authedRequest }) => {
    const res = await authedRequest.post("/api/uploads", {
      multipart: { file: pngFilePart() },
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    const url: string = body.url ?? body.imageUrl;
    expect(url, "response should carry the uploaded image's URL").toMatch(/^https?:\/\//);
  });

  test("the returned URL actually serves the image", async ({ authedRequest, apiRequest }) => {
    const res = await authedRequest.post("/api/uploads", {
      multipart: { file: pngFilePart() },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    const url: string = body.url ?? body.imageUrl;

    // A URL that 404s would pass a shape-only assertion while being useless to
    // the caller, so follow it.
    const fetched = await apiRequest.get(url);
    expect(fetched.status()).toBe(200);
    expect(fetched.headers()["content-type"]).toContain("image");
  });

  test("rejects a request with no file", async ({ authedRequest }) => {
    const res = await authedRequest.post("/api/uploads", { multipart: {} });
    expect(res.status()).toBe(400);
  });

  test("rejects a file that isn't an image", async ({ authedRequest }) => {
    const res = await authedRequest.post("/api/uploads", {
      multipart: { file: disallowedFilePart() },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a file over the size limit", async ({ authedRequest }) => {
    const res = await authedRequest.post("/api/uploads", {
      multipart: { file: oversizedPngFilePart() },
    });
    // Some hosts reject an oversized body at the edge before the handler sees
    // it, so accept the platform's 413 as well as the app's own 400.
    expect([400, 413]).toContain(res.status());
  });
});
