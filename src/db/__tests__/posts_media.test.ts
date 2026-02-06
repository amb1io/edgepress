import { drizzle } from "drizzle-orm/libsql";
import { describe, it, expect, beforeAll } from "vitest";
import { postTypes, posts, postsMedia } from "../schema.ts";
import { defaultMetaSchema } from "../schema.ts";
import { createTestDb } from "./setup.ts";

describe("posts_media", () => {
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const { db: testDb } = await createTestDb();
    db = testDb;
    const now = Date.now();
    await db.insert(postTypes).values({
      slug: "post",
      name: "Post",
      meta_schema: defaultMetaSchema,
      created_at: now,
    });
    await db.insert(postTypes).values({
      slug: "attachment",
      name: "Attachment",
      meta_schema: [{ key: "mime_type", type: "string" }],
      created_at: now,
    });
    await db.insert(posts).values({
      post_type_id: 1,
      title: "Post with media",
      slug: "post-with-media",
      status: "published",
      created_at: now,
      updated_at: now,
    });
    await db.insert(posts).values({
      post_type_id: 2,
      title: "Attachment file",
      slug: "attachment-file",
      status: "published",
      created_at: now,
      updated_at: now,
    });
  });

  it("should insert and select post-media relation", async () => {
    await db.insert(postsMedia).values({
      post_id: 1,
      media_id: 2,
    });

    const result = await db.select().from(postsMedia);
    expect(result).toHaveLength(1);
    expect(result[0]?.post_id).toBe(1);
    expect(result[0]?.media_id).toBe(2);
  });
});
