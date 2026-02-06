import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { describe, it, expect, beforeAll } from "vitest";
import { postTypes, posts, defaultMetaSchema } from "../schema.ts";
import { createTestDb } from "./setup.ts";

describe("posts", () => {
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
      slug: "custom-attachment",
      name: "Attachment Custom",
      meta_schema: [{ key: "mime_type", type: "string" }],
      created_at: now,
    });
    await db.insert(postTypes).values({
      slug: "attachment",
      name: "Attachment",
      meta_schema: [
        { key: "mime_type", type: "string" },
        { key: "attachment_file", type: "string" },
        { key: "attachment_width", type: "int" },
        { key: "attachment_height", type: "int" },
        { key: "attachment_path", type: "string" },
        { key: "attachment_alt", type: "string" },
      ],
      created_at: now,
    });
  });

  it("should insert and select a post", async () => {
    const now = Date.now();
    const [inserted] = await db
      .insert(posts)
      .values({
        post_type_id: 1,
        title: "Hello World",
        slug: "hello-world",
        status: "draft",
        created_at: now,
        updated_at: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toBe(1);
    expect(inserted?.title).toBe("Hello World");
    expect(inserted?.slug).toBe("hello-world");
    expect(inserted?.status).toBe("draft");

    const [selected] = await db
      .select()
      .from(posts)
      .where(eq(posts.slug, "hello-world"));

    expect(selected?.title).toBe("Hello World");
  });

  it("should insert and select a post of type attachment", async () => {
    const now = Date.now();
    const metaValues = {
      mime_type: "image/png",
      attachment_file: "sample-image.png",
      attachment_width: 1920,
      attachment_height: 1080,
      attachment_path: "/uploads/2024/sample-image.png",
      attachment_alt: "Sample image description",
    };
    const [inserted] = await db
      .insert(posts)
      .values({
        post_type_id: 3,
        title: "Sample Image",
        slug: "sample-image",
        status: "published",
        meta_values: JSON.stringify(metaValues),
        created_at: now,
        updated_at: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toBe(2);
    expect(inserted?.post_type_id).toBe(3);
    expect(inserted?.title).toBe("Sample Image");
    expect(inserted?.slug).toBe("sample-image");
    expect(inserted?.status).toBe("published");
    expect(JSON.parse(inserted?.meta_values ?? "{}")).toEqual(metaValues);

    const [selected] = await db
      .select()
      .from(posts)
      .where(eq(posts.slug, "sample-image"));

    expect(selected?.post_type_id).toBe(3);
    expect(selected?.title).toBe("Sample Image");
    expect(JSON.parse(selected?.meta_values ?? "{}")).toEqual(metaValues);
  });

  it("should insert and select a post of type attachment (PDF document without width/height)", async () => {
    const now = Date.now();
    const metaValues = {
      mime_type: "application/pdf",
      attachment_file: "document.pdf",
      attachment_path: "/uploads/2024/document.pdf",
      attachment_alt: "PDF document",
    };
    const [inserted] = await db
      .insert(posts)
      .values({
        post_type_id: 3,
        title: "Sample Document",
        slug: "sample-document",
        status: "published",
        meta_values: JSON.stringify(metaValues),
        created_at: now,
        updated_at: now,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toBe(3);
    expect(inserted?.post_type_id).toBe(3);
    expect(inserted?.title).toBe("Sample Document");
    expect(inserted?.slug).toBe("sample-document");
    expect(inserted?.status).toBe("published");

    const parsedMeta = JSON.parse(inserted?.meta_values ?? "{}");
    expect(parsedMeta.mime_type).toBe("application/pdf");
    expect(parsedMeta.attachment_file).toBe("document.pdf");
    expect(parsedMeta.attachment_path).toBe("/uploads/2024/document.pdf");
    expect(parsedMeta.attachment_alt).toBe("PDF document");
    expect(parsedMeta).not.toHaveProperty("attachment_width");
    expect(parsedMeta).not.toHaveProperty("attachment_height");

    const [selected] = await db
      .select()
      .from(posts)
      .where(eq(posts.slug, "sample-document"));

    expect(selected?.post_type_id).toBe(3);
    expect(selected?.title).toBe("Sample Document");
    expect(JSON.parse(selected?.meta_values ?? "{}")).toEqual(metaValues);
  });
});
