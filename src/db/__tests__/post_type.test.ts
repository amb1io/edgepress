import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { describe, it, expect, beforeAll } from "vitest";
import { postTypes, defaultMetaSchema } from "../schema.ts";
import { createTestDb } from "./setup.ts";

describe("post_types", () => {
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const { db: testDb } = await createTestDb();
    db = testDb;
  });

  it("should insert and select a post type with default meta_schema", async () => {
    const now = Date.now();
    const [inserted] = await db
      .insert(postTypes)
      .values({
        slug: "post",
        name: "Post",
        meta_schema: defaultMetaSchema,
        created_at: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toBe(1);
    expect(inserted?.slug).toBe("post");
    expect(inserted?.name).toBe("Post");
    expect(inserted?.meta_schema).toEqual(defaultMetaSchema);

    const [selected] = await db
      .select()
      .from(postTypes)
      .where(eq(postTypes.slug, "post"));

    expect(selected).toEqual(inserted);
  });

  it("should insert and select a post type of attachment with custom meta_schema", async () => {
    const attachmentMetaSchema = [{ key: "mime_type", type: "string" }];
    const now = Date.now();
    const [inserted] = await db
      .insert(postTypes)
      .values({
        slug: "custom-attachment",
        name: "Attachment Custom",
        meta_schema: attachmentMetaSchema,
        created_at: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.slug).toBe("custom-attachment");
    expect(inserted?.name).toBe("Attachment Custom");
    expect(inserted?.meta_schema).toEqual(attachmentMetaSchema);

    const [selected] = await db
      .select()
      .from(postTypes)
      .where(eq(postTypes.slug, "custom-attachment"));

    expect(selected?.meta_schema).toEqual(attachmentMetaSchema);
  });

  it("should insert and select a post type of attachment with full meta_schema", async () => {
    const attachmentFullMetaSchema = [
      { key: "mime_type", type: "string" },
      { key: "attachment_file", type: "string" },
      { key: "attachment_width", type: "int" },
      { key: "attachment_height", type: "int" },
      { key: "attachment_path", type: "string" },
      { key: "attachment_alt", type: "string" },
    ];
    const now = Date.now();
    const [inserted] = await db
      .insert(postTypes)
      .values({
        slug: "attachment",
        name: "Attachment",
        meta_schema: attachmentFullMetaSchema,
        created_at: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.slug).toBe("attachment");
    expect(inserted?.name).toBe("Attachment");
    expect(inserted?.meta_schema).toEqual(attachmentFullMetaSchema);

    const [selected] = await db
      .select()
      .from(postTypes)
      .where(eq(postTypes.slug, "attachment"));

    expect(selected?.meta_schema).toEqual(attachmentFullMetaSchema);
  });
});
