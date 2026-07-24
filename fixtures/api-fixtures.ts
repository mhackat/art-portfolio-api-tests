import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { env } from "../config/env";
import { loadAuth, type StoredAuth } from "../utils/auth-storage";

type ApiFixtures = {
  /** Unauthenticated request context, same baseURL as everything else. Use
   * this for public endpoints and for negative "no auth provided" cases. */
  apiRequest: APIRequestContext;
  /** Request context pre-authenticated as API_AUTOMATION via the token the
   * setup project captured. Use this for anything that needs a logged-in
   * session — reusing one token across the whole suite instead of logging
   * in per test keeps us well under the login rate limit. */
  authedRequest: APIRequestContext;
  /** The API_AUTOMATION user's own id/username, for building URLs and
   * asserting ownership without hardcoding them in every spec. */
  authedUser: StoredAuth;
};

export const test = base.extend<ApiFixtures>({
  apiRequest: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({ baseURL: env.baseURL });
    await use(context);
    await context.dispose();
  },

  authedUser: async ({}, use) => {
    await use(loadAuth());
  },

  authedRequest: async ({ playwright, authedUser }, use) => {
    const context = await playwright.request.newContext({
      baseURL: env.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${authedUser.token}` },
    });
    await use(context);
    await context.dispose();
  },
});

export { expect };
