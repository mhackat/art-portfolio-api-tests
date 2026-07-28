import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { env } from "../config/env";
import { loadAuth, loadAdminAuth, type StoredAuth } from "../utils/auth-storage";
import { withResponseLogging } from "../utils/api-logging";

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
  /** Request context authenticated as the configured admin. Skips the test if
   * no admin credentials are set. */
  adminRequest: APIRequestContext;
  /** Builds a logged request context for an arbitrary bearer token — used to
   * act as a throwaway account the test just created. Contexts made this way
   * are disposed automatically when the test ends. */
  contextAs: (token: string, label: string) => Promise<APIRequestContext>;
};

export const test = base.extend<ApiFixtures>({
  apiRequest: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({ baseURL: env.baseURL });
    await use(withResponseLogging(context, "anon"));
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
    await use(withResponseLogging(context, "api-automation"));
    await context.dispose();
  },

  adminRequest: async ({ playwright }, use) => {
    test.skip(!env.admin.isConfigured, "ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin tests");

    // Reads the session the setup project captured, so no test logs in itself.
    const context = await playwright.request.newContext({
      baseURL: env.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${loadAdminAuth().token}` },
    });
    await use(withResponseLogging(context, "admin"));
    await context.dispose();
  },

  contextAs: async ({ playwright }, use) => {
    const created: APIRequestContext[] = [];

    await use(async (token: string, label: string) => {
      const context = await playwright.request.newContext({
        baseURL: env.baseURL,
        extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      });
      created.push(context);
      return withResponseLogging(context, label);
    });

    // Disposing the real contexts, not the proxies — the proxy forwards
    // everything else, but there's no reason to route teardown through it.
    for (const context of created) {
      await context.dispose();
    }
  },
});

export { expect };
