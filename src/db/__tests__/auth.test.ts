import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { describe, it, expect, beforeAll } from "vitest";
import { user, session, account, verification } from "../schema.ts";
import { createTestDb } from "./setup.ts";

describe("auth (Better Auth)", () => {
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const { db: testDb } = await createTestDb();
    db = testDb;
  });

  it("should insert and select a user", async () => {
    const now = Date.now();
    const [inserted] = await db
      .insert(user)
      .values({
        id: "user-1",
        name: "John Doe",
        email: "john@example.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toBe("user-1");
    expect(inserted?.name).toBe("John Doe");
    expect(inserted?.email).toBe("john@example.com");
    expect(inserted?.emailVerified).toBe(false);

    const [selected] = await db
      .select()
      .from(user)
      .where(eq(user.email, "john@example.com"));

    expect(selected?.id).toBe("user-1");
    expect(selected?.name).toBe("John Doe");
  });

  it("should insert and select a user with email verified and image", async () => {
    const now = Date.now();
    const [inserted] = await db
      .insert(user)
      .values({
        id: "user-2",
        name: "Jane Smith",
        email: "jane@example.com",
        emailVerified: true,
        image: "https://example.com/avatar.png",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.emailVerified).toBe(true);
    expect(inserted?.image).toBe("https://example.com/avatar.png");
  });

  it("should insert and select a session", async () => {
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days
    const [inserted] = await db
      .insert(session)
      .values({
        id: "session-1",
        userId: "user-1",
        token: "session-token-abc123",
        expiresAt,
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toBe("session-1");
    expect(inserted?.userId).toBe("user-1");
    expect(inserted?.token).toBe("session-token-abc123");
    expect(inserted?.ipAddress).toBe("127.0.0.1");

    const [selected] = await db
      .select()
      .from(session)
      .where(eq(session.token, "session-token-abc123"));

    expect(selected?.userId).toBe("user-1");
  });

  it("should insert and select an account (credential provider)", async () => {
    const now = Date.now();
    const [inserted] = await db
      .insert(account)
      .values({
        id: "account-1",
        userId: "user-1",
        accountId: "user-1",
        providerId: "credential",
        password: "hashed-password",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toBe("account-1");
    expect(inserted?.userId).toBe("user-1");
    expect(inserted?.providerId).toBe("credential");
    expect(inserted?.accountId).toBe("user-1");
  });

  it("should insert and select an account (OAuth provider)", async () => {
    const now = Date.now();
    const [inserted] = await db
      .insert(account)
      .values({
        id: "account-2",
        userId: "user-2",
        accountId: "oauth-123",
        providerId: "google",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.providerId).toBe("google");
    expect(inserted?.accessToken).toBe("access-token");
  });

  it("should insert and select a verification token", async () => {
    const now = Date.now();
    const expiresAt = now + 60 * 60 * 1000; // 1 hour
    const [inserted] = await db
      .insert(verification)
      .values({
        id: "verification-1",
        identifier: "john@example.com",
        value: "verification-code-xyz",
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toBe("verification-1");
    expect(inserted?.identifier).toBe("john@example.com");
    expect(inserted?.value).toBe("verification-code-xyz");

    const [selected] = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, "john@example.com"));

    expect(selected?.value).toBe("verification-code-xyz");
  });
});
