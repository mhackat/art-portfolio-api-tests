import { defineConfig } from "@playwright/test";
import { env } from "./config/env";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Auth-dependent specs share one captured token; running many in parallel
  // is fine since it's read-only after setup, but keep worker count modest
  // to avoid hammering rate limits when pointed at a shared environment.
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: env.baseURL,
    extraHTTPHeaders: { Accept: "application/json" },
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /tests\/setup\/global\.setup\.ts/,
    },
    {
      name: "teardown",
      testMatch: /tests\/setup\/global\.teardown\.ts/,
    },
    {
      name: "api",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /tests\/setup\/.*/,
      dependencies: ["setup"],
      teardown: "teardown",
    },
  ],
});
