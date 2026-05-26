import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { describe, it, expect, beforeAll } from "vitest";
import { user, settings, postTypes, posts } from "../../db/schema.ts";
import { getSourceKind, getRecordById } from "../content-source.ts";

describe("content-source", () => {
  let client: ReturnType<typeof createClient>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    db = drizzle(client, {
      schema: { user, settings, postTypes, posts },
    });
    await client.execute(
      "CREATE TABLE IF NOT EXISTS settings (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL, value text NOT NULL, autoload integer DEFAULT 1 NOT NULL)"
    );
    await client.execute(
      "CREATE TABLE IF NOT EXISTS user (id text PRIMARY KEY NOT NULL, name text NOT NULL, email text NOT NULL UNIQUE, email_verified integer DEFAULT 0 NOT NULL, image text, role integer DEFAULT 3, created_at integer NOT NULL, updated_at integer NOT NULL)"
    );
    await client.execute(
      "CREATE TABLE IF NOT EXISTS post_types (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, slug text NOT NULL, name text NOT NULL, meta_schema text, created_at integer, updated_at integer)"
    );
    await client.execute(
      "CREATE TABLE IF NOT EXISTS posts (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, post_type_id integer NOT NULL, author_id text, title text NOT NULL, slug text NOT NULL, excerpt text, body text, status text DEFAULT 'draft', meta_values text, published_at integer, created_at integer, updated_at integer)"
    );

    await db.insert(settings).values([
      { name: "site_name", value: "My Site", autoload: true },
      { name: "setup_done", value: "Y", autoload: true },
    ]);
    const now = Date.now();
    await db.insert(user).values({
      id: "user-1",
      name: "Admin",
      email: "admin@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(postTypes).values({
      slug: "post",
      name: "Post",
      meta_schema: "[]",
      created_at: now,
      updated_at: now,
    });
    await db.insert(posts).values({
      post_type_id: 1,
      title: "First Post",
      slug: "first-post",
      status: "published",
      created_at: now,
      updated_at: now,
    });
  });

  describe("getSourceKind", () => {
    it("returns 'table' when type matches a table name (settings)", async () => {
      const kind = await getSourceKind(db, "settings");
      expect(kind).toBe("table");
    });

    it("returns 'table' when type matches a table name (user)", async () => {
      const kind = await getSourceKind(db, "user");
      expect(kind).toBe("table");
    });

    it("returns 'posts' when type does not match a table name (post)", async () => {
      const kind = await getSourceKind(db, "post");
      expect(kind).toBe("posts");
    });

    it("returns 'posts' when type does not match a table name (page)", async () => {
      const kind = await getSourceKind(db, "page");
      expect(kind).toBe("posts");
    });
  });

  describe("getRecordById", () => {
    it("returns table record for type=settings and valid id", async () => {
      const result = await getRecordById(db, "settings", "1");
      expect(result.kind).toBe("table");
      expect(result.record).not.toBeNull();
      expect(result.record).toHaveProperty("name");
      expect(result.record).toHaveProperty("value");
      expect((result.record as Record<string, unknown>).name).toBe("site_name");
    });

    it("returns null for type=settings and non-existent id", async () => {
      const result = await getRecordById(db, "settings", "999");
      expect(result.kind).toBe("table");
      expect(result.record).toBeNull();
    });

    it("returns table record for type=user and valid id", async () => {
      const result = await getRecordById(db, "user", "user-1");
      expect(result.kind).toBe("table");
      expect(result.record).not.toBeNull();
      expect((result.record as Record<string, unknown>).email).toBe("admin@example.com");
    });

    it("returns null for type=user and non-existent id", async () => {
      const result = await getRecordById(db, "user", "no-such-id");
      expect(result.kind).toBe("table");
      expect(result.record).toBeNull();
    });

    it("returns posts record when type=post and id matches post of that type", async () => {
      const result = await getRecordById(db, "post", "1");
      expect(result.kind).toBe("posts");
      expect(result.record).not.toBeNull();
      expect((result.record as Record<string, unknown>).title).toBe("First Post");
      expect((result.record as Record<string, unknown>).slug).toBe("first-post");
    });

    it("returns null for type=post and non-existent post id", async () => {
      const result = await getRecordById(db, "post", "999");
      expect(result.kind).toBe("posts");
      expect(result.record).toBeNull();
    });

    it("returns null when id is null or empty for table", async () => {
      const r1 = await getRecordById(db, "settings", null);
      const r2 = await getRecordById(db, "settings", "");
      expect(r1.record).toBeNull();
      expect(r2.record).toBeNull();
    });

    it("returns null when id is invalid for posts (non-numeric)", async () => {
      const result = await getRecordById(db, "post", "abc");
      expect(result.kind).toBe("posts");
      expect(result.record).toBeNull();
    });
  });
});
