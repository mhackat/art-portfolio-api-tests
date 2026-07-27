import { request } from "@playwright/test";
import { test, expect } from "../../fixtures/api-fixtures";
import { env } from "../../config/env";
import { loadAdminAuth } from "../../utils/auth-storage";
import {
  createThrowawayUser,
  deleteThrowawayUser,
  THROWAWAY_PASSWORD,
  type ThrowawayUser,
} from "../../utils/throwaway-user";

/**
 * The admin controls that act *on* an account: locking, unlocking, forcing a
 * password, and issuing a reset link. Security-critical and, until there was a
 * disposable account to point them at, untestable — none of this can be aimed
 * at the shared API_AUTOMATION user without wrecking the rest of the run.
 *
 * Serial, sharing one throwaway account for the whole file. Each account costs
 * a single-use code that can never be reclaimed, so one per file rather than
 * one per test. Serial also matters on its own terms: these steps are a
 * sequence — an account has to be locked before unlocking it means anything.
 */
test.describe.configure({ mode: "serial" });

test.describe("Admin account controls @admin", () => {
  let user: ThrowawayUser;

  test("creates a throwaway account to operate on", async ({ adminRequest, apiRequest }) => {
    user = await createThrowawayUser(adminRequest, apiRequest, "lifecycle");
    expect(user.id).toBeTruthy();
  });

  // afterAll can't take test-scoped fixtures, so it builds its own admin
  // context. Runs even if a test above failed, so a broken run still can't
  // strand the account on a shared environment.
  test.afterAll(async () => {
    if (!user?.id || !env.admin.isConfigured) return;

    const context = await request.newContext({
      baseURL: env.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${loadAdminAuth().token}` },
    });
    await deleteThrowawayUser(context, user.id);
    await context.dispose();
  });

  test("an admin can force a new password, and the old one stops working", async ({
    adminRequest,
    apiRequest,
  }) => {
    const forced = "ForcedByAdmin123!";

    const res = await adminRequest.post(`/api/admin/users/${user.id}/set-password`, {
      data: { password: forced },
    });
    expect([200, 204]).toContain(res.status());

    const withOld = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: THROWAWAY_PASSWORD },
    });
    expect(withOld.status(), "the password the admin replaced should no longer work").toBe(401);

    const withNew = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: forced },
    });
    expect(withNew.status()).toBe(201);

    user.password = forced;
    user.token = (await withNew.json()).token;
  });

  test("locking an account stops it authenticating and lists it as locked", async ({
    adminRequest,
    apiRequest,
    contextAs,
  }) => {
    // Prove the account's existing token works before the lock, so the check
    // afterwards is measuring the lock rather than a token that was never valid.
    const asUser = await contextAs(user.token, "throwaway");
    expect((await asUser.get("/api/api-keys")).status()).toBe(200);

    const lock = await adminRequest.post(`/api/admin/users/${user.id}/lock`);
    expect([200, 204]).toContain(lock.status());

    const locked = await adminRequest.get("/api/admin/users/locked");
    expect(locked.status()).toBe(200);
    const lockedBody = await locked.json();
    const lockedUsers = lockedBody.users ?? lockedBody;
    expect(
      lockedUsers.some((u: { id: string }) => u.id === user.id),
      "the account just locked should appear in the locked list"
    ).toBe(true);

    const login = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: user.password },
    });
    expect(login.status(), "a locked account should not be able to log in").not.toBe(201);

    // Locking revokes the account's API keys, so its captured session should
    // stop working too — a lock that only blocked future logins would leave an
    // already-authenticated attacker in place.
    expect((await asUser.get("/api/api-keys")).status()).toBe(401);
  });

  test("unlocking restores access", async ({ adminRequest, apiRequest }) => {
    const unlock = await adminRequest.post(`/api/admin/users/${user.id}/unlock`);
    expect([200, 204]).toContain(unlock.status());

    const locked = await adminRequest.get("/api/admin/users/locked");
    const lockedBody = await locked.json();
    const lockedUsers = lockedBody.users ?? lockedBody;
    expect(lockedUsers.some((u: { id: string }) => u.id === user.id)).toBe(false);

    const login = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: user.password },
    });
    expect(login.status()).toBe(201);
    user.token = (await login.json()).token;
  });

  test("a reset link lets the user set a new password, and is single-use", async ({
    adminRequest,
    apiRequest,
  }) => {
    const linkRes = await adminRequest.post(`/api/admin/users/${user.id}/reset-link`);
    expect(linkRes.status()).toBe(200);

    const { token: resetToken } = await linkRes.json();
    expect(typeof resetToken).toBe("string");

    const reset = "AfterReset123!";
    const used = await apiRequest.post("/api/reset-password", {
      data: { token: resetToken, password: reset },
    });
    expect([200, 204]).toContain(used.status());

    const login = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: reset },
    });
    expect(login.status()).toBe(201);
    user.password = reset;
    user.token = (await login.json()).token;

    // The whole point of a single-use token: replaying it must not let someone
    // who intercepted the link take the account over later.
    const replay = await apiRequest.post("/api/reset-password", {
      data: { token: resetToken, password: "ReplayAttempt123!" },
    });
    expect(replay.status(), "a consumed reset token should be refused").not.toBe(200);

    const stillWorks = await apiRequest.post("/api/auth/login", {
      data: { identifier: user.username, password: reset },
    });
    expect(stillWorks.status(), "the replay must not have changed the password").toBe(201);
  });

  test("a made-up reset token is refused", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/reset-password", {
      data: { token: "prt_not-a-real-token", password: "Whatever123!" },
    });
    expect(res.status()).not.toBe(200);
  });

  test("issuing a new reset link invalidates the previous one", async ({ adminRequest, apiRequest }) => {
    const first = await adminRequest.post(`/api/admin/users/${user.id}/reset-link`);
    expect(first.status()).toBe(200);
    const firstToken = (await first.json()).token;

    const second = await adminRequest.post(`/api/admin/users/${user.id}/reset-link`);
    expect(second.status()).toBe(200);
    const secondToken = (await second.json()).token;
    expect(secondToken).not.toBe(firstToken);

    const stale = await apiRequest.post("/api/reset-password", {
      data: { token: firstToken, password: "FromStaleLink123!" },
    });
    expect(stale.status(), "only the newest outstanding link should work").not.toBe(200);

    const current = await apiRequest.post("/api/reset-password", {
      data: { token: secondToken, password: "FromCurrentLink123!" },
    });
    expect([200, 204]).toContain(current.status());
    user.password = "FromCurrentLink123!";
  });

  test("these controls reject a non-admin", async ({ authedRequest }) => {
    expect((await authedRequest.post(`/api/admin/users/${user.id}/lock`)).status()).toBe(403);
    expect((await authedRequest.post(`/api/admin/users/${user.id}/unlock`)).status()).toBe(403);
    expect((await authedRequest.post(`/api/admin/users/${user.id}/reset-link`)).status()).toBe(403);
    expect((await authedRequest.get("/api/admin/users/locked")).status()).toBe(403);
  });
});
