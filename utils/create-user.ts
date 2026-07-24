import type { APIRequestContext } from "@playwright/test";
import { generateUniqueUser } from "./test-data";

export type TestUser = {
  token: string;
  userId: string;
  username: string;
  email: string;
  password: string;
  displayName: string;
};

/**
 * Signs up + logs in a fresh, uniquely-named user for tests that need a
 * *second* identity — e.g. proving user A can't edit user B's bio. Kept
 * separate from the suite-wide API_AUTOMATION account (captured once in
 * global setup) so these throwaway users don't collide with it or with
 * each other across parallel workers.
 */
export async function createTestUser(request: APIRequestContext, prefix = "apiauto_other"): Promise<TestUser> {
  const candidate = generateUniqueUser(prefix);

  const signupRes = await request.post("/api/signup", { data: candidate });
  if (signupRes.status() !== 201) {
    throw new Error(`Failed to create test user: ${signupRes.status()} ${await signupRes.text()}`);
  }

  const loginRes = await request.post("/api/auth/login", {
    data: { identifier: candidate.username, password: candidate.password },
  });
  if (loginRes.status() !== 201) {
    throw new Error(`Failed to log in test user: ${loginRes.status()} ${await loginRes.text()}`);
  }
  const body = await loginRes.json();

  return {
    token: body.token,
    userId: body.user.id,
    username: body.user.username,
    email: candidate.email,
    password: candidate.password,
    displayName: candidate.displayName,
  };
}
