import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDatabase, getDb } from "@/lib/db";
import { organizationMembers, organizations, sessions, users } from "@/lib/db/schema";
import { authenticate, registerAccount } from "@/lib/auth/auth-service";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { useTestDatabase } from "./helpers/fixtures";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: () => undefined,
    delete: () => undefined,
    get: () => undefined,
  }),
  headers: async () => new Headers({ "user-agent": "Vitest browser" }),
}));

describe("authentication service", () => {
  beforeAll(async () => {
    await useTestDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("hashes passwords with scrypt and verifies them without storing plaintext", async () => {
    const hash = await hashPassword("CorrectHorse!2026");
    expect(hash).not.toContain("CorrectHorse!2026");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("CorrectHorse!2026", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("registers an administrator, organization, membership, and session", async () => {
    const result = await registerAccount({
      name: "Test Administrator",
      email: "  Admin@Test.Example ",
      password: "Register!2026",
      organizationName: "Test Register Co",
      ip: "127.0.0.1",
      userAgent: "Vitest",
    });
    const db = await getDb();
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, result.userId));
    expect(userRows[0]?.email).toBe("admin@test.example");
    const orgRows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, result.organizationId));
    expect(orgRows[0]?.name).toBe("Test Register Co");
    const memberRows = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, result.userId));
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0]?.role).toBe("ADMIN");
    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, result.userId));
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]?.activeOrganizationId).toBe(result.organizationId);
  });

  it("rejects duplicate registration regardless of email casing", async () => {
    await expect(
      registerAccount({
        name: "Duplicate",
        email: "ADMIN@TEST.EXAMPLE",
        password: "Register!2026",
        organizationName: "Duplicate Co",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("authenticates valid credentials and rejects an invalid password", async () => {
    const valid = await authenticate({
      email: "admin@test.example",
      password: "Register!2026",
    });
    expect(valid.userId).toBeTruthy();
    expect(valid.organizationId).toBeTruthy();
    await expect(
      authenticate({ email: "admin@test.example", password: "not-the-password" }),
    ).rejects.toThrow(/Invalid email or password/);
  });

  it("records failed login attempts and resets them after a successful sign-in", async () => {
    const db = await getDb();
    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.email, "admin@test.example"));
    await expect(
      authenticate({ email: "admin@test.example", password: "bad" }),
    ).rejects.toThrow();
    const failed = await db
      .select()
      .from(users)
      .where(eq(users.email, "admin@test.example"));
    expect(failed[0]?.failedLoginAttempts).toBe(1);
    await authenticate({ email: "admin@test.example", password: "Register!2026" });
    const reset = await db
      .select()
      .from(users)
      .where(eq(users.email, "admin@test.example"));
    expect(reset[0]?.failedLoginAttempts).toBe(0);
  });
});
