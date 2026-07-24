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
};
