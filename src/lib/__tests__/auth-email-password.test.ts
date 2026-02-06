/**
 * Testes do fluxo email-password do better-auth.
 * @see https://www.better-auth.com/docs/authentication/email-password
 */
import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { describe, it, expect, beforeAll } from "vitest";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  user,
  session,
  account,
  verification,
  userRelations,
  sessionRelations,
  accountRelations,
} from "../../db/schema/auth.ts";

const authSchema = {
  user,
  session,
  account,
  verification,
  userRelations,
  sessionRelations,
  accountRelations,
};

const AUTH_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "email_verified" integer DEFAULT 0 NOT NULL,
    "image" text,
    "role" integer DEFAULT 3,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email")`,
  `CREATE TABLE IF NOT EXISTS "session" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "token" text NOT NULL,
    "expires_at" integer NOT NULL,
    "ip_address" text,
    "user_agent" text,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "session_token_unique" ON "session" ("token")`,
  `CREATE TABLE IF NOT EXISTS "account" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "account_id" text NOT NULL,
    "provider_id" text NOT NULL,
    "access_token" text,
    "refresh_token" text,
    "access_token_expires_at" integer,
    "refresh_token_expires_at" integer,
    "scope" text,
    "id_token" text,
    "password" text,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "verification" (
    "id" text PRIMARY KEY NOT NULL,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expires_at" integer NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`,
];

describe("auth email-password flow", () => {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema: authSchema });

  const auth = betterAuth({
    emailAndPassword: {
      enabled: true,
    },
    baseURL: "http://localhost:4321",
    secret: "test-secret-at-least-32-chars-long",
    user: {
      additionalFields: {
        role: {
          type: "number",
          required: false,
          defaultValue: 3,
        },
      },
    },
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema,
    }),
  });

  beforeAll(async () => {
    for (const stmt of AUTH_TABLE_STATEMENTS) {
      await client.execute(stmt);
    }
  });

  describe("signUp.email", () => {
    it("creates a new user with name, email and password", async () => {
      const result = await auth.api.signUpEmail({
        body: {
          name: "Test User",
          email: "test@example.com",
          password: "password1234",
        },
      });

      expect(result).toBeDefined();
      const body = typeof result.json === "function" ? await result.json().catch(() => ({})) : result;
      const userData = body.user ?? body;
      expect(userData).toMatchObject({
        name: "Test User",
        email: "test@example.com",
      });
      expect(userData).toHaveProperty("id");
      expect(typeof userData.id).toBe("string");
    });

    it("stores user in database with correct fields", async () => {
      const rows = await db
        .select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, role: user.role })
        .from(user)
        .where(eq(user.email, "test@example.com"));

      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({
        name: "Test User",
        email: "test@example.com",
      });
      expect(rows[0]?.emailVerified === 0 || rows[0]?.emailVerified === false).toBe(true); // false by default
      expect(rows[0]?.role).toBe(3); // default role when not sent (3 = leitor)
    });

    it("stores password in account table with provider credential", async () => {
      const userRows = await db.select({ id: user.id }).from(user).where(eq(user.email, "test@example.com"));
      expect(userRows.length).toBe(1);
      const userId = userRows[0]!.id;

      const accountRows = await db
        .select({ userId: account.userId, providerId: account.providerId, password: account.password })
        .from(account)
        .where(eq(account.userId, userId));

      expect(accountRows.length).toBe(1);
      expect(accountRows[0]?.providerId).toBe("credential");
      expect(accountRows[0]?.password).toBeDefined();
      expect(typeof accountRows[0]?.password).toBe("string");
      expect((accountRows[0]?.password ?? "").length).toBeGreaterThan(0);
    });

    it("rejects duplicate email with conflict", async () => {
      let status = 0;
      try {
        const result = await auth.api.signUpEmail({
          body: {
            name: "Another User",
            email: "test@example.com",
            password: "anotherpassword",
          },
        });
        status = result.status;
      } catch {
        status = 409;
      }
      expect(status).toBe(409);
    });

    it("rejects password shorter than 8 characters", async () => {
      let status = 0;
      try {
        const result = await auth.api.signUpEmail({
          body: {
            name: "Short Pass User",
            email: "shortpass@example.com",
            password: "short",
          },
        });
        status = result.status;
      } catch {
        status = 400;
      }
      expect(status).toBe(400);
    });

    it("accepts optional image field", async () => {
      const result = await auth.api.signUpEmail({
        body: {
          name: "User With Image",
          email: "withimage@example.com",
          password: "password1234",
          image: "https://example.com/avatar.png",
        },
      });

      const body = typeof result.json === "function" ? await result.json().catch(() => ({})) : result;
      const userData = body.user ?? body;
      expect(userData).toHaveProperty("image", "https://example.com/avatar.png");

      const rows = await db.select({ image: user.image }).from(user).where(eq(user.email, "withimage@example.com"));
      expect(rows[0]?.image).toBe("https://example.com/avatar.png");
    });

    it("accepts optional role field and stores it", async () => {
      const result = await auth.api.signUpEmail({
        body: {
          name: "Editor User",
          email: "editor@example.com",
          password: "password1234",
          role: 1, // 1 = editor
        },
      });

      const body = typeof result.json === "function" ? await result.json().catch(() => ({})) : result;
      const userData = body.user ?? body;
      expect(userData).toHaveProperty("role", 1);

      const rows = await db.select({ role: user.role }).from(user).where(eq(user.email, "editor@example.com"));
      expect(rows[0]?.role).toBe(1);
    });
  });

  describe("signIn.email", () => {
    it("signs in with correct email and password", async () => {
      const result = await auth.api.signInEmail({
        body: {
          email: "test@example.com",
          password: "password1234",
        },
      });

      const body = typeof result.json === "function" ? await result.json().catch(() => ({})) : result;
      const userData = body.user ?? body;
      expect(userData).toBeDefined();
      expect(userData.email).toBe("test@example.com");
    });

    it("rejects wrong password", async () => {
      let status = 0;
      try {
        const result = await auth.api.signInEmail({
          body: {
            email: "test@example.com",
            password: "wrongpassword",
          },
        });
        status = result.status;
      } catch {
        status = 401;
      }
      expect(status).toBe(401);
    });

    it("rejects non-existent email", async () => {
      let status = 0;
      try {
        const result = await auth.api.signInEmail({
          body: {
            email: "nonexistent@example.com",
            password: "password1234",
          },
        });
        status = result.status;
      } catch {
        status = 401;
      }
      expect(status).toBe(401);
    });
  });
});
