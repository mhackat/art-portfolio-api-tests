import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = join(__dirname, "..", ".auth", "api-automation.json");
const ADMIN_AUTH_FILE = join(__dirname, "..", ".auth", "admin.json");

export type StoredAuth = {
  token: string;
  userId: string;
  username: string;
};

export function saveAuth(auth: StoredAuth): void {
  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2));
}

export function loadAuth(): StoredAuth {
  if (!existsSync(AUTH_FILE)) {
    throw new Error(
      `No captured auth found at ${AUTH_FILE}. The "setup" project must run before any test that needs authentication.`
    );
  }
  return JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
}

export function authFileExists(): boolean {
  return existsSync(AUTH_FILE);
}

/**
 * The admin session is captured once in setup and shared for the whole run, for
 * the same reason as the automation account: the app rate-limits logins per
 * identifier, and logging in per worker (let alone per test) puts a local run —
 * where Playwright scales workers to the CPU — straight into 429 territory.
 */
export function saveAdminAuth(auth: StoredAuth): void {
  mkdirSync(dirname(ADMIN_AUTH_FILE), { recursive: true });
  writeFileSync(ADMIN_AUTH_FILE, JSON.stringify(auth, null, 2));
}

export function loadAdminAuth(): StoredAuth {
  if (!existsSync(ADMIN_AUTH_FILE)) {
    throw new Error(
      `No captured admin auth found at ${ADMIN_AUTH_FILE}. The "setup" project must run first, and ADMIN_EMAIL/ADMIN_PASSWORD must be set.`
    );
  }
  return JSON.parse(readFileSync(ADMIN_AUTH_FILE, "utf-8"));
}

export function adminAuthFileExists(): boolean {
  return existsSync(ADMIN_AUTH_FILE);
}

export const AUTH_FILE_PATH = AUTH_FILE;
export const ADMIN_AUTH_FILE_PATH = ADMIN_AUTH_FILE;
