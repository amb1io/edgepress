import { drizzle } from "drizzle-orm/libsql";
import { describe, it, expect, beforeAll } from "vitest";
import { postTypes, posts, taxonomies, postsTaxonomies } from "../schema.ts";
import { defaultMetaSchema } from "../schema.ts";
import { createTestDb } from "./setup.ts";

describe("posts_taxonomies", () => {
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
    await db.insert(posts).values({
      post_type_id: 1,
      title: "Test Post",
      slug: "test-post",
      status: "draft",
      created_at: now,
      updated_at: now,
    });
    await db.insert(taxonomies).values({
      name: "Technology",
      slug: "technology",
      type: "category",
    });
  });

  it("should insert and select post-taxonomy relation", async () => {
    await db.insert(postsTaxonomies).values({
      post_id: 1,
      term_id: 1,
    });

    const result = await db.select().from(postsTaxonomies);
    expect(result).toHaveLength(1);
    expect(result[0]?.post_id).toBe(1);
    expect(result[0]?.term_id).toBe(1);
  });
});
