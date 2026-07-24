/** Generates a unique, valid (letters/numbers/_/- only, <=30 chars) username/email
 * pair for signup tests, so repeated runs never collide on a 409. */
export function generateUniqueUser(prefix = "apiauto") {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const username = `${prefix}_${suffix}`.slice(0, 30);
  return {
    username,
    email: `${username}@example.com`,
    password: "TestPassword123!",
    displayName: `API Test ${suffix}`,
  };
}
