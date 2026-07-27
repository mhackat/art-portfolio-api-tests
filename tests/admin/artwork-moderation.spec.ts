import { request } from "@playwright/test";
import { test, expect } from "../../fixtures/api-fixtures";
import { env } from "../../config/env";
import { loadAdminAuth } from "../../utils/auth-storage";
import { createThrowawayUser, deleteThrowawayUser, type ThrowawayUser } from "../../utils/throwaway-user";
import { pngFilePart } from "../../utils/test-image";

/**
 * Deleting other people's work: the admin moderation routes, plus the owner's
 * own bulk delete.
 *
 * All of it points at a throwaway account. Aiming a bulk delete at
 * API_AUTOMATION would wipe the gallery the artwork specs build up, and on a
 * shared environment it would destroy whatever else happened to be there.
 *
 * Serial and sharing one account, since each costs a single-use code that can
 * never be reclaimed.
 */
test.describe.configure({ mode: "serial" });

test.describe("Artwork moderation @admin", () => {
  let user: ThrowawayUser;

  async function addArtwork(token: string, title: string): Promise<string> {
    const context = await request.newContext({
      baseURL: env.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const res = await context.post(`/api/users/by-username/${user.username}/artworks`, {
      multipart: { title, file: pngFilePart() },
    });
    expect(res.status(), `Could not seed an artwork: ${await res.text()}`).toBe(201);
    const { id } = await res.json();
    await context.dispose();
    return id;
  }

  test("creates a throwaway artist with a small gallery", async ({ adminRequest, apiRequest }) => {
    user = await createThrowawayUser(adminRequest, apiRequest, "moderation");

    for (const title of ["Moderation One", "Moderation Two", "Moderation Three"]) {
      await addArtwork(user.token, title);
    }

    const profile = await apiRequest.get(`/api/users/by-username/${user.username}`);
    expect(profile.status()).toBe(200);
    expect((await profile.json()).artworks).toHaveLength(3);
  });

  test.afterAll(async () => {
    if (!user?.id || !env.admin.isConfigured) return;

    const context = await request.newContext({
      baseURL: env.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${loadAdminAuth().token}` },
    });
    await deleteThrowawayUser(context, user.id);
    await context.dispose();
  });

  test("a non-admin cannot delete someone else's artwork", async ({ authedRequest, apiRequest }) => {
    const profile = await apiRequest.get(`/api/users/by-username/${user.username}`);
    const [first] = (await profile.json()).artworks;

    // The owner-facing route refuses outright...
    expect((await authedRequest.delete(`/api/artworks/${first.id}`)).status()).toBe(403);
    // ...and the admin route refuses a caller who isn't an admin.
    expect((await authedRequest.delete(`/api/admin/artworks/${first.id}`)).status()).toBe(403);
    expect((await authedRequest.delete(`/api/admin/users/${user.id}/artworks`)).status()).toBe(403);
  });

  test("admin artwork routes require authentication", async ({ apiRequest }) => {
    expect((await apiRequest.delete("/api/admin/artworks/anything")).status()).toBe(401);
    expect((await apiRequest.delete(`/api/admin/users/${user.id}/artworks`)).status()).toBe(401);
  });

  test("an admin can delete a single artwork from someone else's gallery", async ({
    adminRequest,
    apiRequest,
  }) => {
    const before = await apiRequest.get(`/api/users/by-username/${user.username}`);
    const artworks = (await before.json()).artworks;
    const target = artworks[0];

    const res = await adminRequest.delete(`/api/admin/artworks/${target.id}`);
    expect([200, 204]).toContain(res.status());

    const after = await apiRequest.get(`/api/users/by-username/${user.username}`);
    const remaining = (await after.json()).artworks;
    expect(remaining).toHaveLength(artworks.length - 1);
    expect(remaining.some((a: { id: string }) => a.id === target.id)).toBe(false);
  });

  test("404s deleting an artwork that doesn't exist", async ({ adminRequest }) => {
    const res = await adminRequest.delete("/api/admin/artworks/does-not-exist-xyz");
    expect(res.status()).toBe(404);
  });

  test("an admin can empty a gallery without touching the account", async ({
    adminRequest,
    apiRequest,
  }) => {
    const res = await adminRequest.delete(`/api/admin/users/${user.id}/artworks`);
    expect(res.status()).toBe(200);
    expect((await res.json()).count).toBeGreaterThan(0);

    const profile = await apiRequest.get(`/api/users/by-username/${user.username}`);
    // The account surviving is the point: emptying a gallery and removing a
    // person are meant to be different actions.
    expect(profile.status()).toBe(200);
    const body = await profile.json();
    expect(body.artworks).toHaveLength(0);
    expect(body.displayName).toBe(user.displayName);
  });

  test("404s emptying the gallery of a user that doesn't exist", async ({ adminRequest }) => {
    const res = await adminRequest.delete("/api/admin/users/does-not-exist-xyz/artworks");
    expect(res.status()).toBe(404);
  });

  test("the owner can bulk-delete their own gallery", async ({ contextAs, apiRequest }) => {
    await addArtwork(user.token, "Owner Bulk One");
    await addArtwork(user.token, "Owner Bulk Two");

    const asUser = await contextAs(user.token, "throwaway");
    const res = await asUser.delete(`/api/users/by-username/${user.username}/artworks`);
    expect(res.status()).toBe(200);
    expect((await res.json()).count).toBe(2);

    const profile = await apiRequest.get(`/api/users/by-username/${user.username}`);
    expect((await profile.json()).artworks).toHaveLength(0);
  });
});
