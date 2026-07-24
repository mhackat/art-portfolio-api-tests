import { test, expect } from "../../fixtures/api-fixtures";
import { generateUniqueUser } from "../../utils/test-data";

// The only test in the whole suite that exercises the actual signup flow
// (creates a real account). Every other test authenticates as the existing
// API_AUTOMATION user captured once in global setup — see fixtures/api-fixtures.ts.
// Signup is rate-limited per IP, so we keep this to a single test with two
// requests: one that creates the account, and one that reuses the same
// details to prove the uniqueness check works, rather than a separate test
// (and separate signup call) per validation case.
test.describe("POST /api/signup", () => {
  test("creates a new account, returned without the password, and rejects a duplicate", async ({ apiRequest }) => {
    const candidate = generateUniqueUser();

    const res = await apiRequest.post("/api/signup", { data: candidate });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      username: candidate.username,
      email: candidate.email,
      displayName: candidate.displayName,
    });
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("passwordHash");

    const dupe = await apiRequest.post("/api/signup", { data: candidate });
    expect(dupe.status()).toBe(409);
  });
});
