import { test, expect } from "../../fixtures/api-fixtures";
import { generateUniqueUser } from "../../utils/test-data";

test.describe("POST /api/signup", () => {
  test("creates a new account and returns it without the password", async ({ apiRequest }) => {
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
  });

  test("rejects a duplicate username", async ({ apiRequest }) => {
    const candidate = generateUniqueUser();
    const first = await apiRequest.post("/api/signup", { data: candidate });
    expect(first.status()).toBe(201);

    const dupeUsername = { ...generateUniqueUser(), username: candidate.username };
    const second = await apiRequest.post("/api/signup", { data: dupeUsername });
    expect(second.status()).toBe(409);
  });

  test("rejects a duplicate email", async ({ apiRequest }) => {
    const candidate = generateUniqueUser();
    const first = await apiRequest.post("/api/signup", { data: candidate });
    expect(first.status()).toBe(201);

    const dupeEmail = { ...generateUniqueUser(), email: candidate.email };
    const second = await apiRequest.post("/api/signup", { data: dupeEmail });
    expect(second.status()).toBe(409);
  });

  test("rejects a password shorter than 8 characters", async ({ apiRequest }) => {
    const candidate = { ...generateUniqueUser(), password: "short1" };
    const res = await apiRequest.post("/api/signup", { data: candidate });
    expect(res.status()).toBe(400);
  });

  test("rejects a username with invalid characters", async ({ apiRequest }) => {
    const candidate = { ...generateUniqueUser(), username: "has a space" };
    const res = await apiRequest.post("/api/signup", { data: candidate });
    expect(res.status()).toBe(400);
  });

  test("rejects a malformed email", async ({ apiRequest }) => {
    const candidate = { ...generateUniqueUser(), email: "not-an-email" };
    const res = await apiRequest.post("/api/signup", { data: candidate });
    expect(res.status()).toBe(400);
  });

  test("rejects a missing displayName", async ({ apiRequest }) => {
    const { displayName, ...rest } = generateUniqueUser();
    const res = await apiRequest.post("/api/signup", { data: rest });
    expect(res.status()).toBe(400);
  });

  test("rejects a body that isn't valid JSON", async ({ apiRequest }) => {
    const res = await apiRequest.post("/api/signup", {
      headers: { "Content-Type": "application/json" },
      data: "not json",
    });
    expect(res.status()).toBe(400);
  });
});
