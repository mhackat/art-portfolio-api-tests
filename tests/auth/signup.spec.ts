import { test, expect } from "../../fixtures/api-fixtures";

/**
 * The one place the suite creates an account.
 *
 * Signup is invite-only, so this needs an admin to mint a code first — which
 * also gives it the means to clean up after itself. The delete is part of the
 * test rather than only a teardown step, so that "an admin can remove a user"
 * is actually asserted rather than assumed. The afterEach is a safety net for
 * the case where the test fails before reaching it, so a broken run can't leave
 * a stray account behind on a shared environment.
 *
 * Deliberately one test rather than several: every signup burns a code, and a
 * used code can't be revoked (the app refuses, since it's the record of which
 * account the code created). Splitting this up would leave more of that residue
 * behind on every run for no extra coverage.
 *
 * Tagged @admin because it depends on ADMIN_EMAIL/ADMIN_PASSWORD, and skips
 * rather than fails when they're unset.
 */
test.describe("Signup @admin", () => {
  // Unique per run so repeated runs never collide on the unique email/username.
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const newUser = {
    email: `signup.${suffix}@example.com`,
    username: `signup_${suffix}`,
    password: "SignupSpec123!",
    displayName: "Signup Spec",
  };

  let createdUserId: string | undefined;

  test.afterEach(async ({ adminRequest }) => {
    // Only fires if the test didn't get as far as deleting the account itself.
    if (!createdUserId) return;

    const res = await adminRequest.delete(`/api/admin/users/${createdUserId}`);
    expect(
      [200, 204, 404],
      `Cleanup failed — user ${createdUserId} may still exist on the target environment. Status ${res.status()}`
    ).toContain(res.status());
  });

  test("an admin-minted code creates one account, which the admin can then delete", async ({
    adminRequest,
    apiRequest,
  }) => {
    // --- signup is closed without a code -------------------------------------
    const noCode = await apiRequest.post("/api/signup", { data: newUser });
    expect(noCode.status()).toBe(403);
    expect((await noCode.json()).message).toContain("hirehackett@gmail.com");

    // --- an admin mints one --------------------------------------------------
    const codeRes = await adminRequest.post("/api/admin/access-codes", {
      data: { note: `signup spec ${suffix}` },
    });
    expect(codeRes.status()).toBe(201);
    const { code } = await codeRes.json();
    expect(typeof code).toBe("string");

    // --- which lets exactly one account through ------------------------------
    const signupRes = await apiRequest.post("/api/signup", {
      data: { ...newUser, accessCode: code },
    });
    expect(signupRes.status(), await signupRes.text()).toBe(201);

    const created = await signupRes.json();
    createdUserId = created.id;

    expect(created.email).toBe(newUser.email);
    expect(created.username).toBe(newUser.username);
    expect(created.displayName).toBe(newUser.displayName);
    expect(created).not.toHaveProperty("passwordHash");

    // --- the code is spent ---------------------------------------------------
    const reuse = await apiRequest.post("/api/signup", {
      data: {
        ...newUser,
        email: `reuse.${suffix}@example.com`,
        username: `reuse_${suffix}`,
        accessCode: code,
      },
    });
    expect(reuse.status()).toBe(403);

    // --- and the account it made really works --------------------------------
    const login = await apiRequest.post("/api/auth/login", {
      data: { identifier: newUser.username, password: newUser.password },
    });
    expect(login.status()).toBe(201);
    expect((await login.json()).user.username).toBe(newUser.username);

    const profile = await apiRequest.get(`/api/users/by-username/${newUser.username}`);
    expect(profile.status()).toBe(200);
    expect((await profile.json()).displayName).toBe(newUser.displayName);

    // --- the admin removes it, and it's really gone --------------------------
    const deleted = await adminRequest.delete(`/api/admin/users/${createdUserId}`);
    expect([200, 204]).toContain(deleted.status());
    createdUserId = undefined;

    const afterDelete = await apiRequest.get(`/api/users/by-username/${newUser.username}`);
    expect(afterDelete.status()).toBe(404);
  });
});
