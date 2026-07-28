import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Creates a disposable account, and gives the caller everything needed to act
 * as it or clean it up.
 *
 * This is what makes the destructive admin surface testable at all. Locking an
 * account, resetting its password or emptying its gallery can't be pointed at
 * API_AUTOMATION — that account is shared by the whole run, so any of those
 * would sabotage every test after it. A user that exists only for one spec can
 * absorb all of it.
 *
 * Each one costs a single-use access code, and a *used* code can't be revoked
 * (the app refuses — that row records which account the code created). So specs
 * share one throwaway across their whole file rather than making one per test,
 * to keep that residue down on a shared environment.
 */

export type ThrowawayUser = {
  id: string;
  username: string;
  email: string;
  password: string;
  displayName: string;
  /** Bearer token for acting *as* this user. */
  token: string;
};

export const THROWAWAY_PASSWORD = "Throwaway123!";

export async function createThrowawayUser(
  adminRequest: APIRequestContext,
  apiRequest: APIRequestContext,
  label: string
): Promise<ThrowawayUser> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `tmp_${label}_${suffix}`.slice(0, 30);
  const email = `tmp.${label}.${suffix}@example.com`;
  const displayName = `Throwaway ${label}`;

  const codeRes = await adminRequest.post("/api/admin/access-codes", {
    data: { note: `throwaway ${label} ${suffix}` },
  });
  expect(codeRes.status(), `Could not mint an access code: ${await codeRes.text()}`).toBe(201);
  const { code } = await codeRes.json();

  const signupRes = await apiRequest.post("/api/signup", {
    data: { email, username, password: THROWAWAY_PASSWORD, displayName, accessCode: code },
  });
  expect(signupRes.status(), `Throwaway signup failed: ${await signupRes.text()}`).toBe(201);
  const { id } = await signupRes.json();

  const loginRes = await apiRequest.post("/api/auth/login", {
    data: { identifier: username, password: THROWAWAY_PASSWORD },
  });
  expect(loginRes.status(), `Throwaway login failed: ${await loginRes.text()}`).toBe(201);
  const { token } = await loginRes.json();

  return { id, username, email, password: THROWAWAY_PASSWORD, displayName, token };
}

/** Idempotent: a 404 means an earlier step already removed it. */
export async function deleteThrowawayUser(
  adminRequest: APIRequestContext,
  userId: string | undefined
): Promise<void> {
  if (!userId) return;

  const res = await adminRequest.delete(`/api/admin/users/${userId}`);
  expect(
    [200, 204, 404],
    `Cleanup failed — throwaway ${userId} may still exist on the target environment. Status ${res.status()}`
  ).toContain(res.status());
}
