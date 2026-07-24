import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  baseURL: process.env.API_BASE_URL || "http://localhost:3000",

  automationUser: {
    get username() {
      return required("API_AUTOMATION_USERNAME");
    },
    get email() {
      return required("API_AUTOMATION_EMAIL");
    },
    get password() {
      return required("API_AUTOMATION_PASSWORD");
    },
    get displayName() {
      return process.env.API_AUTOMATION_DISPLAY_NAME || "API Automation";
    },
  },

  admin: {
    get email() {
      return process.env.ADMIN_EMAIL;
    },
    get password() {
      return process.env.ADMIN_PASSWORD;
    },
    get isConfigured() {
      return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
    },
  },

  // Optional. When set, sent as the `X-RateLimit-Bypass` header on most test
  // traffic so a full suite run doesn't trip the app's per-IP signup/login
  // abuse limits (a handful of attempts per 15 minutes — fine for real users,
  // far too strict for a suite that creates many accounts per run). Must
  // match RATE_LIMIT_BYPASS_TOKEN on the target app, and that var must never
  // be set on a Production/Preview deployment. If unset here, tests just run
  // unbypassed and may hit real rate limits on a fresh environment.
  rateLimitBypassToken: process.env.RATE_LIMIT_BYPASS_TOKEN,
};
