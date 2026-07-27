import { test, expect } from "../../fixtures/api-fixtures";

/**
 * Listing and bulk-revoking signup codes.
 *
 * Note on blast radius: `revoke-unused` deletes *every* outstanding code on the
 * target environment, not just the ones this spec made. That's fine where the
 * suite is meant to run — localhost and the dedicated test deployment, where
 * outstanding codes are only ever test artifacts. It would be destructive
 * against an environment holding invites issued to real people, which is one
 * more reason the suite never points at Production.
 */
test.describe.configure({ mode: "serial" });

test.describe("Admin signup codes @admin", () => {
  test("requires an admin", async ({ apiRequest, authedRequest }) => {
    expect((await apiRequest.get("/api/admin/access-codes")).status()).toBe(401);
    expect((await authedRequest.get("/api/admin/access-codes")).status()).toBe(403);
    expect((await apiRequest.post("/api/admin/access-codes/revoke-unused")).status()).toBe(401);
    expect((await authedRequest.post("/api/admin/access-codes/revoke-unused")).status()).toBe(403);
  });

  test("a minted code shows up in the list, by prefix only", async ({ adminRequest }) => {
    const mint = await adminRequest.post("/api/admin/access-codes", { data: { note: "list check" } });
    expect(mint.status()).toBe(201);
    const created = await mint.json();

    const list = await adminRequest.get("/api/admin/access-codes");
    expect(list.status()).toBe(200);

    const { codes } = await list.json();
    const found = codes.find((c: { id: string }) => c.id === created.id);
    expect(found, "the code just minted should appear in the list").toBeTruthy();
    expect(found.codePrefix).toBe(created.codePrefix);
    expect(found.note).toBe("list check");
    expect(found.usedAt).toBeNull();

    // The raw code is hashed at rest and shown once, at creation. If the list
    // ever started returning it, every stored code would be usable by anyone
    // who could read this response.
    expect(found).not.toHaveProperty("code");
    expect(found).not.toHaveProperty("codeHash");
    expect(JSON.stringify(codes)).not.toContain(created.code);
  });

  test("revoking all outstanding codes clears them but keeps used ones", async ({ adminRequest }) => {
    await adminRequest.post("/api/admin/access-codes", { data: { note: "revoke-all check" } });

    const before = await adminRequest.get("/api/admin/access-codes");
    const usedBefore = (await before.json()).codes.filter(
      (c: { usedAt: string | null }) => c.usedAt !== null
    ).length;

    const revoke = await adminRequest.post("/api/admin/access-codes/revoke-unused");
    expect(revoke.status()).toBe(200);
    expect((await revoke.json()).count).toBeGreaterThan(0);

    const after = await adminRequest.get("/api/admin/access-codes");
    const codes = (await after.json()).codes;

    expect(
      codes.filter((c: { usedAt: string | null }) => c.usedAt === null),
      "no outstanding codes should remain"
    ).toHaveLength(0);
    // Used codes are the record of which account each one created — a bulk
    // revoke must not quietly erase that history.
    expect(codes.filter((c: { usedAt: string | null }) => c.usedAt !== null).length).toBe(usedBefore);
  });

  test("a used code cannot be revoked", async ({ adminRequest }) => {
    const list = await adminRequest.get("/api/admin/access-codes");
    const used = (await list.json()).codes.find((c: { usedAt: string | null }) => c.usedAt !== null);

    test.skip(!used, "no used code on this environment yet — nothing to assert against");

    const res = await adminRequest.delete(`/api/admin/access-codes/${used.id}`);
    expect(res.status(), "revoking a spent code should be refused, not silently delete the record").toBe(
      409
    );
  });

  test("404s revoking a code that doesn't exist", async ({ adminRequest }) => {
    const res = await adminRequest.delete("/api/admin/access-codes/does-not-exist-xyz");
    expect(res.status()).toBe(404);
  });
});
