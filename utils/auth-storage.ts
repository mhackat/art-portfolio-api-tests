import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = join(__dirname, "..", ".auth", "api-automation.json");

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

export const AUTH_FILE_PATH = AUTH_FILE;
